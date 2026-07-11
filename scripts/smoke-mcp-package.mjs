import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-mcp-package-"));
const graphDir = path.join(root, ".intent");
fs.mkdirSync(graphDir, { recursive: true });
fs.writeFileSync(
  path.join(graphDir, "graph.intent.json"),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), entries: {} }, null, 2)}\n`,
  "utf8"
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/mcp.js"), "--root", root],
  cwd: process.cwd(),
  stderr: "pipe"
});
const client = new Client({ name: "intent-layer-package-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = [
    "intent_find_elements",
    "intent_inspect_element",
    "intent_preview_edit",
    "intent_apply_edit",
    "intent_undo_edit",
    "intent_verify_edit"
  ];
  const actual = tools.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected.sort())) {
    throw new Error(`Unexpected MCP tools: ${actual.join(", ")}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, toolCount: actual.length })}\n`);
} finally {
  await client.close();
  fs.rmSync(root, { recursive: true, force: true });
}
