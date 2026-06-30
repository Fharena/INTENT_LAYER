import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { categorizeTailwindToken, tokenizeClassName } from "../src/intent/tailwind";

type Classification = "static" | "simple-cn-clsx" | "read-only";

interface ClassNameRecord {
  file: string;
  line: number;
  classification: Classification;
  reason: string;
  stringValues: string[];
  tokenCount: number;
  editableTokenCount: number;
}

interface Summary {
  generatedAt: string;
  filesScanned: number;
  classNameOccurrences: number;
  classification: Record<Classification, number>;
  classificationRatio: Record<Classification, number>;
  tokenTotals: {
    static: number;
    staticEditable: number;
    staticAndSimple: number;
    staticAndSimpleEditable: number;
    all: number;
    allEditable: number;
  };
  editableCoverage: {
    staticOnly: number;
    staticAndSimpleCnClsx: number;
    allObservedTokens: number;
  };
  unsupportedReasons: Record<string, number>;
  records: ClassNameRecord[];
}

function isSourceFile(file: string): boolean {
  return /\.[jt]sx$/.test(file);
}

function collectFiles(input: string): string[] {
  if (!fs.existsSync(input)) return [];
  const stat = fs.statSync(input);
  if (stat.isFile()) return isSourceFile(input) ? [input] : [];

  const ignored = new Set(["node_modules", ".git", "dist", ".vite"]);
  const files: string[] = [];
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const next = path.join(input, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(next));
    } else if (isSourceFile(next)) {
      files.push(next);
    }
  }
  return files;
}

function getLine(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function getCalleeName(node: ts.Expression): string {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return node.getText();
}

function extractStringValues(node: ts.Expression): { ok: true; values: string[] } | { ok: false; reason: string } {
  if (ts.isStringLiteralLike(node)) {
    return { ok: true, values: [node.text] };
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    if (ts.isStringLiteralLike(node.right)) {
      return { ok: true, values: [node.right.text] };
    }
    return { ok: false, reason: "logical-expression-non-string-right" };
  }

  if (ts.isConditionalExpression(node)) {
    if (ts.isStringLiteralLike(node.whenTrue) && ts.isStringLiteralLike(node.whenFalse)) {
      return { ok: true, values: [node.whenTrue.text, node.whenFalse.text] };
    }
    return { ok: false, reason: "conditional-expression-non-string-branch" };
  }

  return { ok: false, reason: node.kind === ts.SyntaxKind.Identifier ? "variable-reference" : "runtime-expression" };
}

function classifyInitializer(
  initializer: ts.JsxAttribute["initializer"]
): { classification: Classification; reason: string; stringValues: string[] } {
  if (!initializer) {
    return { classification: "read-only", reason: "missing-initializer", stringValues: [] };
  }

  if (ts.isStringLiteral(initializer)) {
    return { classification: "static", reason: "static-jsx-string", stringValues: [initializer.text] };
  }

  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return { classification: "read-only", reason: "unsupported-jsx-initializer", stringValues: [] };
  }

  const expression = initializer.expression;
  if (ts.isStringLiteralLike(expression)) {
    return { classification: "static", reason: "static-expression-string", stringValues: [expression.text] };
  }

  if (ts.isNoSubstitutionTemplateLiteral(expression)) {
    return { classification: "static", reason: "static-template-string", stringValues: [expression.text] };
  }

  if (ts.isTemplateExpression(expression)) {
    return { classification: "read-only", reason: "template-expression", stringValues: [] };
  }

  if (ts.isIdentifier(expression)) {
    return { classification: "read-only", reason: "variable-reference", stringValues: [] };
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return { classification: "read-only", reason: "property-access-reference", stringValues: [] };
  }

  if (ts.isCallExpression(expression)) {
    const calleeName = getCalleeName(expression.expression);
    if (calleeName !== "cn" && calleeName !== "clsx") {
      return {
        classification: "read-only",
        reason: calleeName.includes("variant") || calleeName.includes("Variants")
          ? "variant-function"
          : "runtime-call-expression",
        stringValues: []
      };
    }

    const values: string[] = [];
    for (const argument of expression.arguments) {
      const result = extractStringValues(argument);
      if (!result.ok) {
        return {
          classification: "read-only",
          reason: `complex-${calleeName}-${result.reason}`,
          stringValues: values
        };
      }
      values.push(...result.values);
    }

    return {
      classification: "simple-cn-clsx",
      reason: `simple-${calleeName}`,
      stringValues: values
    };
  }

  return { classification: "read-only", reason: "unsupported-expression", stringValues: [] };
}

