import { describe, expect, it } from "vitest";
import {
  candidatesForToken,
  categorizeTailwindToken,
  describeTailwindToken,
  gridLayoutToken,
  gridTemplateToken,
  parseGridLayoutToken,
  parseGridTemplateToken,
  tokenizeClassName
} from "./tailwind";

describe("Tailwind direct-edit candidates", () => {
  it("offers real color choices while preserving variants and opacity", () => {
    const candidates = candidatesForToken("hover:bg-slate-50/50");

    expect(candidates).toContain("hover:bg-slate-100/50");
    expect(candidates).toContain("hover:bg-blue-50/50");
    expect(candidates).toContain("hover:bg-white");
    expect(candidates.length).toBeGreaterThan(20);
  });

  it("supports common visual effect tokens", () => {
    expect(categorizeTailwindToken("shadow-md")).toBe("effect");
    expect(candidatesForToken("shadow-md")).toContain("shadow-xl");
    expect(candidatesForToken("opacity-50")).toContain("opacity-100");
    expect(candidatesForToken("ring-2")).toContain("ring-4");
    expect(candidatesForToken("transition-colors")).toContain("transition-transform");
  });

  it("covers the standard spacing scale beyond the demo subset", () => {
    const candidates = candidatesForToken("gap-4");

    expect(candidates).toContain("gap-0.5");
    expect(candidates).toContain("gap-48");
    expect(candidates).toContain("gap-96");
  });

  it("keeps flex controls within one semantic property", () => {
    expect(candidatesForToken("flex-col")).toEqual([
      "flex-col",
      "flex-row",
      "flex-row-reverse",
      "flex-col-reverse"
    ]);
    expect(candidatesForToken("flex-wrap")).toEqual(["flex-wrap", "flex-wrap-reverse", "flex-nowrap"]);
    expect(candidatesForToken("flex-1")).toEqual(["flex-1", "flex-auto", "flex-initial", "flex-none"]);
  });

  it("accepts negative margin but not invalid negative padding or gap", () => {
    const tokens = tokenizeClassName("-m-4 -p-4 -gap-4");

    expect(tokens.find((token) => token.token === "-m-4")?.editable).toBe(true);
    expect(tokens.find((token) => token.token === "-p-4")?.editable).toBe(false);
    expect(tokens.find((token) => token.token === "-gap-4")?.editable).toBe(false);
    expect(candidatesForToken("-m-4")).toContain("-m-8");
  });

  it("does not claim arbitrary or unsupported tokens are editable", () => {
    const tokens = tokenizeClassName("bg-[var(--surface)] tracking-tight p-4");

    expect(tokens.find((token) => token.token === "bg-[var(--surface)]")?.editable).toBe(false);
    expect(tokens.find((token) => token.token === "tracking-tight")?.editable).toBe(false);
    expect(tokens.find((token) => token.token === "p-4")?.editable).toBe(true);
  });

  it("maps tokens to semantic properties without losing variants", () => {
    const color = describeTailwindToken("hover:bg-slate-50/50");
    const gap = describeTailwindToken("gap-4");

    expect(color).toMatchObject({
      property: "color.background",
      value: "slate-50/50",
      variant: "hover"
    });
    expect(color?.candidates).toContainEqual({
      value: "blue-50/50",
      token: "hover:bg-blue-50/50"
    });
    expect(gap).toMatchObject({ property: "layout.gap", value: "4", variant: null });
  });

  it("round-trips numeric grid placement tokens", () => {
    expect(parseGridLayoutToken("md:col-start-4")).toEqual({
      breakpoint: "md",
      property: "columnStart",
      value: 4
    });
    expect(gridLayoutToken("columnSpan", 7, "lg")).toBe("lg:col-span-7");
    expect(categorizeTailwindToken("col-span-5")).toBe("layout");
    expect(describeTailwindToken("col-span-5")).toMatchObject({
      property: "layout.columnSpan",
      value: "5"
    });
  });

  it("round-trips safe fractional grid templates", () => {
    expect(parseGridTemplateToken("md:grid-cols-[1.2fr_0.8fr]")).toEqual({
      breakpoint: "md",
      weights: [1.2, 0.8]
    });
    expect(gridTemplateToken([0.75, 1.25], "lg")).toBe("lg:grid-cols-[0.75fr_1.25fr]");
    expect(parseGridTemplateToken("grid-cols-[minmax(0,_1fr)_2fr]")).toBeNull();
  });
});
