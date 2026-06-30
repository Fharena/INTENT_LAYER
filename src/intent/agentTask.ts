import fs from "node:fs";
import path from "node:path";
import { sourceHash } from "./hash";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineWindow(source: string, start: number, end: number, contextLines = 4) {
  const lines = source.split(/\r?\n/);
  let offset = 0;
  let startLine = 1;
  let endLine = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const nextOffset = offset + lines[index].length + 1;
    if (offset <= start && start < nextOffset) {
      startLine = index + 1;
    }
    if (offset < end && end <= nextOffset) {
      endLine = index + 1;
      break;
    }
    offset = nextOffset;
  }

  const windowStartLine = Math.max(1, startLine - contextLines);
  const windowEndLine = Math.min(lines.length, endLine + contextLines);

  return {
    startLine,
    endLine,
    windowStartLine,
    windowEndLine,
    excerpt: lines.slice(windowStartLine - 1, windowEndLine).join("\n")
  };
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
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

function scanExpressionStatementEnd(source: string, start: number): number {
  let quote: string | null = null;
  let depth = 0;

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

    if (character === "(" || character === "{" || character === "[") depth += 1;
    if (character === ")" || character === "}" || character === "]") depth = Math.max(0, depth - 1);
    if (character === ";" && depth === 0) return index + 1;
  }

  return source.length;
}

function scanFunctionDeclarationEnd(source: string, start: number): number {
  const paramsStart = source.indexOf("(", start);
  const paramsEnd = paramsStart >= 0 ? scanBalanced(source, paramsStart, "(", ")") : -1;
  const bodyStart = paramsEnd > paramsStart ? source.indexOf("{", paramsEnd) : -1;
  const bodyEnd = bodyStart >= 0 ? scanBalanced(source, bodyStart, "{", "}") : -1;
  return bodyEnd > bodyStart ? bodyEnd : scanExpressionStatementEnd(source, start);
}

function variableComponentRange(
  source: string,
  start: number
): { start: number; end: number } | null {
  const statementEnd = scanExpressionStatementEnd(source, start);
  const statement = source.slice(start, statementEnd);
  const hasInlineComponent =
    statement.includes("=>") ||
    /\b(?:memo|forwardRef|with[A-Z][\w$]*|React\.memo|React\.forwardRef)\s*(?:<[^;]*?>)?\s*\(/.test(
      statement
    );

  if (!hasInlineComponent) return null;

  return {
    start,
    end: statementEnd
  };
}

function findComponentRange(source: string, componentName: string | null): { start: number; end: number } | null {
  if (!componentName) return null;

  const escapedName = escapeRegExp(componentName);
  const functionMatch = new RegExp(`\\bfunction\\s+${escapedName}\\s*\\(`).exec(source);
  if (functionMatch) {
    const paramsStart = source.indexOf("(", functionMatch.index);
    const paramsEnd = paramsStart >= 0 ? scanBalanced(source, paramsStart, "(", ")") : -1;
    const bodyStart = paramsEnd > paramsStart ? source.indexOf("{", paramsEnd) : -1;
    const bodyEnd = bodyStart >= 0 ? scanBalanced(source, bodyStart, "{", "}") : -1;
    if (bodyEnd > bodyStart) {
      return {
        start: functionMatch.index,
        end: bodyEnd
      };
    }
  }

  const variableMatch = new RegExp(`\\b(?:const|let|var)\\s+${escapedName}\\b`).exec(source);
  if (!variableMatch) return null;

  const wrappedRange = variableComponentRange(source, variableMatch.index);
  if (wrappedRange) return wrappedRange;

  const arrowIndex = source.indexOf("=>", variableMatch.index);
  if (arrowIndex < 0) return null;

  const bodyStart = skipWhitespace(source, arrowIndex + 2);
  const first = source[bodyStart];

  if (first === "{") {
    const blockEnd = scanBalanced(source, bodyStart, "{", "}");
    if (blockEnd > bodyStart) {
      return {
        start: variableMatch.index,
        end: source[blockEnd] === ";" ? blockEnd + 1 : blockEnd
      };
    }
  }

  if (first === "(") {
    const expressionEnd = scanBalanced(source, bodyStart, "(", ")");
    if (expressionEnd > bodyStart) {
      return {
        start: variableMatch.index,
        end: source[expressionEnd] === ";" ? expressionEnd + 1 : expressionEnd
      };
    }
  }

  const expressionEnd = scanExpressionStatementEnd(source, bodyStart);
  if (expressionEnd > bodyStart) {
    return {
      start: variableMatch.index,
      end: expressionEnd
    };
  }

  return null;
}

interface RelatedSourceRange {
  file: string;
  relativeFile: string;
  sourceHash: string;
  source: string;
  kind: "variable-declaration" | "variant-function";
  identifier: string;
  start: number;
  end: number;
}

function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function importedNameForLocalIdentifier(source: string, localIdentifier: string): { importedName: string; file: string } | null {
  const importPattern = /import\s+{([\s\S]*?)}\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source)) !== null) {
    const specifiers = match[1].split(",");
    for (const rawSpecifier of specifiers) {
      const specifier = rawSpecifier.trim();
      if (!specifier) continue;

      const aliasMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(specifier);
      const importedName = aliasMatch?.[1] ?? specifier;
      const localName = aliasMatch?.[2] ?? specifier;
      if (localName === localIdentifier && /^[A-Za-z_$][\w$]*$/.test(importedName)) {
        return { importedName, file: match[2] };
      }
    }
  }

  return null;
}