function analyzeFile(file: string, rootDir: string): ClassNameRecord[] {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const records: ClassNameRecord[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className") {
      const result = classifyInitializer(node.initializer);
      const tokens = result.stringValues.flatMap((value) => tokenizeClassName(value));
      records.push({
        file: path.relative(rootDir, file).replace(/\\/g, "/"),
        line: getLine(sourceFile, node.getStart(sourceFile)),
        classification: result.classification,
        reason: result.reason,
        stringValues: result.stringValues,
        tokenCount: tokens.length,
        editableTokenCount: tokens.filter((token) => token.editable && categorizeTailwindToken(token.token)).length
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return records;
}

function ratio(value: number, total: number): number {
  if (total === 0) return 0;
  return Number((value / total).toFixed(4));
}

export function analyzeClassNames(inputs: string[], rootDir = process.cwd()): Summary {
  const files = [...new Set(inputs.flatMap((input) => collectFiles(path.resolve(rootDir, input))))].sort();
  const records = files.flatMap((file) => analyzeFile(file, rootDir));
  const classification: Record<Classification, number> = {
    static: 0,
    "simple-cn-clsx": 0,
    "read-only": 0
  };
  const unsupportedReasons: Record<string, number> = {};

  for (const record of records) {
    classification[record.classification] += 1;
    if (record.classification === "read-only") {
      unsupportedReasons[record.reason] = (unsupportedReasons[record.reason] ?? 0) + 1;
    }
  }

  const staticRecords = records.filter((record) => record.classification === "static");
  const staticAndSimpleRecords = records.filter((record) => record.classification !== "read-only");

  const tokenTotals = {
    static: staticRecords.reduce((sum, record) => sum + record.tokenCount, 0),
    staticEditable: staticRecords.reduce((sum, record) => sum + record.editableTokenCount, 0),
    staticAndSimple: staticAndSimpleRecords.reduce((sum, record) => sum + record.tokenCount, 0),
    staticAndSimpleEditable: staticAndSimpleRecords.reduce((sum, record) => sum + record.editableTokenCount, 0),
    all: records.reduce((sum, record) => sum + record.tokenCount, 0),
    allEditable: records.reduce((sum, record) => sum + record.editableTokenCount, 0)
  };

  return {
    generatedAt: new Date().toISOString(),
    filesScanned: files.length,
    classNameOccurrences: records.length,
    classification,
    classificationRatio: {
      static: ratio(classification.static, records.length),
      "simple-cn-clsx": ratio(classification["simple-cn-clsx"], records.length),
      "read-only": ratio(classification["read-only"], records.length)
    },
    tokenTotals,
    editableCoverage: {
      staticOnly: ratio(tokenTotals.staticEditable, tokenTotals.static),
      staticAndSimpleCnClsx: ratio(tokenTotals.staticAndSimpleEditable, tokenTotals.staticAndSimple),
      allObservedTokens: ratio(tokenTotals.allEditable, tokenTotals.all)
    },
    unsupportedReasons,
    records
  };
}

function parseArgs(argv: string[]) {
  const inputs: string[] = [];
  let out: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      out = argv[index + 1] ?? null;
      index += 1;
    } else {
      inputs.push(arg);
    }
  }

  return { inputs: inputs.length > 0 ? inputs : ["src"], out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { inputs, out } = parseArgs(process.argv.slice(2));
  const summary = analyzeClassNames(inputs);
  const json = `${JSON.stringify(summary, null, 2)}\n`;

  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, json);
  }

  process.stdout.write(json);
}
