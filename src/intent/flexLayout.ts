import fs from "node:fs";
import path from "node:path";
import { sourceHash } from "./hash";
import { candidatesForToken, splitTailwindVariant } from "./tailwind";
import type {
  FlexLayoutAlign,
  FlexLayoutAlignSelf,
  FlexLayoutBreakpoint,
  FlexLayoutDirection,
  FlexLayoutEditRequest,
  FlexLayoutInspectRequest,
  FlexLayoutInspection,
  FlexLayoutJustify,
  FlexLayoutResolvedValue,
  FlexLayoutWrap,
  IntentBinding,
  PatchFailure,
  PatchPreview,
  PatchTextEdit
} from "./types";

const defaultBreakpoints: FlexLayoutBreakpoint[] = ["base", "sm", "md", "lg", "xl", "2xl"];
const directionValues: FlexLayoutDirection[] = ["row", "row-reverse", "col", "col-reverse"];
const wrapValues: FlexLayoutWrap[] = ["nowrap", "wrap", "wrap-reverse"];
const justifyValues: FlexLayoutJustify[] = [
  "normal",
  "start",
  "end",
  "center",
  "between",
  "around",
  "evenly",
  "stretch"
];
const alignValues: FlexLayoutAlign[] = ["start", "end", "center", "baseline", "stretch"];
const alignSelfValues: FlexLayoutAlignSelf[] = ["auto", "start", "end", "center", "stretch", "baseline"];

type FlexParentProperty = "direction" | "wrap" | "justify" | "align" | "gap";
type FlexProperty = FlexParentProperty | "alignSelf";

interface ParsedFlexToken {
  breakpoint: string;
  property: FlexProperty;
  value: string;
}

interface FlexParticipants {
  parent: IntentBinding;
  children: IntentBinding[];
}

export interface FlexLayoutPlan {
  ok: true;
  inspection: FlexLayoutInspection;
  patch: PatchPreview;
  affectedBindingCount: number;
}

function failure(reason: string, detail: string, id?: string): PatchFailure {
  return { ok: false, id, reason, detail };
}

function normalizeBreakpoints(values: FlexLayoutBreakpoint[] = defaultBreakpoints): FlexLayoutBreakpoint[] {
  return ["base", ...values.filter((value) => value !== "base")].filter(
    (value, index, all) => value.length > 0 && all.indexOf(value) === index
  );
}

function parseFlexToken(token: string): ParsedFlexToken | null {
  const { variantPrefix, base } = splitTailwindVariant(token);
  const breakpoint = variantPrefix ? variantPrefix.slice(0, -1) : "base";
  const direction = /^flex-(row|row-reverse|col|col-reverse)$/.exec(base)?.[1];
  if (direction) return { breakpoint, property: "direction", value: direction };
  const wrap = /^flex-(nowrap|wrap|wrap-reverse)$/.exec(base)?.[1];
  if (wrap) return { breakpoint, property: "wrap", value: wrap };
  const justify = /^justify-(normal|start|end|center|between|around|evenly|stretch)$/.exec(base)?.[1];
  if (justify) return { breakpoint, property: "justify", value: justify };
  const align = /^items-(start|end|center|baseline|stretch)$/.exec(base)?.[1];
  if (align) return { breakpoint, property: "align", value: align };
  const alignSelf = /^self-(auto|start|end|center|stretch|baseline)$/.exec(base)?.[1];
  if (alignSelf) return { breakpoint, property: "alignSelf", value: alignSelf };
  const gap = /^gap-(?![xy]-)(.+)$/.exec(base)?.[1];
  if (gap) return { breakpoint, property: "gap", value: `gap-${gap}` };
  return null;
}

function exactValue(
  entry: IntentBinding,
  property: FlexProperty,
  breakpoint: FlexLayoutBreakpoint
): string | null | PatchFailure {
  const matches = entry.tokens
    .map((token) => parseFlexToken(token.token))
    .filter((token): token is ParsedFlexToken => Boolean(token?.property === property && token.breakpoint === breakpoint));
  if (matches.length > 1) {
    return failure(
      "ambiguous-flex-token",
      `More than one ${breakpoint}:${property} token exists on ${entry.id}.`,
      entry.id
    );
  }
  return matches[0]?.value ?? null;
}

function effectiveValue(
  entry: IntentBinding,
  property: FlexProperty,
  breakpoint: FlexLayoutBreakpoint,
  fallback: string | null,
  breakpoints: FlexLayoutBreakpoint[]
): string | null | PatchFailure {
  for (let index = breakpoints.indexOf(breakpoint); index >= 0; index -= 1) {
    const value = exactValue(entry, property, breakpoints[index]);
    if (value && typeof value === "object") return value;
    if (value !== null) return value;
  }
  return fallback;
}

