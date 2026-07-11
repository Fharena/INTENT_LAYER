import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntentService } from "../intentService";
import {
  applyEditInput,
  findElementsInput,
  inspectElementInput,
  previewEditInput,
  undoEditInput,
  verifyEditInput
} from "./schemas";
import { toolResult } from "./result";

export const intentToolNames = [
  "intent_find_elements",
  "intent_inspect_element",
  "intent_preview_edit",
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
    "intent_apply_edit",
    {
      title: "Apply a previewed UI edit",
      description: "Apply a previously previewed edit after source hash and file-lock validation.",
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
    async ({ operationId }) => toolResult(await service.verifySemanticEditWithRuntime(operationId))
  );
}
