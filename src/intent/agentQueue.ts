import fs from "node:fs";
import path from "node:path";
import type {
  AgentProvider,
  AgentQueueSignal,
  AgentQueueTask,
  AgentTaskClaimRequest,
  AgentTaskClaimResult,
  AgentTaskMetadata,
  AgentTaskStatus,
  AgentTaskStatusUpdateRequest,
  AgentTaskStatusUpdateResult,
  PatchFailure
} from "./types";

const metadataKeys: Array<keyof AgentTaskMetadata> = [
  "intentTaskVersion",
  "taskId",
  "status",
  "provider",
  "claimedBy",
  "sessionId",
  "exclusive",
  "createdAt",
  "updatedAt",
  "sourceIntentId",
  "sourceFile",
  "resultFile",
  "diffFile",
  "failureReason"
];

const runningStatuses = new Set<AgentTaskStatus>(["claimed", "running"]);
const terminalStatuses = new Set<AgentTaskStatus>(["done", "failed", "cancelled"]);

function nowIso(): string {
  return new Date().toISOString();
}

function toSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativeFromRoot(rootDir: string, file: string): string {
  return toSlashPath(path.relative(rootDir, file));
}

function absoluteFromRoot(rootDir: string, file: string): string {
  return path.isAbsolute(file) ? file : path.join(rootDir, file);
}

