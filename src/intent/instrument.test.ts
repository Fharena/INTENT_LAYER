import path from "node:path";
import { describe, expect, it } from "vitest";
import { instrumentSource } from "./instrument";

const rootDir = path.resolve("fixture-project");
const file = path.join(rootDir, "src", "App.tsx");

describe("instrumentSource", () => {
  it("instruments real JSX but ignores JSX-looking strings and comments", () => {
    const code = [
      "const sample = '<div className=\"p-4\">';",
      "// <section className=\"m-4\">comment</section>",
      "export function App() {",
      "  return <main className=\"gap-4\">Real</main>;",
      "}"
    ].join("\n");

    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].tagName).toBe("main");
    expect(result.code).toContain("'<div className=\"p-4\">'");
    expect(result.code).toContain("// <section className=\"m-4\">comment</section>");
    expect(result.code.match(/data-intent-id=/g)).toHaveLength(1);
  });

  it("maps instrumentation and appended runtime code back to the original source", () => {
    const code = `export function Card() { return <div className="p-4">Mapped</div>; }`;
    const result = instrumentSource({
      code,
      file,
      rootDir,
      options: {
        append: "\nconst __intentRuntime = true;\n",
        sourceMap: true
      }
    });

    expect(result.code).toContain('className="p-4" data-intent-id=');
    expect(result.code).toContain("const __intentRuntime = true");
    expect(result.map).not.toBeNull();
    expect(result.map?.sources).toEqual([file.replace(/\\/g, "/")]);
    expect(result.map?.sourcesContent).toEqual([code]);
    expect(result.map?.mappings.length).toBeGreaterThan(0);
  });

  it("preserves appended runtime code and its source map without className bindings", () => {
    const code = `export const answer = 42;`;
    const result = instrumentSource({
      code,
      file,
      rootDir,
      options: {
        append: "\nconst __intentRuntime = true;\n",
        sourceMap: true
      }
    });

    expect(result.entries).toEqual([]);
    expect(result.code).toBe(`${code}\nconst __intentRuntime = true;\n`);
    expect(result.map?.sourcesContent).toEqual([code]);
  });

  it("maps static and cn literal tokens to exact source ranges", () => {
    const code = [
      "export const Card = ({ active }: { active: boolean }) => (",
      "  <article className={cn(\"rounded-lg p-4\", active && \"bg-blue-500\", active ? \"gap-4\" : \"gap-6\")}>Card</article>",
      ");"
    ].join("\n");

    const result = instrumentSource({ code, file, rootDir });
    const entry = result.entries[0];

    expect(entry.componentName).toBe("Card");
    expect(entry.className.kind).toBe("call-literals");
    expect(entry.className.callee).toBe("cn");
    expect(entry.tokens.map((token) => token.token)).toEqual([
      "rounded-lg",
      "p-4",
      "bg-blue-500",
      "gap-4",
      "gap-6"
    ]);
    for (const token of entry.tokens) {
      expect(code.slice(token.sourceStart, token.sourceEnd)).toBe(token.token);
    }
  });

  it("keeps runtime expressions inspectable but read-only", () => {
    const code = "export function App(){ return <div className={styles.card}>Card</div>; }";
    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries[0].className.kind).toBe("read-only");
    expect(result.entries[0].className.unsupportedReason).toBe("property-access-reference");
    expect(result.entries[0].tokens).toEqual([]);
  });

  it("classifies variant calls without crashing the AST path", () => {
    const code = "export function App(){ return <button className={buttonVariants({ size: 'sm' })}>Go</button>; }";
    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries[0].className.kind).toBe("read-only");
    expect(result.entries[0].className.unsupportedReason).toBe("variant-function");
  });

  it("keeps the component name through wrappers, classes, and namespace objects", () => {
    const wrapped = "export const WrappedCard = memo(function Inner(){ return <section className=\"p-4\">Card</section>; });";
    const classComponent = "export class LegacyCard extends Component { render(){ return <article className=\"m-4\">Card</article>; } }";
    const namespace = "export const CardParts = { Root: () => <section className=\"p-4\">Card</section> };";

    expect(instrumentSource({ code: wrapped, file, rootDir }).entries[0].componentName).toBe("WrappedCard");
    expect(instrumentSource({ code: classComponent, file, rootDir }).entries[0].componentName).toBe("LegacyCard");
    expect(instrumentSource({ code: namespace, file, rootDir }).entries[0].componentName).toBe("CardParts");
  });

  it("traverses fragments, conditionals, maps, suspense children, and portal content", () => {
    const code = [
      "export const App = forwardRef(function App(_, ref) {",
      "  const items = [1, 2];",
      "  return <>",
      "    <Suspense fallback={<div className=\"p-2\">Loading</div>}>",
      "      {items.map((item) => <article ref={ref} className=\"gap-4\">{item}</article>)}",
      "      {items.length > 0 ? <section className=\"m-4\">Ready</section> : null}",
      "      {createPortal(<aside className=\"rounded-lg\">Portal</aside>, document.body)}",
      "    </Suspense>",
      "  </>;",
      "});"
    ].join("\n");

    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries.map((entry) => entry.tagName)).toEqual(["div", "article", "section", "aside"]);
    expect(result.entries.every((entry) => entry.componentName === "App")).toBe(true);
  });

  it("does not bind custom component props or member expressions as DOM nodes", () => {
    const code = [
      "export function App(){",
      "  return <><Card className=\"p-4\" /><motion.div className=\"m-4\" /><my-widget className=\"gap-4\" /></>;",
      "}"
    ].join("\n");
    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries.map((entry) => entry.tagName)).toEqual(["my-widget"]);
    expect(result.entries[0].tokens.map((token) => token.token)).toEqual(["gap-4"]);
    expect(result.code).not.toContain("<Card className=\"p-4\" data-intent-id");
    expect(result.code).not.toContain("<motion.div className=\"m-4\" data-intent-id");
  });

  it("instruments intrinsic React.createElement calls with source-stable token ranges", () => {
    const code = [
      "import React from 'react';",
      "export function Card({ active }: { active: boolean }) {",
      "  return React.createElement('section', { className: cn('p-4', active && 'gap-4'), title: 'Card' });",
      "}"
    ].join("\n");

    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      tagName: "section",
      componentName: "Card",
      className: { kind: "call-literals", callee: "cn" }
    });
    expect(result.code).toContain('"data-intent-id": "il_');
    for (const token of result.entries[0].tokens) {
      expect(code.slice(token.sourceStart, token.sourceEnd)).toBe(token.token);
    }
  });

  it("supports React factory aliases but rejects unrelated createElement functions", () => {
    const code = [
      "import R, { createElement as h } from 'react';",
      "const createElement = (...args: unknown[]) => args;",
      "const custom = createElement('div', { className: 'm-4' });",
      "export function App(){",
      "  return h('section', { className: 'p-4' }, R.createElement('span', { className: 'gap-4' }));",
      "}"
    ].join("\n");

    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries.map((entry) => entry.tagName)).toEqual(["section", "span"]);
    expect(result.entries.flatMap((entry) => entry.tokens.map((token) => token.token))).not.toContain("m-4");
  });

  it("does not guess provenance for custom createElement or cloneElement calls", () => {
    const code = [
      "const createElement = (...args: unknown[]) => args;",
      "const custom = createElement('section', { className: 'm-4' });",
      "const React = { createElement: (...args: unknown[]) => args };",
      "const first = React.createElement('article', { className: 'p-4' });",
      "const second = cloneElement(first, { className: 'gap-4' });"
    ].join("\n");

    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries).toEqual([]);
    expect(result.code).toBe(code);
  });
});
