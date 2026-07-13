import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function toolResult(value: unknown, options: { isError?: boolean } = {}): CallToolResult {
  const object = value && typeof value === "object" ? (value as Record<string, unknown>) : { value };
  return {
    content: [{ type: "text", text: JSON.stringify(object, null, 2) }],
    structuredContent: object,
    isError: options.isError ?? object.ok === false
  };
}
