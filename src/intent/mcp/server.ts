import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IntentGraphStore } from "../graphStore";
import { IntentService } from "../intentService";
import { registerIntentResources } from "./resources";
import { registerIntentTools } from "./tools";

export interface IntentMcpServerOptions {
  rootDir?: string;
}

export function createIntentMcpServer(options: IntentMcpServerOptions = {}) {
  const graphStore = new IntentGraphStore(options.rootDir ?? process.cwd());
  const service = new IntentService(graphStore, { graphMode: "disk" });
  const server = new McpServer({ name: "intent-layer", version: "0.0.1" });
  registerIntentTools(server, service);
  registerIntentResources(server, service);
  return { server, service, graphStore };
}

export async function runIntentMcpServer(options: IntentMcpServerOptions = {}): Promise<void> {
  const { server } = createIntentMcpServer(options);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`Intent Layer MCP ready for ${options.rootDir ?? process.cwd()}\n`);
}
