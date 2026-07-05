import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { sourceHash } from "./hash";
import { buildAgentTaskMarkdown, createAgentTaskMetadata, refreshAgentQueueSignal } from "./agentQueue";
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
  kind: "variable-declaration" | "object-property" | "variant-function";
  identifier: string;
  start: number;
  end: number;
}

interface ExternalImportReference {
  kind: "external-package-import";
  usageKind:
    | "variable-reference"
    | "property-access-reference"
    | "variant-function"
    | "unsupported-call-expression";
  specifier: string;
  packageName: string;
  subpath: string;
  importKind: "named" | "default" | "namespace";
  importedName: string;
  localName: string;
  referencedName: string;
  usage: string;
  editable: false;
  reason: "external-package-source-unresolved";
  guidance: string[];
}

const dependencyIdentifierDenylist = new Set([
  "Array",
  "Boolean",
  "Math",
  "Number",
  "Object",
  "React",
  "String",
  "as",
  "clsx",
  "cn",
  "const",
  "export",
  "false",
  "from",
  "function",
  "import",
  "let",
  "null",
  "return",
  "true",
  "undefined",
  "var"
]);

function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;

  return resolveFileCandidate(path.resolve(path.dirname(fromFile), specifier));
}

function resolveFileCandidate(base: string): string | null {
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

interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

function readTsConfigPaths(rootDir: string): TsConfigPaths | null {
  const configFile = path.join(rootDir, "tsconfig.json");
  if (!fs.existsSync(configFile)) return null;

  try {
    const parsed = ts.parseConfigFileTextToJson(configFile, fs.readFileSync(configFile, "utf8")).config as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };
    const paths = parsed.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") return null;

    return {
      baseUrl: path.resolve(rootDir, parsed.compilerOptions?.baseUrl ?? "."),
      paths
    };
  } catch {
    return null;
  }
}

function matchPathAlias(pattern: string, specifier: string): string[] | null {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex < 0) return pattern === specifier ? [] : null;

  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;

  return [specifier.slice(prefix.length, specifier.length - suffix.length)];
}

function resolvePathAliasImport(rootDir: string, specifier: string): string | null {
  const config = readTsConfigPaths(rootDir);
  if (!config) return null;

  for (const [pattern, targets] of Object.entries(config.paths)) {
    const wildcards = matchPathAlias(pattern, specifier);
    if (!wildcards) continue;

    for (const target of targets) {
      let mapped = target;
      for (const wildcard of wildcards) {
        mapped = mapped.replace("*", wildcard);
      }

      const resolved = resolveFileCandidate(path.resolve(config.baseUrl, mapped));
      if (resolved) return resolved;
    }
  }

  return null;
}

interface PackageSpecifier {
  packageName: string;
  subpath: string;
}

interface PackageJsonLike {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  exports?: unknown;
  source?: string;
  module?: string;
  main?: string;
  types?: string;
  typings?: string;
}

function readPackageJson(file: string): PackageJsonLike | null {
  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PackageJsonLike;
  } catch {
    return null;
  }
}

function packageSpecifierParts(specifier: string): PackageSpecifier | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;

  const parts = specifier.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const packageName = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const subpathParts = specifier.startsWith("@") ? parts.slice(2) : parts.slice(1);
  if (specifier.startsWith("@") && parts.length < 2) return null;

  return {
    packageName,
    subpath: subpathParts.length > 0 ? `./${subpathParts.join("/")}` : "."
  };
}

function workspacePatterns(rootDir: string): string[] {
  const rootPackage = readPackageJson(path.join(rootDir, "package.json"));
  const workspaces = rootPackage?.workspaces;
  if (Array.isArray(workspaces)) return workspaces;
  if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages;
  return [];
}

function candidateWorkspacePackageDirs(rootDir: string, pattern: string): string[] {
  if (!pattern.includes("*")) {
    const fullPath = path.resolve(rootDir, pattern);
    return fs.existsSync(path.join(fullPath, "package.json")) ? [fullPath] : [];
  }

  const wildcardIndex = pattern.indexOf("*");
  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1).replace(/^[/\\]+/, "");
  const baseDir = path.resolve(rootDir, prefix);
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return [];

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(baseDir, entry.name, suffix))
    .filter((candidate) => fs.existsSync(path.join(candidate, "package.json")));
}

