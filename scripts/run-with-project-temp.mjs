import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Usage: run-with-project-temp.mjs <node|tsx|vitest|playwright> [...args]");

const tempRoot = path.resolve(process.env.INTENT_LAYER_TEST_TMP || path.join(root, ".intent", "tmp", "os"));
if (process.platform === "win32" && path.parse(tempRoot).root.toLowerCase() !== path.parse(root).root.toLowerCase()) {
  throw new Error(`Test temp must stay on the workspace drive: ${tempRoot}`);
}
fs.mkdirSync(tempRoot, { recursive: true });

const entrypoints = {
  playwright: path.join(root, "node_modules", "playwright", "cli.js"),
  tsx: path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
  vitest: path.join(root, "node_modules", "vitest", "vitest.mjs")
};
const executable = process.execPath;
const childArgs = command === "node" ? args : [entrypoints[command], ...args];
if (command !== "node" && !entrypoints[command]) throw new Error(`Unsupported local test command: ${command}`);
if (command !== "node" && !fs.existsSync(entrypoints[command])) {
  throw new Error(`Local test command is not installed: ${entrypoints[command]}`);
}

const env = {
  ...process.env,
  INTENT_LAYER_TEST_TMP: tempRoot,
  TEMP: tempRoot,
  TMP: tempRoot,
  TMPDIR: tempRoot
};
if (command === "playwright" && !env.PLAYWRIGHT_BROWSERS_PATH) {
  env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".intent", "tmp", "ms-playwright");
}

const child = spawn(executable, childArgs, { cwd: root, env, stdio: "inherit" });
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
