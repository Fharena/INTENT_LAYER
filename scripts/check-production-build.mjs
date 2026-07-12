import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "demo-dist");
const forbidden = ["data-intent-id", "virtual:intent-layer/client", "intent-layer-overlay-style"];
const matches = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile() && /\.(?:css|html|js|mjs)$/.test(entry.name)) {
      const source = fs.readFileSync(file, "utf8");
      for (const marker of forbidden) {
        if (source.includes(marker)) matches.push({ file: path.relative(root, file).replace(/\\/g, "/"), marker });
      }
    }
  }
}

if (!fs.existsSync(output)) throw new Error("demo-dist does not exist. Run the production build first.");
visit(output);
process.stdout.write(`${JSON.stringify({ ok: matches.length === 0, checked: "demo-dist", matches }, null, 2)}\n`);
if (matches.length > 0) process.exitCode = 1;
