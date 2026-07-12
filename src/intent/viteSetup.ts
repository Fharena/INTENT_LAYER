import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface ViteProjectSetupResult {
  ok: boolean;
  status: "configured" | "already-configured" | "created" | "missing-config" | "unsupported-config";
  configFile: string | null;
  changed: boolean;
  dryRun: boolean;
  detail: string;
}

const configNames = [
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
  "vite.config.cts",
  "vite.config.cjs"
];

function moduleName(statement: ts.ImportDeclaration): string | null {
  return ts.isStringLiteralLike(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return null;
}

function variableInitializers(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const values = new Map<string, ts.Expression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        values.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return values;
}

function unwrapExpression(expression: ts.Expression, variables: Map<string, ts.Expression>): ts.Expression {
  let current = expression;
  const seen = new Set<string>();
  while (true) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (ts.isIdentifier(current) && variables.has(current.text) && !seen.has(current.text)) {
      seen.add(current.text);
      current = variables.get(current.text)!;
      continue;
    }
    if (ts.isCallExpression(current) && current.arguments[0]) {
      current = current.arguments[0];
      continue;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      if (ts.isBlock(current.body)) {
        const returned = current.body.statements.find(ts.isReturnStatement)?.expression;
        if (returned) {
          current = returned;
          continue;
        }
      } else {
        current = current.body;
        continue;
      }
    }
    return current;
  }
}

function configObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  const variables = variableInitializers(sourceFile);
  const exported = sourceFile.statements.find(ts.isExportAssignment);
  if (!exported) return null;
  const value = unwrapExpression(exported.expression, variables);
  return ts.isObjectLiteralExpression(value) ? value : null;
}

function parseErrors(sourceFile: ts.SourceFile): number {
  return ((sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [])
    .length;
}

function sourceFileFor(file: string, source: string): ts.SourceFile {
  const kind = /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
}

function uniqueLocalName(sourceFile: ts.SourceFile): string {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names.has("intentLayer") ? "intentLayerPlugin" : "intentLayer";
}

function existingIntentImport(sourceFile: ts.SourceFile): string | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const source = moduleName(statement);
    if (source !== "intent-layer/vite" && !source?.replace(/\\/g, "/").endsWith("/intent/vitePlugin")) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "intentLayer") return element.name.text;
    }
  }
  return null;
}

function hasPluginCall(object: ts.ObjectLiteralExpression, localName: string): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === localName) {
      return true;
    }
    return node.getChildren().some(visit);
  };
  return visit(object);
}

function lineIndent(source: string, position: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  return /^\s*/.exec(source.slice(lineStart, position))?.[0] ?? "";
}

function pluginInsertion(
  source: string,
  sourceFile: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  localName: string,
  newline: string
): { position: number; text: string } | null {
  const plugins = object.properties.find(
    (property) => "name" in property && property.name && propertyName(property.name) === "plugins"
  );
  if (plugins) {
    if (!ts.isPropertyAssignment(plugins) || !ts.isArrayLiteralExpression(plugins.initializer)) {
      return null;
    }
    const array = plugins.initializer;
    const first = array.elements[0];
    if (!first) return { position: array.getStart(sourceFile) + 1, text: `${localName}()` };
    const between = source.slice(array.getStart(sourceFile) + 1, first.getStart(sourceFile));
    if (between.includes("\n")) {
      return {
        position: first.getStart(sourceFile),
        text: `${localName}(),${newline}${lineIndent(source, first.getStart(sourceFile))}`
      };
    }
    return { position: first.getStart(sourceFile), text: `${localName}(), ` };
  }

  const open = object.getStart(sourceFile) + 1;
  const objectIndent = lineIndent(source, object.getStart(sourceFile));
  return {
    position: open,
    text: `${newline}${objectIndent}  plugins: [${localName}()],`
  };
}

function importInsertion(
  sourceFile: ts.SourceFile,
  localName: string,
  newline: string
): { position: number; text: string } {
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const declaration =
    localName === "intentLayer"
      ? `import { intentLayer } from "intent-layer/vite";`
      : `import { intentLayer as ${localName} } from "intent-layer/vite";`;
  const last = imports[imports.length - 1];
  return last
    ? { position: last.end, text: `${newline}${declaration}` }
    : { position: 0, text: `${declaration}${newline}` };
}

