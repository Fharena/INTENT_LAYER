import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { candidatesForToken, describeTailwindToken, splitTailwindVariant } from "./tailwind";
import type { TailwindSemanticToken } from "./tailwind";

export interface ProjectThemeCatalog {
  files: string[];
  colors: string[];
  spacing: string[];
  radii: string[];
  shadows: string[];
  breakpoints: string[];
}

interface CachedCatalog {
  fingerprint: string;
  catalog: ProjectThemeCatalog;
}

interface MutableCatalog {
  colors: Set<string>;
  spacing: Set<string>;
  radii: Set<string>;
  shadows: Set<string>;
  breakpoints: Map<string, number>;
  explicitBreakpoints: boolean;
}

const defaultBreakpoints = new Map<string, number>([
  ["sm", 640],
  ["md", 768],
  ["lg", 1024],
  ["xl", 1280],
  ["2xl", 1536]
]);

const catalogCache = new Map<string, CachedCatalog>();
const configNames = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mts",
  "tailwind.config.mjs",
  "tailwind.config.cts",
  "tailwind.config.cjs"
];
const cssLocations = [
  "src/index.css",
  "src/styles.css",
  "src/app.css",
  "src/globals.css",
  "src/styles/globals.css",
  "app/globals.css",
  "styles/globals.css"
];

function propertyName(node: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) {
    return node.expression.text;
  }
  return null;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isCallExpression(current) && current.arguments[0]) return unwrapExpression(current.arguments[0]);
  return current;
}

function objectBindings(sourceFile: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const bindings = new Map<string, ts.ObjectLiteralExpression>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(value)) bindings.set(node.name.text, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function objectValue(
  expression: ts.Expression,
  bindings: Map<string, ts.ObjectLiteralExpression>
): ts.ObjectLiteralExpression | null {
  const value = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(value)) return value;
  return ts.isIdentifier(value) ? bindings.get(value.text) ?? null : null;
}

function propertyValue(
  object: ts.ObjectLiteralExpression,
  key: string,
  bindings: Map<string, ts.ObjectLiteralExpression>
): ts.ObjectLiteralExpression | null {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === key) {
      return objectValue(property.initializer, bindings);
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === key) {
      return bindings.get(key) ?? null;
    }
  }
  return null;
}

function collectScale(
  object: ts.ObjectLiteralExpression,
  bindings: Map<string, ts.ObjectLiteralExpression>,
  output: Set<string>,
  prefix = ""
): void {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (!key) continue;
    if (key === "DEFAULT") {
      if (prefix) output.add(prefix);
      continue;
    }
    const name = prefix ? `${prefix}-${key}` : key;
    const nested = ts.isPropertyAssignment(property)
      ? objectValue(property.initializer, bindings)
      : bindings.get(property.name.text) ?? null;
    if (nested) collectScale(nested, bindings, output, name);
    else output.add(name);
  }
}

function cssLengthPx(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(px|rem|em)$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === "px" ? amount : amount * 16;
}

function breakpointValue(
  expression: ts.Expression,
  bindings: Map<string, ts.ObjectLiteralExpression>
): number | null {
  const value = unwrapExpression(expression);
  if (ts.isStringLiteralLike(value)) return cssLengthPx(value.text);
  const object = objectValue(value, bindings);
  if (!object) return null;
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      propertyName(property.name) === "min" &&
      ts.isStringLiteralLike(unwrapExpression(property.initializer))
    ) {
      return cssLengthPx((unwrapExpression(property.initializer) as ts.StringLiteralLike).text);
    }
  }
  return null;
}

function collectBreakpoints(
  object: ts.ObjectLiteralExpression,
  bindings: Map<string, ts.ObjectLiteralExpression>,
  output: Map<string, number>
): void {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    const value = breakpointValue(property.initializer, bindings);
    if (key && value !== null) output.set(key, value);
  }
}

function configRoot(
  sourceFile: ts.SourceFile,
  bindings: Map<string, ts.ObjectLiteralExpression>
): ts.ObjectLiteralExpression | null {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      const value = objectValue(statement.expression, bindings);
      if (value) return value;
    }
    if (
      ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) &&
      statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      statement.expression.left.getText(sourceFile) === "module.exports"
    ) {
      const value = objectValue(statement.expression.right, bindings);
      if (value) return value;
    }
  }
  return null;
}

