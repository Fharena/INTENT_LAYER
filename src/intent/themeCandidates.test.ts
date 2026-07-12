import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { instrumentSource } from "./instrument";
import {
  clearProjectThemeCandidateCache,
  describeProjectTailwindToken,
  projectCandidatesForToken,
  readProjectThemeCatalog
} from "./themeCandidates";

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-theme-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  return root;
}

afterEach(() => {
  clearProjectThemeCandidateCache();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("project Tailwind candidates", () => {
  it("reads static Tailwind config scales without executing the config", () => {
    const root = workspace();
    fs.writeFileSync(
      path.join(root, "tailwind.config.cjs"),
      `module.exports = { theme: { extend: {
        colors: { brand: { DEFAULT: "#123", 500: "#456" }, ink: "#111" },
        spacing: { panel: "1.25rem" },
        borderRadius: { card: "0.75rem" },
        boxShadow: { soft: "0 4px 20px #0002" }
      } } };\n`,
      "utf8"
    );

    const catalog = readProjectThemeCatalog(root);

    expect(catalog.colors).toEqual(expect.arrayContaining(["brand", "brand-500", "ink"]));
    expect(projectCandidatesForToken(root, "hover:bg-ink")).toContain("hover:bg-brand-500");
    expect(projectCandidatesForToken(root, "text-6xl")).not.toContain("text-brand");
    expect(projectCandidatesForToken(root, "text-ink")).toContain("text-brand");
    expect(projectCandidatesForToken(root, "gap-4")).toContain("gap-panel");
    expect(projectCandidatesForToken(root, "rounded-lg")).toContain("rounded-card");
    expect(projectCandidatesForToken(root, "shadow-md")).toContain("shadow-soft");
    expect(describeProjectTailwindToken(root, "shadow-md")).toMatchObject({
      property: "effect.shadow",
      candidates: expect.arrayContaining([{ token: "shadow-soft", value: "soft" }])
    });
  });

  it("reads Tailwind v4 theme variables and conservative semantic CSS variables", () => {
    const root = workspace();
    fs.writeFileSync(
      path.join(root, "src", "index.css"),
      `@theme {
        --color-canvas: #fafafa;
        --spacing-gutter: 1.5rem;
        --radius-panel: 12px;
      }
      :root { --surface-raised: #fff; --unrelated-duration: 200ms; }\n`,
      "utf8"
    );

    expect(projectCandidatesForToken(root, "bg-canvas")).toContain("bg-[var(--surface-raised)]");
    expect(projectCandidatesForToken(root, "p-4")).toContain("p-gutter");
    expect(projectCandidatesForToken(root, "rounded-lg")).toContain("rounded-panel");
    expect(projectCandidatesForToken(root, "bg-canvas")).not.toContain("bg-[var(--unrelated-duration)]");
  });

  it("publishes project candidates on source bindings", () => {
    const root = workspace();
    const file = path.join(root, "src", "App.tsx");
    fs.writeFileSync(
      path.join(root, "tailwind.config.ts"),
      `export default { theme: { extend: { colors: { brand: "#123", accent: "#456" } } } };\n`,
      "utf8"
    );
    const code = `export function App() { return <div className="bg-brand">A</div>; }`;

    const result = instrumentSource({ code, file, rootDir: root });
    const token = result.entries[0].tokens[0];

    expect(token.editable).toBe(true);
    expect(projectCandidatesForToken(root, token.token)).toContain("bg-accent");
  });
});
