import fs from "node:fs";
import path from "node:path";
import { sourceHash } from "./hash";
import {
  gridLayoutToken,
  gridTemplateToken,
  parseGridLayoutToken,
  parseGridTemplateToken,
  type GridLayoutTokenProperty
} from "./tailwind";
import type {
  GridLayoutBreakpoint,
  GridLayoutEditRequest,
  GridLayoutInspectRequest,
  GridLayoutInspection,
  IntentBinding,
  PatchFailure,
  PatchPreview,
  PatchTextEdit
} from "./types";

const breakpoints: GridLayoutBreakpoint[] = ["base", "sm", "md", "lg"];

interface GridParticipants {
  parent: IntentBinding;
  children: IntentBinding[];
}

interface ColumnDefinition {
  columns: number;
  template: number[] | null;
}

export interface GridLayoutPlan {
  ok: true;
  inspection: GridLayoutInspection;
  patch: PatchPreview;
  affectedBindingCount: number;
}

function failure(reason: string, detail: string, id?: string): PatchFailure {
  return { ok: false, id, reason, detail };
}

function exactColumnDefinition(
  entry: IntentBinding,
  breakpoint: GridLayoutBreakpoint
): ColumnDefinition | null | PatchFailure {
  const numeric = entry.tokens
    .map((token) => parseGridLayoutToken(token.token))
    .filter((token) => token?.property === "columns" && token.breakpoint === breakpoint);
  const templates = entry.tokens
    .map((token) => parseGridTemplateToken(token.token))
    .filter((token) => token?.breakpoint === breakpoint);
  if (numeric.length + templates.length > 1) {
    return failure(
      "ambiguous-grid-token",
      `More than one ${breakpoint}:columns token exists on ${entry.id}.`,
      entry.id
    );
  }
  if (numeric[0]) return { columns: numeric[0].value, template: null };
  if (templates[0]) return { columns: templates[0].weights.length, template: templates[0].weights };
  return null;
}

function effectiveColumnDefinition(
  entry: IntentBinding,
  breakpoint: GridLayoutBreakpoint,
  excludeCurrent = false
): ColumnDefinition | PatchFailure {
  const targetIndex = breakpoints.indexOf(breakpoint) - (excludeCurrent ? 1 : 0);
  for (let index = targetIndex; index >= 0; index -= 1) {
    const value = exactColumnDefinition(entry, breakpoints[index]);
    if (value) return value;
  }
  return { columns: 1, template: null };
}

function exactGridValue(
  entry: IntentBinding,
  property: GridLayoutTokenProperty,
  breakpoint: GridLayoutBreakpoint
): number | null | PatchFailure {
  if (property === "columns") {
    const definition = exactColumnDefinition(entry, breakpoint);
    if (definition && "ok" in definition) return definition;
    return definition?.columns ?? null;
  }
  const matches = entry.tokens
    .map((token) => parseGridLayoutToken(token.token))
    .filter(
      (token): token is NonNullable<ReturnType<typeof parseGridLayoutToken>> =>
        Boolean(token && token.property === property && token.breakpoint === breakpoint)
    );
  if (matches.length > 1) {
    return failure(
      "ambiguous-grid-token",
      `More than one ${breakpoint}:${property} token exists on ${entry.id}.`,
      entry.id
    );
  }
  return matches[0]?.value ?? null;
}

function effectiveGridValue(
  entry: IntentBinding,
  property: GridLayoutTokenProperty,
  breakpoint: GridLayoutBreakpoint,
  fallback: number | null,
  excludeCurrent = false
): number | null | PatchFailure {
  const targetIndex = breakpoints.indexOf(breakpoint) - (excludeCurrent ? 1 : 0);
  for (let index = targetIndex; index >= 0; index -= 1) {
    const value = exactGridValue(entry, property, breakpoints[index]);
    if (typeof value !== "object" && value !== null) return value;
    if (value && typeof value === "object") return value;
  }
  return fallback;
}

function tokenVariantAndBase(token: string): { variant: string; base: string } {
  const parts = token.split(":");
  return {
    variant: parts.length > 1 ? parts.slice(0, -1).join(":") : "base",
    base: parts[parts.length - 1] ?? token
  };
}