function readTailwindConfig(file: string, catalog: MutableCatalog): void {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const bindings = objectBindings(sourceFile);
  const root = configRoot(sourceFile, bindings);
  const theme = root ? propertyValue(root, "theme", bindings) : null;
  if (!theme) return;

  const directScreens = propertyValue(theme, "screens", bindings);
  if (directScreens) {
    if (!catalog.explicitBreakpoints) catalog.breakpoints.clear();
    catalog.explicitBreakpoints = true;
    collectBreakpoints(directScreens, bindings, catalog.breakpoints);
  }
  const extendedTheme = propertyValue(theme, "extend", bindings);
  const extendedScreens = extendedTheme ? propertyValue(extendedTheme, "screens", bindings) : null;
  if (extendedScreens) collectBreakpoints(extendedScreens, bindings, catalog.breakpoints);

  for (const candidate of [theme, extendedTheme].filter(
    (value): value is ts.ObjectLiteralExpression => Boolean(value)
  )) {
    const scales: Array<[string, Set<string>]> = [
      ["colors", catalog.colors],
      ["spacing", catalog.spacing],
      ["borderRadius", catalog.radii],
      ["boxShadow", catalog.shadows]
    ];
    for (const [name, output] of scales) {
      const scale = propertyValue(candidate, name, bindings);
      if (scale) collectScale(scale, bindings, output);
    }
  }
}

function readCssTheme(file: string, catalog: MutableCatalog): void {
  const source = fs.readFileSync(file, "utf8");
  const scales: Array<[RegExp, Set<string>]> = [
    [/--color-([a-zA-Z0-9_-]+)\s*:/g, catalog.colors],
    [/--spacing-([a-zA-Z0-9_.\/-]+)\s*:/g, catalog.spacing],
    [/--radius-([a-zA-Z0-9_-]+)\s*:/g, catalog.radii],
    [/--shadow-([a-zA-Z0-9_-]+)\s*:/g, catalog.shadows]
  ];
  for (const [pattern, output] of scales) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) output.add(match[1]);
  }

  const semanticColorName = /(?:color|foreground|background|surface|primary|secondary|accent|muted|border|ring|ink)/i;
  const variablePattern = /--([a-zA-Z0-9_-]+)\s*:/g;
  let variable: RegExpExecArray | null;
  while ((variable = variablePattern.exec(source)) !== null) {
    if (semanticColorName.test(variable[1])) catalog.colors.add(`[var(--${variable[1]})]`);
  }


  const breakpointPattern = /--breakpoint-([a-zA-Z0-9_-]+)\s*:\s*([^;\s}]+)/g;
  let breakpoint: RegExpExecArray | null;
  while ((breakpoint = breakpointPattern.exec(source)) !== null) {
    if (breakpoint[2] === "initial") catalog.breakpoints.delete(breakpoint[1]);
    else {
      const value = cssLengthPx(breakpoint[2]);
      if (value !== null) catalog.breakpoints.set(breakpoint[1], value);
    }
  }
}

function candidateFiles(rootDir: string): string[] {
  const files = [...configNames, ...cssLocations]
    .map((name) => path.join(rootDir, name))
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  return [...new Set(files.map((file) => path.resolve(file)))].sort();
}

function fingerprint(files: string[]): string {
  return files
    .map((file) => {
      const stat = fs.statSync(file);
      return `${file}:${stat.mtimeMs}:${stat.size}`;
    })
    .join("|");
}

export function readProjectThemeCatalog(rootDir: string): ProjectThemeCatalog {
  const root = path.resolve(rootDir);
  const files = candidateFiles(root);
  const nextFingerprint = fingerprint(files);
  const cached = catalogCache.get(root);
  if (cached?.fingerprint === nextFingerprint) return cached.catalog;

  const mutable: MutableCatalog = {
    colors: new Set(),
    spacing: new Set(),
    radii: new Set(),
    shadows: new Set(),
    breakpoints: new Map(defaultBreakpoints),
    explicitBreakpoints: false
  };
  for (const file of files) {
    try {
      if (/tailwind\.config\./.test(path.basename(file))) readTailwindConfig(file, mutable);
      else readCssTheme(file, mutable);
    } catch {
      // Dynamic theme files leave the built-in candidate set intact.
    }
  }
  const catalog: ProjectThemeCatalog = {
    files: files.map((file) => path.relative(root, file).replace(/\\/g, "/")),
    colors: [...mutable.colors].sort(),
    spacing: [...mutable.spacing].sort(),
    radii: [...mutable.radii].sort(),
    shadows: [...mutable.shadows].sort(),
    breakpoints: [
      "base",
      ...[...mutable.breakpoints.entries()]
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
        .map(([name]) => name)
    ]
  };
  catalogCache.set(root, { fingerprint: nextFingerprint, catalog });
  return catalog;
}

