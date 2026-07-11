import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const outdir = path.join(root, "dist");

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const nodeBuild = {
  bundle: true,
  external: ["typescript", "vite", "@modelcontextprotocol/sdk/*", "zod", "zod/*"],
  format: "esm",
  legalComments: "none",
  platform: "node",
  sourcemap: false,
  target: "node20"
};

await build({
  ...nodeBuild,
  entryPoints: [path.join(root, "src", "intent", "cli.ts")],
  outfile: path.join(outdir, "cli.js")
});

const cliFile = path.join(outdir, "cli.js");
const cliSource = fs.readFileSync(cliFile, "utf8").replace(/^#!.*\r?\n/, "#!/usr/bin/env node\n");
fs.writeFileSync(cliFile, cliSource, "utf8");

await build({
  ...nodeBuild,
  entryPoints: [path.join(root, "src", "intent", "vitePlugin.ts")],
  outfile: path.join(outdir, "vite.js")
});

await build({
  ...nodeBuild,
  entryPoints: [path.join(root, "src", "intent", "mcp", "entry.ts")],
  outfile: path.join(outdir, "mcp.js")
});

await build({
  bundle: false,
  entryPoints: {
    client: path.join(root, "src", "intent", "client.ts"),
    tailwind: path.join(root, "src", "intent", "tailwind.ts")
  },
  format: "esm",
  legalComments: "none",
  outdir,
  platform: "browser",
  sourcemap: false,
  target: "es2020"
});

fs.chmodSync(cliFile, 0o755);
fs.chmodSync(path.join(outdir, "mcp.js"), 0o755);
