import { describe, expect, it } from "vitest";
import {
  candidatesForToken,
  categorizeTailwindToken,
  describeTailwindToken,
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
});
