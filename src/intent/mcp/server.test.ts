import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { IntentGraphStore } from "../graphStore";
import { instrumentSource } from "../instrument";
import { writeRuntimeSelection } from "../runtimeSession";
import { createIntentMcpServer } from "./server";
import { intentToolNames } from "./tools";

const roots: string[] = [];

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-mcp-"));
  roots.push(rootDir);
  const file = path.join(rootDir, "src", "App.tsx");
  const source = 'export function App(){ return <main className="gap-4 p-4">App</main>; }';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf8");
  const entries = instrumentSource({ code: source, file, rootDir }).entries;
  const store = new IntentGraphStore(rootDir);
  store.replaceFileEntries(file, entries);
  store.publish();
  return { rootDir, file, source, entry: entries[0] };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Intent Layer MCP", () => {
  it("runs the complete guarded edit round trip through an MCP client", async () => {
    const { rootDir, file, source, entry } = fixture();
    writeRuntimeSelection(rootDir, entry, {
      id: entry.id,
      route: "/demo",
      text: "App",
      role: "main",
      visible: true,
      rect: { x: 10, y: 20, width: 300, height: 120 }
    });
    const { server } = createIntentMcpServer({ rootDir });
    const client = new Client({ name: "intent-layer-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...intentToolNames].sort());

      const found = await client.callTool({
        name: "intent_find_elements",
        arguments: { token: "gap-4" }
      });
      expect(found.structuredContent).toMatchObject({ count: 1 });

      const inspected = await client.callTool({
        name: "intent_inspect_element",
        arguments: { id: entry.id }
      });
      expect(inspected.structuredContent).toMatchObject({
        ok: true,
        element: { properties: expect.arrayContaining([expect.objectContaining({ property: "layout.gap" })]) }
      });

      const previewed = await client.callTool({
        name: "intent_preview_edit",
        arguments: { targetId: entry.id, property: "layout.gap", value: "6" }
      });
      const previewContent = previewed.structuredContent as Record<string, unknown> | undefined;
      const previewId = String(previewContent?.previewId);
      expect(previewId).not.toBe("undefined");
      expect(fs.readFileSync(file, "utf8")).toBe(source);

      const applied = await client.callTool({
        name: "intent_apply_edit",
        arguments: { previewId, idempotencyKey: "mcp-round-trip-edit" }
      });
      const appliedContent = applied.structuredContent as Record<string, unknown> | undefined;
      const operationId = String(appliedContent?.operationId);
      expect(applied.structuredContent).toMatchObject({ ok: true, idempotentReplay: false });
      expect(fs.readFileSync(file, "utf8")).toBe(source.replace("gap-4", "gap-6"));

      const verified = await client.callTool({
        name: "intent_verify_edit",
        arguments: { operationId }
      });
      expect(verified.structuredContent).toMatchObject({
        ok: true,
        source: "verified",
        runtime: "unavailable"
      });

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain("intent://graph/current");
      const graph = await client.readResource({ uri: "intent://graph/current" });
      expect(graph.contents[0]).toMatchObject({ mimeType: "application/json" });
      const selection = await client.readResource({ uri: "intent://selection/current" });
      expect(selection.contents[0]).toMatchObject({ mimeType: "application/json" });
      const selectionContent = selection.contents[0];
      expect("text" in selectionContent).toBe(true);
      if (!("text" in selectionContent)) return;
      expect(JSON.parse(selectionContent.text)).toMatchObject({
        selection: { id: entry.id, route: "/demo", text: "App" }
      });

      const undone = await client.callTool({
        name: "intent_undo_edit",
        arguments: { operationId }
      });
      expect(undone.structuredContent).toMatchObject({ ok: true, reverted: true });
      expect(fs.readFileSync(file, "utf8")).toBe(source);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