function applyInsertions(source: string, insertions: Array<{ position: number; text: string }>): string {
  let output = source;
  for (const insertion of [...insertions].sort((left, right) => right.position - left.position)) {
    output = `${output.slice(0, insertion.position)}${insertion.text}${output.slice(insertion.position)}`;
  }
  return output;
}

function writeAtomic(file: string, source: string): void {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, source, "utf8");
  try {
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function canCreateConfig(rootDir: string): boolean {
  const packageFile = path.join(rootDir, "package.json");
  if (!fs.existsSync(packageFile)) return false;
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      packageJson.dependencies?.["@vitejs/plugin-react"] ||
        packageJson.devDependencies?.["@vitejs/plugin-react"]
    );
  } catch {
    return false;
  }
}

export function configureViteProject(rootDir: string, dryRun = false): ViteProjectSetupResult {
  const root = path.resolve(rootDir);
  let file = configNames.map((name) => path.join(root, name)).find((candidate) => fs.existsSync(candidate));
  if (!file) {
    if (!canCreateConfig(root)) {
      return {
        ok: false,
        status: "missing-config",
        configFile: null,
        changed: false,
        dryRun,
        detail: "No Vite config was found, and this project does not declare @vitejs/plugin-react."
      };
    }
    file = path.join(root, "vite.config.ts");
    const source = [
      `import react from "@vitejs/plugin-react";`,
      `import { defineConfig } from "vite";`,
      `import { intentLayer } from "intent-layer/vite";`,
      "",
      "export default defineConfig({",
      "  plugins: [intentLayer(), react()]",
      "});",
      ""
    ].join("\n");
    if (!dryRun) writeAtomic(file, source);
    return {
      ok: true,
      status: "created",
      configFile: path.relative(root, file).replace(/\\/g, "/"),
      changed: true,
      dryRun,
      detail: dryRun ? "Vite config would be created." : "Vite config created with Intent Layer first."
    };
  }

  const source = fs.readFileSync(file, "utf8");
  const sourceFile = sourceFileFor(file, source);
  const object = configObject(sourceFile);
  if (parseErrors(sourceFile) > 0 || !object) {
    return {
      ok: false,
      status: "unsupported-config",
      configFile: path.relative(root, file).replace(/\\/g, "/"),
      changed: false,
      dryRun,
      detail: "The Vite config shape is not a statically editable defineConfig object. No file was changed."
    };
  }

  const importedName = existingIntentImport(sourceFile);
  if (importedName && hasPluginCall(object, importedName)) {
    return {
      ok: true,
      status: "already-configured",
      configFile: path.relative(root, file).replace(/\\/g, "/"),
      changed: false,
      dryRun,
      detail: "Intent Layer is already registered in the Vite plugins array."
    };
  }

  const localName = importedName ?? uniqueLocalName(sourceFile);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const plugin = pluginInsertion(source, sourceFile, object, localName, newline);
  if (!plugin) {
    return {
      ok: false,
      status: "unsupported-config",
      configFile: path.relative(root, file).replace(/\\/g, "/"),
      changed: false,
      dryRun,
      detail: "The Vite plugins value is not a static array. No file was changed."
    };
  }
  const nextSource = applyInsertions(source, [
    plugin,
    ...(importedName ? [] : [importInsertion(sourceFile, localName, newline)])
  ]);
  if (parseErrors(sourceFileFor(file, nextSource)) > 0) {
    return {
      ok: false,
      status: "unsupported-config",
      configFile: path.relative(root, file).replace(/\\/g, "/"),
      changed: false,
      dryRun,
      detail: "The proposed Vite edit did not parse cleanly. No file was changed."
    };
  }
  if (!dryRun) writeAtomic(file, nextSource);
  return {
    ok: true,
    status: "configured",
    configFile: path.relative(root, file).replace(/\\/g, "/"),
    changed: true,
    dryRun,
    detail: dryRun ? "Vite config would register Intent Layer." : "Vite config now registers Intent Layer first."
  };
}
