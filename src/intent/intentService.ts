import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { IntentFileLockedError, withIntentFileLock, withIntentOperationLock } from "./fileLock";
import { IntentGraphStore } from "./graphStore";
import { inspectGridLayout as inspectGridLayoutRequest, planGridLayout } from "./gridLayout";
import { sourceHash } from "./hash";
import { queryRuntimeToken } from "./runtimeSession";
import {
  applyTokenPatch,
  applyPlannedPatch,
  discardPendingUndo,
  pendingUndoStackFromOperationLog,
  planTokenPatch,
  readPatchConflictReport,
  recordPatchApplyInOperationLog,
  recordPatchRevertInOperationLog,
  removeDiscardedPatchFromStack,
  resolvePatchConflict,
  revertPendingUndo,
  revertTokenPatch,
  undoHistoryFromStack
} from "./patch";
import { describeTailwindToken } from "./tailwind";
import type {
  IntentBinding,
  IntentGraph,
  GridLayoutApplyRequest,
  GridLayoutEditRequest,
  GridLayoutInspectRequest,
  GridLayoutInspection,
  GridLayoutPreviewResult,
  PatchApplyResult,
  PatchConflictResolveRequest,
  PatchConflictResolveResult,
  PatchFailure,
  PatchPreview,
  PatchRequest,
  PatchRevertResult,
  PatchUndoDiscardRequest,
  PatchUndoDiscardResult,
  PatchUndoRevertRequest,
  PatchUndoRevertResult,
  UndoHistoryReport
} from "./types";

export interface IntentPropertyCandidate {
  value: string;
  token: string;
}

export interface IntentEditableProperty {
  property: string;
  value: string;
  token: string;
  variant: string | null;
  category: string | null;
  candidates: IntentPropertyCandidate[];
}

export interface IntentElementInspection {
  ok: true;
  element: {
    id: string;
    tagName: string;
    componentName: string | null;
    source: {
      file: string;
      line: number;
      column: number;
      classNameKind: IntentBinding["className"]["kind"];
    };
    confidence: "high" | "read-only";
    properties: IntentEditableProperty[];
  };
}

export interface IntentFindQuery {
  query?: string;
  component?: string;
  file?: string;
  tag?: string;
  token?: string;
  limit?: number;
}

export interface IntentSemanticEditRequest {
  targetId: string;
  property: string;
  value: string;
  variant?: string | null;
  scope?: "source";
}

export interface IntentSemanticPreview {
  ok: true;
  previewId: string;
  expiresAt: string;
  targetId: string;
  property: string;
  value: string;
  scope: "source";
  patch: PatchPreview;
}

export interface IntentSemanticApply {
  ok: true;
  operationId: string;
  idempotentReplay: boolean;
  patch: PatchApplyResult;
}

export interface IntentVerifyResult {
  ok: boolean;
  operationId: string;
  source: "verified" | "drifted" | "missing";
  runtime: "verified" | "drifted" | "unavailable";
  renderedInstanceCount?: number;
  matchingInstanceCount?: number;
  detail: string;
}

interface StoredPreview {
  preview: IntentSemanticPreview;
  request: PatchRequest;
  expiresAtMs: number;
}

interface StoredGridLayoutPreview {
  preview: GridLayoutPreviewResult;
  expiresAtMs: number;
}

interface IdempotentApply {
  previewId: string;
  result: IntentSemanticApply;
}

interface IntentServiceOptions {
  graphMode?: "memory" | "disk";
  previewTtlMs?: number;
  onSourceChanged?: (file: string) => void;
}

function failure(reason: string, detail: string, id?: string): PatchFailure {
  return { ok: false, id, reason, detail };
}

function sourcePosition(entry: IntentBinding): { line: number; column: number } {
  try {
    const prefix = fs.readFileSync(entry.file, "utf8").slice(0, entry.className.start);
    const lines = prefix.split("\n");
    return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
  } catch {
    return { line: 1, column: 1 };
  }
}

