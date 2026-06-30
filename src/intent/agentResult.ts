import fs from "node:fs";
import path from "node:path";
import { sourceHash } from "./hash";
import { tokenizeClassName } from "./tailwind";
import type {
  AgentResultArtifact,
  AgentResultRequest,
  IntentBinding,
  IntentTokenCategory,
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

interface ClassNameIntent {
  kind: "static" | "call-literals" | "read-only";
  value: string;
  tokens: Array<{ token: string; category: IntentTokenCategory | null }>;
}

type SemanticClassNameChange = NonNullable<AgentResultArtifact["semanticDiff"]>["classNameChanges"][number];

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

function scanQuotedLiteral(source: string, start: number): { value: string; end: number; quote: string } | null {
  const quote = source[start];
  if (quote !== "\"" && quote !== "'" && quote !== "`") return null;

  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (character === quote && previous !== "\\") {
      return { value, end: index + 1, quote };
    }
    value += character;
  }

  return null;
}

function scanBalanced(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  return -1;
}

function literalStringsFromExpression(expression: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < expression.length; index += 1) {
    const literal = scanQuotedLiteral(expression, index);
    if (!literal) continue;

    const isTemplateWithRuntime = literal.quote === "`" && literal.value.includes("${");
    if (!isTemplateWithRuntime) values.push(literal.value);
    index = literal.end - 1;
  }

  return values;
}

function tokensForClassName(value: string): ClassNameIntent["tokens"] {
  return tokenizeClassName(value).map((token) => ({
    token: token.token,
    category: token.category
  }));
}

function classNameIntentFromExpression(expression: string): ClassNameIntent {
  const trimmed = expression.trim();
  const directLiteral = scanQuotedLiteral(trimmed, 0);
  if (directLiteral && directLiteral.end === trimmed.length) {
    return {
      kind: "static",
      value: directLiteral.value,
      tokens: tokensForClassName(directLiteral.value)
    };
  }

  if (/^(cn|clsx)\s*\(/.test(trimmed)) {
    const values = literalStringsFromExpression(trimmed);
    const value = values.join(" ");
    return {
      kind: values.length > 0 ? "call-literals" : "read-only",
      value,
      tokens: tokensForClassName(value)
    };
  }

  return {
    kind: "read-only",
    value: trimmed,
    tokens: []
  };
}

function extractClassNameIntents(source: string): ClassNameIntent[] {
  const intents: ClassNameIntent[] = [];
  const pattern = /className\s*=\s*/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const valueStart = match.index + match[0].length;
    const first = source[valueStart];

    if (first === "\"" || first === "'") {
      const literal = scanQuotedLiteral(source, valueStart);
      if (literal) {
        intents.push({
          kind: "static",
          value: literal.value,
          tokens: tokensForClassName(literal.value)
        });
        pattern.lastIndex = literal.end;
      }
      continue;
    }

    if (first === "{") {
      const end = scanBalanced(source, valueStart, "{", "}");
      if (end > 0) {
        intents.push(classNameIntentFromExpression(source.slice(valueStart + 1, end - 1)));
        pattern.lastIndex = end;
      }
    }
  }

  return intents;
}

function tokenKey(token: { token: string; category: IntentTokenCategory | null }): string {
  return `${token.token}\u0000${token.category ?? ""}`;
}

function diffTokens(
  before: ClassNameIntent["tokens"],
  after: ClassNameIntent["tokens"]
): {
  addedTokens: SemanticClassNameChange["addedTokens"];
  removedTokens: SemanticClassNameChange["removedTokens"];
} {
  const afterCounts = new Map<string, number>();
  const afterByKey = new Map<string, { token: string; category: IntentTokenCategory | null }>();
  for (const token of after) {
    const key = tokenKey(token);
    afterCounts.set(key, (afterCounts.get(key) ?? 0) + 1);
    afterByKey.set(key, token);
  }

  const removedTokens: SemanticClassNameChange["removedTokens"] = [];
  for (const token of before) {
    const key = tokenKey(token);
    const count = afterCounts.get(key) ?? 0;
    if (count > 0) {
      afterCounts.set(key, count - 1);
    } else {
      removedTokens.push(token);
    }
  }

  const beforeCounts = new Map<string, number>();
  for (const token of before) {
    const key = tokenKey(token);
    beforeCounts.set(key, (beforeCounts.get(key) ?? 0) + 1);
  }

  const addedTokens: SemanticClassNameChange["addedTokens"] = [];
  for (const token of after) {
    const key = tokenKey(token);
    const count = beforeCounts.get(key) ?? 0;
    if (count > 0) {
      beforeCounts.set(key, count - 1);
    } else {
      addedTokens.push(afterByKey.get(key) ?? token);
    }
  }

  return { addedTokens, removedTokens };
}

