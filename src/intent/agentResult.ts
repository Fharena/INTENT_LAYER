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

  let sourceHashAfter: string | null = null;
  try {
    sourceHashAfter = sha256(fs.readFileSync(binding.file, "utf8"));
  } catch {
    sourceHashAfter = null;
  }

  const sourceHashChanged = sourceHashAfter === null ? null : sourceHashAfter !== binding.sourceHash;
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
      sourceHashChanged
    },
    metrics: {
      resultMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