export function clearProjectThemeCandidateCache(): void {
  catalogCache.clear();
}

const builtInShadowValues = new Set(["none", "sm", "md", "lg", "xl", "2xl", "inner"]);

function projectShadowValue(catalog: ProjectThemeCatalog, base: string): string | null {
  const match = base.match(/^shadow(?:-(.+))?$/);
  if (!match) return null;
  const value = match[1] ?? "default";
  return value === "default" || builtInShadowValues.has(value) || catalog.shadows.includes(value) ? value : null;
}

function candidatesFromCatalog(catalog: ProjectThemeCatalog, token: string): string[] {
  const { variantPrefix, base } = splitTailwindVariant(token);
  const projectBases: string[] = [];
  const current = describeTailwindToken(token, [token]);
  const spacing = base.match(/^(-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y))-(.+)$/);
  const sizing = base.match(/^((?:w|h|min-w|min-h|max-w|max-h|size))-(.+)$/);
  const radius = base.match(/^(rounded(?:-[trbl]{1,2})?)(?:-(.+))?$/);
  const shadow = base.match(/^(shadow)(?:-(.+))?$/);
  const shadowValue = projectShadowValue(catalog, base);
  const color = base.match(
    /^((?:bg|text|border(?:-[trblxy])?|divide-[xy]|ring|ring-offset|outline|decoration|accent|caret|fill|stroke|shadow))-(.+)$/
  );

  if (spacing) projectBases.push(...catalog.spacing.map((value) => `${spacing[1]}-${value}`));
  if (sizing) projectBases.push(...catalog.spacing.map((value) => `${sizing[1]}-${value}`));
  if (radius) projectBases.push(...catalog.radii.map((value) => `${radius[1]}-${value}`));
  if (shadow && shadowValue !== null) projectBases.push(...catalog.shadows.map((value) => `${shadow[1]}-${value}`));
  if (color && shadowValue === null && current?.property.startsWith("color.")) {
    projectBases.push(...catalog.colors.map((value) => `${color[1]}-${value}`));
  }

  const builtInCandidates = shadowValue === null ? candidatesForToken(token) : candidatesForToken(`${variantPrefix}shadow-md`);
  const candidates = [
    ...new Set([
      token,
      ...projectBases.map((value) => `${variantPrefix}${value}`),
      ...builtInCandidates
    ])
  ];
  if (shadowValue !== null) return candidates;
  return describeTailwindToken(token, candidates)?.candidates.map((candidate) => candidate.token) ?? [token];
}

export function describeProjectTailwindToken(rootDir: string, token: string): TailwindSemanticToken | null {
  const catalog = readProjectThemeCatalog(rootDir);
  const candidates = candidatesFromCatalog(catalog, token);
  const split = splitTailwindVariant(token);
  const shadowValue = projectShadowValue(catalog, split.base);
  if (shadowValue === null) return describeTailwindToken(token, candidates);

  return {
    property: "effect.shadow",
    value: shadowValue,
    token,
    variant: split.variantPrefix ? split.variantPrefix.slice(0, -1) : null,
    candidates: candidates.map((candidate) => {
      const candidateBase = splitTailwindVariant(candidate).base;
      return {
        token: candidate,
        value: candidateBase === "shadow" ? "default" : candidateBase.slice("shadow-".length)
      };
    })
  };
}

export function createProjectCandidateResolver(rootDir: string): (token: string) => string[] {
  const catalog = readProjectThemeCatalog(rootDir);
  return (token) => candidatesFromCatalog(catalog, token);
}

export function projectCandidatesForToken(rootDir: string, token: string): string[] {
  return candidatesFromCatalog(readProjectThemeCatalog(rootDir), token);
}
