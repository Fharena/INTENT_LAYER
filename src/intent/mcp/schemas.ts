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

export const inspectLayoutInput = {
  breakpoint: z.string().trim().min(1).default("base").describe("Tailwind breakpoint to inspect, such as base or md.")
};

export const previewLayoutInput = {
  kind: z.enum(["grid", "flex"]).describe("Layout kind returned by inspect_layout."),
  breakpoint: z.string().trim().min(1).default("base").describe("Tailwind breakpoint returned by inspect_layout."),
  columns: z.number().int().min(1).max(12).nullable().optional().describe("Grid column count, or null to remove a non-base override."),
  rows: z.number().int().min(1).max(12).nullable().optional().describe("Grid row count, or null to remove an override."),
  columnTemplate: z
    .array(z.number().positive().max(12))
    .min(1)
    .max(12)
    .nullable()
    .optional()
    .describe("Grid fractional track weights, or null to remove an arbitrary template."),
  direction: z.enum(["row", "row-reverse", "col", "col-reverse"]).nullable().optional(),
  wrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).nullable().optional(),
  justify: z
    .enum(["normal", "start", "end", "center", "between", "around", "evenly", "stretch"])
    .nullable()
    .optional(),
  align: z.enum(["start", "end", "center", "baseline", "stretch"]).nullable().optional(),
  gap: z.string().trim().min(1).nullable().optional().describe("Exact Flex gap token returned by inspect_layout."),
  items: z
    .array(
      z.object({
        id: z.string().min(1).describe("Direct child id returned by inspect_layout."),
        columnStart: z.number().int().min(1).max(12).nullable().optional(),
        columnSpan: z.number().int().min(1).max(12).nullable().optional(),
        rowStart: z.number().int().min(1).max(12).nullable().optional(),
        rowSpan: z.number().int().min(1).max(12).nullable().optional(),
        alignSelf: z.enum(["auto", "start", "end", "center", "stretch", "baseline"]).nullable().optional()
      })
    )
    .max(100)
    .default([])
    .describe("Only changed direct children, using ids from inspect_layout.")
};

export const applyEditInput = {
  previewId: z.string().uuid().describe("Preview id returned by preview_edit or preview_layout."),
  idempotencyKey: z.string().min(8).max(200).describe("Stable unique key for this intended apply operation.")
};

export const undoEditInput = {
  operationId: z.string().min(1).optional().describe("Operation id returned by apply_edit, or latest.")
};

export const verifyEditInput = {
  operationId: z.string().min(1).describe("Operation id returned by apply_edit.")
};
