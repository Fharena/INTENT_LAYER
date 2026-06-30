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

interface AttributeMatch {
  name: string;
  valueStart: number | null;
  valueEnd: number | null;
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

function unsupportedReasonForExpression(node: ts.Expression): string {
  if (ts.isIdentifier(node)) return "variable-reference";
  if (ts.isTemplateExpression(node)) return "template-expression";
  if (ts.isCallExpression(node)) {
    const calleeText = node.expression.getText();
    if (/variant|cva/i.test(calleeText)) return "variant-function";
    return "unsupported-call-expression";
  }
  return "unsupported-expression";
}

function readOnlyBinding(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  reason = unsupportedReasonForExpression(expression),
  dynamicSegments = 1
): ClassNameBinding {
  return {
    kind: "read-only",
    start: expression.getStart(sourceFile),
    end: expression.getEnd(),
    value: expression.getText(sourceFile),
    dynamicSegments,
    unsupportedReason: reason,
    tokens: []
  };
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

function insertText(code: string, insertions: Insertion[]): string {
  if (insertions.length === 0) return code;

  const sorted = [...insertions].sort((left, right) => left.position - right.position);
  let result = "";
  let cursor = 0;

  for (const insertion of sorted) {
    result += code.slice(cursor, insertion.position);
    result += insertion.text;
    cursor = insertion.position;
  }

  return `${result}${code.slice(cursor)}`;
}

function isTagNameStart(character: string): boolean {
  return character >= "a" && character <= "z";
}

function isNameCharacter(character: string): boolean {
  return /[\w:$.-]/.test(character);
}

function skipWhitespace(code: string, index: number, end: number): number {
  let cursor = index;
  while (cursor < end && /\s/.test(code[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function scanBalanced(code: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = start; index < code.length; index += 1) {
    const character = code[index];
    const previous = code[index - 1];

    if (quote) {
      if (character === quote && previous !== "\\") {
        quote = null;
      }
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

function scanJsxTagEnd(code: string, start: number): number {
  let braceDepth = 0;
  let quote: string | null = null;

  for (let index = start; index < code.length; index += 1) {
    const character = code[index];
    const previous = code[index - 1];

    if (quote) {
      if (character === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") braceDepth += 1;
    if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (character === ">" && braceDepth === 0) return index + 1;
  }

  return -1;
}

function readAttribute(code: string, start: number, end: number): AttributeMatch | null {
  let cursor = skipWhitespace(code, start, end);
  if (cursor >= end || code[cursor] === "/" || code[cursor] === ">") return null;

  const nameStart = cursor;
  while (cursor < end && isNameCharacter(code[cursor] ?? "")) {
    cursor += 1;
  }

  if (cursor === nameStart) return null;

  const name = code.slice(nameStart, cursor);
  cursor = skipWhitespace(code, cursor, end);

  if (code[cursor] !== "=") {
    return { name, valueStart: null, valueEnd: cursor };
  }

  cursor = skipWhitespace(code, cursor + 1, end);
  const valueStart = cursor;
  const opener = code[cursor];

  if (opener === "\"" || opener === "'") {
    cursor += 1;
    while (cursor < end) {
      if (code[cursor] === opener && code[cursor - 1] !== "\\") {
        return { name, valueStart, valueEnd: cursor + 1 };
      }
      cursor += 1;
    }
    return null;
  }

  if (opener === "{") {
    const valueEnd = scanBalanced(code, cursor, "{", "}");
    return valueEnd > 0 ? { name, valueStart, valueEnd } : null;
  }

  while (cursor < end && !/\s/.test(code[cursor] ?? "") && code[cursor] !== ">") {
    cursor += 1;
  }
  return { name, valueStart, valueEnd: cursor };
}

function findAttributeFast(
  code: string,
  start: number,
  end: number,
  name: string
): AttributeMatch | null {
  let cursor = start;

  while (cursor < end) {
    const attribute = readAttribute(code, cursor, end);
    if (!attribute) {
      cursor += 1;
      continue;
    }

    if (attribute.name === name) return attribute;
    cursor = attribute.valueEnd ?? cursor + attribute.name.length;
  }

  return null;
}

function trimRange(code: string, start: number, end: number): { start: number; end: number } {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/.test(code[nextStart] ?? "")) nextStart += 1;
  while (nextEnd > nextStart && /\s/.test(code[nextEnd - 1] ?? "")) nextEnd -= 1;
  return { start: nextStart, end: nextEnd };
}

function literalSegmentFromRange(code: string, start: number, end: number): SourceSegment | null {
  const trimmed = trimRange(code, start, end);
  const opener = code[trimmed.start];
  const closer = code[trimmed.end - 1];

  if ((opener === "\"" || opener === "'") && closer === opener) {
    return {
      start: trimmed.start + 1,
      end: trimmed.end - 1,
      value: code.slice(trimmed.start + 1, trimmed.end - 1)
    };
  }

  if (opener === "`" && closer === "`" && !code.slice(trimmed.start + 1, trimmed.end - 1).includes("${")) {
    return {
      start: trimmed.start + 1,
      end: trimmed.end - 1,
      value: code.slice(trimmed.start + 1, trimmed.end - 1)
    };
  }

  return null;
}

function splitTopLevel(code: string, start: number, end: number, delimiter: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let quote: string | null = null;
  let depth = 0;
  let cursor = start;

  for (let index = start; index < end; index += 1) {
    const character = code[index];
    const previous = code[index - 1];

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
      ranges.push([cursor, index]);
      cursor = index + 1;
    }
  }

  ranges.push([cursor, end]);
  return ranges;
}

function findTopLevelText(code: string, start: number, end: number, text: string): number {
  let quote: string | null = null;
  let depth = 0;

  for (let index = start; index <= end - text.length; index += 1) {
    const character = code[index];
    const previous = code[index - 1];

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
    if (depth === 0 && code.slice(index, index + text.length) === text) return index;
  }

  return -1;
}

function collectArgumentSegments(
  code: string,
  start: number,
  end: number
): { segments: SourceSegment[]; dynamicSegments: number; unsupportedReasons: string[] } {
  const direct = literalSegmentFromRange(code, start, end);
  if (direct) return { segments: [direct], dynamicSegments: 0, unsupportedReasons: [] };

  const logicalIndex = findTopLevelText(code, start, end, "&&");
  if (logicalIndex >= 0) {
    const right = literalSegmentFromRange(code, logicalIndex + 2, end);
    return right
      ? { segments: [right], dynamicSegments: 0, unsupportedReasons: [] }
      : {
          segments: [],
          dynamicSegments: 1,
          unsupportedReasons: ["logical-expression-non-string-right"]
        };
  }

  const questionIndex = findTopLevelText(code, start, end, "?");
  const colonIndex =
    questionIndex >= 0 ? findTopLevelText(code, questionIndex + 1, end, ":") : -1;
  if (questionIndex >= 0 && colonIndex >= 0) {
    const whenTrue = literalSegmentFromRange(code, questionIndex + 1, colonIndex);
    const whenFalse = literalSegmentFromRange(code, colonIndex + 1, end);
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
    unsupportedReasons: [/^\s*[A-Za-z_$][\w$]*\s*$/.test(code.slice(start, end))
      ? "variable-reference"
      : "runtime-expression"]
  };
}

function unsupportedReasonForExpressionText(expression: string): string {
  const trimmed = expression.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return "variable-reference";
  if (trimmed.startsWith("`") && trimmed.includes("${")) return "template-expression";
  if (/^[\w$.]*variant[\w$.]*\s*\(/i.test(trimmed) || /^cva\s*\(/i.test(trimmed)) {
    return "variant-function";
  }
  if (/^[A-Za-z_$][\w$.$]*\s*\(/.test(trimmed)) return "unsupported-call-expression";
  return "unsupported-expression";
}

function getFastClassNameBinding(
  code: string,
  attribute: AttributeMatch
): ClassNameBinding | null {
  if (attribute.valueStart === null || attribute.valueEnd === null) return null;

  const opener = code[attribute.valueStart];
  if (opener === "\"" || opener === "'") {
    const segment = literalSegmentFromRange(code, attribute.valueStart, attribute.valueEnd);
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

  if (opener !== "{") return null;

  const expressionRange = trimRange(code, attribute.valueStart + 1, attribute.valueEnd - 1);
  const staticExpression = literalSegmentFromRange(code, expressionRange.start, expressionRange.end);
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

  const calleeMatch = /^([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(expressionRange.start, expressionRange.end));
  const callee = calleeMatch?.[1] === "cn" || calleeMatch?.[1] === "clsx" ? calleeMatch[1] : null;
  if (!callee || !calleeMatch) {
    const expression = code.slice(expressionRange.start, expressionRange.end);
    return {
      kind: "read-only",
      start: expressionRange.start,
      end: expressionRange.end,
      value: expression,
      dynamicSegments: 1,
      unsupportedReason: unsupportedReasonForExpressionText(expression),
      tokens: []
    };
  }

  const calleeEnd = expressionRange.start + calleeMatch[0].length;
  const parenStart = calleeEnd - 1;
  const parenEnd = scanBalanced(code, parenStart, "(", ")");
  if (parenEnd < 0 || trimRange(code, parenEnd, expressionRange.end).start !== expressionRange.end) {
    const expression = code.slice(expressionRange.start, expressionRange.end);
    return {
      kind: "read-only",
      start: expressionRange.start,
      end: expressionRange.end,
      value: expression,
      dynamicSegments: 1,
      unsupportedReason: "unsupported-call-expression",
      tokens: []
    };
  }

  const segments: SourceSegment[] = [];
  let dynamicSegments = 0;
  const unsupportedReasons: string[] = [];
  for (const [argumentStart, argumentEnd] of splitTopLevel(code, parenStart + 1, parenEnd - 1, ",")) {
    const result = collectArgumentSegments(code, argumentStart, argumentEnd);
    segments.push(...result.segments);
    dynamicSegments += result.dynamicSegments;
    unsupportedReasons.push(...result.unsupportedReasons);
  }

  if (segments.length === 0) {
    const expression = code.slice(expressionRange.start, expressionRange.end);
    return {
      kind: "read-only",
      start: expressionRange.start,
      end: expressionRange.end,
      value: expression,
      dynamicSegments: dynamicSegments || 1,
      unsupportedReason: unsupportedReasons.join(", ") || "call-without-literal-segments",
      tokens: []
    };
  }

  const { value, tokens } = tokensFromSegments(segments);
  return {
    kind: "call-literals",
    start: expressionRange.start,
    end: expressionRange.end,
    value,
    callee,
    dynamicSegments,
    unsupportedReason: unsupportedReasons.join(", ") || undefined,
    tokens
  };
}

function collectComponentDeclarations(code: string): Array<{ position: number; name: string }> {
  const declarations: Array<{ position: number; name: string }> = [];
  const pattern =
    /(?:export\s+)?function\s+([A-Z][\w$]*)\s*\(|(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code)) !== null) {
    declarations.push({
      position: match.index,
      name: match[1] ?? match[2]
    });
  }

  return declarations;
}

function componentNameAt(
  declarations: Array<{ position: number; name: string }>,
  position: number
): string | null {
  let current: string | null = null;
  for (const declaration of declarations) {
    if (declaration.position > position) break;
    current = declaration.name;
  }
  return current;
}

function instrumentSourceFast(params: {
  code: string;
  file: string;
  rootDir: string;
  started: number;
}): InstrumentResult | null {
  const currentSourceHash = sourceHash(params.code);
  const insertions: Insertion[] = [];
  const entries: IntentBinding[] = [];
  const relativeFile = path.relative(params.rootDir, params.file).replace(/\\/g, "/");
  const componentDeclarations = collectComponentDeclarations(params.code);

  for (let index = 0; index < params.code.length; index += 1) {
    if (params.code[index] !== "<" || !isTagNameStart(params.code[index + 1] ?? "")) continue;

    const tagNameStart = index + 1;
    let tagNameEnd = tagNameStart;
    while (tagNameEnd < params.code.length && isNameCharacter(params.code[tagNameEnd] ?? "")) {
      tagNameEnd += 1;
    }

    const tagName = params.code.slice(tagNameStart, tagNameEnd);
    const tagEnd = scanJsxTagEnd(params.code, tagNameEnd);
    if (tagEnd < 0) return null;

    const classNameAttribute = findAttributeFast(params.code, tagNameEnd, tagEnd - 1, "className");
    const existingIntentId = findAttributeFast(params.code, tagNameEnd, tagEnd - 1, "data-intent-id");
    if (!classNameAttribute || existingIntentId) {
      index = tagEnd - 1;
      continue;
    }

    const className = getFastClassNameBinding(params.code, classNameAttribute);
    if (!className) return null;

    const id = `il_${shortHash(`${relativeFile}:${className.start}:${tagName}`)}`;
    const insertPosition = params.code[tagEnd - 2] === "/" ? tagEnd - 2 : tagEnd - 1;
    insertions.push({
      position: insertPosition,
      text: ` data-intent-id="${id}"`
    });
    entries.push({
      id,
      file: params.file,
      relativeFile,
      tagName,
      componentName: componentNameAt(componentDeclarations, index),
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

    index = tagEnd - 1;
  }

  const transformMs = performance.now() - params.started;
  for (const entry of entries) {
    entry.transformMs = Number(transformMs.toFixed(3));
  }

  return {
    code: insertText(params.code, insertions),
    entries,
    transformMs: Number(transformMs.toFixed(3))
  };
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
    return readOnlyBinding(expression, sourceFile);
  }

  const callee = getCalleeName(expression.expression);
  if (!callee) {
    return readOnlyBinding(expression, sourceFile);
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
    return {
      code: params.code,
      entries: [],
      transformMs: Number((performance.now() - started).toFixed(3))
    };
  }

  const fastResult = instrumentSourceFast({ ...params, started });
  if (fastResult) return fastResult;

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
          insertions.push({
            position: getInsertPosition(node, sourceFile),
            text: ` data-intent-id="${id}"`
          });
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

  const transformMs = performance.now() - started;
  for (const entry of entries) {
    entry.transformMs = Number(transformMs.toFixed(3));
  }

  return {
    code: insertText(params.code, insertions),
    entries,
    transformMs: Number(transformMs.toFixed(3))
  };
}