export class IntentService {
  private readonly graphMode: "memory" | "disk";
  private readonly previewTtlMs: number;
  private sourceChanged: ((file: string) => void) | undefined;
  private undoStack: PatchApplyResult[] = [];
  private readonly previews = new Map<string, StoredPreview>();
  private readonly gridLayoutPreviews = new Map<string, StoredGridLayoutPreview>();
  private readonly idempotentApplies = new Map<string, IdempotentApply>();

  constructor(readonly graphStore: IntentGraphStore, options: IntentServiceOptions = {}) {
    this.graphMode = options.graphMode ?? "memory";
    this.previewTtlMs = options.previewTtlMs ?? 5 * 60_000;
    this.sourceChanged = options.onSourceChanged;
    if (this.graphMode === "disk") this.graphStore.loadPublishedGraph(true);
  }

  get rootDir(): string {
    return this.graphStore.rootDir;
  }

  setSourceChanged(callback: ((file: string) => void) | undefined): void {
    this.sourceChanged = callback;
  }

  graph(): IntentGraph {
    this.refreshGraph();
    return this.graphStore.toGraph();
  }

  getEntry(id: string): IntentBinding | undefined {
    this.refreshGraph();
    return this.graphStore.get(id);
  }

  previewToken(request: PatchRequest): PatchPreview | PatchFailure {
    return planTokenPatch(this.getEntry(request.id), request);
  }

  applyToken(request: PatchRequest): PatchApplyResult | PatchFailure {
    const entry = this.getEntry(request.id);
    if (!entry) return applyTokenPatch(this.rootDir, entry, request);

    try {
      return withIntentOperationLock(this.rootDir, () =>
        withIntentFileLock(this.rootDir, entry.file, () => {
          const result = applyTokenPatch(this.rootDir, this.getEntry(request.id), request);
          if (result.ok) {
            this.undoStack.push(result);
            recordPatchApplyInOperationLog(this.rootDir, result);
            this.refreshChangedFile(result.file);
          }
          return result;
        })
      );
    } catch (error) {
      if (error instanceof IntentFileLockedError) return failure(error.code, error.message, request.id);
      throw error;
    }
  }

  undoHistory(): UndoHistoryReport {
    return undoHistoryFromStack(this.refreshUndoStack());
  }

  conflicts() {
    return readPatchConflictReport(this.rootDir);
  }

  revertLatest(): PatchRevertResult | PatchFailure {
    try {
      return withIntentOperationLock(this.rootDir, () => {
        const stack = this.refreshUndoStack();
        const patch = stack[stack.length - 1] ?? null;
        if (!patch) return revertTokenPatch(this.rootDir, patch, undefined);

        return withIntentFileLock(this.rootDir, patch.file, () => {
          const result = revertTokenPatch(this.rootDir, patch, this.getEntry(patch.id));
          if (result.ok) {
            this.undoStack.pop();
            recordPatchRevertInOperationLog(this.rootDir, result);
            this.refreshChangedFile(result.file);
          }
          return result;
        });
      });
    } catch (error) {
      if (error instanceof IntentFileLockedError) return failure(error.code, error.message);
      throw error;
    }
  }

  resolveConflict(request: PatchConflictResolveRequest): PatchConflictResolveResult | PatchFailure {
    const result = resolvePatchConflict(this.rootDir, request);
    if (result.ok) {
      this.undoStack = removeDiscardedPatchFromStack(this.undoStack, result.discardedPatch);
    }
    return result;
  }

  discardUndo(request: PatchUndoDiscardRequest): PatchUndoDiscardResult | PatchFailure {
    const result = discardPendingUndo(this.rootDir, request);
    if (result.ok) {
      this.undoStack = removeDiscardedPatchFromStack(this.undoStack, result.discardedPatch);
    }
    return result;
  }

  revertUndo(request: PatchUndoRevertRequest): PatchUndoRevertResult | PatchFailure {
    try {
      return withIntentOperationLock(this.rootDir, () => {
        const stack = this.refreshUndoStack();
        const patch = stack.find((item) => this.operationMatches(item, request.operationFile));
        if (!patch) return revertPendingUndo(this.rootDir, undefined, request);

        return withIntentFileLock(this.rootDir, patch.file, () => {
          const result = revertPendingUndo(this.rootDir, this.getEntry(patch.id), request);
          if (result.ok) {
            this.undoStack = this.undoStack.filter(
              (item) => !this.operationMatches(item, request.operationFile)
            );
            this.refreshChangedFile(result.file);
          }
          return result;
        });
      });
    } catch (error) {
      if (error instanceof IntentFileLockedError) return failure(error.code, error.message);
      throw error;
    }
  }

