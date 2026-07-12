import * as z from "zod/v4";

export const findElementsInput = {
  query: z.string().trim().optional().describe("Free-text match across id, component, file, tag, and classes."),
  component: z.string().trim().optional().describe("Exact React component name."),
  file: z.string().trim().optional().describe("Partial project-relative source path."),
  tag: z.string().trim().optional().describe("Exact rendered tag name."),
  token: z.string().trim().optional().describe("Exact Tailwind token."),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum results. Defaults to 20.")
};

export const inspectElementInput = {
  id: z.string().min(1).describe("Intent id returned by find_elements or the current selection resource.")
};

export const previewEditInput = {
  targetId: z.string().min(1).describe("Intent id to edit."),
  property: z.string().min(1).describe("Semantic property returned by inspect_element."),
  value: z.string().min(1).describe("Candidate value returned by inspect_element, or replacement copy for content.text."),
  variant: z.string().nullable().optional().describe("Variant such as hover when the property is ambiguous."),
  scope: z.literal("source").optional().describe("Only deterministic source scope is currently supported.")
};

export const applyEditInput = {
  previewId: z.string().uuid().describe("Preview id returned by preview_edit."),
  idempotencyKey: z.string().min(8).max(200).describe("Stable unique key for this intended apply operation.")
};

export const undoEditInput = {
  operationId: z.string().min(1).optional().describe("Operation id returned by apply_edit, or latest.")
};

export const verifyEditInput = {
  operationId: z.string().min(1).describe("Operation id returned by apply_edit.")
};