function resolvedValue<T extends string>(
  entry: IntentBinding,
  property: FlexProperty,
  breakpoint: FlexLayoutBreakpoint,
  fallback: T,
  breakpoints: FlexLayoutBreakpoint[]
): FlexLayoutResolvedValue<T> | PatchFailure {
  const explicit = exactValue(entry, property, breakpoint);
  if (explicit && typeof explicit === "object") return explicit;
  const effective = effectiveValue(entry, property, breakpoint, fallback, breakpoints);
  if (effective && typeof effective === "object") return effective;
  return { explicit: explicit as T | null, effective: effective as T };
}

function tokenVariantAndBase(token: string): { variant: string; base: string } {
  const { variantPrefix, base } = splitTailwindVariant(token);
  return { variant: variantPrefix ? variantPrefix.slice(0, -1) : "base", base };
}

function unsupportedFlexConflict(
  entry: IntentBinding,
  role: "parent" | "child",
  relevantBreakpoints: Set<string>
): string | null {
  for (const token of entry.tokens) {
    const parsed = parseFlexToken(token.token);
    const { variant, base } = tokenVariantAndBase(token.token);
    if (!relevantBreakpoints.has(variant)) continue;
    if (role === "parent") {
      if (/^gap-[xy]-/.test(base)) return token.token;
      if (/^(?:justify-|items-|gap-)/.test(base) && !parsed) return token.token;
      if (/^flex-(?:row|col|wrap|nowrap)/.test(base) && !parsed) return token.token;
    } else if (/^self-/.test(base) && !parsed) {
      return token.token;
    }
  }
  return null;
}

function participants(
  resolve: (id: string) => IntentBinding | undefined,
  request: FlexLayoutInspectRequest,
  breakpoints: FlexLayoutBreakpoint[]
): FlexParticipants | PatchFailure {
  if (!breakpoints.includes(request.breakpoint)) {
    return failure("unsupported-breakpoint", `Breakpoint ${request.breakpoint} is not supported.`, request.parentId);
  }
  const parent = resolve(request.parentId);
  if (!parent) return failure("missing-binding", "The selected flex parent has no current source binding.", request.parentId);
  if (request.unboundChildCount && request.unboundChildCount > 0) {
    return failure(
      "unbound-flex-child",
      `${request.unboundChildCount} direct flex child element(s) have no source binding.`,
      request.parentId
    );
  }
  if (request.childIds.length === 0) {
    return failure("empty-flex", "The selected flex container has no bound direct children.", request.parentId);
  }
  if (new Set(request.childIds).size !== request.childIds.length) {
    return failure(
      "repeated-flex-binding",
      "At least two rendered flex children share one source binding. Per-instance layout needs a prop or variant refactor.",
      request.parentId
    );
  }
  const children: IntentBinding[] = [];
  for (const id of request.childIds) {
    const child = resolve(id);
    if (!child) return failure("missing-flex-child", `No current source binding exists for flex child ${id}.`, id);
    children.push(child);
  }
  const all = [parent, ...children];
  if (all.some((entry) => entry.className.kind !== "static")) {
    return failure(
      "dynamic-flex-classname",
      "Flex composition requires static className literals on the parent and every direct child.",
      request.parentId
    );
  }
  if (all.some((entry) => /[\r\n]/.test(entry.className.value))) {
    return failure(
      "multiline-flex-classname",
      "Multiline className literals are inspectable but read-only in the Flex composer.",
      request.parentId
    );
  }
  if (all.some((entry) => entry.className.value !== entry.tokens.map((token) => token.token).join(" "))) {
    return failure(
      "noncanonical-flex-classname",
      "The Flex composer preserves unusual className whitespace by leaving this layout read-only.",
      request.parentId
    );
  }
  if (all.some((entry) => path.resolve(entry.file) !== path.resolve(parent.file))) {
    return failure(
      "cross-file-flex",
      "The flex parent and direct children span multiple source files. Use an agent refactor instead.",
      request.parentId
    );
  }
  if (!parent.tokens.some((token) => token.token === "flex" || token.token === "inline-flex")) {
    return failure("not-static-flex", "The selected parent needs a base flex or inline-flex token.", request.parentId);
  }
  const targetIndex = breakpoints.indexOf(request.breakpoint);
  const relevantBreakpoints = new Set(breakpoints.slice(0, targetIndex + 1));
  const parentConflict = unsupportedFlexConflict(parent, "parent", relevantBreakpoints);
  if (parentConflict) {
    return failure("unsupported-flex-token", `Unsupported parent flex token: ${parentConflict}.`, request.parentId);
  }
  for (const child of children) {
    const conflict = unsupportedFlexConflict(child, "child", relevantBreakpoints);
    if (conflict) return failure("unsupported-flex-token", `Unsupported child flex token: ${conflict}.`, child.id);
  }
  return { parent, children };
}

