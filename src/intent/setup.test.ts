import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyIntentSetup } from "./setup";

const roots: string[] = [];

function rootFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-setup-"));
  roots.push(root);
  return root;
}

function installMcpEntry(root: string): void {
  const entry = path.join(root, "node_modules", "intent-layer", "dist", "mcp.js");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "// packaged MCP fixture\n", "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("GUI-first setup", () => {
  it("creates the workspace without silently enabling AI or legacy queue integrations", () => {
    const root = rootFixture();
    const result = applyIntentSetup(root, {
      language: "ko",
      createWorkspace: true,
      completeOnboarding: true
    });

    expect(result.status.settings).toMatchObject({
      language: "ko",
      mcp: { codexEnabled: false, claudeEnabled: false },
      agent: { legacyQueueEnabled: false, codexSkillEnabled: false, claudeHookEnabled: false }
    });
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toContain(".intent/runtime/");
    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".mcp.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".intent-agent-queue.json"))).toBe(false);
    const operationSchema = JSON.parse(
      fs.readFileSync(path.join(root, ".intent", "schema", "intent-op.schema.json"), "utf8")
    ) as { supportedKinds: string[]; change: Record<string, string[]> };
    expect(operationSchema.supportedKinds).toEqual([
      "tailwind-token-replace",
      "literal-text",
      "grid-layout",
      "flex-layout"
    ]);
    expect(operationSchema.change.groupedRequired).toEqual(["count", "edits"]);
  });

  it("adds only explicitly enabled project-local MCP integrations", () => {
    const root = rootFixture();
    installMcpEntry(root);
    const result = applyIntentSetup(root, {
      createWorkspace: true,
      completeOnboarding: true,
      mcp: { codexEnabled: true, claudeEnabled: true }
    });

    expect(result.status.mcp).toMatchObject({
      codexEnabled: true,
      codexReady: true,
      claudeEnabled: true,
      claudeReady: true,
      serverReady: true
    });
    expect(fs.readFileSync(path.join(root, ".codex", "config.toml"), "utf8")).toContain(
      "[mcp_servers.intent_layer]"
    );
    const claude = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(claude.mcpServers["intent-layer"]).toBeDefined();
    expect(fs.existsSync(path.join(root, ".intent-agent-queue.json"))).toBe(false);
  });

  it("does not append a redundant runtime rule when the whole intent directory is ignored", () => {
    const root = rootFixture();
    const ignoreFile = path.join(root, ".gitignore");
    const original = "node_modules/\n.intent/\n";
    fs.writeFileSync(ignoreFile, original, "utf8");

    applyIntentSetup(root, { createWorkspace: true, completeOnboarding: true });

    expect(fs.readFileSync(ignoreFile, "utf8")).toBe(original);
  });

  it("keeps legacy queue integrations off unless the advanced mode is explicit", () => {
    const root = rootFixture();
    const result = applyIntentSetup(root, {
      createWorkspace: true,
      completeOnboarding: true,
      agent: {
        legacyQueueEnabled: false,
        runEnabled: true,
        codexSkillEnabled: true,
        claudeHookEnabled: true
      }
    });

    expect(result.status.settings.agent).toMatchObject({
      legacyQueueEnabled: false,
      runEnabled: false,
      codexSkillEnabled: false,
      claudeHookEnabled: false
    });
    expect(fs.existsSync(path.join(root, ".intent-agent-queue.json"))).toBe(false);
  });
});