  findElements(query: IntentFindQuery = {}) {
    this.refreshGraph();
    const needle = query.query?.trim().toLowerCase() ?? "";
    const limit = Math.max(1, Math.min(query.limit ?? 20, 100));
    const elements = this.graphStore
      .values()
      .filter((entry) => {
        if (query.component && entry.componentName !== query.component) return false;
        if (query.file && !entry.relativeFile.toLowerCase().includes(query.file.toLowerCase())) return false;
        if (query.tag && entry.tagName.toLowerCase() !== query.tag.toLowerCase()) return false;
        if (query.token && !entry.tokens.some((token) => token.token === query.token)) return false;
        if (!needle) return true;
        return [entry.id, entry.relativeFile, entry.componentName ?? "", entry.tagName, entry.className.value]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        tagName: entry.tagName,
        componentName: entry.componentName,
        file: entry.relativeFile,
        editablePropertyCount: this.propertiesFor(entry).length
      }));
    return { ok: true as const, count: elements.length, elements };
  }

  inspectElement(id: string): IntentElementInspection | PatchFailure {
    const entry = this.getEntry(id);
    if (!entry) return failure("missing-binding", "No source binding exists for this intent id.", id);
    const position = sourcePosition(entry);
    return {
      ok: true,
      element: {
        id: entry.id,
        tagName: entry.tagName,
        componentName: entry.componentName,
        source: {
          file: entry.relativeFile,
          line: position.line,
          column: position.column,
          classNameKind: entry.className.kind
        },
        confidence: entry.className.kind === "read-only" ? "read-only" : "high",
        properties: this.propertiesFor(entry)
      }
    };
  }

  inspectGridLayout(request: GridLayoutInspectRequest): GridLayoutInspection | PatchFailure {
    this.refreshGraph();
    return inspectGridLayoutRequest((id) => this.graphStore.get(id), request);
  }

  previewGridLayout(request: GridLayoutEditRequest): GridLayoutPreviewResult | PatchFailure {
    this.refreshGraph();
    const plan = planGridLayout((id) => this.graphStore.get(id), request);
    if (!plan.ok) return plan;
    const previewId = randomUUID();
    const expiresAtMs = Date.now() + this.previewTtlMs;
    const preview: GridLayoutPreviewResult = {
      ok: true,
      previewId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      parentId: request.parentId,
      breakpoint: request.breakpoint,
      affectedBindingCount: plan.affectedBindingCount,
      patch: plan.patch
    };
    this.gridLayoutPreviews.set(previewId, { preview, expiresAtMs });
    this.prunePreviews();
    return preview;
  }

  applyGridLayout(request: GridLayoutApplyRequest): PatchApplyResult | PatchFailure {
    const stored = this.gridLayoutPreviews.get(request.previewId);
    if (!stored) return failure("missing-preview", "Grid layout preview not found. Create a new preview before applying.");
    if (Date.now() > stored.expiresAtMs) {
      this.gridLayoutPreviews.delete(request.previewId);
      return failure("preview-expired", "The grid layout preview expired. Create a new preview before applying.");
    }

    const patch = stored.preview.patch;
    const entry = this.getEntry(stored.preview.parentId);
    if (!entry) return failure("missing-binding", "The selected grid parent no longer has a source binding.");
    try {
      return withIntentOperationLock(this.rootDir, () =>
        withIntentFileLock(this.rootDir, patch.file, () => {
          const result = applyPlannedPatch(this.rootDir, this.getEntry(stored.preview.parentId), patch);
          if (result.ok) {
            this.undoStack.push(result);
            recordPatchApplyInOperationLog(this.rootDir, result);
            this.gridLayoutPreviews.delete(request.previewId);
            this.refreshChangedFile(result.file);
          }
          return result;
        })
      );
    } catch (error) {
      if (error instanceof IntentFileLockedError) return failure(error.code, error.message, stored.preview.parentId);
      throw error;
    }
  }

  previewSemanticEdit(
    request: IntentSemanticEditRequest
  ): IntentSemanticPreview | PatchFailure {
    if (request.scope && request.scope !== "source") {
      return failure(
        "unsupported-scope",
        "Only source scope is deterministic. Instance-only edits require a component refactor.",
        request.targetId
      );
    }

    const entry = this.getEntry(request.targetId);
    if (!entry) return failure("missing-binding", "No source binding exists for this intent id.", request.targetId);
    const matches = this.propertiesFor(entry).filter(
      (property) =>
        property.property === request.property &&
        (request.variant === undefined || property.variant === request.variant)
    );
    if (matches.length === 0) {
      return failure(
        "unsupported-property",
        `Property "${request.property}" is not directly editable on this element.`,
        request.targetId
      );
    }
    if (matches.length > 1) {
      return failure(
        "ambiguous-property",
        `Property "${request.property}" occurs more than once. Pass its variant from inspect_element.`,
        request.targetId
      );
    }

    const property = matches[0];
    const candidate = property.candidates.find(
      (item) => item.value === request.value || item.token === request.value
    );
    if (!candidate) {
      return failure(
        "unsupported-value",
        `Value "${request.value}" is not one of the candidates returned by inspect_element.`,
        request.targetId
      );
    }
    if (candidate.token === property.token) {
      return failure("no-change", "The requested value is already applied.", request.targetId);
    }

    const sourceToken = entry.tokens.find((token) => token.token === property.token);
    if (!sourceToken) return failure("missing-token", "The selected source token no longer exists.", request.targetId);
    const patchRequest: PatchRequest = {
      id: request.targetId,
      oldToken: property.token,
      nextToken: candidate.token,
      sourceStart: sourceToken.sourceStart,
      sourceEnd: sourceToken.sourceEnd
    };
    const patch = planTokenPatch(entry, patchRequest);
    if (!patch.ok) return patch;

    const previewId = randomUUID();
    const expiresAtMs = Date.now() + this.previewTtlMs;
    const preview: IntentSemanticPreview = {
      ok: true,
      previewId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      targetId: request.targetId,
      property: request.property,
      value: candidate.value,
      scope: "source",
      patch
    };
    this.previews.set(previewId, { preview, request: patchRequest, expiresAtMs });
    this.prunePreviews();
    return preview;
  }

  applySemanticEdit(input: {
    previewId: string;
    idempotencyKey: string;
  }): IntentSemanticApply | PatchFailure {
    const replay = this.idempotentApplies.get(input.idempotencyKey);
    if (replay) {
      if (replay.previewId !== input.previewId) {
        return failure(
          "idempotency-key-conflict",
          "This idempotency key was already used for another preview."
        );
      }
      return { ...replay.result, idempotentReplay: true };
    }

    const stored = this.previews.get(input.previewId);
    if (!stored) return failure("missing-preview", "Preview not found. Create a new preview before applying.");
    if (Date.now() > stored.expiresAtMs) {
      this.previews.delete(input.previewId);
      return failure("preview-expired", "The preview expired. Create a new preview before applying.");
    }

    let currentSource: string;
    try {
      currentSource = fs.readFileSync(stored.preview.patch.file, "utf8");
    } catch (error) {
      return failure(
        "source-read-failed",
        error instanceof Error ? error.message : String(error),
        stored.request.id
      );
    }
    if (sourceHash(currentSource) !== stored.preview.patch.sourceHashBefore) {
      return failure("source-hash-mismatch", "The source changed after preview. Create a new preview.");
    }

    const patch = this.applyToken(stored.request);
    if (!patch.ok) return patch;
    const result: IntentSemanticApply = {
      ok: true,
      operationId: this.operationId(patch),
      idempotentReplay: false,
      patch
    };
    this.idempotentApplies.set(input.idempotencyKey, { previewId: input.previewId, result });
    this.previews.delete(input.previewId);
    return result;
  }

  undoSemanticEdit(operationId = "latest"): PatchUndoRevertResult | PatchRevertResult | PatchFailure {
    if (operationId === "latest") return this.revertLatest();
    const patch = this.refreshUndoStack().find((item) => this.operationMatches(item, operationId));
    if (!patch) return failure("missing-operation", "No pending operation matches this operation id.");
    return this.revertUndo({ operationFile: patch.operationFile });
  }

  verifySemanticEdit(operationId: string): IntentVerifyResult {
    const patch = this.refreshUndoStack().find((item) => this.operationMatches(item, operationId));
    if (!patch || !fs.existsSync(patch.file)) {
      return {
        ok: false,
        operationId,
        source: "missing",
        runtime: "unavailable",
        detail: "The operation is not pending or its source file no longer exists."
      };
    }

    const source = fs.readFileSync(patch.file, "utf8");
    const token = source.slice(patch.range.start, patch.range.start + patch.nextToken.length);
    const verified = sourceHash(source) === patch.sourceHashAfter && token === patch.nextToken;
    return {
      ok: verified,
      operationId: this.operationId(patch),
      source: verified ? "verified" : "drifted",
      runtime: "unavailable",
      detail: verified
        ? "The source patch is intact. No browser runtime is connected for visual verification."
        : "The source changed after the operation."
    };
  }

  async verifySemanticEditWithRuntime(operationId: string): Promise<IntentVerifyResult> {
    const sourceResult = this.verifySemanticEdit(operationId);
    if (!sourceResult.ok) return sourceResult;
    const patch = this.operationFor(operationId);
    if (!patch) return sourceResult;

    const runtime = await queryRuntimeToken(this.rootDir, patch.id, patch.nextToken);
    return {
      ...sourceResult,
      ok: sourceResult.ok && runtime.status === "verified",
      runtime: runtime.status,
      renderedInstanceCount: runtime.renderedInstanceCount,
      matchingInstanceCount: runtime.matchingInstanceCount,
      detail:
        runtime.status === "verified"
          ? "The guarded source patch and rendered class token are both verified."
          : runtime.status === "drifted"
            ? runtime.detail
            : sourceResult.detail
    };
  }

  operationFor(operationId: string): PatchApplyResult | undefined {
    return this.refreshUndoStack().find((item) => this.operationMatches(item, operationId));
  }

  private propertiesFor(entry: IntentBinding): IntentEditableProperty[] {
    return entry.tokens.flatMap((token) => {
      if (!token.editable) return [];
      const semantic = describeTailwindToken(token.token);
      if (!semantic || semantic.candidates.length < 2) return [];
      return [
        {
          property: semantic.property,
          value: semantic.value,
          token: semantic.token,
          variant: semantic.variant,
          category: token.category,
          candidates: semantic.candidates
        }
      ];
    });
  }

  private refreshGraph(): void {
    if (this.graphMode === "disk") this.graphStore.loadPublishedGraph();
  }

  private refreshChangedFile(file: string): void {
    this.graphStore.refreshFile(file);
    this.sourceChanged?.(file);
  }

  private refreshUndoStack(): PatchApplyResult[] {
    const source = pendingUndoStackFromOperationLog(this.rootDir);
    this.undoStack = source.filter((patch) => this.graphStore.containsPatch(patch));
    return this.undoStack;
  }

  private operationId(patch: PatchApplyResult): string {
    return path.relative(this.rootDir, patch.operationFile).replace(/\\/g, "/");
  }

  private operationMatches(patch: PatchApplyResult, operationId: string): boolean {
    const normalized = operationId.replace(/\\/g, "/");
    return (
      this.operationId(patch) === normalized ||
      path.resolve(patch.operationFile) === path.resolve(this.rootDir, operationId) ||
      path.basename(patch.operationFile) === path.basename(operationId)
    );
  }

  private prunePreviews(): void {
    const now = Date.now();
    for (const [id, preview] of this.previews) {
      if (preview.expiresAtMs < now) this.previews.delete(id);
    }
    for (const [id, preview] of this.gridLayoutPreviews) {
      if (preview.expiresAtMs < now) this.gridLayoutPreviews.delete(id);
    }
  }
}
