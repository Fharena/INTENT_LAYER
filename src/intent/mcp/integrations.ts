import fs from "node:fs";
import path from "node:path";
import type { IntentMcpSettings } from "../types";

const codexStart = "# intent-layer:mcp:start";
const codexEnd = "# intent-layer:mcp:end";

export interface IntentMcpIntegrationStatus {
  codexEnabled: boolean;
  codexReady: boolean;
  codexConfigPath: string;
  claudeEnabled: boolean;
  claudeReady: boolean;
  claudeConfigPath: string;
  serverCommand: string;
  serverArgs: string[];
}

function relativePath(rootDir: string, file: string): string {
  return path.relative(rootDir, file).replace(/\\/g, "/");
}

function serverArgs(rootDir: string): string[] {
  const localBuild = path.join(rootDir, "dist", "mcp.js");
  const entry = fs.existsSync(localBuild)
    ? "./dist/mcp.js"
    : "./node_modules/intent-layer/dist/mcp.js";
  return [entry, "--root", "."];
}

function codexBlock(args: string[]): string {
  const encodedArgs = args.map((value) => JSON.stringify(value)).join(", ");
  return [
    codexStart,
    "[mcp_servers.intent_layer]",
    'command = "node"',
    `args = [${encodedArgs}]`,
    'cwd = "."',
    codexEnd
  ].join("\n");
}

function replaceCodexBlock(contents: string, block: string | null): string {
  const start = contents.indexOf(codexStart);
  const end = contents.indexOf(codexEnd);
  let next = contents;
  if (start >= 0 && end >= start) {
    next = `${contents.slice(0, start)}${contents.slice(end + codexEnd.length)}`.trimEnd();
  }
  if (!block) return next ? `${next}\n` : "";
  return `${next ? `${next}\n\n` : ""}${block}\n`;
}

function readClaudeConfig(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function intentMcpIntegrationStatus(
  rootDir: string,
  settings: IntentMcpSettings
): IntentMcpIntegrationStatus {
  const codexFile = path.join(rootDir, ".codex", "config.toml");
  const claudeFile = path.join(rootDir, ".mcp.json");
  const args = serverArgs(rootDir);
  const codexContents = fs.existsSync(codexFile) ? fs.readFileSync(codexFile, "utf8") : "";
  const claude = readClaudeConfig(claudeFile);
  const claudeServers =
    claude && claude.mcpServers && typeof claude.mcpServers === "object"
      ? (claude.mcpServers as Record<string, unknown>)
      : {};

  return {
    codexEnabled: settings.codexEnabled,
    codexReady: !settings.codexEnabled || codexContents.includes(codexStart),
    codexConfigPath: relativePath(rootDir, codexFile),
    claudeEnabled: settings.claudeEnabled,
    claudeReady: !settings.claudeEnabled || Boolean(claudeServers["intent-layer"]),
    claudeConfigPath: relativePath(rootDir, claudeFile),
    serverCommand: "node",
    serverArgs: args
  };
}

export function ensureIntentMcpIntegrations(
  rootDir: string,
  settings: IntentMcpSettings,
  createdPaths: string[],
  existingPaths: string[]
): IntentMcpIntegrationStatus {
  const args = serverArgs(rootDir);
  const codexFile = path.join(rootDir, ".codex", "config.toml");
  const codexExisted = fs.existsSync(codexFile);
  const codexContents = codexExisted ? fs.readFileSync(codexFile, "utf8") : "";
  const nextCodex = replaceCodexBlock(codexContents, settings.codexEnabled ? codexBlock(args) : null);
  if (nextCodex !== codexContents) {
    fs.mkdirSync(path.dirname(codexFile), { recursive: true });
    fs.writeFileSync(codexFile, nextCodex, "utf8");
    (codexExisted ? existingPaths : createdPaths).push(relativePath(rootDir, codexFile));
  }

  const claudeFile = path.join(rootDir, ".mcp.json");
  const claudeExisted = fs.existsSync(claudeFile);
  const claude = readClaudeConfig(claudeFile);
  if (claude && (claudeExisted || settings.claudeEnabled)) {
    const servers =
      claude.mcpServers && typeof claude.mcpServers === "object"
        ? { ...(claude.mcpServers as Record<string, unknown>) }
        : {};
    if (settings.claudeEnabled) {
      servers["intent-layer"] = { command: "node", args };
    } else {
      delete servers["intent-layer"];
    }
    const nextClaude = { ...claude, mcpServers: servers };
    const nextContents = `${JSON.stringify(nextClaude, null, 2)}\n`;
    const previousContents = claudeExisted ? fs.readFileSync(claudeFile, "utf8") : "";
    if (nextContents !== previousContents) {
      fs.writeFileSync(claudeFile, nextContents, "utf8");
      (claudeExisted ? existingPaths : createdPaths).push(relativePath(rootDir, claudeFile));
    }
  }

  return intentMcpIntegrationStatus(rootDir, settings);
}
