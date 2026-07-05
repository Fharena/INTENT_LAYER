import fs from "node:fs";
import path from "node:path";
import { agentQueueSignalPath, refreshAgentQueueSignal } from "./agentQueue";
import type { IntentAgentSettings } from "./types";

export interface AgentIntegrationStatus {
  queueSignalReady: boolean;
  queueSignalPath: string;
  codexSkillEnabled: boolean;
  codexSkillReady: boolean;
  codexSkillPath: string;
  claudeHookEnabled: boolean;
  claudeHookReady: boolean;
  claudeSettingsPath: string;
}

function toSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativeFromRoot(rootDir: string, file: string): string {
  return toSlashPath(path.relative(rootDir, file));
}

function codexSkillPath(rootDir: string): string {
  return path.join(rootDir, ".agents", "skills", "intent-layer-task-runner", "SKILL.md");
}

function claudeSettingsPath(rootDir: string): string {
  return path.join(rootDir, ".claude", "settings.json");
}

function writeIfMissing(
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

function codexSkillContents(): string {
  return [
    "---",
    "name: intent-layer-task-runner",
    "description: Process pending INTENT_LAYER agent queue tasks in the current project.",
    "---",
    "",
    "# Intent Layer Task Runner",
    "",
    "Use this skill when the user asks Codex to process an INTENT_LAYER task, continue a queued UI edit, or pick up pending work from `.intent-agent-queue.json`.",
    "",
    "## Workflow",
    "",
    "1. Read `.intent-agent-queue.json` and choose the newest task with `status: queued`.",
    "2. Claim the task before editing:",
    "",
    "```bash",
    "intent-layer agent-claim --provider codex --task <task-file>",
    "```",
    "",
    "If `intent-layer` is not on PATH in a local repo checkout, use the project script equivalent when present:",
    "",
    "```bash",
    "npm run intent -- agent-claim --provider codex --task <task-file>",
    "```",
    "",
    "3. Read the task markdown completely. Respect its allowed files, forbidden files, and required checks.",
    "4. Make the smallest source edits that satisfy the requested UI change.",
    "5. Run the task checks when practical.",
    "6. Record completion:",
    "",
    "```bash",
    "intent-layer agent-result --id <intent-id> --task <task-file> --summary \"<what changed>\" --changed <file> --check \"<check command>\"",
    "```",
    "",
    "If the task cannot be completed, mark it failed:",
    "",
    "```bash",
    "intent-layer agent-fail --provider codex --task <task-file> --summary \"<why it could not be completed>\"",
    "```",
    "",
    "## Safety",
    "",
    "- Do not process tasks already claimed by another provider.",
    "- Do not edit files outside the task constraints.",
    "- Do not rewrite full files for small Tailwind or layout changes.",
    "- Keep the task markdown and `.intent-agent-queue.json` as the shared handoff state.",
    ""
  ].join("\n");
}

function claudeHookPrompt(): string {
  return [
    "INTENT_LAYER queue changed.",
    "Read .intent-agent-queue.json, choose the newest queued task, and claim it before editing:",
    "intent-layer agent-claim --provider claude --task <task-file>",
    "Then read the task markdown, keep edits within the allowed files, run practical checks, and record completion with:",
    "intent-layer agent-result --id <intent-id> --task <task-file> --summary \"<what changed>\" --changed <file> --check \"<check command>\"",
    "If you cannot complete it, run:",
    "intent-layer agent-fail --provider claude --task <task-file> --summary \"<why it could not be completed>\"",
    "Skip the task if it is already claimed, running, done, failed, or locked by another provider."
  ].join(" ");
}

function defaultClaudeSettings() {
  return {
    hooks: {
      FileChanged: [
        {
          matcher: ".intent-agent-queue.json",
          hooks: [
            {
              type: "agent",
              prompt: claudeHookPrompt()
            }
          ]
        }
      ]
    }
  };
}

function hasClaudeIntentHook(value: unknown): boolean {
  return JSON.stringify(value ?? {}).includes(".intent-agent-queue.json");
}

function mergeClaudeSettings(existing: unknown) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  if (hasClaudeIntentHook(base)) return base;

  const hooks =
    base.hooks && typeof base.hooks === "object" && !Array.isArray(base.hooks)
      ? (base.hooks as Record<string, unknown>)
      : {};
  const fileChanged = Array.isArray(hooks.FileChanged) ? hooks.FileChanged : [];

  return {
    ...base,
    hooks: {
      ...hooks,
      FileChanged: [
        ...fileChanged,
        {
          matcher: ".intent-agent-queue.json",
          hooks: [
            {
              type: "agent",
              prompt: claudeHookPrompt()
            }
          ]
        }
      ]
    }
  };
}

function ensureClaudeSettings(
  rootDir: string,
  createdPaths: string[],
  existingPaths: string[]
) {
  const file = claudeSettingsPath(rootDir);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(defaultClaudeSettings(), null, 2)}\n`);
    createdPaths.push(relativeFromRoot(rootDir, file));
    return;
  }

  try {
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    const merged = mergeClaudeSettings(existing);
    if (JSON.stringify(existing) === JSON.stringify(merged)) {
      existingPaths.push(relativeFromRoot(rootDir, file));
      return;
    }
    fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
    existingPaths.push(relativeFromRoot(rootDir, file));
  } catch {
    const exampleFile = path.join(path.dirname(file), "settings.intent-layer.example.json");
    writeIfMissing(
      rootDir,
      exampleFile,
      `${JSON.stringify(defaultClaudeSettings(), null, 2)}\n`,
      createdPaths,
      existingPaths
    );
    existingPaths.push(relativeFromRoot(rootDir, file));
  }
}

export function agentIntegrationStatus(
  rootDir: string,
  settings: IntentAgentSettings
): AgentIntegrationStatus {
  const queueFile = agentQueueSignalPath(rootDir);
  const skillFile = codexSkillPath(rootDir);
  const claudeFile = claudeSettingsPath(rootDir);
  let claudeHookReady = false;

  if (fs.existsSync(claudeFile)) {
    try {
      claudeHookReady = hasClaudeIntentHook(JSON.parse(fs.readFileSync(claudeFile, "utf8")) as unknown);
    } catch {
      claudeHookReady = false;
    }
  }

  return {
    queueSignalReady: fs.existsSync(queueFile),
    queueSignalPath: relativeFromRoot(rootDir, queueFile),
    codexSkillEnabled: settings.codexSkillEnabled,
    codexSkillReady: fs.existsSync(skillFile),
    codexSkillPath: relativeFromRoot(rootDir, skillFile),
    claudeHookEnabled: settings.claudeHookEnabled,
    claudeHookReady,
    claudeSettingsPath: relativeFromRoot(rootDir, claudeFile)
  };
}

export function ensureAgentIntegrations(
  rootDir: string,
  settings: IntentAgentSettings,
  createdPaths: string[],
  existingPaths: string[]
): AgentIntegrationStatus {
  const queue = refreshAgentQueueSignal(rootDir);
  const queuePath = path.join(rootDir, queue.queueFile);
  if (fs.existsSync(queuePath)) {
    existingPaths.push(relativeFromRoot(rootDir, queuePath));
  }

  if (settings.codexSkillEnabled) {
    writeIfMissing(rootDir, codexSkillPath(rootDir), codexSkillContents(), createdPaths, existingPaths);
  }

  if (settings.claudeHookEnabled) {
    ensureClaudeSettings(rootDir, createdPaths, existingPaths);
  }

  return agentIntegrationStatus(rootDir, settings);
}