function normalizedGapCandidates(values: string[]): string[] {
  return [...new Set(values.filter((value) => /^gap-(?![xy]-)\S+$/.test(value)))];
}

export function inspectFlexLayout(
  resolve: (id: string) => IntentBinding | undefined,
  request: FlexLayoutInspectRequest,
  supportedBreakpoints: FlexLayoutBreakpoint[] = defaultBreakpoints,
  gapCandidates: string[] = candidatesForToken("gap-4")
): FlexLayoutInspection | PatchFailure {
  const breakpoints = normalizeBreakpoints(supportedBreakpoints);
  const scope = participants(resolve, request, breakpoints);
  if (!("parent" in scope)) return scope;
  const direction = resolvedValue(scope.parent, "direction", request.breakpoint, "row", breakpoints);
  if ("reason" in direction) return direction;
  const wrap = resolvedValue(scope.parent, "wrap", request.breakpoint, "nowrap", breakpoints);
  if ("reason" in wrap) return wrap;
  const justify = resolvedValue(scope.parent, "justify", request.breakpoint, "normal", breakpoints);
  if ("reason" in justify) return justify;
  const align = resolvedValue(scope.parent, "align", request.breakpoint, "stretch", breakpoints);
  if ("reason" in align) return align;
  const explicitGap = exactValue(scope.parent, "gap", request.breakpoint);
  if (explicitGap && typeof explicitGap === "object") return explicitGap;
  const effectiveGap = effectiveValue(scope.parent, "gap", request.breakpoint, null, breakpoints);
  if (effectiveGap && typeof effectiveGap === "object") return effectiveGap;
  const candidates = normalizedGapCandidates([
    ...(effectiveGap ? [effectiveGap] : []),
    ...gapCandidates
  ]);

  const items: FlexLayoutInspection["items"] = [];
  for (const child of scope.children) {
    const alignSelf = resolvedValue(child, "alignSelf", request.breakpoint, "auto", breakpoints);
    if ("reason" in alignSelf) return alignSelf;
    items.push({
      id: child.id,
      label: `${child.componentName ?? "Component"}.${child.tagName}`,
      alignSelf
    });
  }
  return {
    ok: true,
    parentId: scope.parent.id,
    relativeFile: scope.parent.relativeFile,
    breakpoint: request.breakpoint,
    supportedBreakpoints: breakpoints,
    direction,
    wrap,
    justify,
    align,
    gap: {
      explicit: explicitGap,
      effective: effectiveGap,
      candidates
    },
    items
  };
}

function flexToken(property: FlexProperty, value: string, breakpoint: FlexLayoutBreakpoint): string {
  const base =
    property === "direction" || property === "wrap"
      ? `flex-${value}`
      : property === "justify"
        ? `justify-${value}`
        : property === "align"
          ? `items-${value}`
          : property === "alignSelf"
            ? `self-${value}`
            : value;
  return `${breakpoint === "base" ? "" : `${breakpoint}:`}${base}`;
}

