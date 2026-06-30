import path from "node:path";
import MagicString from "magic-string";
import ts from "typescript";
import { sha256, shortHash } from "./hash";
import { tokenizeClassName } from "./tailwind";
import type { IntentBinding, IntentToken } from "./types";

interface SourceSegment {
  start: number;
  end: number;
  value: string;
}

interface ClassNameBinding {
  kind: "static" | "call-literals";
  start: number;
  end: number;
  value: string;
  callee?: "cn" | "clsx";
  dynamicSegments: number;
  unsupportedReason?: string;
  tokens: IntentToken[];
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
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile
): number {
  if (ts.isJsxSelfClosingElement(node)) {
    return node.getEnd() - 2;
  }

  return node.getEnd() - 1;
}

function getCalleeName(node: ts.Expression): "cn" | "clsx" | null {
  if (ts.isIdentifier(node) && (node.text === "cn" || node.text === "clsx")) {
    return node.text;
  }

  return null;
}

function stringSegment(node: ts.Node, sourceFile: ts.SourceFile): SourceSegment | null {
  if (ts.isStringLiteralLike(node)) {
    return {
      start: node.getStart(sourceFile) + 1,
      end: node.getEnd() - 1,
      value: node.text
    };
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return {
      start: node.getStart(sourceFile) + 1,
      end: node.getEnd() - 1,
      value: node.text
    };
  }

  return null;
}

function collectLiteralSegments(
  node: ts.Expression,
  sourceFile: ts.SourceFile
): { segments: SourceSegment[]; dynamicSegments: number; unsupportedReasons: string[] } {
  const direct = stringSegment(node, sourceFile);
  if (direct) {
    return { segments: [direct], dynamicSegments: 0, unsupportedReasons: [] };
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const right = stringSegment(node.right, sourceFile);
    if (right) {
      return { segments: [right], dynamicSegments: 0, unsupportedReasons: [] };
    }

    return {
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
    unsupportedReasons: [ts.isIdentifier(node) ? "variable-reference" : "runtime-expression"]
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

    const segmentTokens = tokenizeClassName(segment.value);
    for (const token of segmentTokens) {
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
    return {
      kind: "static",
      start: segment.start,
      end: segment.end,
      value,
      dynamicSegments: 0,
      tokens
    };
  }

  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return null;
  }

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

  if (!ts.isCallExpression(expression)) {
    return null;
  }

  const callee = getCalleeName(expression.expression);
  if (!callee) {
    return null;
  }

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
    return null;
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
  const sourceFile = ts.createSourceFile(
    params.file,
    params.code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );
  const sourceHash = sha256(params.code);
  const magic = new MagicString(params.code);
  const entries: IntentBinding[] = [];
  const relativeFile = path.relative(params.rootDir, params.file).replace(/\\/g, "/");

  function visit(node: ts.Node, componentName: string | null) {
    let currentComponentName = componentName;

    if (ts.isFunctionDeclaration(node) && node.name) {
      currentComponentName = node.name.text;
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      currentComponentName = node.name.text;
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagNameText(node, sourceFile);
      const classNameAttribute = findAttribute(node, "className");
      const existingIntentId = findAttribute(node, "data-intent-id");

      if (isIntrinsicTag(tagName) && classNameAttribute && !existingIntentId) {
        const className = getClassNameBinding(classNameAttribute, sourceFile);

        if (className) {
          const id = `il_${shortHash(`${relativeFile}:${className.start}:${tagName}`)}`;
          magic.appendLeft(getInsertPosition(node, sourceFile), ` data-intent-id="${id}"`);
          entries.push({
            id,
            file: params.file,
            relativeFile,
            tagName,
            componentName: currentComponentName,
            sourceHash,
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

  const transformMs = performance.now() - started;
  for (const entry of entries) {
    entry.transformMs = Number(transformMs.toFixed(3));
  }

  return {
    code: magic.toString(),
    entries,
    transformMs: Number(transformMs.toFixed(3))
  };
}
