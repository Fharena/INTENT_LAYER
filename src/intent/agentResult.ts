import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./hash";
import type {
  AgentResultArtifact,
  AgentResultRequest,
  IntentBinding,
  PatchFailure
} from "./types";

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeRelativePath(rootDir: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const fullPath = path.isAbsolute(trimmed) ? trimmed : path.join(rootDir, trimmed);
  const relative = path.relative(rootDir, fullPath);
  return relative.replace(/\\/g, "/");
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function markdownList(values: string[]): string {
  if (values.length === 0) return "- None recorded";
  return values.map((value) => `- \`${value}\``).join("\n");
}

function codeFence(value: string, language: string): string {
  return [`\`\`\`${language}`, value, "```"].join("\n");
}

function blockScalar(value: string, indent = "      "): string {
  const clean = value.trim();
  if (!clean) return `${indent}none`;
  return clean
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

interface SourceSnapshot {
  file: string;
  sourceHash: string;
  range: {
    start: number;
    end: number;
  };
  startLine: number;
  endLine: number;
  windowStartLine: number;
  windowEndLine: number;
  excerpt: string;
}

function parseSourceSnapshot(rootDir: string, taskFile: string | null): SourceSnapshot | null {
  if (!taskFile) return null;

  const fullPath = path.isAbsolute(taskFile) ? taskFile : path.join(rootDir, taskFile);
  if (!fs.existsSync(fullPath)) return null;

  const markdown = fs.readFileSync(fullPath, "utf8");
  const match = markdown.match(/## Source Snapshot\s+```json\s+([\s\S]*?)\s+```/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as SourceSnapshot;
    if (!parsed.file || typeof parsed.excerpt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function excerptBySnapshot(source: string, snapshot: SourceSnapshot): string {
  const lines = source.split(/\r?\n/);
  const start = Math.max(1, snapshot.windowStartLine);
  const end = Math.min(lines.length, snapshot.windowEndLine);
  return lines.slice(start - 1, end).join("\n");
}

function unifiedLineDiff(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  if (removed.length === 0 && added.length === 0) return "";

  const contextBefore = beforeLines.slice(Math.max(0, prefix - 2), prefix);
  const contextAfter = beforeLines.slice(beforeLines.length - suffix, beforeLines.length - suffix + 2);
  return [
    "@@ selected-source-window @@",
    ...contextBefore.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...contextAfter.map((line) => ` ${line}`)
  ].join("\n");
}

function diffLineCount(diff: string): number {
  if (!diff) return 0;
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") || line.startsWith("-")).length;
}

export function recordAgentResult(
  rootDir: string,
  binding: IntentBinding | undefined,
  request: AgentResultRequest
): AgentResultArtifact | PatchFailure {
  const started = performance.now();

  if (!binding) {
    return {
      ok: false,
      id: request.id,
      reason: "missing-binding",
      detail: "No source binding exists for the selected intent id.",
      metrics: { resultMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const summary = request.summary.trim();
  if (!summary) {
    return {
      ok: false,
      id: request.id,
      reason: "missing-result-summary",
      detail: "Describe the agent result before recording it.",
      metrics: { resultMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const createdAt = new Date().toISOString();
  const timestamp = timestampSlug();
  const agentDir = path.join(rootDir, ".intent", "agent");
  const diffsDir = path.join(rootDir, ".intent", "diffs");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(diffsDir, { recursive: true });

  const resultFile = path.join(agentDir, `result_${timestamp}.md`);
  const diffFile = path.join(diffsDir, `${timestamp}_agent.intent-diff.yml`);
  const taskFile = request.taskFile ? normalizeRelativePath(rootDir, request.taskFile) : null;
  const changedFiles = uniqueNonEmpty(
    request.changedFiles?.length ? request.changedFiles : [binding.relativeFile]
  ).map((file) => normalizeRelativePath(rootDir, file));
  const checks = uniqueNonEmpty(request.checks ?? []);
  const notes = request.notes?.trim() ?? "";
  const snapshot = parseSourceSnapshot(rootDir, taskFile);

  let sourceHashAfter: string | null = null;
  let currentSource: string | null = null;
  try {
    currentSource = fs.readFileSync(binding.file, "utf8");
    sourceHashAfter = sha256(currentSource);
  } catch {
    sourceHashAfter = null;
  }

  const sourceHashChanged = sourceHashAfter === null ? null : sourceHashAfter !== binding.sourceHash;
  const sourceDiff =
    snapshot && currentSource ? unifiedLineDiff(snapshot.excerpt, excerptBySnapshot(currentSource, snapshot)) : "";
  const changedLineCount = diffLineCount(sourceDiff);
  const markdown = [
    "# Intent Agent Result",
    "",
    "## Summary",
    "",
    truncate(summary, 2000),
    "",
    "## Source Binding",
    "",
    `- Component: \`${binding.componentName ?? "Unknown"}\``,
    `- Source: \`${binding.relativeFile}\``,
    `- JSX tag: \`${binding.tagName}\``,
    `- Intent id: \`${binding.id}\``,
    `- Original source hash: \`${binding.sourceHash}\``,
    `- Current source hash: \`${sourceHashAfter ?? "unavailable"}\``,
    `- Source hash changed: \`${String(sourceHashChanged)}\``,
    "",
    "## Task",
    "",
    taskFile ? `- Task file: \`${taskFile}\`` : "- Task file: none recorded",
    "",
    "## Changed Files",
    "",
    markdownList(changedFiles),
    "",
    "## Checks",
    "",
    markdownList(checks),
    "",
    "## Notes",
    "",
    notes ? truncate(notes, 1000) : "None recorded.",
    "",
    "## Source Diff",
    "",
    snapshot
      ? sourceDiff
        ? [`- Snapshot file: \`${snapshot.file}\``, "", codeFence(sourceDiff, "diff")].join("\n")
        : "- Snapshot matched current source window. No line diff recorded."
      : "- No source snapshot was available from the task file.",
    "",
    "## Intent Diff",
    "",
    `- Diff file: \`${path.relative(rootDir, diffFile).replace(/\\/g, "/")}\``,
    ""
  ].join("\n");

  const diff = [
    "version: 1",
    "kind: intent-diff",
    "source: agent-result",
    `createdAt: ${createdAt}`,
    taskFile ? `taskFile: ${yamlString(taskFile)}` : "taskFile: null",
    "target:",
    `  id: ${yamlString(binding.id)}`,
    `  componentName: ${yamlString(binding.componentName ?? "Unknown")}`,
    `  file: ${yamlString(binding.relativeFile)}`,
    `  tagName: ${yamlString(binding.tagName)}`,
    "sourceHash:",
    `  before: ${yamlString(binding.sourceHash)}`,
    sourceHashAfter ? `  after: ${yamlString(sourceHashAfter)}` : "  after: null",
    `  changed: ${sourceHashChanged}`,
    "sourceDiff:",
    `  snapshotAvailable: ${Boolean(snapshot)}`,
    `  diffLineCount: ${changedLineCount}`,
    sourceDiff ? "  patch: |-" : "  patch: null",
    ...(sourceDiff ? sourceDiff.split(/\r?\n/).map((line) => `    ${line}`) : []),
    "changes:",
    "  - type: agent-handoff-result",
    `    file: ${yamlString(binding.relativeFile)}`,
    "    summary: |-",
    blockScalar(summary),
    "    changedFiles:",
    ...changedFiles.map((file) => `      - ${yamlString(file)}`),
    "    checks:",
    ...(checks.length > 0 ? checks.map((check) => `      - ${yamlString(check)}`) : ["      - none"]),
    ""
  ].join("\n");

  fs.writeFileSync(resultFile, markdown);
  fs.writeFileSync(diffFile, diff);

  return {
    ok: true,
    id: binding.id,
    file: binding.file,
    relativeFile: binding.relativeFile,
    resultFile,
    diffFile,
    markdown,
    source: {
      sourceHashBefore: binding.sourceHash,
      sourceHashAfter,
      sourceHashChanged,
      snapshotAvailable: Boolean(snapshot),
      diffLineCount: changedLineCount
    },
    sourceDiff: sourceDiff || null,
    metrics: {
      resultMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
