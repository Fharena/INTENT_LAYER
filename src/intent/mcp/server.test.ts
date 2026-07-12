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

function flexFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-mcp-layout-"));
  roots.push(rootDir);
  const file = path.join(rootDir, "src", "App.tsx");
  const source =
    'export function App(){ return <section className="flex items-center justify-between gap-4"><article className="self-auto rounded">A</article><article className="rounded">B</article></section>; }';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf8");
  const entries = instrumentSource({ code: source, file, rootDir }).entries;
  const parent = entries.find((entry) => entry.tagName === "section");
  const children = entries.filter((entry) => entry.tagName === "article");
  if (!parent || children.length !== 2) throw new Error("Invalid MCP Flex fixture.");
  const store = new IntentGraphStore(rootDir);
  store.replaceFileEntries(file, entries);
  store.publish();
  return { rootDir, file, source, parent, children };
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
      classTokens: ["gap-4", "p-4"],
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
        element: {
          literalText: "App",
          properties: expect.arrayContaining([
            expect.objectContaining({ property: "layout.gap" }),
            expect.objectContaining({ property: "content.text", value: "App" })
          ])
        }
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
        ok: false,
        source: "verified",
        runtime: "unavailable"
      });
      expect(verified.isError).toBe(false);

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
        selection: { id: entry.id, route: "/demo", text: "App", classTokens: ["gap-4", "p-4"] }
      });

      const missingLayout = await client.callTool({
        name: "intent_inspect_layout",
        arguments: { breakpoint: "base" }
      });
      expect(missingLayout.structuredContent).toMatchObject({
        ok: false,
        reason: "missing-layout-selection"
      });
      expect(missingLayout.isError).toBe(true);

      const undone = await client.callTool({
        name: "intent_undo_edit",
        arguments: { operationId }
      });
      expect(undone.structuredContent).toMatchObject({ ok: true, reverted: true });
      expect(fs.readFileSync(file, "utf8")).toBe(source);

      const textPreview = await client.callTool({
        name: "intent_preview_edit",
        arguments: { targetId: entry.id, property: "content.text", value: "MCP title" }
      });
      const textPreviewId = String(
        (textPreview.structuredContent as Record<string, unknown> | undefined)?.previewId
      );
      const textApply = await client.callTool({
        name: "intent_apply_edit",
        arguments: { previewId: textPreviewId, idempotencyKey: "mcp-literal-text-edit" }
      });
      const textOperationId = String(
        (textApply.structuredContent as Record<string, unknown> | undefined)?.operationId
      );
      expect(textApply.structuredContent).toMatchObject({ ok: true });
      expect(fs.readFileSync(file, "utf8")).toBe(source.replace(">App</", ">MCP title</"));
      const textVerified = await client.callTool({
        name: "intent_verify_edit",
        arguments: { operationId: textOperationId }
      });
      expect(textVerified.structuredContent).toMatchObject({
        ok: true,
        source: "verified",
        runtime: "unavailable"
      });
      const textUndone = await client.callTool({
        name: "intent_undo_edit",
        arguments: { operationId: textOperationId }
      });
      expect(textUndone.structuredContent).toMatchObject({
        ok: true,
        kind: "literal-text-revert"
      });
      expect(fs.readFileSync(file, "utf8")).toBe(source);

      const missing = await client.callTool({
        name: "intent_verify_edit",
        arguments: { operationId }
      });
      expect(missing.structuredContent).toMatchObject({ ok: false, source: "missing" });
      expect(missing.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("uses the browser-selected Flex scope for a guarded grouped edit", async () => {
    const { rootDir, file, source, parent, children } = flexFixture();
    writeRuntimeSelection(rootDir, parent, {
      id: parent.id,
      route: "/layout",
      classTokens: ["flex", "items-center", "justify-between", "gap-4"],
      layout: {
        kind: "flex",
        parentId: parent.id,
        childIds: children.map((child) => child.id),
        unboundChildCount: 0,
        renderedParentCount: 1
      }
    });
    const { server } = createIntentMcpServer({ rootDir });
    const client = new Client({ name: "intent-layer-layout-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const inspected = await client.callTool({
        name: "intent_inspect_layout",
        arguments: { breakpoint: "base" }
      });
      expect(inspected.structuredContent).toMatchObject({
        ok: true,
        kind: "flex",
        selectedId: parent.id,
        scope: {
          parentId: parent.id,
          childIds: children.map((child) => child.id)
        },
        inspection: {
          direction: { effective: "row" },
          gap: { effective: "gap-4" }
        }
      });

      const wrongKind = await client.callTool({
        name: "intent_preview_layout",
        arguments: { kind: "grid", breakpoint: "base", columns: 2, items: [] }
      });
      expect(wrongKind.structuredContent).toMatchObject({
        ok: false,
        reason: "layout-kind-mismatch"
      });

      const forgedChild = await client.callTool({
        name: "intent_preview_layout",
        arguments: {
          kind: "flex",
          breakpoint: "base",
          items: [{ id: "forged-child-id", alignSelf: "center" }]
        }
      });
      expect(forgedChild.structuredContent).toMatchObject({
        ok: false,
        reason: "flex-child-out-of-scope"
      });

      const previewed = await client.callTool({
        name: "intent_preview_layout",
        arguments: {
          kind: "flex",
          breakpoint: "base",
          direction: "col",
          gap: "gap-6",
          items: [{ id: children[0].id, alignSelf: "center" }]
        }
      });
      const previewId = String(
        (previewed.structuredContent as Record<string, unknown> | undefined)?.previewId
      );
      expect(previewed.structuredContent).toMatchObject({
        ok: true,
        parentId: parent.id,
        affectedBindingCount: 2,
        patch: { kind: "flex-layout" }
      });
      expect(fs.readFileSync(file, "utf8")).toBe(source);

      const applied = await client.callTool({
        name: "intent_apply_edit",
        arguments: { previewId, idempotencyKey: "mcp-flex-layout-edit" }
      });
      const operationId = String(
        (applied.structuredContent as Record<string, unknown> | undefined)?.operationId
      );
      expect(applied.structuredContent).toMatchObject({
        ok: true,
        patch: { kind: "flex-layout" }
      });
      const changed = fs.readFileSync(file, "utf8");
      expect(changed).toContain("flex-col");
      expect(changed).toContain("gap-6");
      expect(changed).toContain("self-center");

      const replayed = await client.callTool({
        name: "intent_apply_edit",
        arguments: { previewId, idempotencyKey: "mcp-flex-layout-edit" }
      });
      expect(replayed.structuredContent).toMatchObject({ ok: true, idempotentReplay: true });
      expect(fs.readFileSync(file, "utf8")).toBe(changed);

      const verified = await client.callTool({
        name: "intent_verify_edit",
        arguments: { operationId }
      });
      expect(verified.structuredContent).toMatchObject({
        ok: true,
        source: "verified",
        runtime: "unavailable"
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