function updateStaticClassName(
  entry: IntentBinding,
  changes: Array<{ property: FlexProperty; value: string | null }>,
  breakpoint: FlexLayoutBreakpoint
): string | PatchFailure {
  const tokens = entry.tokens.map((token) => token.token);
  for (const change of changes) {
    const indexes = tokens.flatMap((token, index) => {
      const parsed = parseFlexToken(token);
      return parsed?.property === change.property && parsed.breakpoint === breakpoint ? [index] : [];
    });
    if (indexes.length > 1) {
      return failure("ambiguous-flex-token", `More than one ${breakpoint}:${change.property} token exists.`, entry.id);
    }
    const index = indexes[0];
    if (change.value === null) {
      if (index !== undefined) tokens.splice(index, 1);
      continue;
    }
    const nextToken = flexToken(change.property, change.value, breakpoint);
    if (index === undefined) tokens.push(nextToken);
    else tokens[index] = nextToken;
  }
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

export function planFlexLayout(
  resolve: (id: string) => IntentBinding | undefined,
  request: FlexLayoutEditRequest,
  supportedBreakpoints: FlexLayoutBreakpoint[] = defaultBreakpoints,
  gapCandidates: string[] = candidatesForToken("gap-4")
): FlexLayoutPlan | PatchFailure {
  const started = performance.now();
  const breakpoints = normalizeBreakpoints(supportedBreakpoints);
  const inspection = inspectFlexLayout(resolve, request, breakpoints, gapCandidates);
  if (!inspection.ok) return inspection;
  const scope = participants(resolve, request, breakpoints);
  if (!("parent" in scope)) return scope;
  const childById = new Map(scope.children.map((child) => [child.id, child]));
  if (new Set(request.items.map((item) => item.id)).size !== request.items.length) {
    return failure("duplicate-flex-edit", "A flex child appears more than once in the layout edit.", request.parentId);
  }
  if (request.items.some((item) => !childById.has(item.id))) {
    return failure("flex-child-out-of-scope", "A requested item is not a direct child of the selected flex container.", request.parentId);
  }
  if (request.direction !== undefined && request.direction !== null && !directionValues.includes(request.direction)) {
    return failure("invalid-flex-direction", "Unsupported flex direction.", request.parentId);
  }
  if (request.wrap !== undefined && request.wrap !== null && !wrapValues.includes(request.wrap)) {
    return failure("invalid-flex-wrap", "Unsupported flex wrap mode.", request.parentId);
  }
  if (request.justify !== undefined && request.justify !== null && !justifyValues.includes(request.justify)) {
    return failure("invalid-flex-justify", "Unsupported flex justification.", request.parentId);
  }
  if (request.align !== undefined && request.align !== null && !alignValues.includes(request.align)) {
    return failure("invalid-flex-align", "Unsupported flex item alignment.", request.parentId);
  }
  if (request.gap !== undefined && request.gap !== null && !inspection.gap.candidates.includes(request.gap)) {
    return failure("invalid-flex-gap", "The requested gap is not a known project candidate.", request.parentId);
  }

  const updates = new Map<string, Array<{ property: FlexProperty; value: string | null }>>();
  const parentUpdates: Array<{ property: FlexProperty; value: string | null }> = [];
  if (request.direction !== undefined) parentUpdates.push({ property: "direction", value: request.direction });
  if (request.wrap !== undefined) parentUpdates.push({ property: "wrap", value: request.wrap });
  if (request.justify !== undefined) parentUpdates.push({ property: "justify", value: request.justify });
  if (request.align !== undefined) parentUpdates.push({ property: "align", value: request.align });
  if (request.gap !== undefined) parentUpdates.push({ property: "gap", value: request.gap });
  if (parentUpdates.length > 0) updates.set(scope.parent.id, parentUpdates);
  for (const item of request.items) {
    if (item.alignSelf !== undefined && item.alignSelf !== null && !alignSelfValues.includes(item.alignSelf)) {
      return failure("invalid-flex-align-self", "Unsupported child self alignment.", item.id);
    }
    if (item.alignSelf !== undefined) {
      updates.set(item.id, [{ property: "alignSelf", value: item.alignSelf }]);
    }
  }

  const editsWithoutAppliedRange: Array<Omit<PatchTextEdit, "appliedRange">> = [];
  for (const entry of [scope.parent, ...scope.children]) {
    const changes = updates.get(entry.id);
    if (!changes) continue;
    const nextClassName = updateStaticClassName(entry, changes, request.breakpoint);
    if (typeof nextClassName !== "string") return nextClassName;
    if (nextClassName !== entry.className.value) editsWithoutAppliedRange.push(classEdit(entry, nextClassName));
  }
  if (editsWithoutAppliedRange.length === 0) {
    return failure("no-change", "The requested flex layout already matches the source.", request.parentId);
  }

  const source = fs.readFileSync(scope.parent.file, "utf8");
  const currentHash = sourceHash(source);
  if (currentHash !== scope.parent.sourceHash) {
    return failure("source-hash-mismatch", "The source changed after the flex binding was generated.", request.parentId);
  }
  const sorted = [...editsWithoutAppliedRange].sort((left, right) => left.range.start - right.range.start);
  let delta = 0;
  const edits: PatchTextEdit[] = [];
  for (const edit of sorted) {
    if (source.slice(edit.range.start, edit.range.end) !== edit.oldText) {
      return failure("flex-range-mismatch", `The stored className range no longer matches ${edit.id}.`, edit.id);
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
    kind: "flex-layout",
    id: scope.parent.id,
    file: scope.parent.file,
    relativeFile: scope.parent.relativeFile,
    oldToken: `flex-layout:${request.breakpoint}`,
    nextToken: `flex-layout:${request.breakpoint}:${edits.length}`,
    range: { start: first.range.start, end: last.range.end },
    before: edits.map((edit) => `${edit.label}: ${edit.oldText}`).join("\n"),
    after: edits.map((edit) => `${edit.label}: ${edit.newText}`).join("\n"),
    sourceHashBefore: currentHash,
    sourceHashAfter: sourceHash(patchedSource),
    edits,
    metrics: { previewMs: Number((performance.now() - started).toFixed(3)) }
  };
  return { ok: true, inspection, patch, affectedBindingCount: edits.length };
}