function unsupportedGridConflict(
  entry: IntentBinding,
  breakpoint: GridLayoutBreakpoint,
  role: "parent" | "child"
): string | null {
  for (const token of entry.tokens) {
    const parsed = parseGridLayoutToken(token.token);
    const template = parseGridTemplateToken(token.token);
    const { variant, base } = tokenVariantAndBase(token.token);
    if (variant !== breakpoint) continue;
    if (role === "parent" && base.startsWith("grid-cols-") && !parsed && !template) return token.token;
    if (role === "child" && /^(?:col-auto|col-end-|col-start-|col-span-)/.test(base) && !parsed) {
      return token.token;
    }
  }
  return null;
}

function participants(
  resolve: (id: string) => IntentBinding | undefined,
  request: GridLayoutInspectRequest
): GridParticipants | PatchFailure {
  if (!breakpoints.includes(request.breakpoint)) {
    return failure("unsupported-breakpoint", `Breakpoint ${request.breakpoint} is not supported.`, request.parentId);
  }
  const parent = resolve(request.parentId);
  if (!parent) return failure("missing-binding", "The selected grid parent has no current source binding.", request.parentId);
  if (request.unboundChildCount && request.unboundChildCount > 0) {
    return failure(
      "unbound-grid-child",
      `${request.unboundChildCount} direct grid child element(s) have no source binding.`,
      request.parentId
    );
  }
  if (request.childIds.length === 0) {
    return failure("empty-grid", "The selected grid has no bound direct children.", request.parentId);
  }
  if (new Set(request.childIds).size !== request.childIds.length) {
    return failure(
      "repeated-grid-binding",
      "At least two rendered grid children share one source binding. Per-instance placement needs a prop or variant refactor.",
      request.parentId
    );
  }

  const children: IntentBinding[] = [];
  for (const id of request.childIds) {
    const child = resolve(id);
    if (!child) return failure("missing-grid-child", `No current source binding exists for grid child ${id}.`, id);
    children.push(child);
  }
  const all = [parent, ...children];
  if (all.some((entry) => entry.className.kind !== "static")) {
    return failure(
      "dynamic-grid-classname",
      "Grid layout composition currently requires static className literals on the parent and every direct child.",
      request.parentId
    );
  }
  if (all.some((entry) => /[\r\n]/.test(entry.className.value))) {
    return failure(
      "multiline-grid-classname",
      "Multiline className literals are inspectable but not yet edited by the layout composer.",
      request.parentId
    );
  }
  if (all.some((entry) => entry.className.value !== entry.tokens.map((token) => token.token).join(" "))) {
    return failure(
      "noncanonical-grid-classname",
      "Grid layout composition preserves unusual className whitespace by leaving this layout read-only.",
      request.parentId
    );
  }
  if (all.some((entry) => path.resolve(entry.file) !== path.resolve(parent.file))) {
    return failure(
      "cross-file-grid",
      "The grid parent and direct children span multiple source files. Use an agent refactor instead of a partial direct edit.",
      request.parentId
    );
  }
  if (!parent.tokens.some((token) => token.token === "grid")) {
    return failure("not-static-grid", "The selected parent does not have a base grid token.", request.parentId);
  }
  const baseColumns = effectiveColumnDefinition(parent, "base");
  if ("ok" in baseColumns) return baseColumns;
  if (baseColumns.columns < 1 || baseColumns.columns > 12) {
    return failure(
      "unsupported-grid-columns",
      "The selected parent needs one through twelve numeric or fractional grid columns.",
      request.parentId
    );
  }
  const parentConflict = unsupportedGridConflict(parent, request.breakpoint, "parent");
  if (parentConflict) {
    return failure("unsupported-grid-token", `Unsupported parent grid token: ${parentConflict}.`, request.parentId);
  }
  for (const child of children) {
    const conflict = unsupportedGridConflict(child, request.breakpoint, "child");
    if (conflict) return failure("unsupported-grid-token", `Unsupported child grid token: ${conflict}.`, child.id);
  }
  return { parent, children };
}