function findWorkspacePackageRoot(rootDir: string, packageName: string): string | null {
  for (const pattern of workspacePatterns(rootDir)) {
    for (const packageDir of candidateWorkspacePackageDirs(rootDir, pattern)) {
      const packageJson = readPackageJson(path.join(packageDir, "package.json"));
      if (packageJson?.name === packageName) return packageDir;
    }
  }

  return null;
}

function packageExportValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["source", "development", "import", "module", "default", "require", "types", "typings"]) {
    const resolved = packageExportValue(record[key]);
    if (resolved) return resolved;
  }

  return null;
}

function packageExportTarget(exportsField: unknown, subpath: string): string | null {
  if (typeof exportsField === "string") return subpath === "." ? exportsField : null;
  if (!exportsField || typeof exportsField !== "object") return null;

  const record = exportsField as Record<string, unknown>;
  const mappedSubpath = packageExportValue(record[subpath]);
  if (mappedSubpath) return mappedSubpath;

  return subpath === "." ? packageExportValue(exportsField) : null;
}

function resolveWorkspacePackageImport(rootDir: string, specifier: string): string | null {
  const parts = packageSpecifierParts(specifier);
  if (!parts) return null;

  const packageRoot = findWorkspacePackageRoot(rootDir, parts.packageName);
  if (!packageRoot) return null;

  const packageJson = readPackageJson(path.join(packageRoot, "package.json"));
  const target =
    packageExportTarget(packageJson?.exports, parts.subpath) ??
    (parts.subpath === "."
      ? packageJson?.source ?? packageJson?.module ?? packageJson?.main ?? packageJson?.types ?? packageJson?.typings
      : parts.subpath);
  if (!target) return null;

  const resolvedBase = path.resolve(packageRoot, target);
  const relativeToPackage = path.relative(packageRoot, resolvedBase);
  if (relativeToPackage.startsWith("..") || path.isAbsolute(relativeToPackage)) return null;

  return resolveFileCandidate(resolvedBase);
}

function resolveImportFile(rootDir: string, fromFile: string, specifier: string): string | null {
  return (
    resolveRelativeImport(fromFile, specifier) ??
    resolvePathAliasImport(rootDir, specifier) ??
    resolveWorkspacePackageImport(rootDir, specifier)
  );
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

interface ImportReference {
  importedName: string;
  localName: string;
  file: string;
  importKind: "named" | "default" | "namespace";
}

function importReferenceForLocalIdentifier(
  source: string,
  localIdentifier: string
): ImportReference | null {
  const namedImportPattern = /import\s+{([\s\S]*?)}\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = namedImportPattern.exec(source)) !== null) {
    const specifiers = match[1].split(",");
    for (const rawSpecifier of specifiers) {
      const specifier = rawSpecifier.trim();
      if (!specifier) continue;

      const aliasMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(specifier);
      const importedName = aliasMatch?.[1] ?? specifier;
      const localName = aliasMatch?.[2] ?? specifier;
      if (localName === localIdentifier && /^[A-Za-z_$][\w$]*$/.test(importedName)) {
        return { importedName, localName, file: match[2], importKind: "named" };
      }
    }
  }

  const namespaceImportPattern = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g;
  while ((match = namespaceImportPattern.exec(source)) !== null) {
    if (match[1] === localIdentifier) {
      return {
        importedName: "*",
        localName: match[1],
        file: match[2],
        importKind: "namespace"
      };
    }
  }

  const defaultImportPattern =
    /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*(?:{[\s\S]*?}|\*\s+as\s+[A-Za-z_$][\w$]*))?\s+from\s+["']([^"']+)["']/g;
  while ((match = defaultImportPattern.exec(source)) !== null) {
    if (match[1] === localIdentifier) {
      return {
        importedName: "default",
        localName: match[1],
        file: match[2],
        importKind: "default"
      };
    }
  }

  return null;
}

