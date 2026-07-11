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

  it("keeps the exported component name through wrappers and namespace objects", () => {
    const wrapped = "export const WrappedCard = memo(function Inner(){ return <section className=\"p-4\">Card</section>; });";
    const namespace = "export const CardParts = { Root: () => <section className=\"p-4\">Card</section> };";

    expect(instrumentSource({ code: wrapped, file, rootDir }).entries[0].componentName).toBe("WrappedCard");
    expect(instrumentSource({ code: namespace, file, rootDir }).entries[0].componentName).toBe("CardParts");
  });

  it("does not bind custom component props as DOM nodes", () => {
    const code = "export function App(){ return <Card className=\"p-4\" />; }";
    const result = instrumentSource({ code, file, rootDir });

    expect(result.entries).toEqual([]);
    expect(result.code).toBe(code);
  });
});
