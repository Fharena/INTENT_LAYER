import fs from "node:fs";
import path from "node:path";
import { sourceHash } from "./hash";
import type {
  IntentBinding,
  IntentToken,
  PatchApplyResult,
  PatchConflictArtifact,
  PatchConflictReport,
  PatchConflictResolveRequest,
  PatchConflictResolveResult,
  PatchConflictSummary,
  PatchFailure,
  PatchOperationLog,
  PatchPreview,
  PatchRequest,
  PatchRevertResult,
  PatchUndoDiscardReference,
  UndoHistoryReport
} from "./types";

function lineSnippet(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset) + 1;
  const lineEndIndex = source.indexOf("\n", offset);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  return source.slice(lineStart, lineEnd);
}

function findPatchTarget(entry: IntentBinding, request: PatchRequest): IntentToken | undefined {
  if (request.sourceStart !== undefined && request.sourceEnd !== undefined) {
    return entry.tokens.find(
      (token) =>
        token.sourceStart === request.sourceStart &&
        token.sourceEnd === request.sourceEnd &&
        token.token === request.oldToken
    );
  }

  return entry.tokens.find((token) => token.token === request.oldToken);
}

export function planTokenPatch(
  entry: IntentBinding | undefined,
  request: PatchRequest
): PatchPreview | PatchFailure {
  const started = performance.now();

  if (!entry) {
    return {
      ok: false,
      id: request.id,
      reason: "missing-binding",
      detail: "No source binding exists for the selected intent id.",
      metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const source = fs.readFileSync(entry.file, "utf8");
  const currentHash = sourceHash(source);
  if (currentHash !== entry.sourceHash) {
    return {
      ok: false,
      id: request.id,
      reason: "source-hash-mismatch",
      detail: "The file changed after the binding was generated. Re-select the element.",
      metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const target = findPatchTarget(entry, request);

  if (!target) {
    return {
      ok: false,
      id: request.id,
      reason: "old-token-mismatch",
      detail: `Token "${request.oldToken}" was not found in the current className range.`,
      metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  if (!target.editable) {
    return {
      ok: false,
      id: request.id,
      reason: "token-not-editable",
      detail: `Token "${request.oldToken}" is not in the supported direct-edit set.`,
      metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const start = target.sourceStart;
  const end = target.sourceEnd;
  const currentToken = source.slice(start, end);

  if (currentToken !== request.oldToken) {
    return {
      ok: false,
      id: request.id,
      reason: "old-token-mismatch",
      detail: `Expected "${request.oldToken}" at the stored source range, found "${currentToken}".`,
      metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const before = lineSnippet(source, start);
  const patchedSource = `${source.slice(0, start)}${request.nextToken}${source.slice(end)}`;
  const after = lineSnippet(patchedSource, start);

  return {
    ok: true,
    id: request.id,
    file: entry.file,
    relativeFile: entry.relativeFile,
    oldToken: request.oldToken,
    nextToken: request.nextToken,
    range: { start, end },
    before,
    after,
    metrics: {
      previewMs: Number((performance.now() - started).toFixed(3))
    }
  };
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function operationLogPath(rootDir: string): string {
  return path.join(rootDir, ".intent", "operations", "operation-log.json");
}

function conflictsDirPath(rootDir: string): string {
  return path.join(rootDir, ".intent", "conflicts");
}

function toSlashPath(input: string): string {
  return input.replace(/\\/g, "/");
}

function relativeFromRoot(rootDir: string, file: string): string {
  return toSlashPath(path.relative(rootDir, file));
}

function patchMatchesDiscard(patch: PatchApplyResult, discard: PatchUndoDiscardReference): boolean {
  return (
    patch.id === discard.id &&
    patch.file === discard.file &&
    patch.oldToken === discard.oldToken &&
    patch.nextToken === discard.nextToken &&
    patch.range.start === discard.range.start
  );
}

function readOperationLog(rootDir: string): PatchOperationLog {
  const file = operationLogPath(rootDir);
  if (!fs.existsSync(file)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: []
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as PatchOperationLog;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      throw new Error("Unsupported operation log format");
    }
    return parsed;
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: []
    };
  }
}

function writeOperationLog(rootDir: string, log: PatchOperationLog): string {
  const file = operationLogPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`);
  return file;
}

export function recordPatchApplyInOperationLog(rootDir: string, patch: PatchApplyResult): string {
  const log = readOperationLog(rootDir);
  const now = new Date().toISOString();
  log.updatedAt = now;
  log.entries.push({
    action: "apply",
    createdAt: now,
    patch
  });
  return writeOperationLog(rootDir, log);
}

export function recordPatchRevertInOperationLog(rootDir: string, patch: PatchRevertResult): string {
  const log = readOperationLog(rootDir);
  const now = new Date().toISOString();
  log.updatedAt = now;
  log.entries.push({
    action: "revert",
    createdAt: now,
    patch
  });
  return writeOperationLog(rootDir, log);
}

export function pendingUndoStackFromOperationLog(rootDir: string): PatchApplyResult[] {
  const stack: PatchApplyResult[] = [];

  for (const entry of readOperationLog(rootDir).entries) {
    if (entry.action === "apply") {
      stack.push(entry.patch);
      continue;
    }

    const index =
      entry.action === "revert"
        ? [...stack]
            .reverse()
            .findIndex(
              (patch) =>
                patch.id === entry.patch.id &&
                patch.nextToken === entry.patch.oldToken &&
                patch.oldToken === entry.patch.restoredToken &&
                patch.range.start === entry.patch.range.start
            )
        : [...stack].reverse().findIndex((patch) => patchMatchesDiscard(patch, entry.patch));
    if (index >= 0) {
      stack.splice(stack.length - 1 - index, 1);
    }
  }

  return stack;
}

export function undoHistoryFromStack(stack: PatchApplyResult[]): UndoHistoryReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    pendingCount: stack.length,
    entries: stack.map((patch, index) => ({
      index,
      next: index === stack.length - 1,
      id: patch.id,
      file: patch.file,
      relativeFile: patch.relativeFile,
      oldToken: patch.oldToken,
      nextToken: patch.nextToken,
      range: patch.range,
      operationFile: patch.operationFile,
      diffFile: patch.diffFile
    }))
  };
}

export function pendingUndoHistoryFromOperationLog(rootDir: string): UndoHistoryReport {
  return undoHistoryFromStack(pendingUndoStackFromOperationLog(rootDir));
}

function writeIntentArtifacts(params: {
  rootDir: string;
  entry: IntentBinding;
  preview: PatchPreview;
  kind?: "tailwind-token-replace" | "tailwind-token-revert";
}) {
  const { rootDir, entry, preview, kind = "tailwind-token-replace" } = params;
  const timestamp = timestampSlug();
  const operationsDir = path.join(rootDir, ".intent", "operations");
  const diffsDir = path.join(rootDir, ".intent", "diffs");
  fs.mkdirSync(operationsDir, { recursive: true });
  fs.mkdirSync(diffsDir, { recursive: true });

  const operationFile = path.join(operationsDir, `${timestamp}.intent-op.json`);
  const diffFile = path.join(diffsDir, `${timestamp}.intent-diff.yml`);

  fs.writeFileSync(
    operationFile,
    `${JSON.stringify(
      {
        version: 1,
        kind,
        createdAt: new Date().toISOString(),
        target: {
          id: entry.id,
          componentName: entry.componentName,
          file: entry.relativeFile,
          tagName: entry.tagName,
          range: preview.range
        },
        change: {
          from: preview.oldToken,
          to: preview.nextToken
        }
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    diffFile,
    [
      "version: 1",
      "kind: intent-diff",
      `createdAt: ${new Date().toISOString()}`,
      "changes:",
      `  - target: ${entry.componentName ?? "Unknown"}.${entry.tagName}.${entry.id}`,
      `    type: ${kind}`,
      `    file: ${entry.relativeFile}`,
      `    from: ${preview.oldToken}`,
      `    to: ${preview.nextToken}`,
      ""
    ].join("\n")
  );

  return { operationFile, diffFile };
}

function writeRevertConflictArtifact(params: {
  rootDir: string;
  lastPatch: PatchApplyResult;
  source: string;
  actualToken: string;
  reason: string;
}): { conflictFile: string; conflictArtifact: PatchConflictArtifact } {
  const { rootDir, lastPatch, source, actualToken, reason } = params;
  const timestamp = timestampSlug();
  const conflictsDir = conflictsDirPath(rootDir);
  fs.mkdirSync(conflictsDir, { recursive: true });

  const conflictFile = path.join(conflictsDir, `${timestamp}.intent-conflict.json`);
  const conflictArtifact: PatchConflictArtifact = {
    version: 1,
    kind: "revert-conflict",
    createdAt: new Date().toISOString(),
    reason,
    id: lastPatch.id,
    file: lastPatch.file,
    relativeFile: lastPatch.relativeFile,
    range: {
      start: lastPatch.range.start,
      end: lastPatch.range.start + lastPatch.nextToken.length
    },
    expectedToken: lastPatch.nextToken,
    actualToken,
    restoreToken: lastPatch.oldToken,
    beforeLine: lineSnippet(source, lastPatch.range.start),
    operationFile: lastPatch.operationFile,
    diffFile: lastPatch.diffFile,
    guidance: [
      "Do not auto-revert this patch because the expected token is no longer present at the stored range.",
      "Re-select the element or review this conflict artifact before creating a manual or agent handoff fix.",
      "Keep the pending undo entry until a human resolves the conflict or intentionally discards it."
    ]
  };

  fs.writeFileSync(conflictFile, `${JSON.stringify(conflictArtifact, null, 2)}\n`);
  return { conflictFile, conflictArtifact };
}

function resolveConflictFilePath(rootDir: string, requestedFile: string): string {
  const conflictsDir = path.resolve(conflictsDirPath(rootDir));
  const candidate = path.isAbsolute(requestedFile)
    ? path.resolve(requestedFile)
    : path.resolve(rootDir, requestedFile);

  if (!candidate.startsWith(`${conflictsDir}${path.sep}`)) {
    throw new Error("Conflict file must be inside .intent/conflicts.");
  }

  if (!candidate.endsWith(".intent-conflict.json")) {
    throw new Error("Unsupported conflict file extension.");
  }

  return candidate;
}

function readConflictArtifactFile(file: string): PatchConflictArtifact | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as PatchConflictArtifact;
    if (parsed.version !== 1 || parsed.kind !== "revert-conflict") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readPatchConflictReport(rootDir: string): PatchConflictReport {
  const conflictsDir = conflictsDirPath(rootDir);
  const files = fs.existsSync(conflictsDir)
    ? fs
        .readdirSync(conflictsDir)
        .filter((name) => name.endsWith(".intent-conflict.json"))
        .map((name) => path.join(conflictsDir, name))
    : [];

  const conflicts: PatchConflictSummary[] = files
    .map((file) => {
      const artifact = readConflictArtifactFile(file);
      if (!artifact || artifact.resolvedAt) {
        return null;
      }

      return {
        ...artifact,
        conflictFile: file,
        relativeConflictFile: relativeFromRoot(rootDir, file),
        resolved: false
      };
    })
    .filter((conflict): conflict is PatchConflictSummary => Boolean(conflict))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    conflictCount: conflicts.length,
    conflicts
  };
}

function recordPatchDiscardInOperationLog(
  rootDir: string,
  conflictFile: string,
  patch: PatchUndoDiscardReference
): string {
  const log = readOperationLog(rootDir);
  const now = new Date().toISOString();
  log.updatedAt = now;
  log.entries.push({
    action: "discard",
    createdAt: now,
    conflictFile,
    patch
  });
  return writeOperationLog(rootDir, log);
}

export function resolvePatchConflict(
  rootDir: string,
  request: PatchConflictResolveRequest
): PatchConflictResolveResult | PatchFailure {
  const started = performance.now();

  if (request.action !== "discard-pending-undo") {
    return {
      ok: false,
      reason: "unsupported-conflict-action",
      detail: `Unsupported conflict action: ${request.action}`,
      metrics: { resolveMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  let conflictFile: string;
  try {
    conflictFile = resolveConflictFilePath(rootDir, request.conflictFile);
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-conflict-file",
      detail: error instanceof Error ? error.message : String(error),
      metrics: { resolveMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const artifact = readConflictArtifactFile(conflictFile);
  if (!artifact) {
    return {
      ok: false,
      reason: "missing-conflict-artifact",
      detail: "No readable conflict artifact exists for the requested file.",
      metrics: { resolveMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  if (artifact.resolvedAt) {
    return {
      ok: false,
      id: artifact.id,
      reason: "conflict-already-resolved",
      detail: "This conflict artifact already has a resolution.",
      metrics: { resolveMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const discardPatch: PatchUndoDiscardReference = {
    id: artifact.id,
    file: artifact.file,
    relativeFile: artifact.relativeFile,
    oldToken: artifact.restoreToken,
    nextToken: artifact.expectedToken,
    range: artifact.range
  };
  const operationLogFile = recordPatchDiscardInOperationLog(rootDir, conflictFile, discardPatch);
  const resolvedArtifact: PatchConflictArtifact = {
    ...artifact,
    resolvedAt: new Date().toISOString(),
    resolution: {
      action: "discard-pending-undo",
      note: request.note
    }
  };
  fs.writeFileSync(conflictFile, `${JSON.stringify(resolvedArtifact, null, 2)}\n`);

  const pendingCount = pendingUndoStackFromOperationLog(rootDir).length;

  return {
    ok: true,
    resolved: true,
    conflictFile,
    relativeConflictFile: relativeFromRoot(rootDir, conflictFile),
    action: "discard-pending-undo",
    discardedPatch: discardPatch,
    pendingCount,
    conflictArtifact: resolvedArtifact,
    operationLogFile,
    metrics: {
      resolveMs: Number((performance.now() - started).toFixed(3))
    }
  };
}

export function removeDiscardedPatchFromStack(
  stack: PatchApplyResult[],
  discard: PatchUndoDiscardReference
): PatchApplyResult[] {
  const index = [...stack].reverse().findIndex((patch) => patchMatchesDiscard(patch, discard));
  if (index < 0) {
    return stack;
  }

  const nextStack = [...stack];
  nextStack.splice(nextStack.length - 1 - index, 1);
  return nextStack;
}

export function applyTokenPatch(
  rootDir: string,
  entry: IntentBinding | undefined,
  request: PatchRequest
): PatchApplyResult | PatchFailure {
  const applyStarted = performance.now();
  const preview = planTokenPatch(entry, request);
  if (!preview.ok) {
    return {
      ...preview,
      metrics: {
        ...preview.metrics,
        applyMs: Number((performance.now() - applyStarted).toFixed(3))
      }
    };
  }

  const source = fs.readFileSync(preview.file, "utf8");
  const patchedSource = `${source.slice(0, preview.range.start)}${preview.nextToken}${source.slice(
    preview.range.end
  )}`;
  fs.writeFileSync(preview.file, patchedSource);

  const artifacts = writeIntentArtifacts({ rootDir, entry: entry!, preview });

  return {
    ...preview,
    applied: true,
    operationFile: artifacts.operationFile,
    diffFile: artifacts.diffFile,
    metrics: {
      previewMs: preview.metrics.previewMs,
      applyMs: Number((performance.now() - applyStarted).toFixed(3))
    }
  };
}

export function revertTokenPatch(
  rootDir: string,
  lastPatch: PatchApplyResult | null | undefined,
  entry: IntentBinding | undefined
): PatchRevertResult | PatchFailure {
  const started = performance.now();

  if (!lastPatch) {
    return {
      ok: false,
      reason: "missing-last-patch",
      detail: "No applied patch is available to revert.",
      metrics: { revertMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  if (!entry) {
    return {
      ok: false,
      id: lastPatch.id,
      reason: "missing-binding",
      detail: "No source binding exists for the last patch.",
      metrics: { revertMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const source = fs.readFileSync(lastPatch.file, "utf8");
  const start = lastPatch.range.start;
  const end = start + lastPatch.nextToken.length;
  const currentToken = source.slice(start, end);

  if (currentToken !== lastPatch.nextToken) {
    const conflict = writeRevertConflictArtifact({
      rootDir,
      lastPatch,
      source,
      actualToken: currentToken,
      reason: "revert-token-mismatch"
    });
    return {
      ok: false,
      id: lastPatch.id,
      reason: "revert-token-mismatch",
      detail: `Expected "${lastPatch.nextToken}" at the last patch range, found "${currentToken}".`,
      conflictFile: conflict.conflictFile,
      conflictArtifact: conflict.conflictArtifact,
      metrics: { revertMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const before = lineSnippet(source, start);
  const revertedSource = `${source.slice(0, start)}${lastPatch.oldToken}${source.slice(end)}`;
  const after = lineSnippet(revertedSource, start);
  fs.writeFileSync(lastPatch.file, revertedSource);

  const preview: PatchPreview = {
    ok: true,
    id: lastPatch.id,
    file: lastPatch.file,
    relativeFile: lastPatch.relativeFile,
    oldToken: lastPatch.nextToken,
    nextToken: lastPatch.oldToken,
    range: {
      start,
      end
    },
    before,
    after,
    metrics: {
      previewMs: 0
    }
  };
  const artifacts = writeIntentArtifacts({
    rootDir,
    entry,
    preview,
    kind: "tailwind-token-revert"
  });

  return {
    ok: true,
    reverted: true,
    id: lastPatch.id,
    file: lastPatch.file,
    relativeFile: lastPatch.relativeFile,
    oldToken: lastPatch.nextToken,
    restoredToken: lastPatch.oldToken,
    range: {
      start,
      end
    },
    before,
    after,
    operationFile: artifacts.operationFile,
    diffFile: artifacts.diffFile,
    metrics: {
      revertMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
