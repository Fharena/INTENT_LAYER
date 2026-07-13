import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntentSelectedLayoutEditRequest, IntentService } from "../intentService";
import {
  applyEditInput,
  findElementsInput,
  inspectElementInput,
  inspectLayoutInput,
  previewEditInput,
  previewLayoutInput,
  undoEditInput,
  verifyEditInput
} from "./schemas";
import { toolResult } from "./result";

export const intentToolNames = [
  "intent_find_elements",
  "intent_inspect_element",
  "intent_inspect_layout",
  "intent_preview_edit",
  "intent_preview_layout",
  "intent_apply_edit",
  "intent_undo_edit",
  "intent_verify_edit"
] as const;

export function registerIntentTools(server: McpServer, service: IntentService): void {
  server.registerTool(
    "intent_find_elements",
    {
      title: "Find UI elements",
      description: "Find instrumented React elements before inspecting or editing one.",
      inputSchema: findElementsInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => toolResult(service.findElements(input))
  );

  server.registerTool(
    "intent_inspect_element",
    {
      title: "Inspect a UI element",
      description: "Read source evidence and deterministic editable properties for an intent id.",
      inputSchema: inspectElementInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ id }) => toolResult(service.inspectElement(id))
  );

  server.registerTool(
    "intent_preview_edit",
    {
      title: "Preview a UI edit",
      description: "Create an expiring minimal source diff. Call inspect_element first and do not guess values.",
      inputSchema: previewEditInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => toolResult(service.previewSemanticEdit(input))
  );

  server.registerTool(
    "intent_inspect_layout",
    {
      title: "Inspect the selected layout",
      description:
        "Inspect the Grid or Flex scope around the current browser selection. Parent and child ids are resolved from the live selection, not caller input.",
      inputSchema: inspectLayoutInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) => toolResult(service.inspectSelectedLayout(input))
  );

  server.registerTool(
    "intent_preview_layout",
    {
      title: "Preview a selected layout edit",
      description:
        "Create an expiring grouped Grid or Flex diff for the current browser selection. Call inspect_layout first and reuse only returned values and child ids.",
      inputSchema: previewLayoutInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async (input) =>
      toolResult(service.previewSelectedLayout(input as IntentSelectedLayoutEditRequest))
  );

  server.registerTool(
    "intent_apply_edit",
    {
      title: "Apply a previewed UI edit",
      description:
        "Apply a previously previewed property, text, Grid, or Flex edit after source hash and file-lock validation.",
      inputSchema: applyEditInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
    },
    async (input) => toolResult(service.applySemanticEdit(input))
  );

  server.registerTool(
    "intent_undo_edit",
    {
      title: "Undo an Intent Layer edit",
      description: "Undo the latest pending operation, or a supplied operation when it is the latest safe undo.",
      inputSchema: undoEditInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
    },
    async ({ operationId }) => toolResult(service.undoSemanticEdit(operationId ?? "latest"))
  );

  server.registerTool(
    "intent_verify_edit",
    {
      title: "Verify an Intent Layer edit",
      description: "Verify that the guarded source patch is intact. Runtime verification is reported separately.",
      inputSchema: verifyEditInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ operationId }) => {
      const result = await service.verifySemanticEditWithRuntime(operationId);
      return toolResult(result, {
        isError: result.source !== "verified" || result.runtime === "drifted"
      });
    }
  );
}