function externalPackageImportForLocalIdentifier(
  rootDir: string,
  fromFile: string,
  source: string,
  localIdentifier: string
): (ImportReference & PackageSpecifier & { specifier: string }) | null {
  const reference = importReferenceForLocalIdentifier(source, localIdentifier);
  if (!reference) return null;

  const parts = packageSpecifierParts(reference.file);
  if (!parts || reference.file.startsWith("#") || parts.packageName.startsWith("@/")) {
    return null;
  }

  if (resolveImportFile(rootDir, fromFile, reference.file)) {
    return null;
  }

  return {
    ...reference,
    specifier: reference.file,
    packageName: parts.packageName,
    subpath: parts.subpath
  };
}

function reExportForIdentifier(
  source: string,
  identifier: string
): { importedName: string; file: string } | null {
  const namedExportPattern = /export\s+{([\s\S]*?)}\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = namedExportPattern.exec(source)) !== null) {
    const specifiers = match[1].split(",");
    for (const rawSpecifier of specifiers) {
      const specifier = rawSpecifier.trim();
      if (!specifier) continue;

      const aliasMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(specifier);
      const importedName = aliasMatch?.[1] ?? specifier;
      const exportedName = aliasMatch?.[2] ?? specifier;
      if (exportedName === identifier && /^[A-Za-z_$][\w$]*$/.test(importedName)) {
        return { importedName, file: match[2] };
      }
    }
  }

  const starExportPattern = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  while ((match = starExportPattern.exec(source)) !== null) {
    return { importedName: identifier, file: match[1] };
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

function findVariableDeclarationRange(
  source: string,
  identifier: string
): { start: number; end: number } | null {
  const match = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(identifier)}\\b`).exec(source);
  if (!match) return null;

  return {
    start: match.index,
    end: scanExpressionStatementEnd(source, match.index)
  };
}

function trimSourceRange(source: string, start: number, end: number): { start: number; end: number } {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/.test(source[nextStart] ?? "")) nextStart += 1;
  while (nextEnd > nextStart && /\s/.test(source[nextEnd - 1] ?? "")) nextEnd -= 1;
  return { start: nextStart, end: nextEnd };
}

function splitTopLevelRanges(
  source: string,
  start: number,
  end: number,
  delimiter: string
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let quote: string | null = null;
  let depth = 0;
  let cursor = start;

  for (let index = start; index < end; index += 1) {
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
    if (character === delimiter && depth === 0) {
      ranges.push(trimSourceRange(source, cursor, index));
      cursor = index + 1;
    }
  }

  ranges.push(trimSourceRange(source, cursor, end));
  return ranges.filter((range) => range.start < range.end);
}

function objectPropertyKey(source: string, range: { start: number; end: number }): string | null {
  const first = source[range.start];
  if (first === "\"" || first === "'") {
    let cursor = range.start + 1;
    while (cursor < range.end) {
      if (source[cursor] === first && source[cursor - 1] !== "\\") {
        const afterQuote = skipWhitespace(source, cursor + 1);
        return source[afterQuote] === ":" ? source.slice(range.start + 1, cursor) : null;
      }
      cursor += 1;
    }
    return null;
  }

  const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(range.start, range.end));
  if (!match) return null;

  const afterName = skipWhitespace(source, range.start + match[0].length);
  return source[afterName] === ":" ? match[0] : null;
}

function findObjectPropertyRange(
  source: string,
  objectName: string,
  propertyName: string
): { start: number; end: number } | null {
  const variableRange = findVariableDeclarationRange(source, objectName);
  if (!variableRange) return null;

  const equalsIndex = source.indexOf("=", variableRange.start);
  if (equalsIndex < 0 || equalsIndex >= variableRange.end) return null;

  const objectStart = skipWhitespace(source, equalsIndex + 1);
  if (source[objectStart] !== "{" || objectStart >= variableRange.end) return null;

  const objectEnd = scanBalanced(source, objectStart, "{", "}");
  if (objectEnd < 0 || objectEnd > variableRange.end) return null;

  for (const range of splitTopLevelRanges(source, objectStart + 1, objectEnd - 1, ",")) {
    if (objectPropertyKey(source, range) === propertyName) return range;
  }

  return null;
}

function relatedRangeFromLocalDeclaration(
  rootDir: string,
  file: string,
  source: string,
  kind: RelatedSourceRange["kind"],
  identifier: string,
  range: { start: number; end: number }
): RelatedSourceRange {
  return {
    file,
    relativeFile: path.relative(rootDir, file).replace(/\\/g, "/"),
    sourceHash: sourceHash(source),
    source,
    kind,
    identifier,
    start: range.start,
    end: range.end
  };
}

function relatedRangeFromObjectProperty(
  rootDir: string,
  file: string,
  source: string,
  objectName: string,
  propertyName: string,
  range: { start: number; end: number }
): RelatedSourceRange {
  return relatedRangeFromLocalDeclaration(
    rootDir,
    file,
    source,
    "object-property",
    `${objectName}.${propertyName}`,
    range
  );
}

function maskStringAndCommentContent(source: string): string {
  let output = "";
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        output += "\n";
      } else {
        output += " ";
      }
      continue;
    }

    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        output += "  ";
        index += 1;
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      output += character === "\n" ? "\n" : " ";
      continue;
    }

    if (character === "/" && next === "/") {
      lineComment = true;
      output += "  ";
      index += 1;
      continue;
    }

    if (character === "/" && next === "*") {
      blockComment = true;
      output += "  ";
      index += 1;
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      output += " ";
      continue;
    }

    output += character;
  }

  return output;
}

function findRelatedDependencyRanges(
  rootDir: string,
  relatedRange: RelatedSourceRange
): RelatedSourceRange[] {
  const relatedSource = relatedRange.source.slice(relatedRange.start, relatedRange.end);
  const maskedSource = maskStringAndCommentContent(relatedSource);
  const identifiers = new Set<string>();
  const identifierPattern = /\b[A-Za-z_$][\w$]*\b/g;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(maskedSource)) !== null) {
    const identifier = match[0];
    if (identifier === relatedRange.identifier || dependencyIdentifierDenylist.has(identifier)) {
      continue;
    }
    identifiers.add(identifier);
  }

  const dependencies: RelatedSourceRange[] = [];
  const seen = new Set<string>();
  for (const identifier of identifiers) {
    const range = findVariableDeclarationRange(relatedRange.source, identifier);
    if (range && !(range.start >= relatedRange.start && range.end <= relatedRange.end)) {
      const dependency = relatedRangeFromLocalDeclaration(
        rootDir,
        relatedRange.file,
        relatedRange.source,
        "variable-declaration",
        identifier,
        range
      );
      const key = `${dependency.relativeFile}:${dependency.start}:${dependency.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        dependencies.push(dependency);
      }
      continue;
    }

    const imported = importedNameForLocalIdentifier(relatedRange.source, identifier);
    const importedFile = imported ? resolveImportFile(rootDir, relatedRange.file, imported.file) : null;
    const dependency = imported && importedFile
      ? findImportedVariableDeclaration(rootDir, importedFile, imported.importedName)
      : null;
    if (!dependency) continue;

    const key = `${dependency.relativeFile}:${dependency.start}:${dependency.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push(dependency);
  }

  return dependencies.slice(0, 8);
}

function findImportedVariableDeclaration(
  rootDir: string,
  file: string,
  identifier: string,
  visited = new Set<string>()
): RelatedSourceRange | null {
  const normalizedFile = path.resolve(file);
  const visitKey = `${normalizedFile}:${identifier}`;
  if (visited.has(visitKey) || visited.size > 6) return null;
  visited.add(visitKey);

  const source = fs.readFileSync(normalizedFile, "utf8");
  const localRange = findVariableDeclarationRange(source, identifier);
  if (localRange) {
    return relatedRangeFromLocalDeclaration(
      rootDir,
      normalizedFile,
      source,
      "variable-declaration",
      identifier,
      localRange
    );
  }

  const reExport = reExportForIdentifier(source, identifier);
  const reExportFile = reExport ? resolveImportFile(rootDir, normalizedFile, reExport.file) : null;
  if (!reExport || !reExportFile) return null;

  return findImportedVariableDeclaration(rootDir, reExportFile, reExport.importedName, visited);
}

function propertyAccessReference(
  value: string
): { objectName: string; propertyName: string } | null {
  const trimmed = value.trim();
  const dotMatch = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(trimmed);
  if (dotMatch) {
    return {
      objectName: dotMatch[1],
      propertyName: dotMatch[2]
    };
  }

  const bracketMatch = /^([A-Za-z_$][\w$]*)\[\s*["']([^"']+)["']\s*\]$/.exec(trimmed);
  if (bracketMatch && /^[A-Za-z_$][\w$]*$/.test(bracketMatch[2])) {
    return {
      objectName: bracketMatch[1],
      propertyName: bracketMatch[2]
    };
  }

  return null;
}

function findImportedObjectPropertyDeclaration(
  rootDir: string,
  file: string,
  objectName: string,
  propertyName: string,
  visited = new Set<string>()
): RelatedSourceRange | null {
  const normalizedFile = path.resolve(file);
  const visitKey = `${normalizedFile}:${objectName}.${propertyName}`;
  if (visited.has(visitKey) || visited.size > 6) return null;
  visited.add(visitKey);

  const source = fs.readFileSync(normalizedFile, "utf8");
  const propertyRange = findObjectPropertyRange(source, objectName, propertyName);
  if (propertyRange) {
    return relatedRangeFromObjectProperty(
      rootDir,
      normalizedFile,
      source,
      objectName,
      propertyName,
      propertyRange
    );
  }

  const reExport = reExportForIdentifier(source, objectName);
  const reExportFile = reExport ? resolveImportFile(rootDir, normalizedFile, reExport.file) : null;
  if (!reExport || !reExportFile) return null;

  return findImportedObjectPropertyDeclaration(
    rootDir,
    reExportFile,
    reExport.importedName,
    propertyName,
    visited
  );
}

function findImportedVariantDeclaration(
  rootDir: string,
  file: string,
  identifier: string,
  visited = new Set<string>()
): RelatedSourceRange | null {
  const normalizedFile = path.resolve(file);
  const visitKey = `${normalizedFile}:${identifier}`;
  if (visited.has(visitKey) || visited.size > 6) return null;
  visited.add(visitKey);

  const source = fs.readFileSync(normalizedFile, "utf8");
  const localRange = findVariantDeclarationRange(source, identifier);
  if (localRange) {
    return relatedRangeFromLocalDeclaration(
      rootDir,
      normalizedFile,
      source,
      "variant-function",
      identifier,
      localRange
    );
  }

  const reExport = reExportForIdentifier(source, identifier);
  const reExportFile = reExport ? resolveImportFile(rootDir, normalizedFile, reExport.file) : null;
  if (!reExport || !reExportFile) return null;

  return findImportedVariantDeclaration(rootDir, reExportFile, reExport.importedName, visited);
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

    const localRange = findVariableDeclarationRange(source, identifier);
    if (localRange) {
      return {
        file: binding.file,
        relativeFile: binding.relativeFile,
        sourceHash: binding.sourceHash,
        source,
        kind: "variable-declaration",
        identifier,
        start: localRange.start,
        end: localRange.end
      };
    }

    const imported = importedNameForLocalIdentifier(source, identifier);
    const importedFile = imported ? resolveImportFile(rootDir, binding.file, imported.file) : null;
    if (!imported || !importedFile) return null;

    return findImportedVariableDeclaration(rootDir, importedFile, imported.importedName);
  }

  if (binding.className.unsupportedReason === "property-access-reference") {
    const reference = propertyAccessReference(binding.className.value);
    if (!reference) return null;

    const localPropertyRange = findObjectPropertyRange(
      source,
      reference.objectName,
      reference.propertyName
    );
    if (localPropertyRange) {
      return relatedRangeFromObjectProperty(
        rootDir,
        binding.file,
        source,
        reference.objectName,
        reference.propertyName,
        localPropertyRange
      );
    }

    const imported = importedNameForLocalIdentifier(source, reference.objectName);
    const importedFile = imported ? resolveImportFile(rootDir, binding.file, imported.file) : null;
    if (!imported || !importedFile) return null;

    return findImportedObjectPropertyDeclaration(
      rootDir,
      importedFile,
      imported.importedName,
      reference.propertyName
    );
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
  const importedFile = imported ? resolveImportFile(rootDir, binding.file, imported.file) : null;
  if (!imported || !importedFile) return null;

  return findImportedVariantDeclaration(rootDir, importedFile, imported.importedName);
}

function externalImportReferenceForBinding(
  rootDir: string,
  source: string,
  binding: IntentBinding
): ExternalImportReference | null {
  if (binding.className.kind !== "read-only") return null;

  const unsupportedReason = binding.className.unsupportedReason;
  let localIdentifier: string | null = null;
  let usageKind: ExternalImportReference["usageKind"] | null = null;
  let referencedName: string | null = null;

  if (unsupportedReason === "variable-reference") {
    const identifier = binding.className.value.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(identifier)) {
      localIdentifier = identifier;
      usageKind = "variable-reference";
      referencedName = identifier;
    }
  } else if (unsupportedReason === "property-access-reference") {
    const reference = propertyAccessReference(binding.className.value);
    if (reference) {
      localIdentifier = reference.objectName;
      usageKind = "property-access-reference";
      referencedName = `${reference.objectName}.${reference.propertyName}`;
    }
  } else if (unsupportedReason === "variant-function") {
    const calleeMatch = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(binding.className.value);
    if (calleeMatch) {
      localIdentifier = calleeMatch[1];
      usageKind = "variant-function";
      referencedName = localIdentifier;
    }
  } else if (unsupportedReason === "unsupported-call-expression") {
    const calleeMatch = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(binding.className.value);
    if (calleeMatch) {
      localIdentifier = calleeMatch[1];
      usageKind = "unsupported-call-expression";
      referencedName = localIdentifier;
    }
  }

  if (!localIdentifier || !usageKind || !referencedName) return null;

  const importReference = externalPackageImportForLocalIdentifier(
    rootDir,
    binding.file,
    source,
    localIdentifier
  );
  if (!importReference) return null;

  return {
    kind: "external-package-import",
    usageKind,
    specifier: importReference.specifier,
    packageName: importReference.packageName,
    subpath: importReference.subpath,
    importKind: importReference.importKind,
    importedName: importReference.importedName,
    localName: importReference.localName,
    referencedName,
    usage: binding.className.value,
    editable: false,
    reason: "external-package-source-unresolved",
    guidance: [
      "Do not patch node_modules or third-party package source directly.",
      "Prefer a small local wrapper, prop, or local className override in the selected component.",
      "If the external package must change, create a separate upstream/package task instead of a direct patch."
    ]
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
  const externalImportReference = relatedRange
    ? null
    : externalImportReferenceForBinding(rootDir, currentSource, binding);
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
  const relatedDependencySnapshots = relatedRange
    ? findRelatedDependencyRanges(rootDir, relatedRange).map((dependency) => ({
        file: dependency.relativeFile,
        sourceHash: dependency.sourceHash,
        kind: dependency.kind,
        identifier: dependency.identifier,
        referencedBy: relatedRange.identifier,
        range: {
          start: dependency.start,
          end: dependency.end
        },
        ...lineWindow(dependency.source, dependency.start, dependency.end, 1)
      }))
    : [];
  const editableFiles = Array.from(
    new Set([
      binding.relativeFile,
      ...(relatedSnapshot && relatedSnapshot.file !== binding.relativeFile ? [relatedSnapshot.file] : []),
      ...relatedDependencySnapshots
        .map((snapshot) => snapshot.file)
        .filter((file) => file !== binding.relativeFile && file !== relatedSnapshot?.file)
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

  const metadata = createAgentTaskMetadata({
    taskFile,
    sourceIntentId: binding.id,
    sourceFile: binding.relativeFile
  });
  const body = [
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
    "## External Import Reference",
    "",
    codeFence(externalImportReference),
    "",
    "## Related Dependency Snapshots",
    "",
    codeFence(relatedDependencySnapshots),
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
    ...(externalImportReference
      ? [`- external package source for \`${externalImportReference.specifier}\` unless explicitly vendored`]
      : []),
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
  const markdown = buildAgentTaskMarkdown(metadata, body);

  fs.writeFileSync(taskFile, markdown);
  refreshAgentQueueSignal(rootDir);

  return {
    ok: true,
    id: binding.id,
    taskId: metadata.taskId,
    file: binding.file,
    relativeFile: binding.relativeFile,
    taskFile,
    status: metadata.status,
    markdown,
    metrics: {
      taskMs: Number((performance.now() - started).toFixed(3))
    }
  };
}
