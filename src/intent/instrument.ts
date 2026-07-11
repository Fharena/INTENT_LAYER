import path from "node:path";
import ts from "typescript";
import { shortHash, sourceHash } from "./hash";
import { tokenizeClassName } from "./tailwind";
import type { IntentBinding, IntentToken } from "./types";

interface SourceSegment {
  start: number;
  end: number;
  value: string;
}

interface ClassNameBinding {
  kind: "static" | "call-literals" | "read-only";
  start: number;
  end: number;
  value: string;
  callee?: "cn" | "clsx";
  dynamicSegments: number;
  unsupportedReason?: string;
  tokens: IntentToken[];
}

interface Insertion {
  position: number;
  text: string;
}

export interface InstrumentResult {
  code: string;
  entries: IntentBinding[];
  transformMs: number;
}

function isIntrinsicTag(tagName: string): boolean {
  return /^[a-z]/.test(tagName);
}

function getTagNameText(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile
): string {
  return node.tagName.getText(sourceFile);
}

function findAttribute(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string
): ts.JsxAttribute | null {
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name) {
      return property;
    }
  }
  return null;
}

function getInsertPosition(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement
): number {
  return node.getEnd() - (ts.isJsxSelfClosingElement(node) ? 2 : 1);
}

function getCalleeName(node: ts.Expression): "cn" | "clsx" | null {
  return ts.isIdentifier(node) && (node.text === "cn" || node.text === "clsx") ? node.text : null;
}

function stringSegment(node: ts.Node, sourceFile: ts.SourceFile): SourceSegment | null {
  if (!ts.isStringLiteralLike(node)) return null;
  return {
    start: node.getStart(sourceFile) + 1,
    end: node.getEnd() - 1,
    value: node.text
  };
}

function unsupportedReasonForExpression(node: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(node)) return "variable-reference";
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return "property-access-reference";
  }
  if (ts.isTemplateExpression(node)) return "template-expression";
  if (ts.isCallExpression(node)) {
    return /variant|cva/i.test(node.expression.getText(sourceFile))
      ? "variant-function"
      : "unsupported-call-expression";
  }
  return "unsupported-expression";
}

function readOnlyBinding(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  reason?: string,
  dynamicSegments = 1
): ClassNameBinding {
  return {
    kind: "read-only",
    start: expression.getStart(sourceFile),
    end: expression.getEnd(),
    value: expression.getText(sourceFile),
    dynamicSegments,
    unsupportedReason: reason ?? unsupportedReasonForExpression(expression, sourceFile),
    tokens: []
  };
}

function collectLiteralSegments(
  node: ts.Expression,
  sourceFile: ts.SourceFile
): { segments: SourceSegment[]; dynamicSegments: number; unsupportedReasons: string[] } {
  const direct = stringSegment(node, sourceFile);
  if (direct) return { segments: [direct], dynamicSegments: 0, unsupportedReasons: [] };

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const right = stringSegment(node.right, sourceFile);
    return right
      ? { segments: [right], dynamicSegments: 0, unsupportedReasons: [] }
      : {
          segments: [],
          dynamicSegments: 1,
          unsupportedReasons: ["logical-expression-non-string-right"]
        };
  }

  if (ts.isConditionalExpression(node)) {
    const whenTrue = stringSegment(node.whenTrue, sourceFile);
    const whenFalse = stringSegment(node.whenFalse, sourceFile);
    if (whenTrue && whenFalse) {
      return { segments: [whenTrue, whenFalse], dynamicSegments: 0, unsupportedReasons: [] };
    }
    return {
      segments: [whenTrue, whenFalse].filter((segment): segment is SourceSegment => Boolean(segment)),
      dynamicSegments: 1,
      unsupportedReasons: ["conditional-expression-non-string-branch"]
    };
  }

  return {
    segments: [],
    dynamicSegments: 1,
    unsupportedReasons: [
      ts.isIdentifier(node)
        ? "variable-reference"
        : ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
          ? "property-access-reference"
          : "runtime-expression"
    ]
  };
}

function tokensFromSegments(segments: SourceSegment[]): { value: string; tokens: IntentToken[] } {
  const tokens: IntentToken[] = [];
  let combinedValue = "";
  let combinedOffset = 0;

  for (const segment of segments) {
    if (combinedValue.length > 0) {
      combinedValue += " ";
      combinedOffset += 1;
    }

    for (const token of tokenizeClassName(segment.value)) {
      tokens.push({
        ...token,
        start: combinedOffset + token.start,
        end: combinedOffset + token.end,
        sourceStart: segment.start + token.sourceStart,
        sourceEnd: segment.start + token.sourceEnd
      });
    }

    combinedValue += segment.value;
    combinedOffset += segment.value.length;
  }

  return { value: combinedValue, tokens };
}

