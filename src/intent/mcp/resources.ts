import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntentService } from "../intentService";
import { readRuntimeSelection } from "../runtimeSession";

function jsonResource(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: `${JSON.stringify(value, null, 2)}\n`
      }
    ]
  };
}

export function registerIntentResources(server: McpServer, service: IntentService): void {
  server.registerResource(
    "intent-current-selection",
    "intent://selection/current",
    {
      title: "Current Intent Layer selection",
      description: "The element and nearest supported layout scope most recently selected in the browser overlay.",
      mimeType: "application/json"
    },
    async (uri) => jsonResource(uri, readRuntimeSelection(service.rootDir))
  );

  server.registerResource(
    "intent-current-graph",
    "intent://graph/current",
    {
      title: "Current Intent Layer graph",
      description: "Source bindings currently published by the React integration.",
      mimeType: "application/json"
    },
    async (uri) => jsonResource(uri, service.graph())
  );

  server.registerResource(
    "intent-recent-operations",
    "intent://operations/recent",
    {
      title: "Recent Intent Layer operations",
      description: "Pending deterministic edits that can be verified or undone.",
      mimeType: "application/json"
    },
    async (uri) => jsonResource(uri, service.undoHistory())
  );
}
