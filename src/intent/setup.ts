import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { agentIntegrationStatus, ensureAgentIntegrations } from "./agentIntegrations";
import {
  ensureIntentMcpIntegrations,
  intentMcpIntegrationStatus
} from "./mcp/integrations";
import type {
  IntentAgentCommandSource,
  IntentAgentRunSource,
  IntentAgentSettings,
  IntentLayerLanguage,
  IntentLayerSettings,
  IntentMcpSettings,
  IntentOverlayDensity,
  IntentOverlayDock,
  IntentOverlaySettings,
  IntentSetupRequest,
  IntentSetupResult,
  IntentSetupStatus
} from "./types";

export interface IntentWorkspaceInitResult {
  createdPaths: string[];
  existingPaths: string[];
}

function toSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativeFromRoot(rootDir: string, file: string): string {
  return toSlashPath(path.relative(rootDir, file));
}

function settingsPath(rootDir: string): string {
  return path.join(rootDir, ".intent", "settings.json");
}

function normalizeLanguage(language: unknown): IntentLayerLanguage {
  return language === "ko" ? "ko" : "en";
}

function normalizeDock(value: unknown): IntentOverlayDock {
  return value === "left" ? "left" : "right";
}

function normalizeDensity(value: unknown): IntentOverlayDensity {
  return value === "compact" ? "compact" : "comfortable";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCommand(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function defaultIntentSettings(language: IntentLayerLanguage = "en"): IntentLayerSettings {
  return {
    version: 1,
    language,
    onboardingCompletedAt: null,
    updatedAt: new Date().toISOString(),
    overlay: {
      dock: "right",
      density: "comfortable",
      defaultCollapsed: false,
      autoOpenSetup: true
    },
    mcp: {
      codexEnabled: false,
      claudeEnabled: false
    },
    agent: {
      runEnabled: false,
      codexCommand: null,
      claudeCommand: null,
      codexSkillEnabled: false,
      claudeHookEnabled: false
    }
  };
}

function normalizeMcpSettings(value: unknown): IntentMcpSettings {
  const raw = value && typeof value === "object" ? (value as Partial<IntentMcpSettings>) : {};
  return {
    codexEnabled: normalizeBoolean(raw.codexEnabled, false),
    claudeEnabled: normalizeBoolean(raw.claudeEnabled, false)
  };
}

function normalizeOverlaySettings(value: unknown): IntentOverlaySettings {
  const raw = value && typeof value === "object" ? (value as Partial<IntentOverlaySettings>) : {};
  return {
    dock: normalizeDock(raw.dock),
    density: normalizeDensity(raw.density),
    defaultCollapsed: normalizeBoolean(raw.defaultCollapsed, false),
    autoOpenSetup: normalizeBoolean(raw.autoOpenSetup, true)
  };
}

function normalizeAgentSettings(value: unknown): IntentAgentSettings {
  const raw = value && typeof value === "object" ? (value as Partial<IntentAgentSettings>) : {};
  return {
    runEnabled: normalizeBoolean(raw.runEnabled, false),
    codexCommand: normalizeCommand(raw.codexCommand),
    claudeCommand: normalizeCommand(raw.claudeCommand),
    codexSkillEnabled: normalizeBoolean(raw.codexSkillEnabled, false),
    claudeHookEnabled: normalizeBoolean(raw.claudeHookEnabled, false)
  };
}

function normalizeSettings(value: Partial<IntentLayerSettings> | null, languageFallback: IntentLayerLanguage): IntentLayerSettings {
  const fallback = defaultIntentSettings(languageFallback);
  return {
    version: 1,
    language: normalizeLanguage(value?.language ?? fallback.language),
    onboardingCompletedAt:
      typeof value?.onboardingCompletedAt === "string" ? value.onboardingCompletedAt : null,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : fallback.updatedAt,
    overlay: normalizeOverlaySettings(value?.overlay),
    mcp: normalizeMcpSettings(value?.mcp),
    agent: normalizeAgentSettings(value?.agent)
  };
}

function writeFileIfMissing(
  rootDir: string,
  file: string,
  contents: string,
  createdPaths: string[],
  existingPaths: string[]
) {
  if (fs.existsSync(file)) {
    existingPaths.push(relativeFromRoot(rootDir, file));
    return;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  createdPaths.push(relativeFromRoot(rootDir, file));
}

function createDirIfMissing(rootDir: string, dir: string, createdPaths: string[], existingPaths: string[]) {
  if (fs.existsSync(dir)) {
    existingPaths.push(relativeFromRoot(rootDir, dir));
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  createdPaths.push(relativeFromRoot(rootDir, dir));
}

function ensureRuntimeGitIgnore(
  rootDir: string,
  createdPaths: string[],
  existingPaths: string[]
): void {
  const file = path.join(rootDir, ".gitignore");
  const existed = fs.existsSync(file);
  const contents = existed ? fs.readFileSync(file, "utf8") : "";
  if (contents.split(/\r?\n/).includes(".intent/runtime/")) return;
  const prefix = contents && !contents.endsWith("\n") ? `${contents}\n` : contents;
  fs.writeFileSync(file, `${prefix}.intent/runtime/\n`, "utf8");
  (existed ? existingPaths : createdPaths).push(relativeFromRoot(rootDir, file));
}

export function initIntentWorkspace(rootDir: string): IntentWorkspaceInitResult {
  const createdPaths: string[] = [];
  const existingPaths: string[] = [];
  const intentDir = path.join(rootDir, ".intent");

  for (const dir of [
    intentDir,
    path.join(intentDir, "components"),
    path.join(intentDir, "operations"),
    path.join(intentDir, "diffs"),
    path.join(intentDir, "agent"),
    path.join(intentDir, "agent", "locks"),
    path.join(intentDir, "schema")
  ]) {
    createDirIfMissing(rootDir, dir, createdPaths, existingPaths);
  }
  ensureRuntimeGitIgnore(rootDir, createdPaths, existingPaths);

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "README.md"),
    [
      "# INTENT_LAYER Workspace",
      "",
      "Generated by Intent Layer setup.",
      "",
      "- `graph.intent.json`: latest source binding graph",
      "- `components/`: optional component intent documents",
      "- `operations/`: deterministic patch operations",
      "- `diffs/`: semantic intent diffs",
      "- `agent/`: AI handoff tasks and results",
      "- `schema/`: lightweight format contracts",
      ""
    ].join("\n"),
    createdPaths,
    existingPaths
  );

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "schema", "intent-op.schema.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "intent-op.schema",
        required: ["version", "kind", "target", "change"],
        supportedKinds: ["tailwind-token-replace"],
        target: {
          required: ["id"],
          optional: ["componentName", "file", "tagName", "range"]
        },
        change: {
          required: ["from", "to"]
        }
      },
      null,
      2
    )}\n`,
    createdPaths,
    existingPaths
  );

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "schema", "intent-diff.schema.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "intent-diff.schema",
        required: ["version", "kind", "createdAt", "changes"],
        note: "MVP diffs are YAML files with deterministic source/semantic change summaries."
      },
      null,
      2
    )}\n`,
    createdPaths,
    existingPaths
  );

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "schema", "graph.intent.schema.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "graph.intent.schema",
        required: ["version", "generatedAt", "entries"],
        entry: {
          required: ["id", "file", "relativeFile", "sourceHash", "className", "tokens"]
        }
      },
      null,
      2
    )}\n`,
    createdPaths,
    existingPaths
  );

  return { createdPaths, existingPaths };
}

export function readIntentSettings(rootDir: string): IntentLayerSettings | null {
  const file = settingsPath(rootDir);
  if (!fs.existsSync(file)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<IntentLayerSettings>;
    return normalizeSettings(parsed, normalizeLanguage(parsed.language));
  } catch {
    return null;
  }
}

function writeIntentSettings(
  rootDir: string,
  settings: IntentLayerSettings,
  createdPaths: string[],
  existingPaths: string[]
): string {
  const file = settingsPath(rootDir);
  const existed = fs.existsSync(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  (existed ? existingPaths : createdPaths).push(relativeFromRoot(rootDir, file));
  return relativeFromRoot(rootDir, file);
}

function executableAvailable(command: string, rootDir: string): boolean {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return fs.existsSync(command);
  }

  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [command], {
    cwd: rootDir,
    stdio: "ignore"
  });
  return result.status === 0;
}

function resolveCommand(
  settingsCommand: string | null,
  envName: string,
  defaultCommand: string
): { command: string; source: IntentAgentCommandSource } {
  if (settingsCommand) {
    return { command: settingsCommand, source: "settings" };
  }

  const envCommand = process.env[envName]?.trim();
  if (envCommand) {
    return { command: envCommand, source: "env" };
  }

  return { command: defaultCommand, source: "default" };
}

export function resolveAgentCommands(rootDir: string) {
  const settings = readIntentSettings(rootDir) ?? defaultIntentSettings();
  return {
    codex: resolveCommand(settings.agent.codexCommand, "INTENT_LAYER_CODEX_COMMAND", "codex"),
    claude: resolveCommand(settings.agent.claudeCommand, "INTENT_LAYER_CLAUDE_COMMAND", "claude")
  };
}

export function resolveAgentRunMode(rootDir: string): {
  enabled: boolean;
  source: IntentAgentRunSource;
} {
  const settings = readIntentSettings(rootDir) ?? defaultIntentSettings();
  if (process.env.INTENT_LAYER_AGENT_RUN === "1") {
    return { enabled: true, source: "env" };
  }
  if (settings.agent.runEnabled) {
    return { enabled: true, source: "settings" };
  }
  return { enabled: false, source: "locked" };
}

export function intentSetupStatus(
  rootDir: string,
  options: { graphEntryCount?: number; language?: IntentLayerLanguage } = {}
): IntentSetupStatus {
  const settings = readIntentSettings(rootDir);
  const effectiveSettings = settings ?? defaultIntentSettings(options.language ?? "en");
  const language = settings ? effectiveSettings.language : options.language ?? effectiveSettings.language;
  const displaySettings =
    language === effectiveSettings.language
      ? effectiveSettings
      : {
          ...effectiveSettings,
          language,
          updatedAt: new Date().toISOString()
        };
  const intentDir = path.join(rootDir, ".intent");
  const workspaceReady =
    fs.existsSync(intentDir) &&
    fs.existsSync(path.join(intentDir, "schema", "graph.intent.schema.json")) &&
    fs.existsSync(path.join(intentDir, "schema", "intent-op.schema.json")) &&
    fs.existsSync(path.join(intentDir, "schema", "intent-diff.schema.json"));
  const settingsReady = Boolean(settings?.onboardingCompletedAt);
  const graphEntryCount = options.graphEntryCount ?? 0;
  const graphReady = graphEntryCount > 0 || fs.existsSync(path.join(intentDir, "graph.intent.json"));
  const agentCommands = resolveAgentCommands(rootDir);
  const agentRunMode = resolveAgentRunMode(rootDir);
  const codexCommand = agentCommands.codex.command;
  const claudeCommand = agentCommands.claude.command;
  const integrations = agentIntegrationStatus(rootDir, effectiveSettings.agent);
  const mcp = intentMcpIntegrationStatus(rootDir, effectiveSettings.mcp);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    root: rootDir,
    language,
    workspaceReady,
    settingsReady,
    graphReady,
    graphEntryCount,
    setupRequired: !workspaceReady || !settingsReady,
    settings: displaySettings,
    checks: [
      {
        name: "workspace",
        status: workspaceReady ? "ready" : "missing",
        detail: workspaceReady ? ".intent workspace is ready." : ".intent workspace has not been created yet."
      },
      {
        name: "language",
        status: settingsReady ? "ready" : "warn",
        detail: `Overlay language: ${language === "ko" ? "Korean" : "English"}.`
      },
      {
        name: "graph",
        status: graphReady ? "ready" : "warn",
        detail: graphReady
          ? `${graphEntryCount} source bindings are available.`
          : "Source bindings will appear after Vite transforms JSX/TSX files."
      },
      {
        name: "mcp-integrations",
        status:
          (!mcp.codexEnabled || mcp.codexReady) && (!mcp.claudeEnabled || mcp.claudeReady)
            ? mcp.codexEnabled || mcp.claudeEnabled
              ? "ready"
              : "warn"
            : "warn",
        detail:
          mcp.codexEnabled || mcp.claudeEnabled
            ? mcp.serverReady
              ? "Codex and Claude use the same local Intent Layer MCP tools."
              : "The MCP client config exists, but the built Intent Layer MCP server is missing."
            : "Connect Codex or Claude to let AI inspect and apply guarded UI edits."
      }
    ],
    mcp,
    agent: {
      runEnabled: agentRunMode.enabled,
      runEnabledSource: agentRunMode.source,
      codexCommand,
      codexCommandSource: agentCommands.codex.source,
      codexAvailable: executableAvailable(codexCommand, rootDir),
      claudeCommand,
      claudeCommandSource: agentCommands.claude.source,
      claudeAvailable: executableAvailable(claudeCommand, rootDir),
      queueSignalReady: integrations.queueSignalReady,
      queueSignalPath: integrations.queueSignalPath,
      codexSkillEnabled: integrations.codexSkillEnabled,
      codexSkillReady: integrations.codexSkillReady,
      codexSkillPath: integrations.codexSkillPath,
      claudeHookEnabled: integrations.claudeHookEnabled,
      claudeHookReady: integrations.claudeHookReady,
      claudeSettingsPath: integrations.claudeSettingsPath
    }
  };
}

export function applyIntentSetup(
  rootDir: string,
  request: IntentSetupRequest,
  options: { graphEntryCount?: number } = {}
): IntentSetupResult {
  const started = performance.now();
  const createdPaths: string[] = [];
  const existingPaths: string[] = [];

  if (request.createWorkspace !== false) {
    const init = initIntentWorkspace(rootDir);
    createdPaths.push(...init.createdPaths);
    existingPaths.push(...init.existingPaths);
  }

  const previous = readIntentSettings(rootDir) ?? defaultIntentSettings();
  const language = normalizeLanguage(request.language ?? previous.language);
  const nextOverlay = normalizeOverlaySettings({
    ...previous.overlay,
    ...(request.overlay ?? {})
  });
  const nextMcp = normalizeMcpSettings({
    ...previous.mcp,
    ...(request.mcp ?? {})
  });
  const nextAgent = normalizeAgentSettings({
    ...previous.agent,
    ...(request.agent ?? {})
  });
  const onboardingCompletedAt =
    request.resetOnboarding === true
      ? null
      : request.completeOnboarding === false
        ? previous.onboardingCompletedAt
        : previous.onboardingCompletedAt ?? new Date().toISOString();
  const settingsFile = writeIntentSettings(
    rootDir,
    {
      version: 1,
      language,
      onboardingCompletedAt,
      updatedAt: new Date().toISOString(),
      overlay: nextOverlay,
      mcp: nextMcp,
      agent: nextAgent
    },
    createdPaths,
    existingPaths
  );
  ensureIntentMcpIntegrations(rootDir, nextMcp, createdPaths, existingPaths);
  ensureAgentIntegrations(rootDir, nextAgent, createdPaths, existingPaths);

  return {
    ok: true,
    status: intentSetupStatus(rootDir, {
      graphEntryCount: options.graphEntryCount,
      language
    }),
    createdPaths,
    existingPaths,
    settingsFile,
    metrics: {
      setupMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
