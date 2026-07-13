import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureIntentMcpIntegrations, intentMcpIntegrationStatus } from "./integrations";

const roots: string[] = [];

function rootFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-mcp-setup-"));
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

describe("project-local MCP setup", () => {
  it("does not create client config until the user enables a client", () => {
    const root = rootFixture();
    ensureIntentMcpIntegrations(
      root,
      { codexEnabled: false, claudeEnabled: false },
      [],
      []
    );

    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".mcp.json"))).toBe(false);
  });

  it("merges Codex and Claude MCP entries without replacing unrelated settings", () => {
    const root = rootFixture();
    installMcpEntry(root);
    fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(root, ".codex", "config.toml"), 'model = "custom"\n', "utf8");
    fs.writeFileSync(
      path.join(root, ".mcp.json"),
      `${JSON.stringify({ mcpServers: { existing: { command: "existing" } } }, null, 2)}\n`,
      "utf8"
    );

    ensureIntentMcpIntegrations(
      root,
      { codexEnabled: true, claudeEnabled: true },
      [],
      []
    );

    const codex = fs.readFileSync(path.join(root, ".codex", "config.toml"), "utf8");
    const claude = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(codex).toContain('model = "custom"');
    expect(codex).toContain("[mcp_servers.intent_layer]");
    expect(claude.mcpServers.existing).toBeDefined();
    expect(claude.mcpServers["intent-layer"]).toBeDefined();
    expect(intentMcpIntegrationStatus(root, { codexEnabled: true, claudeEnabled: true })).toMatchObject({
      codexReady: true,
      claudeReady: true,
      serverReady: true,
      serverArgs: ["./node_modules/intent-layer/dist/mcp.js", "--root", "."]
    });

    fs.writeFileSync(
      path.join(root, ".codex", "config.toml"),
      codex.replace("./node_modules/intent-layer/dist/mcp.js", "./dist/mcp.js"),
      "utf8"
    );
    expect(intentMcpIntegrationStatus(root, { codexEnabled: true, claudeEnabled: true })).toMatchObject({
      codexReady: false,
      claudeReady: true
    });
  });

  it("removes only Intent Layer-owned entries when disabled", () => {
    const root = rootFixture();
    installMcpEntry(root);
    ensureIntentMcpIntegrations(
      root,
      { codexEnabled: true, claudeEnabled: true },
      [],
      []
    );
    const claudeFile = path.join(root, ".mcp.json");
    const claude = JSON.parse(fs.readFileSync(claudeFile, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    claude.mcpServers.existing = { command: "existing" };
    fs.writeFileSync(claudeFile, `${JSON.stringify(claude, null, 2)}\n`, "utf8");

    ensureIntentMcpIntegrations(
      root,
      { codexEnabled: false, claudeEnabled: false },
      [],
      []
    );

    const codex = fs.readFileSync(path.join(root, ".codex", "config.toml"), "utf8");
    const nextClaude = JSON.parse(fs.readFileSync(claudeFile, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(codex).not.toContain("intent_layer");
    expect(nextClaude.mcpServers["intent-layer"]).toBeUndefined();
    expect(nextClaude.mcpServers.existing).toBeDefined();
  });

  it("does not mistake an application dist/mcp.js for the packaged server", () => {
    const root = rootFixture();
    fs.mkdirSync(path.join(root, "dist"), { recursive: true });
    fs.writeFileSync(path.join(root, "dist", "mcp.js"), "// unrelated application output\n", "utf8");

    ensureIntentMcpIntegrations(
      root,
      { codexEnabled: true, claudeEnabled: true },
      [],
      []
    );

    const status = intentMcpIntegrationStatus(root, { codexEnabled: true, claudeEnabled: true });
    expect(status).toMatchObject({
      serverReady: false,
      codexReady: false,
      claudeReady: false,
      serverArgs: ["./node_modules/intent-layer/dist/mcp.js", "--root", "."]
    });
  });
});
