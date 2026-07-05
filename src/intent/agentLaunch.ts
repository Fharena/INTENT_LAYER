import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveAgentCommands } from "./setup";
import type { AgentLaunchRequest, AgentLaunchResult, AgentProvider, PatchFailure } from "./types";

interface ProviderConfig {
  commandEnv: string;
  argsBeforePrompt: string[];
}

const providerConfigs: Record<AgentProvider, ProviderConfig> = {
  codex: {
    commandEnv: "INTENT_LAYER_CODEX_COMMAND",
    argsBeforePrompt: ["exec", "--sandbox", "workspace-write"]
  },
  claude: {
    commandEnv: "INTENT_LAYER_CLAUDE_COMMAND",
    argsBeforePrompt: ["-p"]
  }
};

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === "codex" || value === "claude";
}

function relativeFromRoot(rootDir: string, file: string): string {
  return path.relative(rootDir, file).replace(/\\/g, "/");
}

function isInsideRoot(rootDir: string, file: string): boolean {
  const relative = path.relative(rootDir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function quoteShellPart(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function commandText(command: string[]): string {
  return command.map(quoteShellPart).join(" ");
}

function executableExists(command: string, rootDir: string): boolean {
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

function promptForTask(relativeTaskFile: string): string {
  return [
    `Read ${relativeTaskFile} and implement the requested change.`,
    "Keep edits scoped to files allowed by the task.",
    "Run the required checks from the task when practical.",
    "After editing, record the result with intent-layer agent-result if this workspace supports it."
  ].join(" ");
}

function failure(
  request: AgentLaunchRequest,
  reason: string,
  detail: string,
  started: number
): PatchFailure {
  return {
    ok: false,
    id: request.id,
    reason,
    detail,
    metrics: {
      launchMs: Number((performance.now() - started).toFixed(3))
    }
  };
}

export function launchAgentTask(rootDir: string, request: AgentLaunchRequest): AgentLaunchResult | PatchFailure {
  const started = performance.now();

  if (!isAgentProvider(request.provider)) {
    return failure(request, "unsupported-agent-provider", "Use provider codex or claude.", started);
  }

  const rawTaskFile = request.taskFile?.trim();
  if (!rawTaskFile) {
    return failure(request, "missing-task-file", "Create or pass an agent task file before launching an agent.", started);
  }

  const absoluteTaskFile = path.resolve(rootDir, rawTaskFile);
  if (!isInsideRoot(rootDir, absoluteTaskFile)) {
    return failure(request, "invalid-task-file", "Agent task files must stay inside this workspace.", started);
  }

  if (!fs.existsSync(absoluteTaskFile)) {
    return failure(request, "missing-task-file", `Agent task file does not exist: ${rawTaskFile}`, started);
  }

  const relativeTaskFile = relativeFromRoot(rootDir, absoluteTaskFile);
  const config = providerConfigs[request.provider];
  const resolvedCommands = resolveAgentCommands(rootDir);
  const commandInfo = request.provider === "codex" ? resolvedCommands.codex : resolvedCommands.claude;
  const executable = commandInfo.command;
  const command = [executable, ...config.argsBeforePrompt, promptForTask(relativeTaskFile)];
  const enabled = process.env.INTENT_LAYER_AGENT_RUN === "1";
  const executeRequested = request.execute === true;
  const guidance = [
    `Provider command can be changed in Intent Layer settings or with ${config.commandEnv}.`,
    `Current provider command source: ${commandInfo.source}.`,
    "Direct execution is disabled unless INTENT_LAYER_AGENT_RUN=1 is set.",
    "The default path returns a command plan so the user can review it before running."
  ];

  if (!executeRequested || !enabled) {
    return {
      ok: true,
      id: request.id ?? null,
      provider: request.provider,
      taskFile: relativeTaskFile,
      command,
      commandText: commandText(command),
      cwd: rootDir,
      enabled,
      executed: false,
      pid: null,
      stdoutFile: null,
      stderrFile: null,
      guidance,
      metrics: {
        launchMs: Number((performance.now() - started).toFixed(3))
      }
    };
  }

  if (!executableExists(executable, rootDir)) {
    return failure(
      request,
      "agent-command-not-found",
      `Could not find ${executable}. Install the CLI or set ${config.commandEnv}.`,
      started
    );
  }

  const runsDir = path.join(rootDir, ".intent", "agent", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const stdoutFile = path.join(runsDir, `${stamp}_${request.provider}.stdout.log`);
  const stderrFile = path.join(runsDir, `${stamp}_${request.provider}.stderr.log`);
  const stdoutFd = fs.openSync(stdoutFile, "a");
  const stderrFd = fs.openSync(stderrFile, "a");

  try {
    const child = spawn(command[0], command.slice(1), {
      cwd: rootDir,
      detached: true,
      shell: process.platform === "win32" && !path.isAbsolute(command[0]),
      stdio: ["ignore", stdoutFd, stderrFd]
    });
    child.unref();
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);

    return {
      ok: true,
      id: request.id ?? null,
      provider: request.provider,
      taskFile: relativeTaskFile,
      command,
      commandText: commandText(command),
      cwd: rootDir,
      enabled,
      executed: true,
      pid: child.pid ?? null,
      stdoutFile: relativeFromRoot(rootDir, stdoutFile),
      stderrFile: relativeFromRoot(rootDir, stderrFile),
      guidance,
      metrics: {
        launchMs: Number((performance.now() - started).toFixed(3))
      }
    };
  } catch (error) {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
    return failure(
      request,
      "agent-launch-failed",
      error instanceof Error ? error.message : String(error),
      started
    );
  }
}
