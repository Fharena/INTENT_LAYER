import path from "node:path";
import MagicString from "magic-string";
import ts from "typescript";
import { sha256, shortHash } from "./hash";
import { tokenizeClassName } from "./tailwind";
import type { IntentBinding } from "./types";

interface ClassNameRange {
  start: number;
  end: number;
  value: string;
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

function getNearestComponentName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;

  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }

    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }

    current = current.parent;
  }

  return null;
}

function getStaticClassNameRange(
  attribute: ts.JsxAttribute,
  sourceFile: ts.SourceFile
): ClassNameRange | null {
  const initializer = attribute.initializer;
  if (!initializer) return null;

  if (ts.isStringLiteral(initializer)) {
    return {
      start: initializer.getStart(sourceFile) + 1,
      end: initializer.getEnd() - 1,
      value: initializer.text
    };
  }

  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    ts.isStringLiteralLike(initializer.expression)
  ) {
    return {
      start: initializer.expression.getStart(sourceFile) + 1,
      end: initializer.expression.getEnd() - 1,
      value: initializer.expression.text
    };
  }

  return null;
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
    true,
    ts.ScriptKind.TSX
  );
  const sourceHash = sha256(params.code);
  const magic = new MagicString(params.code);
  const entries: IntentBinding[] = [];
  const relativeFile = path.relative(params.rootDir, params.file).replace(/\\/g, "/");

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagNameText(node, sourceFile);
      const classNameAttribute = findAttribute(node, "className");
      const existingIntentId = findAttribute(node, "data-intent-id");

      if (isIntrinsicTag(tagName) && classNameAttribute && !existingIntentId) {
        const className = getStaticClassNameRange(classNameAttribute, sourceFile);

        if (className) {
          const id = `il_${shortHash(`${relativeFile}:${className.start}:${tagName}`)}`;
          magic.appendLeft(getInsertPosition(node, sourceFile), ` data-intent-id="${id}"`);
          entries.push({
            id,
            file: params.file,
            relativeFile,
            tagName,
            componentName: getNearestComponentName(node),
            sourceHash,
            transformMs: 0,
            className,
            tokens: tokenizeClassName(className.value)
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

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