function insertText(code: string, insertions: Insertion[]): string {
  if (insertions.length === 0) return code;

  const parts: string[] = [];
  let cursor = 0;
  for (const insertion of insertions) {
    parts.push(code.slice(cursor, insertion.position), insertion.text);
    cursor = insertion.position;
  }
  parts.push(code.slice(cursor));
  return parts.join("");
}

function getClassNameBinding(
  attribute: ts.JsxAttribute,
  sourceFile: ts.SourceFile
): ClassNameBinding | null {
  const initializer = attribute.initializer;
  if (!initializer) return null;

  if (ts.isStringLiteral(initializer)) {
    const segment = stringSegment(initializer, sourceFile);
    if (!segment) return null;
    const { value, tokens } = tokensFromSegments([segment]);
    return { kind: "static", start: segment.start, end: segment.end, value, dynamicSegments: 0, tokens };
  }

  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null;

  const expression = initializer.expression;
  const staticExpression = stringSegment(expression, sourceFile);
  if (staticExpression) {
    const { value, tokens } = tokensFromSegments([staticExpression]);
    return {
      kind: "static",
      start: staticExpression.start,
      end: staticExpression.end,
      value,
      dynamicSegments: 0,
      tokens
    };
  }

  if (!ts.isCallExpression(expression)) return readOnlyBinding(expression, sourceFile);

  const callee = getCalleeName(expression.expression);
  if (!callee) return readOnlyBinding(expression, sourceFile);

  const segments: SourceSegment[] = [];
  let dynamicSegments = 0;
  const unsupportedReasons: string[] = [];
  for (const argument of expression.arguments) {
    const result = collectLiteralSegments(argument, sourceFile);
    segments.push(...result.segments);
    dynamicSegments += result.dynamicSegments;
    unsupportedReasons.push(...result.unsupportedReasons);
  }

  if (segments.length === 0) {
    return readOnlyBinding(
      expression,
      sourceFile,
      unsupportedReasons.join(", ") || "call-without-literal-segments",
      dynamicSegments || 1
    );
  }

  const { value, tokens } = tokensFromSegments(segments);
  return {
    kind: "call-literals",
    start: expression.getStart(sourceFile),
    end: expression.getEnd(),
    value,
    callee,
    dynamicSegments,
    unsupportedReason: unsupportedReasons.join(", ") || undefined,
    tokens
  };
}

export function instrumentSource(params: {
  code: string;
  file: string;
  rootDir: string;
}): InstrumentResult {
  const started = performance.now();
  if (!params.code.includes("className")) {
    return { code: params.code, entries: [], transformMs: Number((performance.now() - started).toFixed(3)) };
  }

  const sourceFile = ts.createSourceFile(
    params.file,
    params.code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );
  const currentSourceHash = sourceHash(params.code);
  const insertions: Insertion[] = [];
  const entries: IntentBinding[] = [];
  const relativeFile = path.relative(params.rootDir, params.file).replace(/\\/g, "/");

  function visit(node: ts.Node, componentName: string | null) {
    let currentComponentName = componentName;
    if (ts.isFunctionDeclaration(node) && node.name) currentComponentName = node.name.text;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer) ||
        /^[A-Z]/.test(node.name.text))
    ) {
      currentComponentName = node.name.text;
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagNameText(node, sourceFile);
      const classNameAttribute = findAttribute(node, "className");
      if (isIntrinsicTag(tagName) && classNameAttribute && !findAttribute(node, "data-intent-id")) {
        const className = getClassNameBinding(classNameAttribute, sourceFile);
        if (className) {
          const id = `il_${shortHash(`${relativeFile}:${className.start}:${tagName}`)}`;
          insertions.push({ position: getInsertPosition(node), text: ` data-intent-id="${id}"` });
          entries.push({
            id,
            file: params.file,
            relativeFile,
            tagName,
            componentName: currentComponentName,
            sourceHash: currentSourceHash,
            transformMs: 0,
            className: {
              kind: className.kind,
              start: className.start,
              end: className.end,
              value: className.value,
              callee: className.callee,
              dynamicSegments: className.dynamicSegments,
              unsupportedReason: className.unsupportedReason
            },
            tokens: className.tokens
          });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, currentComponentName));
  }

  visit(sourceFile, null);
  const transformMs = Number((performance.now() - started).toFixed(3));
  for (const entry of entries) entry.transformMs = transformMs;
  return { code: insertText(params.code, insertions), entries, transformMs };
}