function findVariantDeclarationRange(
  source: string,
  identifier: string
): { start: number; end: number } | null {
  const functionMatch = new RegExp(`\\bfunction\\s+${escapeRegExp(identifier)}\\s*\\(`).exec(source);
  if (functionMatch) {
    return {
      start: functionMatch.index,
      end: scanFunctionDeclarationEnd(source, functionMatch.index)
    };
  }

  const variableMatch = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(identifier)}\\b`).exec(source);
  if (!variableMatch) return null;

  return {
    start: variableMatch.index,
    end: scanExpressionStatementEnd(source, variableMatch.index)
  };
}

function findRelatedSourceRange(
  rootDir: string,
  source: string,
  binding: IntentBinding
): RelatedSourceRange | null {
  if (binding.className.kind !== "read-only") return null;

  if (binding.className.unsupportedReason === "variable-reference") {
    const identifier = binding.className.value.trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(identifier)) return null;

    const match = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(identifier)}\\b`).exec(source);
    if (!match) return null;

    return {
      file: binding.file,
      relativeFile: binding.relativeFile,
      sourceHash: binding.sourceHash,
      source,
      kind: "variable-declaration",
      identifier,
      start: match.index,
      end: scanExpressionStatementEnd(source, match.index)
    };
  }

  if (binding.className.unsupportedReason !== "variant-function") return null;

  const calleeMatch = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(binding.className.value);
  const identifier = calleeMatch?.[1];
  if (!identifier) return null;

  const localRange = findVariantDeclarationRange(source, identifier);
  if (localRange) {
    return {
      file: binding.file,
      relativeFile: binding.relativeFile,
      sourceHash: binding.sourceHash,
      source,
      kind: "variant-function",
      identifier,
      start: localRange.start,
      end: localRange.end
    };
  }

  const imported = importedNameForLocalIdentifier(source, identifier);
  const importedFile = imported ? resolveRelativeImport(binding.file, imported.file) : null;
  if (!imported || !importedFile) return null;

  const importedSource = fs.readFileSync(importedFile, "utf8");
  const importedRange = findVariantDeclarationRange(importedSource, imported.importedName);
  if (!importedRange) return null;

  return {
    file: importedFile,
    relativeFile: path.relative(rootDir, importedFile).replace(/\\/g, "/"),
    sourceHash: sourceHash(importedSource),
    source: importedSource,
    kind: "variant-function",
    identifier: imported.importedName,
    start: importedRange.start,
    end: importedRange.end
  };
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
  const currentSource = fs.readFileSync(binding.file, "utf8");
  const snapshot = {
    file: binding.relativeFile,
    sourceHash: binding.sourceHash,
    range,
    ...lineWindow(currentSource, range.start, range.end)
  };
  const componentRange = findComponentRange(currentSource, binding.componentName);
  const componentSnapshot = componentRange
    ? {
        file: binding.relativeFile,
        sourceHash: binding.sourceHash,
        componentName: binding.componentName,
        range: componentRange,
        ...lineWindow(currentSource, componentRange.start, componentRange.end, 0)
      }
    : null;
  const relatedRange = findRelatedSourceRange(rootDir, currentSource, binding);
  const relatedSnapshot = relatedRange
    ? {
        file: relatedRange.relativeFile,
        sourceHash: relatedRange.sourceHash,
        kind: relatedRange.kind,
        identifier: relatedRange.identifier,
        range: {
          start: relatedRange.start,
          end: relatedRange.end
        },
        ...lineWindow(relatedRange.source, relatedRange.start, relatedRange.end, 1)
      }
    : null;
  const editableFiles = Array.from(
    new Set([
      binding.relativeFile,
      ...(relatedSnapshot && relatedSnapshot.file !== binding.relativeFile ? [relatedSnapshot.file] : [])
    ])
  );
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
    "## Component Snapshot",
    "",
    codeFence(componentSnapshot),
    "",
    "## Related Source Snapshot",
    "",
    codeFence(relatedSnapshot),
    "",
    "## Source Snapshot",
    "",
    codeFence(snapshot),
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
    ...editableFiles.map((file) => `- \`${file}\``),
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
