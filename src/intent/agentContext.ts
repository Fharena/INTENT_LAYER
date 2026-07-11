import fs from "node:fs";
import path from "node:path";
import type { IntentBinding, IntentGraph, IntentTokenCategory } from "./types";

export interface AgentContextRequest {
  id?: string;
  component?: string;
}

export interface AgentContextSummary {
  graphEntries: number;
  files: number;
  components: number;
  directEditBindings: number;
  readOnlyBindings: number;
  tokenCount: number;
  editableTokenCount: number;
  editableTokenCoverage: number;
  unsupportedReasons: Record<string, number>;
}

export interface AgentContextResult {
  ok: true;
  contextFile: string;
  markdown: string;
  summary: AgentContextSummary;
  selectedBinding: IntentBinding | null;
  metrics: {
    contextMs: number;
  };
}

export interface AgentContextFailure {
  ok: false;
  reason: string;
  detail: string;
  metrics: {
    contextMs: number;
  };
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ratio(value: number, total: number): number {
  if (total === 0) return 0;
  return Number((value / total).toFixed(4));
}

function codeFence(value: unknown, language = "json"): string {
  return [`\`\`\`${language}`, typeof value === "string" ? value : JSON.stringify(value, null, 2), "```"].join(
    "\n"
  );
}

function tokenSummary(binding: IntentBinding): Record<IntentTokenCategory | "unknown", number> {
  const summary: Record<IntentTokenCategory | "unknown", number> = {
    spacing: 0,
    radius: 0,
    layout: 0,
    typography: 0,
    color: 0,
    effect: 0,
    unknown: 0
  };

  for (const token of binding.tokens) {
    summary[token.category ?? "unknown"] += 1;
  }
  return summary;
}

function summarizeGraph(graph: IntentGraph): AgentContextSummary {
  const entries = Object.values(graph.entries);
  const files = new Set(entries.map((entry) => entry.relativeFile));
  const components = new Set(entries.map((entry) => entry.componentName ?? "Unknown"));
  const unsupportedReasons: Record<string, number> = {};
  let directEditBindings = 0;
  let readOnlyBindings = 0;
  let tokenCount = 0;
  let editableTokenCount = 0;

  for (const entry of entries) {
    if (entry.className.kind === "read-only") {
      readOnlyBindings += 1;
      const reason = entry.className.unsupportedReason ?? "unknown";
      unsupportedReasons[reason] = (unsupportedReasons[reason] ?? 0) + 1;
    } else if (entry.tokens.some((token) => token.editable)) {
      directEditBindings += 1;
    }

    tokenCount += entry.tokens.length;
    editableTokenCount += entry.tokens.filter((token) => token.editable).length;
  }

  return {
    graphEntries: entries.length,
    files: files.size,
    components: components.size,
    directEditBindings,
    readOnlyBindings,
    tokenCount,
    editableTokenCount,
    editableTokenCoverage: ratio(editableTokenCount, tokenCount),
    unsupportedReasons
  };
}

function selectBinding(graph: IntentGraph, request: AgentContextRequest): IntentBinding | null {
  if (request.id) return graph.entries[request.id] ?? null;
  if (!request.component) return null;

  const normalized = request.component.toLowerCase();
  return (
    Object.values(graph.entries).find(
      (entry) => (entry.componentName ?? "").toLowerCase() === normalized
    ) ?? null
  );
}

function bindingBrief(binding: IntentBinding) {
  return {
    id: binding.id,
    componentName: binding.componentName,
    file: binding.relativeFile,
    tagName: binding.tagName,
    className: binding.className,
    tokenCount: binding.tokens.length,
    editableTokenCount: binding.tokens.filter((token) => token.editable).length,
    tokenSummary: tokenSummary(binding)
  };
}

function exampleBindings(entries: IntentBinding[], kind: "direct" | "read-only"): Array<ReturnType<typeof bindingBrief>> {
  return entries
    .filter((entry) =>
      kind === "direct"
        ? entry.className.kind !== "read-only" && entry.tokens.some((token) => token.editable)
        : entry.className.kind === "read-only"
    )
    .slice(0, 5)
    .map(bindingBrief);
}

function fileSummary(entries: IntentBinding[]) {
  const byFile = new Map<string, { bindings: number; direct: number; readOnly: number }>();
  for (const entry of entries) {
    const summary = byFile.get(entry.relativeFile) ?? { bindings: 0, direct: 0, readOnly: 0 };
    summary.bindings += 1;
    if (entry.className.kind === "read-only") {
      summary.readOnly += 1;
    } else if (entry.tokens.some((token) => token.editable)) {
      summary.direct += 1;
    }
    byFile.set(entry.relativeFile, summary);
  }

  return Array.from(byFile.entries())
    .map(([file, summary]) => ({ file, ...summary }))
    .sort((left, right) => right.bindings - left.bindings || left.file.localeCompare(right.file))
    .slice(0, 12);
}

export function createAgentContext(
  rootDir: string,
  graph: IntentGraph | null,
  request: AgentContextRequest = {}
): AgentContextResult | AgentContextFailure {
  const started = performance.now();

  if (!graph) {
    return {
      ok: false,
      reason: "missing-graph",
      detail: "Run scan --write-graph first or pass --graph with an existing graph file.",
      metrics: { contextMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const selectedBinding = selectBinding(graph, request);
  if ((request.id || request.component) && !selectedBinding) {
    return {
      ok: false,
      reason: "missing-binding",
      detail: "No source binding matched the requested id or component.",
      metrics: { contextMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const createdAt = new Date().toISOString();
  const entries = Object.values(graph.entries);
  const summary = summarizeGraph(graph);
  const agentDir = path.join(rootDir, ".intent", "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  const contextFile = path.join(agentDir, `context_${timestampSlug()}.md`);

  const markdown = [
    "# Intent Agent Context",
    "",
    "## Scope",
    "",
    `- Created at: \`${createdAt}\``,
    `- Graph generated at: \`${graph.generatedAt}\``,
    request.id ? `- Requested id: \`${request.id}\`` : "- Requested id: none",
    request.component ? `- Requested component: \`${request.component}\`` : "- Requested component: none",
    "",
    "## Graph Summary",
    "",
    codeFence(summary),
    "",
    "## Selected Binding",
    "",
    selectedBinding ? codeFence(bindingBrief(selectedBinding)) : "- No selected binding. This is repo-level context.",
    "",
    "## Editable Surface",
    "",
    "- Direct edits are limited to supported Tailwind tokens already bound in the graph.",
    "- Keep token replacements minimal and validate source hash before patching.",
    "",
    codeFence(exampleBindings(entries, "direct")),
    "",
    "## Read-only Surface",
    "",
    "- Read-only bindings should degrade into structured agent tasks rather than forced patches.",
    "- Unsupported expression reasons are counted below so the agent can choose a narrow path.",
    "",
    codeFence({
      unsupportedReasons: summary.unsupportedReasons,
      examples: exampleBindings(entries, "read-only")
    }),
    "",
    "## File Coverage",
    "",
    codeFence(fileSummary(entries)),
    "",
    "## Agent Rules",
    "",
    "- Prefer deterministic token edits when a binding is direct-editable.",
    "- Do not rewrite a full source file for a small Tailwind token change.",
    "- If confidence is low, create or update an agent task instead of patching directly.",
    "- Preserve existing component behavior unless the requested change requires otherwise.",
    "- Record result markdown and an intent diff after agent-authored code changes.",
    "",
    "## Required Checks",
    "",
    "```bash",
    "npm run typecheck",
    "npm run eval",
    "npm run build",
    "```",
    "",
    "## Useful CLI Commands",
    "",
    "```bash",
    "intent-layer scan src --write-graph",
    "intent-layer check src",
    "intent-layer agent-task --id <intent-id> --change \"Describe the desired change\"",
    "intent-layer agent-result --id <intent-id> --summary \"Describe the result\"",
    "```",
    ""
  ].join("\n");

  fs.writeFileSync(contextFile, markdown);

  return {
    ok: true,
    contextFile,
    markdown,
    summary,
    selectedBinding,
    metrics: {
      contextMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
