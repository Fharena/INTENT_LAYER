import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requestedOutputs = process.argv.slice(2);
const outputNames = requestedOutputs.length > 0 ? requestedOutputs : ["demo-dist"];
const forbidden = ["data-intent-id", "virtual:intent-layer/client", "intent-layer-overlay-style"];
const matches = [];
const checked = [];

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

for (const outputName of outputNames) {
  const output = path.resolve(root, outputName);
  if (!fs.existsSync(output)) {
    throw new Error(`${outputName} does not exist. Run the production build first.`);
  }
  checked.push(path.relative(root, output).replace(/\\/g, "/") || ".");
  visit(output);
}
process.stdout.write(`${JSON.stringify({ ok: matches.length === 0, checked, matches }, null, 2)}\n`);
if (matches.length > 0) process.exitCode = 1;
