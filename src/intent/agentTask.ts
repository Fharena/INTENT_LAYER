import fs from "node:fs";
import path from "node:path";
import type { AgentTaskRequest, AgentTaskResult, IntentBinding, PatchFailure } from "./types";

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function codeFence(value: unknown, language = "json"): string {
  return [`\`\`\`${language}`, typeof value === "string" ? value : JSON.stringify(value, null, 2), "```"].join(
    "\n"
  );
}

function sourceRange(binding: IntentBinding) {
  const tokenStarts = binding.tokens.map((token) => token.sourceStart);
  const tokenEnds = binding.tokens.map((token) => token.sourceEnd);
  return {
    start: tokenStarts.length ? Math.min(...tokenStarts) : binding.className.start,
    end: tokenEnds.length ? Math.max(...tokenEnds) : binding.className.end
  };
}

export function createAgentTask(
  rootDir: string,
  binding: IntentBinding | undefined,
  request: AgentTaskRequest
): AgentTaskResult | PatchFailure {
  const started = performance.now();

  if (!binding) {
    return {
      ok: false,
      id: request.id,
      reason: "missing-binding",
      detail: "No source binding exists for the selected intent id.",
      metrics: { taskMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const desiredChange = request.desiredChange.trim();
  if (!desiredChange) {
    return {
      ok: false,
      id: request.id,
      reason: "missing-desired-change",
      detail: "Describe the change before creating an agent task.",
      metrics: { taskMs: Number((performance.now() - started).toFixed(3)) }
    };
  }

  const range = sourceRange(binding);
  const taskDir = path.join(rootDir, ".intent", "agent");
  fs.mkdirSync(taskDir, { recursive: true });
  const taskFile = path.join(taskDir, `task_${timestampSlug()}.md`);
  const source = {
    component: binding.componentName ?? "Unknown",
    file: binding.relativeFile,
    tagName: binding.tagName,
    intentId: binding.id,
    range,
    className: binding.className,
    editableTokens: binding.tokens.filter((token) => token.editable)
  };

  const markdown = [
    "# Intent Agent Task",
    "",
    "## Goal",
    "",
    truncate(desiredChange, 1000),
    "",
    "## Selected Component",
    "",
    `- Component: \`${binding.componentName ?? "Unknown"}\``,
    `- Source: \`${binding.relativeFile}\``,
    `- JSX tag: \`${binding.tagName}\``,
    `- Intent id: \`${binding.id}\``,
    `- Source range: \`${range.start}-${range.end}\``,
    "",
    "## Current Intent Document",
    "",
    codeFence(source),
    "",
    "## Desired Change",
    "",
    truncate(desiredChange, 2000),
    "",
    "## Constraints",
    "",
    "- Prefer deterministic token edits when possible.",
    "- Do not rewrite the full source file if a smaller patch is enough.",
    "- Preserve existing component behavior unless the desired change requires otherwise.",
    "- Keep Tailwind class order stable where practical.",
    "- If confidence is low, explain the uncertainty instead of forcing a patch.",
    "",
    "## Files That May Be Edited",
    "",
    `- \`${binding.relativeFile}\``,
    "- `.intent/components/*.intent.yml` if an intent document already exists for this component",
    "- `.intent/diffs/*.intent-diff.yml` for the semantic result summary",
    "",
    "## Files That Should Not Be Edited",
    "",
    "- unrelated source files",
    "- generated build output",
    "- `node_modules/`",
    "",
    "## Required Checks",
    "",
    "```bash",
    "npm run typecheck",
    "npm run eval",
    "npm run build",
    "```",
    "",
    "## Expected Result",
    "",
    "- Code patch is small and reviewable.",
    "- Any unsupported edit is called out clearly.",
    "- Update or create an intent diff describing the semantic change.",
    ""
  ].join("\n");

  fs.writeFileSync(taskFile, markdown);

  return {
    ok: true,
    id: binding.id,
    file: binding.file,
    relativeFile: binding.relativeFile,
    taskFile,
    markdown,
    metrics: {
      taskMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