function resolvedValue(
  entry: IntentBinding,
  property: GridLayoutTokenProperty,
  breakpoint: GridLayoutBreakpoint,
  fallback: number | null
) {
  const explicit = exactGridValue(entry, property, breakpoint);
  if (explicit && typeof explicit === "object") return explicit;
  const effective = effectiveGridValue(entry, property, breakpoint, fallback);
  if (effective && typeof effective === "object") return effective;
  return { explicit, effective };
}

export function inspectGridLayout(
  resolve: (id: string) => IntentBinding | undefined,
  request: GridLayoutInspectRequest
): GridLayoutInspection | PatchFailure {
  const scope = participants(resolve, request);
  if (!("parent" in scope)) return scope;
  const columns = resolvedValue(scope.parent, "columns", request.breakpoint, 1);
  if ("ok" in columns) return columns;
  if (typeof columns.effective !== "number") {
    return failure("missing-effective-columns", "No numeric grid column count is effective at this breakpoint.", request.parentId);
  }

  const items: GridLayoutInspection["items"] = [];
  for (const child of scope.children) {
    const columnStart = resolvedValue(child, "columnStart", request.breakpoint, null);
    if ("ok" in columnStart) return columnStart;
    const columnSpan = resolvedValue(child, "columnSpan", request.breakpoint, 1);
    if ("ok" in columnSpan) return columnSpan;
    items.push({
      id: child.id,
      label: `${child.componentName ?? "Component"}.${child.tagName}`,
      columnStart,
      columnSpan
    });
  }

  const explicitDefinition = exactColumnDefinition(scope.parent, request.breakpoint);
  if (explicitDefinition && "ok" in explicitDefinition) return explicitDefinition;
  const effectiveDefinition = effectiveColumnDefinition(scope.parent, request.breakpoint);
  if ("ok" in effectiveDefinition) return effectiveDefinition;

  return {
    ok: true,
    parentId: scope.parent.id,
    relativeFile: scope.parent.relativeFile,
    breakpoint: request.breakpoint,
    supportedBreakpoints: breakpoints,
    columns,
    columnTemplate: {
      explicit: explicitDefinition?.template ?? null,
      effective: effectiveDefinition.template
    },
    items
  };
}

function validTrack(value: number | null | undefined): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12;
}

function validTemplate(weights: number[] | null | undefined): weights is number[] {
  return Boolean(
    weights &&
      weights.length >= 1 &&
      weights.length <= 12 &&
      weights.every((value) => Number.isFinite(value) && value > 0 && value <= 12)
  );
}

function updateStaticClassName(
  entry: IntentBinding,
  changes: Array<{ property: GridLayoutTokenProperty; value: number | null }>,
  breakpoint: GridLayoutBreakpoint
): string | PatchFailure {
  const tokens = entry.tokens.map((token) => token.token);
  for (const change of changes) {
    const indexes = tokens.flatMap((token, index) => {
      const parsed = parseGridLayoutToken(token);
      const template = change.property === "columns" ? parseGridTemplateToken(token) : null;
      return (parsed?.property === change.property && parsed.breakpoint === breakpoint) ||
        template?.breakpoint === breakpoint
        ? [index]
        : [];
    });
    if (indexes.length > 1) {
      return failure("ambiguous-grid-token", `More than one ${breakpoint}:${change.property} token exists.`, entry.id);
    }
    const index = indexes[0];
    if (change.value === null) {
      if (index !== undefined) tokens.splice(index, 1);
      continue;
    }
    const nextToken = gridLayoutToken(change.property, change.value, breakpoint);
    if (index === undefined) tokens.push(nextToken);
    else tokens[index] = nextToken;
  }
  return tokens.join(" ");
}

function updateStaticGridTemplate(
  entry: IntentBinding,
  weights: number[] | null,
  breakpoint: GridLayoutBreakpoint
): string | PatchFailure {
  const tokens = entry.tokens.map((token) => token.token);
  const indexes = tokens.flatMap((token, index) => {
    const numeric = parseGridLayoutToken(token);
    const template = parseGridTemplateToken(token);
    return (numeric?.property === "columns" && numeric.breakpoint === breakpoint) ||
      template?.breakpoint === breakpoint
      ? [index]
      : [];
  });
  if (indexes.length > 1) {
    return failure("ambiguous-grid-token", `More than one ${breakpoint}:columns token exists.`, entry.id);
  }
  const index = indexes[0];
  if (weights === null) {
    if (index !== undefined && parseGridTemplateToken(tokens[index])) tokens.splice(index, 1);
    return tokens.join(" ");
  }
  const nextToken = gridTemplateToken(weights, breakpoint);
  if (index === undefined) tokens.push(nextToken);
  else tokens[index] = nextToken;
  return tokens.join(" ");
}