function semanticClassNameDiff(
  beforeSource: string,
  afterSource: string
): NonNullable<AgentResultArtifact["semanticDiff"]> {
  const beforeIntents = extractClassNameIntents(beforeSource);
  const afterIntents = extractClassNameIntents(afterSource);
  const classNameChanges: SemanticClassNameChange[] = [];
  const count = Math.max(beforeIntents.length, afterIntents.length);

  for (let index = 0; index < count; index += 1) {
    const before = beforeIntents[index] ?? null;
    const after = afterIntents[index] ?? null;
    const { addedTokens, removedTokens } = diffTokens(before?.tokens ?? [], after?.tokens ?? []);
    const changed =
      before?.kind !== after?.kind ||
      before?.value !== after?.value ||
      addedTokens.length > 0 ||
      removedTokens.length > 0;

    if (changed) {
      classNameChanges.push({
        index,
        beforeKind: before?.kind ?? null,
        afterKind: after?.kind ?? null,
        beforeValue: before?.value ?? null,
        afterValue: after?.value ?? null,
        addedTokens,
        removedTokens
      });
    }
  }

  return {
    classNameChangeCount: classNameChanges.length,
    tokenAddedCount: classNameChanges.reduce((sum, change) => sum + change.addedTokens.length, 0),
    tokenRemovedCount: classNameChanges.reduce((sum, change) => sum + change.removedTokens.length, 0),
    classNameChanges
  };
}

function tokenDiffMarkdown(tokens: Array<{ token: string; category: IntentTokenCategory | null }>): string {
  if (tokens.length === 0) return "none";
  return tokens.map((token) => `\`${token.token}\` (${token.category ?? "unknown"})`).join(", ");
}

function semanticDiffMarkdown(diff: NonNullable<AgentResultArtifact["semanticDiff"]> | null): string {
  if (!diff || diff.classNameChanges.length === 0) {
    return "- No className semantic token changes detected in the selected source window.";
  }

  return [
    `- className changes: \`${diff.classNameChangeCount}\``,
    `- tokens added: \`${diff.tokenAddedCount}\``,
    `- tokens removed: \`${diff.tokenRemovedCount}\``,
    "",
    ...diff.classNameChanges.flatMap((change) => [
      `### className[${change.index}]`,
      "",
      `- before: \`${change.beforeValue ?? "missing"}\``,
      `- after: \`${change.afterValue ?? "missing"}\``,
      `- added: ${tokenDiffMarkdown(change.addedTokens)}`,
      `- removed: ${tokenDiffMarkdown(change.removedTokens)}`,
      ""
    ])
  ].join("\n");
}

function semanticDiffYaml(diff: NonNullable<AgentResultArtifact["semanticDiff"]> | null): string[] {
  if (!diff) {
    return ["semanticDiff:", "  available: false"];
  }

  return [
    "semanticDiff:",
    "  available: true",
    `  classNameChangeCount: ${diff.classNameChangeCount}`,
    `  tokenAddedCount: ${diff.tokenAddedCount}`,
    `  tokenRemovedCount: ${diff.tokenRemovedCount}`,
    "  classNameChanges:",
    ...(diff.classNameChanges.length > 0
      ? diff.classNameChanges.flatMap((change) => [
          `    - index: ${change.index}`,
          `      beforeKind: ${change.beforeKind ? yamlString(change.beforeKind) : "null"}`,
          `      afterKind: ${change.afterKind ? yamlString(change.afterKind) : "null"}`,
          `      before: ${change.beforeValue ? yamlString(change.beforeValue) : "null"}`,
          `      after: ${change.afterValue ? yamlString(change.afterValue) : "null"}`,
          "      addedTokens:",
          ...(change.addedTokens.length > 0
            ? change.addedTokens.map(
                (token) =>
                  `        - token: ${yamlString(token.token)}\n          category: ${
                    token.category ? yamlString(token.category) : "null"
                  }`
              )
            : ["        - none"]),
          "      removedTokens:",
          ...(change.removedTokens.length > 0
            ? change.removedTokens.map(
                (token) =>
                  `        - token: ${yamlString(token.token)}\n          category: ${
                    token.category ? yamlString(token.category) : "null"
                  }`
              )
            : ["        - none"])
        ])
      : ["    - none"])
  ];
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
    sourceHashAfter = sourceHash(currentSource);
  } catch {
    sourceHashAfter = null;
  }

  const sourceHashChanged = sourceHashAfter === null ? null : sourceHashAfter !== binding.sourceHash;
  const currentSnapshotExcerpt = snapshot && currentSource ? excerptBySnapshot(currentSource, snapshot) : "";
  const sourceDiff =
    snapshot && currentSource ? unifiedLineDiff(snapshot.excerpt, currentSnapshotExcerpt) : "";
  const changedLineCount = diffLineCount(sourceDiff);
  const semanticDiff = snapshot && currentSource ? semanticClassNameDiff(snapshot.excerpt, currentSnapshotExcerpt) : null;
  const semanticChangeCount = semanticDiff?.classNameChangeCount ?? 0;
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
    "## Semantic Intent Diff",
    "",
    semanticDiffMarkdown(semanticDiff),
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
    ...semanticDiffYaml(semanticDiff),
    "changes:",
    "  - type: agent-handoff-result",
    `    file: ${yamlString(binding.relativeFile)}`,
    "    summary: |-",
    blockScalar(summary),
    `    semanticChangeCount: ${semanticChangeCount}`,
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
      diffLineCount: changedLineCount,
      semanticChangeCount
    },
    sourceDiff: sourceDiff || null,
    semanticDiff,
    metrics: {
      resultMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
