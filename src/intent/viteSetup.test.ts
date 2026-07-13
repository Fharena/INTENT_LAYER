import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configureViteProject } from "./viteSetup";

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-vite-setup-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Vite setup patch", () => {
  it("adds one import and registers Intent Layer before React", () => {
    const root = workspace();
    const file = path.join(root, "vite.config.ts");
    fs.writeFileSync(
      file,
      `import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [react()]\n});\n`,
      "utf8"
    );

    const result = configureViteProject(root);
    const source = fs.readFileSync(file, "utf8");

    expect(result).toMatchObject({ ok: true, status: "configured", changed: true });
    expect(source).toContain(`import { intentLayer } from "intent-layer/vite";`);
    expect(source).toContain("plugins: [intentLayer(), react()]");
    expect(configureViteProject(root)).toMatchObject({
      ok: true,
      status: "already-configured",
      changed: false
    });
  });

  it("uses an alias when the project already declares intentLayer", () => {
    const root = workspace();
    const file = path.join(root, "vite.config.ts");
    fs.writeFileSync(
      file,
      `import { defineConfig } from "vite";\nconst intentLayer = "project value";\nexport default defineConfig({ plugins: [] });\n`,
      "utf8"
    );

    expect(configureViteProject(root).ok).toBe(true);
    const source = fs.readFileSync(file, "utf8");
    expect(source).toContain("intentLayer as intentLayerPlugin");
    expect(source).toContain("plugins: [intentLayerPlugin()]");
  });

  it("creates a conventional React Vite config when none exists", () => {
    const root = workspace();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ devDependencies: { "@vitejs/plugin-react": "latest" } }),
      "utf8"
    );

    const result = configureViteProject(root);

    expect(result).toMatchObject({ ok: true, status: "created" });
    expect(fs.readFileSync(path.join(root, "vite.config.ts"), "utf8")).toContain(
      "plugins: [intentLayer(), react()]"
    );
  });

  it("leaves dynamic plugin arrays untouched", () => {
    const root = workspace();
    const file = path.join(root, "vite.config.ts");
    const source = `import { defineConfig } from "vite";\nconst plugins = [];\nexport default defineConfig({ plugins });\n`;
    fs.writeFileSync(file, source, "utf8");

    expect(configureViteProject(root)).toMatchObject({
      ok: false,
      status: "unsupported-config",
      changed: false
    });
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("supports a no-write dry run", () => {
    const root = workspace();
    const file = path.join(root, "vite.config.ts");
    const source = `import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [] });\n`;
    fs.writeFileSync(file, source, "utf8");

    expect(configureViteProject(root, true)).toMatchObject({ ok: true, changed: true, dryRun: true });
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });
});