function classEdit(entry: IntentBinding, newText: string): Omit<PatchTextEdit, "appliedRange"> {
  return {
    id: entry.id,
    label: `${entry.componentName ?? "Component"}.${entry.tagName}`,
    range: { start: entry.className.start, end: entry.className.end },
    oldText: entry.className.value,
    newText
  };
}

export function planGridLayout(
  resolve: (id: string) => IntentBinding | undefined,
  request: GridLayoutEditRequest
): GridLayoutPlan | PatchFailure {
  const started = performance.now();
  const inspection = inspectGridLayout(resolve, request);
  if (!inspection.ok) return inspection;
  const scope = participants(resolve, request);
  if (!("parent" in scope)) return scope;
  const childById = new Map(scope.children.map((child) => [child.id, child]));
  if (new Set(request.items.map((item) => item.id)).size !== request.items.length) {
    return failure("duplicate-grid-edit", "A grid child appears more than once in the requested layout edit.", request.parentId);
  }
  if (request.items.some((item) => !childById.has(item.id))) {
    return failure("grid-child-out-of-scope", "A requested item is not a direct child of the selected grid.", request.parentId);
  }

  if (request.columns !== undefined && request.columns !== null && !validTrack(request.columns)) {
    return failure("invalid-grid-columns", "Grid columns must be an integer from 1 through 12.", request.parentId);
  }
  if (request.columns !== undefined && request.columnTemplate !== undefined) {
    return failure(
      "conflicting-grid-columns",
      "Change either the column count or the fractional template in one operation, not both.",
      request.parentId
    );
  }
  if (
    request.columnTemplate !== undefined &&
    request.columnTemplate !== null &&
    !validTemplate(request.columnTemplate)
  ) {
    return failure(
      "invalid-grid-template",
      "A fractional grid template needs one through twelve positive track weights.",
      request.parentId
    );
  }
  if (request.columns === null && request.breakpoint === "base") {
    return failure("required-base-columns", "The base grid column token cannot be removed.", request.parentId);
  }
  const inheritedDefinition = effectiveColumnDefinition(scope.parent, request.breakpoint, true);
  if ("ok" in inheritedDefinition) return inheritedDefinition;
  const nextColumns =
    request.columnTemplate !== undefined
      ? request.columnTemplate === null
        ? inheritedDefinition.columns
        : request.columnTemplate.length
      : request.columns === undefined
        ? inspection.columns.effective
        : request.columns === null
          ? inheritedDefinition.columns
          : request.columns;
  if (!validTrack(nextColumns)) {
    return failure("missing-effective-columns", "The edited breakpoint would have no valid grid column count.", request.parentId);
  }

  const updates = new Map<string, Array<{ property: GridLayoutTokenProperty; value: number | null }>>();
  if (request.columns !== undefined) {
    updates.set(scope.parent.id, [{ property: "columns", value: request.columns }]);
  }
  for (const item of request.items) {
    if (item.columnStart !== undefined && item.columnStart !== null && !validTrack(item.columnStart)) {
      return failure("invalid-column-start", "Column start must be null or an integer from 1 through 12.", item.id);
    }
    if (item.columnSpan !== undefined && item.columnSpan !== null && !validTrack(item.columnSpan)) {
      return failure("invalid-column-span", "Column span must be null or an integer from 1 through 12.", item.id);
    }
    const inspected = inspection.items.find((candidate) => candidate.id === item.id)!;
    const child = childById.get(item.id)!;
    const inheritedStart = effectiveGridValue(child, "columnStart", request.breakpoint, null, true);
    if (inheritedStart && typeof inheritedStart === "object") return inheritedStart;
    const inheritedSpan = effectiveGridValue(child, "columnSpan", request.breakpoint, 1, true);
    if (inheritedSpan && typeof inheritedSpan === "object") return inheritedSpan;
    const nextStart =
      item.columnStart === undefined
        ? inspected.columnStart.effective
        : item.columnStart === null
          ? inheritedStart
          : item.columnStart;
    const nextSpan =
      item.columnSpan === undefined
        ? inspected.columnSpan.effective
        : item.columnSpan === null
          ? inheritedSpan
          : item.columnSpan;
    if (!validTrack(nextSpan)) return failure("missing-column-span", "The item would have no valid column span.", item.id);
    if (typeof nextStart === "number" && nextStart + nextSpan - 1 > nextColumns) {
      return failure(
        "grid-placement-overflow",
        `Column ${nextStart} with span ${nextSpan} exceeds the ${nextColumns}-column grid.`,
        item.id
      );
    }
    const itemUpdates: Array<{ property: GridLayoutTokenProperty; value: number | null }> = [];
    if (item.columnStart !== undefined) itemUpdates.push({ property: "columnStart", value: item.columnStart });
    if (item.columnSpan !== undefined) itemUpdates.push({ property: "columnSpan", value: item.columnSpan });
    if (itemUpdates.length > 0) updates.set(item.id, itemUpdates);
  }

  const editsWithoutAppliedRange: Array<Omit<PatchTextEdit, "appliedRange">> = [];
  for (const entry of [scope.parent, ...scope.children]) {
    const changes = updates.get(entry.id);
    if (!changes && !(entry.id === scope.parent.id && request.columnTemplate !== undefined)) continue;
    const nextClassName =
      entry.id === scope.parent.id && request.columnTemplate !== undefined
        ? updateStaticGridTemplate(entry, request.columnTemplate, request.breakpoint)
        : updateStaticClassName(entry, changes ?? [], request.breakpoint);
    if (typeof nextClassName !== "string") return nextClassName;
    if (nextClassName !== entry.className.value) editsWithoutAppliedRange.push(classEdit(entry, nextClassName));
  }
  if (editsWithoutAppliedRange.length === 0) {
    return failure("no-change", "The requested grid layout already matches the source.", request.parentId);
  }

  const source = fs.readFileSync(scope.parent.file, "utf8");
  const currentHash = sourceHash(source);
  if (currentHash !== scope.parent.sourceHash) {
    return failure("source-hash-mismatch", "The source changed after the grid binding was generated.", request.parentId);
  }
  const sorted = [...editsWithoutAppliedRange].sort((left, right) => left.range.start - right.range.start);
  let delta = 0;
  const edits: PatchTextEdit[] = [];
  for (const edit of sorted) {
    if (source.slice(edit.range.start, edit.range.end) !== edit.oldText) {
      return failure(
        "grid-range-mismatch",
        `The stored className range no longer matches grid binding ${edit.id}.`,
        edit.id
      );
    }
    const appliedStart = edit.range.start + delta;
    delta += edit.newText.length - edit.oldText.length;
    edits.push({
      ...edit,
      appliedRange: { start: appliedStart, end: appliedStart + edit.newText.length }
    });
  }
  let patchedSource = source;
  for (const edit of [...edits].reverse()) {
    patchedSource = `${patchedSource.slice(0, edit.range.start)}${edit.newText}${patchedSource.slice(edit.range.end)}`;
  }
  const first = edits[0];
  const last = edits[edits.length - 1];
  const patch: PatchPreview = {
    ok: true,
    kind: "grid-layout",
    id: scope.parent.id,
    file: scope.parent.file,
    relativeFile: scope.parent.relativeFile,
    oldToken: `grid-layout:${request.breakpoint}`,
    nextToken: `grid-layout:${request.breakpoint}:${edits.length}`,
    range: { start: first.range.start, end: last.range.end },
    before: edits.map((edit) => `${edit.label}: ${edit.oldText}`).join("\n"),
    after: edits.map((edit) => `${edit.label}: ${edit.newText}`).join("\n"),
    sourceHashBefore: currentHash,
    sourceHashAfter: sourceHash(patchedSource),
    edits,
    metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
  };
  return {
    ok: true,
    inspection,
    patch,
    affectedBindingCount: edits.length
  };
}