function isInsideRoot(rootDir: string, file: string): boolean {
  const relative = path.relative(rootDir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function agentQueueSignalPath(rootDir: string): string {
  return path.join(rootDir, ".intent-agent-queue.json");
}

function agentDir(rootDir: string): string {
  return path.join(rootDir, ".intent", "agent");
}

function locksDir(rootDir: string): string {
  return path.join(agentDir(rootDir), "locks");
}

function taskIdFromTaskFile(taskFile: string): string {
  return path.basename(taskFile, path.extname(taskFile));
}

function lockFileForTask(rootDir: string, taskId: string): string {
  return path.join(locksDir(rootDir), `${taskId}.lock.json`);
}

function scalarToYaml(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function yamlToScalar(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function normalizeStatus(value: unknown): AgentTaskStatus {
  return value === "claimed" ||
    value === "running" ||
    value === "done" ||
    value === "failed" ||
    value === "cancelled"
    ? value
    : "queued";
}

function normalizeProvider(value: unknown): AgentProvider | "manual" | null {
  return value === "codex" || value === "claude" || value === "manual" ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createAgentTaskMetadata(input: {
  taskFile: string;
  sourceIntentId: string | null;
  sourceFile: string | null;
}): AgentTaskMetadata {
  const createdAt = nowIso();
  return {
    intentTaskVersion: 1,
    taskId: taskIdFromTaskFile(input.taskFile),
    status: "queued",
    provider: null,
    claimedBy: null,
    sessionId: null,
    exclusive: true,
    createdAt,
    updatedAt: createdAt,
    sourceIntentId: input.sourceIntentId,
    sourceFile: input.sourceFile,
    resultFile: null,
    diffFile: null,
    failureReason: null
  };
}

function metadataToFrontmatter(metadata: AgentTaskMetadata): string {
  return [
    "---",
    ...metadataKeys.map((key) => `${key}: ${scalarToYaml(metadata[key])}`),
    "---",
    ""
  ].join("\n");
}

function splitFrontmatter(markdown: string): { metadata: Record<string, unknown> | null; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { metadata: null, body: markdown };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return { metadata: null, body: markdown };
  }

  const raw = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + "\n---\n".length);
  const metadata: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    metadata[key] = yamlToScalar(value);
  }
  return { metadata, body };
}

function normalizeMetadata(
  rootDir: string,
  taskFile: string,
  metadata: Record<string, unknown> | null,
  options: { readLegacySourceFile?: boolean } = {}
): AgentTaskMetadata {
  const stats = fs.statSync(taskFile);
  const createdAt = stringOrNull(metadata?.createdAt) ?? stats.birthtime.toISOString();
  const updatedAt = stringOrNull(metadata?.updatedAt) ?? stats.mtime.toISOString();
  const relativeTaskFile = relativeFromRoot(rootDir, taskFile);

  return {
    intentTaskVersion: 1,
    taskId: stringOrNull(metadata?.taskId) ?? taskIdFromTaskFile(taskFile),
    status: normalizeStatus(metadata?.status),
    provider: normalizeProvider(metadata?.provider),
    claimedBy: stringOrNull(metadata?.claimedBy),
    sessionId: stringOrNull(metadata?.sessionId),
    exclusive: typeof metadata?.exclusive === "boolean" ? metadata.exclusive : true,
    createdAt,
    updatedAt,
    sourceIntentId: stringOrNull(metadata?.sourceIntentId),
    sourceFile:
      stringOrNull(metadata?.sourceFile) ??
      (options.readLegacySourceFile === false
        ? null
        : sourceFileFromLegacyMarkdown(rootDir, relativeTaskFile)),
    resultFile: stringOrNull(metadata?.resultFile),
    diffFile: stringOrNull(metadata?.diffFile),
    failureReason: stringOrNull(metadata?.failureReason)
  };
}

function sourceFileFromLegacyMarkdown(rootDir: string, relativeTaskFile: string): string | null {
  const fullPath = path.join(rootDir, relativeTaskFile);
  try {
    const markdown = fs.readFileSync(fullPath, "utf8");
    const match = markdown.match(/- Source: `([^`]+)`/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildAgentTaskMarkdown(metadata: AgentTaskMetadata, body: string): string {
  return `${metadataToFrontmatter(metadata)}${body.replace(/^\s+/, "")}`;
}

export function readAgentTaskMetadata(
  rootDir: string,
  taskFile: string
): { metadata: AgentTaskMetadata; body: string; absoluteTaskFile: string } | null {
  const absoluteTaskFile = path.resolve(absoluteFromRoot(rootDir, taskFile));
  if (!isInsideRoot(rootDir, absoluteTaskFile) || !fs.existsSync(absoluteTaskFile)) return null;

  const markdown = fs.readFileSync(absoluteTaskFile, "utf8");
  const parsed = splitFrontmatter(markdown);
  return {
    metadata: normalizeMetadata(rootDir, absoluteTaskFile, parsed.metadata),
    body: parsed.body,
    absoluteTaskFile
  };
}

function readAgentTaskMetadataSummary(
  rootDir: string,
  taskFile: string
): { metadata: AgentTaskMetadata; absoluteTaskFile: string } | null {
  const absoluteTaskFile = path.resolve(absoluteFromRoot(rootDir, taskFile));
  if (!isInsideRoot(rootDir, absoluteTaskFile) || !fs.existsSync(absoluteTaskFile)) return null;

  const fd = fs.openSync(absoluteTaskFile, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    const parsed = splitFrontmatter(head);
    return {
      metadata: normalizeMetadata(rootDir, absoluteTaskFile, parsed.metadata, {
        readLegacySourceFile: false
      }),
      absoluteTaskFile
    };
  } finally {
    fs.closeSync(fd);
  }
}

function writeAgentTaskMetadata(
  rootDir: string,
  taskFile: string,
  update: (metadata: AgentTaskMetadata) => AgentTaskMetadata
): { metadata: AgentTaskMetadata; absoluteTaskFile: string } | null {
  const current = readAgentTaskMetadata(rootDir, taskFile);
  if (!current) return null;

  const next = update({
    ...current.metadata,
    updatedAt: nowIso()
  });
  fs.writeFileSync(current.absoluteTaskFile, buildAgentTaskMarkdown(next, current.body));
  return { metadata: next, absoluteTaskFile: current.absoluteTaskFile };
}

function taskFromMetadata(rootDir: string, absoluteTaskFile: string, metadata: AgentTaskMetadata): AgentQueueTask {
  const lockFile = lockFileForTask(rootDir, metadata.taskId);
  const locked = fs.existsSync(lockFile);
  return {
    taskId: metadata.taskId,
    status: metadata.status,
    provider: metadata.provider,
    claimedBy: metadata.claimedBy,
    sessionId: metadata.sessionId,
    exclusive: metadata.exclusive,
    taskFile: relativeFromRoot(rootDir, absoluteTaskFile),
    sourceIntentId: metadata.sourceIntentId,
    sourceFile: metadata.sourceFile,
    resultFile: metadata.resultFile,
    diffFile: metadata.diffFile,
    failureReason: metadata.failureReason,
    locked,
    lockFile: locked ? relativeFromRoot(rootDir, lockFile) : null,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt
  };
}

export function listAgentTasks(rootDir: string, limit = 50): AgentQueueTask[] {
  const dir = agentDir(rootDir);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^task_.*\.md$/.test(entry.name))
    .map((entry) => {
      const file = path.join(dir, entry.name);
      return {
        file,
        mtimeMs: fs.statSync(file).mtimeMs
      };
    })
    .sort((first, second) => second.mtimeMs - first.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.file)
    .map((file) => {
      const parsed = readAgentTaskMetadataSummary(rootDir, file);
      return parsed ? taskFromMetadata(rootDir, parsed.absoluteTaskFile, parsed.metadata) : null;
    })
    .filter((task): task is AgentQueueTask => Boolean(task))
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
    .slice(0, limit);
}

export function refreshAgentQueueSignal(rootDir: string): AgentQueueSignal {
  const dir = agentDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(locksDir(rootDir), { recursive: true });

  const tasks = listAgentTasks(rootDir, 50);
  const signal: AgentQueueSignal = {
    version: 1,
    kind: "intent-agent-queue",
    updatedAt: nowIso(),
    queueFile: ".intent-agent-queue.json",
    agentDir: ".intent/agent",
    pendingTaskCount: tasks.filter((task) => task.status === "queued").length,
    runningTaskCount: tasks.filter((task) => runningStatuses.has(task.status)).length,
    doneTaskCount: tasks.filter((task) => task.status === "done").length,
    latestTask: tasks[0]?.taskFile ?? null,
    tasks
  };
  fs.writeFileSync(agentQueueSignalPath(rootDir), `${JSON.stringify(signal, null, 2)}\n`);
  return signal;
}

function failure(
  id: string | undefined,
  reason: string,
  detail: string,
  metricName: "claimMs" | "statusMs",
  started: number
): PatchFailure {
  return {
    ok: false,
    id,
    reason,
    detail,
    metrics: {
      [metricName]: Number((performance.now() - started).toFixed(3))
    }
  };
}

function selectableTask(rootDir: string, taskFile: string | undefined): AgentQueueTask | null {
  if (taskFile) {
    const parsed = readAgentTaskMetadata(rootDir, taskFile);
    return parsed ? taskFromMetadata(rootDir, parsed.absoluteTaskFile, parsed.metadata) : null;
  }

  return listAgentTasks(rootDir, 50).find((task) => task.status === "queued" && !task.locked) ?? null;
}

export function claimAgentTask(
  rootDir: string,
  request: AgentTaskClaimRequest
): AgentTaskClaimResult | PatchFailure {
  const started = performance.now();
  const task = selectableTask(rootDir, request.taskFile);

  if (!task) {
    return failure(undefined, "missing-queued-agent-task", "No queued Intent Layer agent task is available.", "claimMs", started);
  }

  if (terminalStatuses.has(task.status)) {
    return failure(task.sourceIntentId ?? undefined, "agent-task-closed", `Task is already ${task.status}.`, "claimMs", started);
  }

  if (task.status !== "queued" || task.locked) {
    return failure(task.sourceIntentId ?? undefined, "agent-task-locked", "Task is already claimed by another agent.", "claimMs", started);
  }

  fs.mkdirSync(locksDir(rootDir), { recursive: true });
  const absoluteLockFile = lockFileForTask(rootDir, task.taskId);
  const lockPayload = {
    version: 1,
    taskId: task.taskId,
    provider: request.provider,
    claimedBy: request.claimedBy ?? `${request.provider}-agent`,
    sessionId: request.sessionId ?? null,
    createdAt: nowIso()
  };

  try {
    const lockFd = fs.openSync(absoluteLockFile, "wx");
    fs.writeFileSync(lockFd, `${JSON.stringify(lockPayload, null, 2)}\n`);
    fs.closeSync(lockFd);
  } catch {
    return failure(task.sourceIntentId ?? undefined, "agent-task-locked", "Task lock already exists.", "claimMs", started);
  }

  const updated = writeAgentTaskMetadata(rootDir, task.taskFile, (metadata) => ({
    ...metadata,
    status: "claimed",
    provider: request.provider,
    claimedBy: request.claimedBy ?? `${request.provider}-agent`,
    sessionId: request.sessionId ?? metadata.sessionId
  }));

  if (!updated) {
    return failure(task.sourceIntentId ?? undefined, "missing-task-file", "Task file disappeared while claiming.", "claimMs", started);
  }

  const queue = refreshAgentQueueSignal(rootDir);
  return {
    ok: true,
    taskId: updated.metadata.taskId,
    provider: request.provider,
    taskFile: relativeFromRoot(rootDir, updated.absoluteTaskFile),
    status: updated.metadata.status,
    lockFile: relativeFromRoot(rootDir, absoluteLockFile),
    queue,
    metrics: {
      claimMs: Number((performance.now() - started).toFixed(3))
    }
  };
}

export function completeAgentTask(
  rootDir: string,
  request: AgentTaskStatusUpdateRequest
): AgentTaskStatusUpdateResult | PatchFailure {
  const started = performance.now();
  const updated = writeAgentTaskMetadata(rootDir, request.taskFile, (metadata) => ({
    ...metadata,
    status: "done",
    provider: request.provider ?? metadata.provider,
    resultFile: request.resultFile ?? metadata.resultFile,
    diffFile: request.diffFile ?? metadata.diffFile,
    failureReason: null
  }));

  if (!updated) {
    return failure(undefined, "missing-task-file", "Task file does not exist.", "statusMs", started);
  }

  const lockFile = lockFileForTask(rootDir, updated.metadata.taskId);
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }

  const queue = refreshAgentQueueSignal(rootDir);
  return {
    ok: true,
    taskId: updated.metadata.taskId,
    taskFile: relativeFromRoot(rootDir, updated.absoluteTaskFile),
    status: updated.metadata.status,
    queue,
    metrics: {
      statusMs: Number((performance.now() - started).toFixed(3))
    }
  };
}

export function failAgentTask(
  rootDir: string,
  request: AgentTaskStatusUpdateRequest
): AgentTaskStatusUpdateResult | PatchFailure {
  const started = performance.now();
  const updated = writeAgentTaskMetadata(rootDir, request.taskFile, (metadata) => ({
    ...metadata,
    status: "failed",
    provider: request.provider ?? metadata.provider,
    failureReason: request.failureReason ?? "Agent could not complete the task."
  }));

  if (!updated) {
    return failure(undefined, "missing-task-file", "Task file does not exist.", "statusMs", started);
  }

  const lockFile = lockFileForTask(rootDir, updated.metadata.taskId);
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }

  const queue = refreshAgentQueueSignal(rootDir);
  return {
    ok: true,
    taskId: updated.metadata.taskId,
    taskFile: relativeFromRoot(rootDir, updated.absoluteTaskFile),
    status: updated.metadata.status,
    queue,
    metrics: {
      statusMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
