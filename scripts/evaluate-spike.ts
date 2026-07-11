import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { analyzeClassNames } from "./analyze-classnames";
import { runCli } from "../src/intent/cli";
import { readAgentTaskMetadata, refreshAgentQueueSignal } from "../src/intent/agentQueue";
import { recordAgentResult } from "../src/intent/agentResult";
import { createAgentTask } from "../src/intent/agentTask";
import { instrumentSource } from "../src/intent/instrument";
import {
  applyTokenPatch,
  discardPendingUndo,
  pendingUndoHistoryFromOperationLog,
  pendingUndoStackFromOperationLog,
  planTokenPatch,
  readPatchConflictReport,
  recordPatchApplyInOperationLog,
  recordPatchRevertInOperationLog,
  revertPendingUndo,
  revertTokenPatch,
  resolvePatchConflict
} from "../src/intent/patch";
import type { IntentBinding, IntentGraph } from "../src/intent/types";
import { intentLayer } from "../src/intent/vitePlugin";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "reports", "performance");
const tmpDir = path.join(rootDir, ".intent", "tmp");
const aiCorpusMinFiles = 50;
const aiCorpusCoverageTarget = 0.5;
const externalCorpusHarnessMinFiles = 3;
const externalCorpusHarnessCoverageTarget = 0.5;
const runtimeArtifactRoots = [
  path.join(rootDir, ".intent", "agent"),
  path.join(rootDir, ".intent", "operations"),
  path.join(rootDir, ".intent", "diffs"),
  path.join(rootDir, ".intent", "conflicts")
];

function runtimeArtifactFiles(): Set<string> {
  const files = new Set<string>();
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.add(file);
    }
  };
  for (const directory of runtimeArtifactRoots) visit(directory);
  return files;
}

const runtimeArtifactsBeforeEvaluation = runtimeArtifactFiles();
process.once("exit", () => {
  try {
    for (const file of runtimeArtifactFiles()) {
      if (!runtimeArtifactsBeforeEvaluation.has(file) && fs.existsSync(file)) fs.unlinkSync(file);
    }
    refreshAgentQueueSignal(rootDir);
  } catch {
    // Evaluation cleanup must not mask the gate result.
  }
});

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

interface PackageSmokeResult {
  packageName: string | null;
  packageVersion: string | null;
  binTarget: string | null;
  viteExportTarget: string | null;
  dryRunExitCode: number | null;
  packExitCode: number | null;
  installExitCode: number | null;
  helpExitCode: number | null;
  viteImportExitCode: number | null;
  installedViteTransformExitCode: number | null;
  installedViteDevServerExitCode: number | null;
  packageFileCount: number;
  packageSize: number;
  packageUnpackedSize: number;
  tarballFile: string | null;
  installDir: string;
  binFile: string;
  cliShebang: string | null;
  hasCliBundle: boolean;
  hasViteBundle: boolean;
  hasVirtualClientBundle: boolean;
  hasContextPackFiles: boolean;
  hasReadmeDocs: boolean;
  hasFailureModeDocs: boolean;
  helpIncludesUsage: boolean;
  helpIncludesDev: boolean;
  helpIncludesDoctor: boolean;
  viteImportOk: boolean;
  vitePluginName: string | null;
  vitePluginEnforce: string | null;
  viteLegacyPluginName: string | null;
  installedViteTransformOk: boolean;
  installedViteTransformIncludesIntentId: boolean;
  installedViteTransformGraphExists: boolean;
  installedViteTransformGraphEntryCount: number;
  installedViteTransformGraphBytes: number;
  installedViteTransformFirstRelativeFile: string | null;
  installedViteTransformFirstToken: string | null;
  installedViteTransformHookMs: number;
  installedViteDevServerOk: boolean;
  installedViteDevServerPort: number | null;
  installedViteDevServerHomeStatus: number | null;
  installedViteDevServerModuleStatus: number | null;
  installedViteDevServerGraphStatus: number | null;
  installedViteDevServerModuleIncludesIntentId: boolean;
  installedViteDevServerGraphEntryCount: number;
  installedViteDevServerGraphBytes: number;
  installedViteDevServerFirstRelativeFile: string | null;
  installedViteDevServerFirstToken: string | null;
  installedViteDevServerSetupStatus: number | null;
  installedViteDevServerSetupApplyStatus: number | null;
  installedViteDevServerSetupLanguage: string | null;
  installedViteDevServerSetupWorkspaceReady: boolean;
  installedViteDevServerSetupSettingsReady: boolean;
  installedViteDevServerSetupGraphReady: boolean;
  installedViteDevServerSetupSettingsFileExists: boolean;
  installedViteDevServerSetupSchemaExists: boolean;
  installedViteDevServerSetupQueueSignalExists: boolean;
  installedViteDevServerSetupQueueStatus: number | null;
  installedViteDevServerSetupQueuePendingCount: number;
  installedViteDevServerSetupCodexSkillExists: boolean;
  installedViteDevServerSetupClaudeSettingsExists: boolean;
  installedViteDevServerSetupClaudeHookConfigured: boolean;
  installedViteDevServerSettingsUpdateStatus: number | null;
  installedViteDevServerSettingsLanguage: string | null;
  installedViteDevServerSettingsDock: string | null;
  installedViteDevServerSettingsDensity: string | null;
  installedViteDevServerSettingsDefaultCollapsed: boolean;
  installedViteDevServerSettingsAutoOpenSetup: boolean;
  installedViteDevServerSettingsAgentRunEnabled: boolean;
  installedViteDevServerSettingsCodexSkillEnabled: boolean;
  installedViteDevServerSettingsClaudeHookEnabled: boolean;
  installedViteDevServerSetupAgentRunEnabled: boolean;
  installedViteDevServerSetupAgentRunSource: string | null;
  installedViteDevServerSetupQueueSignalReady: boolean;
  installedViteDevServerSetupCodexSkillReady: boolean;
  installedViteDevServerSetupClaudeHookReady: boolean;
  installedViteDevServerSettingsCodexCommand: string | null;
  installedViteDevServerSettingsClaudeCommand: string | null;
  installedViteDevServerSettingsCommandSource: string | null;
  installedViteDevServerSettingsUpdateOk: boolean;
  installedViteDevServerPreviewStatus: number | null;
  installedViteDevServerPreviewOk: boolean;
  installedViteDevServerApplyStatus: number | null;
  installedViteDevServerApplyOk: boolean;
  installedViteDevServerSourcePatched: boolean;
  installedViteDevServerOperationFileExists: boolean;
  installedViteDevServerDiffFileExists: boolean;
  installedViteDevServerOperationLogExists: boolean;
  installedViteDevServerModuleAfterApplyStatus: number | null;
  installedViteDevServerModuleAfterApplyIncludesNextToken: boolean;
  installedViteDevServerGraphAfterApplyStatus: number | null;
  installedViteDevServerGraphAfterApplyEntryCount: number;
  installedViteDevServerGraphAfterApplyFirstToken: string | null;
  installedViteDevServerApplyRefreshMs: number;
  installedViteDevServerApplyRefreshTargetMs: number;
  installedViteDevServerApplyRefreshTargetPass: boolean;
  installedViteDevServerUndoHistoryAfterApplyStatus: number | null;
  installedViteDevServerUndoHistoryAfterApplyCount: number;
  installedViteDevServerRevertStatus: number | null;
  installedViteDevServerRevertOk: boolean;
  installedViteDevServerSourceReverted: boolean;
  installedViteDevServerModuleAfterRevertStatus: number | null;
  installedViteDevServerModuleAfterRevertIncludesOldToken: boolean;
  installedViteDevServerGraphAfterRevertStatus: number | null;
  installedViteDevServerGraphAfterRevertFirstToken: string | null;
  installedViteDevServerUndoHistoryAfterRevertStatus: number | null;
  installedViteDevServerUndoHistoryAfterRevertCount: number;
  installedViteDevServerRevertRefreshMs: number;
  installedViteDevServerRevertRefreshTargetMs: number;
  installedViteDevServerRevertRefreshTargetPass: boolean;
  installedViteDevServerMultiFileOk: boolean;
  installedViteDevServerMultiFileInitialEntryCount: number;
  installedViteDevServerMultiFileAfterChangeEntryCount: number;
  installedViteDevServerMultiFileChangedFileTokenBefore: string | null;
  installedViteDevServerMultiFileChangedFileTokenAfter: string | null;
  installedViteDevServerMultiFileUnchangedFilesRetained: boolean;
  installedViteDevServerMultiFileGraphGeneratedAtChanged: boolean;
  installedViteDevServerMultiFileModuleAfterChangeIncludesNextToken: boolean;
  installedViteDevServerMultiFileRefreshMs: number;
  installedViteDevServerMultiFileRefreshTargetMs: number;
  installedViteDevServerMultiFileRefreshTargetPass: boolean;
  installedViteDevServerMultiFileMs: number;
  installedViteDevServerMs: number;
  dryRunMs: number;
  packMs: number;
  installMs: number;
  helpMs: number;
  viteImportMs: number;
  installedViteTransformMs: number;
  stdoutBytes: number;
  stderrBytes: number;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function localTsxCommand(): string {
  const file = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  return fs.existsSync(file) ? file : "tsx";
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 60000,
  shell = process.platform === "win32",
  env?: NodeJS.ProcessEnv
): CommandResult {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
    shell,
    windowsHide: true,
    timeout: timeoutMs
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
    ms: Number((performance.now() - started).toFixed(3))
  };
}

function parsePackJson(stdout: string): {
  name?: string;
  version?: string;
  size?: number;
  unpackedSize?: number;
  filename?: string;
  files?: Array<{ path: string; size: number }>;
} | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? (parsed[0] as ReturnType<typeof parsePackJson>) : null;
  } catch {
    return null;
  }
}

function reportPath(file: string): string {
  const normalizedFile = path.resolve(file);
  const normalizedTmp = path.resolve(os.tmpdir());
  if (normalizedFile === normalizedTmp || normalizedFile.startsWith(`${normalizedTmp}${path.sep}`)) {
    return path.join("<os-tmp>", path.relative(normalizedTmp, normalizedFile)).replace(/\\/g, "/");
  }
  return path.relative(rootDir, normalizedFile).replace(/\\/g, "/");
}

function packageSmoke(): PackageSmokeResult {
  const packageSmokeRoot = path.join(tmpDir, "package-smoke");
  fs.mkdirSync(packageSmokeRoot, { recursive: true });
  const packageRoot = fs.mkdtempSync(path.join(packageSmokeRoot, "intent-layer-package-smoke-"));
  const installDir = path.join(packageRoot, "install");
  const npmCacheDir = path.join(tmpDir, "npm-cache");
  const npmEnv = { npm_config_cache: npmCacheDir, NPM_CONFIG_CACHE: npmCacheDir };
  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(npmCacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(installDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`
  );

  const dryRun = runCommand(
    npmCommand(),
    ["pack", "--dry-run", "--json"],
    rootDir,
    60000,
    process.platform === "win32",
    npmEnv
  );
  const dryRunPackage = parsePackJson(dryRun.stdout);
  const pack = runCommand(
    npmCommand(),
    ["pack", "--json", "--pack-destination", packageRoot],
    rootDir,
    60000,
    process.platform === "win32",
    npmEnv
  );
  const packedPackage = parsePackJson(pack.stdout);
  const tarballFile =
    packedPackage?.filename !== undefined ? path.join(packageRoot, packedPackage.filename) : null;
  const install =
    tarballFile && fs.existsSync(tarballFile)
      ? runCommand(
          npmCommand(),
          ["install", path.relative(installDir, tarballFile), "--ignore-scripts", "--no-audit", "--no-fund"],
          installDir,
          120000,
          process.platform === "win32",
          npmEnv
        )
      : { exitCode: null, stdout: "", stderr: "missing tarball", ms: 0 };
  const binFile = path.join(
    installDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "intent-layer.cmd" : "intent-layer"
  );
  const help =
    fs.existsSync(binFile) && install.exitCode === 0
      ? runCommand(binFile, ["--help"], installDir)
      : { exitCode: null, stdout: "", stderr: "missing installed bin", ms: 0 };
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as {
    bin?: Record<string, string>;
    exports?: Record<string, string>;
  };
  const files = dryRunPackage?.files ?? [];
  const packageName = dryRunPackage?.name ?? "intent-layer";
  const viteSmokeFile = path.join(installDir, "vite-export-smoke.mjs");
  fs.writeFileSync(
    viteSmokeFile,
    [
      `import { intentLayer, intentLayerSpike } from "${packageName}/vite";`,
      "const plugin = intentLayer();",
      "const legacyPlugin = intentLayerSpike();",
      "console.log(JSON.stringify({",
      "  ok: plugin.name === 'intent-layer' && legacyPlugin.name === plugin.name,",
      "  pluginName: plugin.name,",
      "  enforce: plugin.enforce ?? null,",
      "  legacyPluginName: legacyPlugin.name",
      "}));",
      ""
    ].join("\n")
  );
  const viteImport =
    install.exitCode === 0
      ? runCommand(process.execPath, [viteSmokeFile], installDir, 60000, false)
      : { exitCode: null, stdout: "", stderr: "package install failed", ms: 0 };
  let viteImportReport: {
    ok?: boolean;
    pluginName?: string;
    enforce?: string | null;
    legacyPluginName?: string;
  } = {};
  try {
    viteImportReport = JSON.parse(viteImport.stdout) as typeof viteImportReport;
  } catch {
    viteImportReport = {};
  }
  const installedTransformSmokeFile = path.join(installDir, "vite-transform-smoke.mjs");
  fs.writeFileSync(
    installedTransformSmokeFile,
    [
      "import fs from \"node:fs\";",
      "import path from \"node:path\";",
      `import { intentLayer } from "${packageName}/vite";`,
      "",
      "function callableHook(hook) {",
      "  if (typeof hook === \"function\") return hook;",
      "  if (hook && typeof hook === \"object\" && \"handler\" in hook) {",
      "    const handler = hook.handler;",
      "    return typeof handler === \"function\" ? handler : null;",
      "  }",
      "  return null;",
      "}",
      "",
      "const root = process.cwd();",
      "const fixture = path.join(root, \"src\", \"App.tsx\");",
      "fs.mkdirSync(path.dirname(fixture), { recursive: true });",
      "const source = [",
      "  \"export function App() {\",",
      "  \"  return <main className=\\\"flex gap-4 rounded-lg p-4 text-sm\\\">Installed package transform</main>;\",",
      "  \"}\",",
      "  \"\"",
      "].join(\"\\n\");",
      "fs.writeFileSync(fixture, source);",
      "const plugin = intentLayer();",
      "callableHook(plugin.configResolved)?.({ root });",
      "const transform = callableHook(plugin.transform);",
      "const started = performance.now();",
      "const transformed = transform ? transform(source, fixture) : null;",
      "if (transformed && typeof transformed.then === \"function\") {",
      "  throw new Error(\"installed Vite transform smoke expected a synchronous transform\");",
      "}",
      "const transformMs = Number((performance.now() - started).toFixed(3));",
      "const code = typeof transformed === \"object\" && transformed && \"code\" in transformed",
      "  ? String(transformed.code)",
      "  : typeof transformed === \"string\"",
      "    ? transformed",
      "    : \"\";",
      "const graphFile = path.join(root, \".intent\", \"graph.intent.json\");",
      "const graphExists = fs.existsSync(graphFile);",
      "const graph = graphExists ? JSON.parse(fs.readFileSync(graphFile, \"utf8\")) : null;",
      "const entries = graph ? Object.values(graph.entries ?? {}) : [];",
      "const first = entries[0] ?? null;",
      "console.log(JSON.stringify({",
      "  ok: Boolean(transform) && code.includes(\"data-intent-id\") && graphExists && entries.length === 1 && first?.relativeFile === \"src/App.tsx\",",
      "  includesIntentId: code.includes(\"data-intent-id\"),",
      "  graphExists,",
      "  graphEntryCount: entries.length,",
      "  graphBytes: graphExists ? fs.statSync(graphFile).size : 0,",
      "  firstRelativeFile: first?.relativeFile ?? null,",
      "  firstToken: first?.tokens?.find((token) => token.editable)?.token ?? null,",
      "  transformMs",
      "}));",
      ""
    ].join("\n")
  );
  const installedViteTransform =
    install.exitCode === 0
      ? runCommand(process.execPath, [installedTransformSmokeFile], installDir, 60000, false)
      : { exitCode: null, stdout: "", stderr: "package install failed", ms: 0 };
  let installedViteTransformReport: {
    ok?: boolean;
    includesIntentId?: boolean;
    graphExists?: boolean;
    graphEntryCount?: number;
    graphBytes?: number;
    firstRelativeFile?: string | null;
    firstToken?: string | null;
    transformMs?: number;
  } = {};
  try {
    installedViteTransformReport = JSON.parse(installedViteTransform.stdout) as typeof installedViteTransformReport;
  } catch {
    installedViteTransformReport = {};
  }
  const installedDevServerSmokeFile = path.join(installDir, "vite-dev-server-smoke.mjs");
  fs.writeFileSync(
    installedDevServerSmokeFile,
    [
      "import { spawn } from \"node:child_process\";",
      "import fs from \"node:fs\";",
      "import net from \"node:net\";",
      "import path from \"node:path\";",
      "",
      `const packageName = ${JSON.stringify(packageName)};`,
      `const viteBin = ${JSON.stringify(path.join(rootDir, "node_modules", "vite", "bin", "vite.js"))};`,
      "",
      "function truncate(value) {",
      "  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;",
      "}",
      "",
      "function freePort() {",
      "  return new Promise((resolve, reject) => {",
      "    const server = net.createServer();",
      "    server.listen(0, \"127.0.0.1\", () => {",
      "      const address = server.address();",
      "      const port = typeof address === \"object\" && address ? address.port : 0;",
      "      server.close(() => resolve(port));",
      "    });",
      "    server.on(\"error\", reject);",
      "  });",
      "}",
      "",
      "async function waitFetch(url, timeoutMs) {",
      "  const deadline = Date.now() + timeoutMs;",
      "  let lastError = null;",
      "  while (Date.now() < deadline) {",
      "    try {",
      "      const response = await fetch(url);",
      "      const body = await response.text();",
      "      return { status: response.status, body };",
      "    } catch (error) {",
      "      lastError = error;",
      "      await new Promise((resolve) => setTimeout(resolve, 100));",
      "    }",
      "  }",
      "  throw lastError ?? new Error(`Timed out fetching ${url}`);",
      "}",
      "",
      "async function postJson(url, body) {",
      "  const response = await fetch(url, {",
      "    method: \"POST\",",
      "    headers: { \"content-type\": \"application/json\" },",
      "    body: JSON.stringify(body)",
      "  });",
      "  const text = await response.text();",
      "  let json = null;",
      "  try {",
      "    json = JSON.parse(text);",
      "  } catch {",
      "    json = null;",
      "  }",
      "  return { status: response.status, text, json };",
      "}",
      "",
      "async function waitFetchMatch(url, timeoutMs, predicate) {",
      "  const deadline = Date.now() + timeoutMs;",
      "  let lastResult = null;",
      "  let lastError = null;",
      "  while (Date.now() < deadline) {",
      "    try {",
      "      const currentUrl = typeof url === \"function\" ? url() : url;",
      "      const response = await fetch(currentUrl);",
      "      const body = await response.text();",
      "      const result = { status: response.status, body };",
      "      lastResult = result;",
      "      if (predicate(result)) return result;",
      "    } catch (error) {",
      "      lastError = error;",
      "    }",
      "    await new Promise((resolve) => setTimeout(resolve, 100));",
      "  }",
      "  const detail = lastResult ? `last status ${lastResult.status}` : lastError instanceof Error ? lastError.message : String(lastError);",
      "  throw new Error(`Timed out waiting for ${typeof url === \"function\" ? \"dynamic url\" : url}: ${detail}`);",
      "}",
      "",
      "function parseGraphResponse(result) {",
      "  if (result.status !== 200) return { generatedAt: null, entries: [] };",
      "  const graph = JSON.parse(result.body);",
      "  return {",
      "    generatedAt: graph.generatedAt ?? null,",
      "    entries: Object.values(graph.entries ?? {})",
      "  };",
      "}",
      "",
      "function entryForRelativeFile(entries, relativeFile) {",
      "  return entries.find((entry) => entry?.relativeFile === relativeFile) ?? null;",
      "}",
      "",
      "function firstEditableTokenValue(entry) {",
      "  return entry?.tokens?.find((token) => token.editable)?.token ?? null;",
      "}",
      "",
      "function editableToken(entry, value) {",
      "  return entry?.tokens?.find((token) => token.editable && token.token === value) ?? null;",
      "}",
      "",
      "function moduleRequestUrl(baseUrl, relativeFile) {",
      "  return `${baseUrl}/${relativeFile}?t=${Date.now()}`;",
      "}",
      "",
      "async function stop(child) {",
      "  if (!child || child.exitCode !== null) return;",
      "  child.kill();",
      "  await new Promise((resolve) => {",
      "    const timer = setTimeout(resolve, 2000);",
      "    child.once(\"exit\", () => {",
      "      clearTimeout(timer);",
      "      resolve();",
      "    });",
      "  });",
      "}",
      "",
      "const root = process.cwd();",
      "const started = performance.now();",
      "let child = null;",
      "let stdout = \"\";",
      "let stderr = \"\";",
      "let port = null;",
      "",
      "try {",
      "  if (!fs.existsSync(viteBin)) throw new Error(`Missing Vite bin: ${viteBin}`);",
      "  port = await freePort();",
      "  fs.mkdirSync(path.join(root, \"src\"), { recursive: true });",
      "  fs.writeFileSync(",
      "    path.join(root, \"index.html\"),",
      "    [",
      "      \"<div id=\\\"root\\\"></div>\",",
      "      \"<script type=\\\"module\\\" src=\\\"/src/App.tsx\\\"></script>\",",
      "      \"\"",
      "    ].join(\"\\n\")",
      "  );",
      "  fs.writeFileSync(",
      "    path.join(root, \"src\", \"App.tsx\"),",
      "    [",
      "      \"export function App() {\",",
      "      \"  return <main className=\\\"flex gap-4 rounded-lg p-4 text-sm\\\">Installed Vite server smoke</main>;\",",
      "      \"}\",",
      "      \"\"",
      "    ].join(\"\\n\")",
      "  );",
      "  fs.writeFileSync(",
      "    path.join(root, \"vite.config.mjs\"),",
      "    [",
      "      `import { intentLayer } from ${JSON.stringify(packageName + \"/vite\")};`,",
      "      \"export default {\",",
      "      \"  plugins: [intentLayer()]\",",
      "      \"};\",",
      "      \"\"",
      "    ].join(\"\\n\")",
      "  );",
      "",
      "  child = spawn(process.execPath, [viteBin, \"--host\", \"127.0.0.1\", \"--port\", String(port), \"--strictPort\"], {",
      "    cwd: root,",
      "    env: { ...process.env, FORCE_COLOR: \"0\", NO_COLOR: \"1\" },",
      "    stdio: [\"ignore\", \"pipe\", \"pipe\"],",
      "    windowsHide: true",
      "  });",
      "  child.stdout.on(\"data\", (chunk) => { stdout += chunk; });",
      "  child.stderr.on(\"data\", (chunk) => { stderr += chunk; });",
      "",
      "  const baseUrl = `http://127.0.0.1:${port}`;",
      "  const home = await waitFetch(`${baseUrl}/`, 10000);",
      "  const module = await waitFetch(`${baseUrl}/src/App.tsx`, 10000);",
      "  const graph = await waitFetch(`${baseUrl}/__intent/graph`, 10000);",
      "  const parsedGraph = graph.status === 200 ? JSON.parse(graph.body) : null;",
      "  const entries = parsedGraph ? Object.values(parsedGraph.entries ?? {}) : [];",
      "  const first = entries[0] ?? null;",
      "  const firstEditableToken = first?.tokens?.find((token) => token.editable) ?? null;",
      "  const firstToken = firstEditableToken?.token ?? null;",
      "  const setupBefore = await waitFetch(`${baseUrl}/__intent/setup?language=ko`, 10000);",
      "  const setupBeforeJson = setupBefore.status === 200 ? JSON.parse(setupBefore.body) : null;",
      "  const setupApply = await postJson(`${baseUrl}/__intent/setup`, {",
      "    language: \"ko\",",
      "    createWorkspace: true,",
      "    completeOnboarding: true",
      "  });",
      "  const setupAfter = await waitFetch(`${baseUrl}/__intent/setup?language=ko`, 10000);",
      "  const setupAfterJson = setupAfter.status === 200 ? JSON.parse(setupAfter.body) : null;",
      "  const setupSettingsFileExists = fs.existsSync(path.join(root, \".intent\", \"settings.json\"));",
      "  const setupSchemaExists = fs.existsSync(path.join(root, \".intent\", \"schema\", \"graph.intent.schema.json\"));",
      "  const setupQueueSignalExists = fs.existsSync(path.join(root, \".intent-agent-queue.json\"));",
      "  const setupCodexSkillExists = fs.existsSync(path.join(root, \".agents\", \"skills\", \"intent-layer-task-runner\", \"SKILL.md\"));",
      "  const setupClaudeSettingsFile = path.join(root, \".claude\", \"settings.json\");",
      "  const setupClaudeSettingsExists = fs.existsSync(setupClaudeSettingsFile);",
      "  const setupClaudeHookConfigured =",
      "    setupClaudeSettingsExists &&",
      "    fs.readFileSync(setupClaudeSettingsFile, \"utf8\").includes(\".intent-agent-queue.json\");",
      "  const agentQueue = await waitFetch(`${baseUrl}/__intent/agent-queue`, 10000);",
      "  const agentQueueJson = agentQueue.status === 200 ? JSON.parse(agentQueue.body) : null;",
      "  const settingsUpdate = await postJson(`${baseUrl}/__intent/setup`, {",
      "    language: \"en\",",
      "    createWorkspace: true,",
      "    completeOnboarding: false,",
      "    overlay: {",
      "      dock: \"left\",",
      "      density: \"compact\",",
      "      defaultCollapsed: true,",
      "      autoOpenSetup: false",
      "    },",
      "    agent: {",
      "      runEnabled: true,",
      "      codexCommand: \"codex-custom\",",
      "      claudeCommand: \"claude-custom\",",
      "      codexSkillEnabled: true,",
      "      claudeHookEnabled: true",
      "    }",
      "  });",
      "  const settingsAfter = await waitFetch(`${baseUrl}/__intent/setup`, 10000);",
      "  const settingsAfterJson = settingsAfter.status === 200 ? JSON.parse(settingsAfter.body) : null;",
      "  const settingsUpdateOk =",
      "    settingsUpdate.status === 200 && settingsUpdate.json?.ok === true && settingsAfter.status === 200 &&",
      "    settingsAfterJson?.language === \"en\" && settingsAfterJson?.settings?.language === \"en\" &&",
      "    settingsAfterJson?.settings?.overlay?.dock === \"left\" &&",
      "    settingsAfterJson?.settings?.overlay?.density === \"compact\" &&",
      "    settingsAfterJson?.settings?.overlay?.defaultCollapsed === true &&",
      "    settingsAfterJson?.settings?.overlay?.autoOpenSetup === false &&",
      "    settingsAfterJson?.settings?.agent?.runEnabled === true &&",
      "    settingsAfterJson?.settings?.agent?.codexSkillEnabled === true &&",
      "    settingsAfterJson?.settings?.agent?.claudeHookEnabled === true &&",
      "    settingsAfterJson?.agent?.runEnabled === true &&",
      "    settingsAfterJson?.agent?.runEnabledSource === \"settings\" &&",
      "    settingsAfterJson?.agent?.queueSignalReady === true &&",
      "    settingsAfterJson?.agent?.codexSkillReady === true &&",
      "    settingsAfterJson?.agent?.claudeHookReady === true &&",
      "    settingsAfterJson?.settings?.agent?.codexCommand === \"codex-custom\" &&",
      "    settingsAfterJson?.settings?.agent?.claudeCommand === \"claude-custom\" &&",
      "    settingsAfterJson?.agent?.codexCommand === \"codex-custom\" &&",
      "    settingsAfterJson?.agent?.codexCommandSource === \"settings\";",
      "  const patchToken = editableToken(first, \"gap-4\");",
      "  const patchRequest = {",
      "    id: first?.id ?? \"missing-installed-dev-server-id\",",
      "    oldToken: \"gap-4\",",
      "    nextToken: \"gap-6\",",
      "    sourceStart: patchToken?.sourceStart,",
      "    sourceEnd: patchToken?.sourceEnd",
      "  };",
      "  const preview = await postJson(`${baseUrl}/__intent/preview`, patchRequest);",
      "  const apply = await postJson(`${baseUrl}/__intent/apply`, patchRequest);",
      "  const sourceAfterApply = fs.readFileSync(path.join(root, \"src\", \"App.tsx\"), \"utf8\");",
      "  const applyRefreshStarted = performance.now();",
      "  const moduleAfterApply = await waitFetchMatch(",
      "    () => moduleRequestUrl(baseUrl, \"src/App.tsx\"),",
      "    10000,",
      "    (result) => result.status === 200 && result.body.includes(\"gap-6\")",
      "  );",
      "  const graphAfterApply = await waitFetchMatch(",
      "    `${baseUrl}/__intent/graph`,",
      "    10000,",
      "    (result) => {",
      "      const parsed = parseGraphResponse(result);",
      "      const firstAfterApplyEntry = entryForRelativeFile(parsed.entries, \"src/App.tsx\");",
      "      return editableToken(firstAfterApplyEntry, \"gap-6\")?.token === \"gap-6\";",
      "    }",
      "  );",
      "  const applyRefreshMs = Number((performance.now() - applyRefreshStarted).toFixed(3));",
      "  const refreshTargetMs = 2500;",
      "  const parsedGraphAfterApply = graphAfterApply.status === 200 ? JSON.parse(graphAfterApply.body) : null;",
      "  const entriesAfterApply = parsedGraphAfterApply ? Object.values(parsedGraphAfterApply.entries ?? {}) : [];",
      "  const firstAfterApply = entriesAfterApply[0] ?? null;",
      "  const firstTokenAfterApply = editableToken(firstAfterApply, \"gap-6\")?.token ?? null;",
      "  const operationFileExists = Boolean(apply.json?.operationFile) && fs.existsSync(apply.json.operationFile);",
      "  const diffFileExists = Boolean(apply.json?.diffFile) && fs.existsSync(apply.json.diffFile);",
      "  const operationLogExists = fs.existsSync(path.join(root, \".intent\", \"operations\", \"operation-log.json\"));",
      "  const undoHistoryAfterApply = await waitFetch(`${baseUrl}/__intent/undo-history`, 10000);",
      "  const parsedUndoHistoryAfterApply = undoHistoryAfterApply.status === 200 ? JSON.parse(undoHistoryAfterApply.body) : null;",
      "  const undoHistoryAfterApplyCount =",
      "    typeof parsedUndoHistoryAfterApply?.pendingCount === \"number\"",
      "      ? parsedUndoHistoryAfterApply.pendingCount",
      "      : Array.isArray(parsedUndoHistoryAfterApply?.entries)",
      "        ? parsedUndoHistoryAfterApply.entries.length",
      "        : 0;",
      "  const revertRefreshStarted = performance.now();",
      "  const revertLast = await postJson(`${baseUrl}/__intent/revert-last`, {});",
      "  const sourceAfterRevert = fs.readFileSync(path.join(root, \"src\", \"App.tsx\"), \"utf8\");",
      "  const moduleAfterRevert = await waitFetchMatch(",
      "    () => moduleRequestUrl(baseUrl, \"src/App.tsx\"),",
      "    10000,",
      "    (result) => result.status === 200 && result.body.includes(\"gap-4\") && !result.body.includes(\"gap-6\")",
      "  );",
      "  const graphAfterRevert = await waitFetchMatch(",
      "    `${baseUrl}/__intent/graph`,",
      "    10000,",
      "    (result) => {",
      "      const parsed = parseGraphResponse(result);",
      "      const firstAfterRevertEntry = entryForRelativeFile(parsed.entries, \"src/App.tsx\");",
      "      return editableToken(firstAfterRevertEntry, \"gap-4\")?.token === \"gap-4\";",
      "    }",
      "  );",
      "  const revertRefreshMs = Number((performance.now() - revertRefreshStarted).toFixed(3));",
      "  const parsedGraphAfterRevert = graphAfterRevert.status === 200 ? JSON.parse(graphAfterRevert.body) : null;",
      "  const entriesAfterRevert = parsedGraphAfterRevert ? Object.values(parsedGraphAfterRevert.entries ?? {}) : [];",
      "  const firstAfterRevert = entriesAfterRevert[0] ?? null;",
      "  const firstTokenAfterRevert = editableToken(firstAfterRevert, \"gap-4\")?.token ?? null;",
      "  const undoHistoryAfterRevert = await waitFetch(`${baseUrl}/__intent/undo-history`, 10000);",
      "  const parsedUndoHistoryAfterRevert = undoHistoryAfterRevert.status === 200 ? JSON.parse(undoHistoryAfterRevert.body) : null;",
      "  const undoHistoryAfterRevertCount =",
      "    typeof parsedUndoHistoryAfterRevert?.pendingCount === \"number\"",
      "      ? parsedUndoHistoryAfterRevert.pendingCount",
      "      : Array.isArray(parsedUndoHistoryAfterRevert?.entries)",
      "        ? parsedUndoHistoryAfterRevert.entries.length",
      "        : 0;",
      "  const multiFileStarted = performance.now();",
      "  fs.writeFileSync(",
      "    path.join(root, \"src\", \"Header.tsx\"),",
      "    [",
      "      \"export function Header() {\",",
      "      \"  return <header className=\\\"flex gap-2 rounded-md p-2 text-sm\\\">Header</header>;\",",
      "      \"}\",",
      "      \"\"",
      "    ].join(\"\\n\")",
      "  );",
      "  fs.writeFileSync(",
      "    path.join(root, \"src\", \"Card.tsx\"),",
      "    [",
      "      \"export function Card() {\",",
      "      \"  return <section className=\\\"flex gap-4 rounded-lg p-4 text-sm\\\">Card</section>;\",",
      "      \"}\",",
      "      \"\"",
      "    ].join(\"\\n\")",
      "  );",
      "  const multiApp = await waitFetchMatch(",
      "    () => moduleRequestUrl(baseUrl, \"src/App.tsx\"),",
      "    10000,",
      "    (result) => result.status === 200 && result.body.includes(\"gap-4\")",
      "  );",
      "  const multiHeader = await waitFetch(`${baseUrl}/src/Header.tsx`, 10000);",
      "  const multiCard = await waitFetch(`${baseUrl}/src/Card.tsx`, 10000);",
      "  const multiGraph = await waitFetch(`${baseUrl}/__intent/graph`, 10000);",
      "  const parsedMultiGraph = parseGraphResponse(multiGraph);",
      "  const multiAppEntry = entryForRelativeFile(parsedMultiGraph.entries, \"src/App.tsx\");",
      "  const multiHeaderEntry = entryForRelativeFile(parsedMultiGraph.entries, \"src/Header.tsx\");",
      "  const multiCardEntry = entryForRelativeFile(parsedMultiGraph.entries, \"src/Card.tsx\");",
      "  const multiAppToken = editableToken(multiAppEntry, \"gap-4\")?.token ?? null;",
      "  const multiHeaderToken = editableToken(multiHeaderEntry, \"gap-2\")?.token ?? null;",
      "  const multiCardTokenBefore = editableToken(multiCardEntry, \"gap-4\")?.token ?? null;",
      "  const multiFileRefreshStarted = performance.now();",
      "  fs.writeFileSync(",
      "    path.join(root, \"src\", \"Card.tsx\"),",
      "    fs.readFileSync(path.join(root, \"src\", \"Card.tsx\"), \"utf8\").replace(\"gap-4\", \"gap-8\")",
      "  );",
      "  const multiCardAfterChange = await waitFetchMatch(",
      "    () => moduleRequestUrl(baseUrl, \"src/Card.tsx\"),",
      "    10000,",
      "    (result) => result.status === 200 && result.body.includes(\"gap-8\")",
      "  );",
      "  const multiGraphAfterChange = await waitFetchMatch(",
      "    `${baseUrl}/__intent/graph`,",
      "    10000,",
      "    (result) => {",
      "      const parsed = parseGraphResponse(result);",
      "      const card = entryForRelativeFile(parsed.entries, \"src/Card.tsx\");",
      "      return editableToken(card, \"gap-8\")?.token === \"gap-8\";",
      "    }",
      "  );",
      "  const multiFileRefreshMs = Number((performance.now() - multiFileRefreshStarted).toFixed(3));",
      "  const parsedMultiGraphAfterChange = parseGraphResponse(multiGraphAfterChange);",
      "  const multiAppAfterChangeEntry = entryForRelativeFile(parsedMultiGraphAfterChange.entries, \"src/App.tsx\");",
      "  const multiHeaderAfterChangeEntry = entryForRelativeFile(parsedMultiGraphAfterChange.entries, \"src/Header.tsx\");",
      "  const multiCardAfterChangeEntry = entryForRelativeFile(parsedMultiGraphAfterChange.entries, \"src/Card.tsx\");",
      "  const multiCardTokenAfter = editableToken(multiCardAfterChangeEntry, \"gap-8\")?.token ?? null;",
      "  const multiFileUnchangedFilesRetained =",
      "    editableToken(multiAppAfterChangeEntry, \"gap-4\")?.token === multiAppToken &&",
      "    editableToken(multiHeaderAfterChangeEntry, \"gap-2\")?.token === multiHeaderToken;",
      "  const multiFileGraphGeneratedAtChanged =",
      "    Boolean(parsedMultiGraph.generatedAt) &&",
      "    Boolean(parsedMultiGraphAfterChange.generatedAt) &&",
      "    parsedMultiGraph.generatedAt !== parsedMultiGraphAfterChange.generatedAt;",
      "  const multiFileModuleAfterChangeIncludesNextToken =",
      "    multiCardAfterChange.status === 200 && multiCardAfterChange.body.includes(\"gap-8\");",
      "  const multiFileMs = Number((performance.now() - multiFileStarted).toFixed(3));",
      "  const multiFileOk =",
      "    multiApp.status === 200 && multiHeader.status === 200 && multiCard.status === 200 &&",
      "    parsedMultiGraph.entries.length === 3 &&",
      "    multiAppToken === \"gap-4\" && multiHeaderToken === \"gap-2\" && multiCardTokenBefore === \"gap-4\" &&",
      "    parsedMultiGraphAfterChange.entries.length === 3 &&",
      "    multiCardTokenAfter === \"gap-8\" &&",
      "    multiFileUnchangedFilesRetained &&",
      "    multiFileGraphGeneratedAtChanged &&",
      "    multiFileModuleAfterChangeIncludesNextToken;",
      "  const elapsedMs = Number((performance.now() - started).toFixed(3));",
      "  const ok = home.status === 200 && module.status === 200 && graph.status === 200 &&",
      "    module.body.includes(\"data-intent-id\") && entries.length === 1 &&",
      "    first?.relativeFile === \"src/App.tsx\" && patchToken?.token === \"gap-4\" &&",
      "    setupBefore.status === 200 && setupBeforeJson?.language === \"ko\" &&",
      "    setupApply.status === 200 && setupApply.json?.ok === true &&",
      "    setupAfter.status === 200 && setupAfterJson?.language === \"ko\" &&",
      "    setupAfterJson?.workspaceReady === true && setupAfterJson?.settingsReady === true &&",
      "    setupAfterJson?.graphReady === true && setupSettingsFileExists && setupSchemaExists &&",
      "    setupQueueSignalExists && setupCodexSkillExists && setupClaudeSettingsExists && setupClaudeHookConfigured &&",
      "    agentQueue.status === 200 && agentQueueJson?.kind === \"intent-agent-queue\" &&",
      "    settingsUpdateOk &&",
      "    preview.status === 200 && preview.json?.ok === true &&",
      "    apply.status === 200 && apply.json?.ok === true &&",
      "    sourceAfterApply.includes(\"gap-6\") && !sourceAfterApply.includes(\"gap-4\") &&",
      "    operationFileExists && diffFileExists && operationLogExists &&",
      "    moduleAfterApply.status === 200 && moduleAfterApply.body.includes(\"gap-6\") &&",
      "    graphAfterApply.status === 200 && entriesAfterApply.length === 1 &&",
      "    firstAfterApply?.relativeFile === \"src/App.tsx\" && firstTokenAfterApply === \"gap-6\" &&",
      "    undoHistoryAfterApply.status === 200 && undoHistoryAfterApplyCount >= 1 &&",
      "    revertLast.status === 200 && revertLast.json?.ok === true &&",
      "    sourceAfterRevert.includes(\"gap-4\") && !sourceAfterRevert.includes(\"gap-6\") &&",
      "    moduleAfterRevert.status === 200 && moduleAfterRevert.body.includes(\"gap-4\") && !moduleAfterRevert.body.includes(\"gap-6\") &&",
      "    graphAfterRevert.status === 200 && entriesAfterRevert.length === 1 && firstTokenAfterRevert === \"gap-4\" &&",
      "    undoHistoryAfterRevert.status === 200 && undoHistoryAfterRevertCount === 0 &&",
      "    revertRefreshMs <= refreshTargetMs &&",
      "    multiFileOk;",
      "  console.log(JSON.stringify({",
      "    ok,",
      "    port,",
      "    homeStatus: home.status,",
      "    moduleStatus: module.status,",
      "    graphStatus: graph.status,",
      "    moduleIncludesIntentId: module.body.includes(\"data-intent-id\"),",
      "    graphEntryCount: entries.length,",
      "    graphBytes: Buffer.byteLength(graph.body),",
      "    firstRelativeFile: first?.relativeFile ?? null,",
      "    firstToken,",
      "    setupStatus: setupBefore.status,",
      "    setupApplyStatus: setupApply.status,",
      "    setupLanguage: setupAfterJson?.language ?? null,",
      "    setupWorkspaceReady: setupAfterJson?.workspaceReady === true,",
      "    setupSettingsReady: setupAfterJson?.settingsReady === true,",
      "    setupGraphReady: setupAfterJson?.graphReady === true,",
      "    setupSettingsFileExists,",
      "    setupSchemaExists,",
      "    setupQueueSignalExists,",
      "    setupQueueStatus: agentQueue.status,",
      "    setupQueuePendingCount: agentQueueJson?.pendingTaskCount ?? 0,",
      "    setupCodexSkillExists,",
      "    setupClaudeSettingsExists,",
      "    setupClaudeHookConfigured,",
      "    settingsUpdateStatus: settingsUpdate.status,",
      "    settingsLanguage: settingsAfterJson?.settings?.language ?? null,",
      "    settingsDock: settingsAfterJson?.settings?.overlay?.dock ?? null,",
      "    settingsDensity: settingsAfterJson?.settings?.overlay?.density ?? null,",
      "    settingsDefaultCollapsed: settingsAfterJson?.settings?.overlay?.defaultCollapsed === true,",
      "    settingsAutoOpenSetup: settingsAfterJson?.settings?.overlay?.autoOpenSetup === true,",
      "    settingsAgentRunEnabled: settingsAfterJson?.settings?.agent?.runEnabled ?? null,",
      "    settingsCodexSkillEnabled: settingsAfterJson?.settings?.agent?.codexSkillEnabled ?? null,",
      "    settingsClaudeHookEnabled: settingsAfterJson?.settings?.agent?.claudeHookEnabled ?? null,",
      "    setupAgentRunEnabled: settingsAfterJson?.agent?.runEnabled ?? null,",
      "    setupAgentRunSource: settingsAfterJson?.agent?.runEnabledSource ?? null,",
      "    setupQueueSignalReady: settingsAfterJson?.agent?.queueSignalReady ?? null,",
      "    setupCodexSkillReady: settingsAfterJson?.agent?.codexSkillReady ?? null,",
      "    setupClaudeHookReady: settingsAfterJson?.agent?.claudeHookReady ?? null,",
      "    settingsCodexCommand: settingsAfterJson?.settings?.agent?.codexCommand ?? null,",
      "    settingsClaudeCommand: settingsAfterJson?.settings?.agent?.claudeCommand ?? null,",
      "    settingsCommandSource: settingsAfterJson?.agent?.codexCommandSource ?? null,",
      "    settingsUpdateOk,",
      "    previewStatus: preview.status,",
      "    previewOk: preview.json?.ok === true,",
      "    applyStatus: apply.status,",
      "    applyOk: apply.json?.ok === true,",
      "    sourcePatched: sourceAfterApply.includes(\"gap-6\") && !sourceAfterApply.includes(\"gap-4\"),",
      "    operationFileExists,",
      "    diffFileExists,",
      "    operationLogExists,",
      "    moduleAfterApplyStatus: moduleAfterApply.status,",
      "    moduleAfterApplyIncludesNextToken: moduleAfterApply.body.includes(\"gap-6\"),",
      "    graphAfterApplyStatus: graphAfterApply.status,",
      "    graphAfterApplyEntryCount: entriesAfterApply.length,",
      "    graphAfterApplyFirstToken: firstTokenAfterApply,",
      "    applyRefreshMs,",
      "    applyRefreshTargetMs: refreshTargetMs,",
      "    applyRefreshTargetPass: applyRefreshMs <= refreshTargetMs,",
      "    undoHistoryAfterApplyStatus: undoHistoryAfterApply.status,",
      "    undoHistoryAfterApplyCount,",
      "    revertStatus: revertLast.status,",
      "    revertOk: revertLast.json?.ok === true,",
      "    sourceReverted: sourceAfterRevert.includes(\"gap-4\") && !sourceAfterRevert.includes(\"gap-6\"),",
      "    moduleAfterRevertStatus: moduleAfterRevert.status,",
      "    moduleAfterRevertIncludesOldToken: moduleAfterRevert.body.includes(\"gap-4\") && !moduleAfterRevert.body.includes(\"gap-6\"),",
      "    graphAfterRevertStatus: graphAfterRevert.status,",
      "    graphAfterRevertFirstToken: firstTokenAfterRevert,",
      "    undoHistoryAfterRevertStatus: undoHistoryAfterRevert.status,",
      "    undoHistoryAfterRevertCount,",
      "    revertRefreshMs,",
      "    revertRefreshTargetMs: refreshTargetMs,",
      "    revertRefreshTargetPass: revertRefreshMs <= refreshTargetMs,",
      "    multiFileOk,",
      "    multiFileInitialEntryCount: parsedMultiGraph.entries.length,",
      "    multiFileAfterChangeEntryCount: parsedMultiGraphAfterChange.entries.length,",
      "    multiFileChangedFileTokenBefore: multiCardTokenBefore,",
      "    multiFileChangedFileTokenAfter: multiCardTokenAfter,",
      "    multiFileUnchangedFilesRetained,",
      "    multiFileGraphGeneratedAtChanged,",
      "    multiFileModuleAfterChangeIncludesNextToken,",
      "    multiFileRefreshMs,",
      "    multiFileRefreshTargetMs: refreshTargetMs,",
      "    multiFileRefreshTargetPass: multiFileRefreshMs <= refreshTargetMs,",
      "    multiFileMs,",
      "    ms: elapsedMs,",
      "    stdoutBytes: stdout.length,",
      "    stderrBytes: stderr.length",
      "  }));",
      "  process.exitCode = ok ? 0 : 1;",
      "} catch (error) {",
      "  console.log(JSON.stringify({",
      "    ok: false,",
      "    port,",
      "    homeStatus: null,",
      "    moduleStatus: null,",
      "    graphStatus: null,",
      "    moduleIncludesIntentId: false,",
      "    graphEntryCount: 0,",
      "    graphBytes: 0,",
      "    firstRelativeFile: null,",
      "    firstToken: null,",
      "    setupStatus: null,",
      "    setupApplyStatus: null,",
      "    setupLanguage: null,",
      "    setupWorkspaceReady: false,",
      "    setupSettingsReady: false,",
      "    setupGraphReady: false,",
      "    setupSettingsFileExists: false,",
      "    setupSchemaExists: false,",
      "    setupQueueSignalExists: false,",
      "    setupQueueStatus: null,",
      "    setupQueuePendingCount: 0,",
      "    setupCodexSkillExists: false,",
      "    setupClaudeSettingsExists: false,",
      "    setupClaudeHookConfigured: false,",
      "    settingsUpdateStatus: null,",
      "    settingsLanguage: null,",
      "    settingsDock: null,",
      "    settingsDensity: null,",
      "    settingsDefaultCollapsed: false,",
      "    settingsAutoOpenSetup: false,",
      "    settingsAgentRunEnabled: false,",
      "    settingsCodexSkillEnabled: false,",
      "    settingsClaudeHookEnabled: false,",
      "    setupAgentRunEnabled: false,",
      "    setupAgentRunSource: null,",
      "    setupQueueSignalReady: false,",
      "    setupCodexSkillReady: false,",
      "    setupClaudeHookReady: false,",
      "    settingsCodexCommand: null,",
      "    settingsClaudeCommand: null,",
      "    settingsCommandSource: null,",
      "    settingsUpdateOk: false,",
      "    previewStatus: null,",
      "    previewOk: false,",
      "    applyStatus: null,",
      "    applyOk: false,",
      "    sourcePatched: false,",
      "    operationFileExists: false,",
      "    diffFileExists: false,",
      "    operationLogExists: false,",
      "    moduleAfterApplyStatus: null,",
      "    moduleAfterApplyIncludesNextToken: false,",
      "    graphAfterApplyStatus: null,",
      "    graphAfterApplyEntryCount: 0,",
      "    graphAfterApplyFirstToken: null,",
      "    applyRefreshMs: 0,",
      "    applyRefreshTargetMs: 500,",
      "    applyRefreshTargetPass: false,",
      "    multiFileOk: false,",
      "    multiFileInitialEntryCount: 0,",
      "    multiFileAfterChangeEntryCount: 0,",
      "    multiFileChangedFileTokenBefore: null,",
      "    multiFileChangedFileTokenAfter: null,",
      "    multiFileUnchangedFilesRetained: false,",
      "    multiFileGraphGeneratedAtChanged: false,",
      "    multiFileModuleAfterChangeIncludesNextToken: false,",
      "    multiFileRefreshMs: 0,",
      "    multiFileRefreshTargetMs: 500,",
      "    multiFileRefreshTargetPass: false,",
      "    multiFileMs: 0,",
      "    ms: Number((performance.now() - started).toFixed(3)),",
      "    error: error instanceof Error ? error.message : String(error),",
      "    stdout: truncate(stdout),",
      "    stderr: truncate(stderr)",
      "  }));",
      "  process.exitCode = 1;",
      "} finally {",
      "  await stop(child);",
      "}",
      ""
    ].join("\n")
  );
  const installedViteDevServer =
    install.exitCode === 0
      ? runCommand(process.execPath, [installedDevServerSmokeFile], installDir, 30000, false)
      : { exitCode: null, stdout: "", stderr: "package install failed", ms: 0 };
  let installedViteDevServerReport: {
    ok?: boolean;
    port?: number | null;
    homeStatus?: number | null;
    moduleStatus?: number | null;
    graphStatus?: number | null;
    moduleIncludesIntentId?: boolean;
    graphEntryCount?: number;
    graphBytes?: number;
    firstRelativeFile?: string | null;
    firstToken?: string | null;
    setupStatus?: number | null;
    setupApplyStatus?: number | null;
    setupLanguage?: string | null;
    setupWorkspaceReady?: boolean;
    setupSettingsReady?: boolean;
    setupGraphReady?: boolean;
    setupSettingsFileExists?: boolean;
    setupSchemaExists?: boolean;
    setupQueueSignalExists?: boolean;
    setupQueueStatus?: number | null;
    setupQueuePendingCount?: number;
    setupCodexSkillExists?: boolean;
    setupClaudeSettingsExists?: boolean;
    setupClaudeHookConfigured?: boolean;
    settingsUpdateStatus?: number | null;
    settingsLanguage?: string | null;
    settingsDock?: string | null;
    settingsDensity?: string | null;
    settingsDefaultCollapsed?: boolean;
    settingsAutoOpenSetup?: boolean;
    settingsAgentRunEnabled?: boolean | null;
    settingsCodexSkillEnabled?: boolean | null;
    settingsClaudeHookEnabled?: boolean | null;
    setupAgentRunEnabled?: boolean | null;
    setupAgentRunSource?: string | null;
    setupQueueSignalReady?: boolean | null;
    setupCodexSkillReady?: boolean | null;
    setupClaudeHookReady?: boolean | null;
    settingsCodexCommand?: string | null;
    settingsClaudeCommand?: string | null;
    settingsCommandSource?: string | null;
    settingsUpdateOk?: boolean;
    previewStatus?: number | null;
    previewOk?: boolean;
    applyStatus?: number | null;
    applyOk?: boolean;
    sourcePatched?: boolean;
    operationFileExists?: boolean;
    diffFileExists?: boolean;
    operationLogExists?: boolean;
    moduleAfterApplyStatus?: number | null;
    moduleAfterApplyIncludesNextToken?: boolean;
    graphAfterApplyStatus?: number | null;
    graphAfterApplyEntryCount?: number;
    graphAfterApplyFirstToken?: string | null;
    applyRefreshMs?: number;
    applyRefreshTargetMs?: number;
    applyRefreshTargetPass?: boolean;
    undoHistoryAfterApplyStatus?: number | null;
    undoHistoryAfterApplyCount?: number;
    revertStatus?: number | null;
    revertOk?: boolean;
    sourceReverted?: boolean;
    moduleAfterRevertStatus?: number | null;
    moduleAfterRevertIncludesOldToken?: boolean;
    graphAfterRevertStatus?: number | null;
    graphAfterRevertFirstToken?: string | null;
    undoHistoryAfterRevertStatus?: number | null;
    undoHistoryAfterRevertCount?: number;
    revertRefreshMs?: number;
    revertRefreshTargetMs?: number;
    revertRefreshTargetPass?: boolean;
    multiFileOk?: boolean;
    multiFileInitialEntryCount?: number;
    multiFileAfterChangeEntryCount?: number;
    multiFileChangedFileTokenBefore?: string | null;
    multiFileChangedFileTokenAfter?: string | null;
    multiFileUnchangedFilesRetained?: boolean;
    multiFileGraphGeneratedAtChanged?: boolean;
    multiFileModuleAfterChangeIncludesNextToken?: boolean;
    multiFileRefreshMs?: number;
    multiFileRefreshTargetMs?: number;
    multiFileRefreshTargetPass?: boolean;
    multiFileMs?: number;
    ms?: number;
  } = {};
  try {
    installedViteDevServerReport = JSON.parse(installedViteDevServer.stdout) as typeof installedViteDevServerReport;
  } catch {
    installedViteDevServerReport = {};
  }
  const builtCliFile = path.join(rootDir, "dist", "cli.js");
  const cliShebang = fs.existsSync(builtCliFile)
    ? fs.readFileSync(builtCliFile, "utf8").split(/\r?\n/, 1)[0] ?? null
    : null;

  return {
    packageName: dryRunPackage?.name ?? null,
    packageVersion: dryRunPackage?.version ?? null,
    binTarget: packageJson.bin?.["intent-layer"] ?? null,
    viteExportTarget: packageJson.exports?.["./vite"] ?? null,
    dryRunExitCode: dryRun.exitCode,
    packExitCode: pack.exitCode,
    installExitCode: install.exitCode,
    helpExitCode: help.exitCode,
    viteImportExitCode: viteImport.exitCode,
    installedViteTransformExitCode: installedViteTransform.exitCode,
    installedViteDevServerExitCode: installedViteDevServer.exitCode,
    packageFileCount: files.length,
    packageSize: dryRunPackage?.size ?? 0,
    packageUnpackedSize: dryRunPackage?.unpackedSize ?? 0,
    tarballFile: tarballFile ? reportPath(tarballFile) : null,
    installDir: reportPath(installDir),
    binFile: reportPath(binFile),
    cliShebang,
    hasCliBundle: files.some((file) => file.path === "dist/cli.js"),
    hasViteBundle: files.some((file) => file.path === "dist/vite.js"),
    hasVirtualClientBundle:
      files.some((file) => file.path === "dist/client.js") &&
      files.some((file) => file.path === "dist/tailwind.js"),
    hasContextPackFiles: files.some((file) => file.path.startsWith(".context-pack/")),
    hasReadmeDocs:
      files.some((file) => file.path === "README.md") &&
      files.some((file) => file.path === "README_KR.md"),
    hasFailureModeDocs:
      files.some((file) => file.path === "FAILURE_MODES_EN.md") &&
      files.some((file) => file.path === "FAILURE_MODES_KR.md"),
    helpIncludesUsage: help.stdout.includes("Usage:"),
    helpIncludesDev: help.stdout.includes("intent-layer dev"),
    helpIncludesDoctor: help.stdout.includes("intent-layer doctor"),
    viteImportOk: viteImportReport.ok === true,
    vitePluginName: viteImportReport.pluginName ?? null,
    vitePluginEnforce: viteImportReport.enforce ?? null,
    viteLegacyPluginName: viteImportReport.legacyPluginName ?? null,
    installedViteTransformOk: installedViteTransformReport.ok === true,
    installedViteTransformIncludesIntentId: installedViteTransformReport.includesIntentId === true,
    installedViteTransformGraphExists: installedViteTransformReport.graphExists === true,
    installedViteTransformGraphEntryCount: installedViteTransformReport.graphEntryCount ?? 0,
    installedViteTransformGraphBytes: installedViteTransformReport.graphBytes ?? 0,
    installedViteTransformFirstRelativeFile: installedViteTransformReport.firstRelativeFile ?? null,
    installedViteTransformFirstToken: installedViteTransformReport.firstToken ?? null,
    installedViteTransformHookMs: installedViteTransformReport.transformMs ?? 0,
    installedViteDevServerOk: installedViteDevServerReport.ok === true,
    installedViteDevServerPort: installedViteDevServerReport.port ?? null,
    installedViteDevServerHomeStatus: installedViteDevServerReport.homeStatus ?? null,
    installedViteDevServerModuleStatus: installedViteDevServerReport.moduleStatus ?? null,
    installedViteDevServerGraphStatus: installedViteDevServerReport.graphStatus ?? null,
    installedViteDevServerModuleIncludesIntentId:
      installedViteDevServerReport.moduleIncludesIntentId === true,
    installedViteDevServerGraphEntryCount: installedViteDevServerReport.graphEntryCount ?? 0,
    installedViteDevServerGraphBytes: installedViteDevServerReport.graphBytes ?? 0,
    installedViteDevServerFirstRelativeFile: installedViteDevServerReport.firstRelativeFile ?? null,
    installedViteDevServerFirstToken: installedViteDevServerReport.firstToken ?? null,
    installedViteDevServerSetupStatus: installedViteDevServerReport.setupStatus ?? null,
    installedViteDevServerSetupApplyStatus: installedViteDevServerReport.setupApplyStatus ?? null,
    installedViteDevServerSetupLanguage: installedViteDevServerReport.setupLanguage ?? null,
    installedViteDevServerSetupWorkspaceReady:
      installedViteDevServerReport.setupWorkspaceReady === true,
    installedViteDevServerSetupSettingsReady:
      installedViteDevServerReport.setupSettingsReady === true,
    installedViteDevServerSetupGraphReady: installedViteDevServerReport.setupGraphReady === true,
    installedViteDevServerSetupSettingsFileExists:
      installedViteDevServerReport.setupSettingsFileExists === true,
    installedViteDevServerSetupSchemaExists: installedViteDevServerReport.setupSchemaExists === true,
    installedViteDevServerSetupQueueSignalExists:
      installedViteDevServerReport.setupQueueSignalExists === true,
    installedViteDevServerSetupQueueStatus:
      installedViteDevServerReport.setupQueueStatus ?? null,
    installedViteDevServerSetupQueuePendingCount:
      installedViteDevServerReport.setupQueuePendingCount ?? 0,
    installedViteDevServerSetupCodexSkillExists:
      installedViteDevServerReport.setupCodexSkillExists === true,
    installedViteDevServerSetupClaudeSettingsExists:
      installedViteDevServerReport.setupClaudeSettingsExists === true,
    installedViteDevServerSetupClaudeHookConfigured:
      installedViteDevServerReport.setupClaudeHookConfigured === true,
    installedViteDevServerSettingsUpdateStatus:
      installedViteDevServerReport.settingsUpdateStatus ?? null,
    installedViteDevServerSettingsLanguage: installedViteDevServerReport.settingsLanguage ?? null,
    installedViteDevServerSettingsDock: installedViteDevServerReport.settingsDock ?? null,
    installedViteDevServerSettingsDensity: installedViteDevServerReport.settingsDensity ?? null,
    installedViteDevServerSettingsDefaultCollapsed:
      installedViteDevServerReport.settingsDefaultCollapsed === true,
    installedViteDevServerSettingsAutoOpenSetup:
      installedViteDevServerReport.settingsAutoOpenSetup === true,
    installedViteDevServerSettingsAgentRunEnabled:
      installedViteDevServerReport.settingsAgentRunEnabled === true,
    installedViteDevServerSettingsCodexSkillEnabled:
      installedViteDevServerReport.settingsCodexSkillEnabled === true,
    installedViteDevServerSettingsClaudeHookEnabled:
      installedViteDevServerReport.settingsClaudeHookEnabled === true,
    installedViteDevServerSetupAgentRunEnabled:
      installedViteDevServerReport.setupAgentRunEnabled === true,
    installedViteDevServerSetupAgentRunSource:
      installedViteDevServerReport.setupAgentRunSource ?? null,
    installedViteDevServerSetupQueueSignalReady:
      installedViteDevServerReport.setupQueueSignalReady === true,
    installedViteDevServerSetupCodexSkillReady:
      installedViteDevServerReport.setupCodexSkillReady === true,
    installedViteDevServerSetupClaudeHookReady:
      installedViteDevServerReport.setupClaudeHookReady === true,
    installedViteDevServerSettingsCodexCommand:
      installedViteDevServerReport.settingsCodexCommand ?? null,
    installedViteDevServerSettingsClaudeCommand:
      installedViteDevServerReport.settingsClaudeCommand ?? null,
    installedViteDevServerSettingsCommandSource:
      installedViteDevServerReport.settingsCommandSource ?? null,
    installedViteDevServerSettingsUpdateOk: installedViteDevServerReport.settingsUpdateOk === true,
    installedViteDevServerPreviewStatus: installedViteDevServerReport.previewStatus ?? null,
    installedViteDevServerPreviewOk: installedViteDevServerReport.previewOk === true,
    installedViteDevServerApplyStatus: installedViteDevServerReport.applyStatus ?? null,
    installedViteDevServerApplyOk: installedViteDevServerReport.applyOk === true,
    installedViteDevServerSourcePatched: installedViteDevServerReport.sourcePatched === true,
    installedViteDevServerOperationFileExists:
      installedViteDevServerReport.operationFileExists === true,
    installedViteDevServerDiffFileExists: installedViteDevServerReport.diffFileExists === true,
    installedViteDevServerOperationLogExists:
      installedViteDevServerReport.operationLogExists === true,
    installedViteDevServerModuleAfterApplyStatus:
      installedViteDevServerReport.moduleAfterApplyStatus ?? null,
    installedViteDevServerModuleAfterApplyIncludesNextToken:
      installedViteDevServerReport.moduleAfterApplyIncludesNextToken === true,
    installedViteDevServerGraphAfterApplyStatus:
      installedViteDevServerReport.graphAfterApplyStatus ?? null,
    installedViteDevServerGraphAfterApplyEntryCount:
      installedViteDevServerReport.graphAfterApplyEntryCount ?? 0,
    installedViteDevServerGraphAfterApplyFirstToken:
      installedViteDevServerReport.graphAfterApplyFirstToken ?? null,
    installedViteDevServerApplyRefreshMs: installedViteDevServerReport.applyRefreshMs ?? 0,
    installedViteDevServerApplyRefreshTargetMs:
      installedViteDevServerReport.applyRefreshTargetMs ?? 500,
    installedViteDevServerApplyRefreshTargetPass:
      installedViteDevServerReport.applyRefreshTargetPass === true,
    installedViteDevServerUndoHistoryAfterApplyStatus:
      installedViteDevServerReport.undoHistoryAfterApplyStatus ?? null,
    installedViteDevServerUndoHistoryAfterApplyCount:
      installedViteDevServerReport.undoHistoryAfterApplyCount ?? 0,
    installedViteDevServerRevertStatus: installedViteDevServerReport.revertStatus ?? null,
    installedViteDevServerRevertOk: installedViteDevServerReport.revertOk === true,
    installedViteDevServerSourceReverted: installedViteDevServerReport.sourceReverted === true,
    installedViteDevServerModuleAfterRevertStatus:
      installedViteDevServerReport.moduleAfterRevertStatus ?? null,
    installedViteDevServerModuleAfterRevertIncludesOldToken:
      installedViteDevServerReport.moduleAfterRevertIncludesOldToken === true,
    installedViteDevServerGraphAfterRevertStatus:
      installedViteDevServerReport.graphAfterRevertStatus ?? null,
    installedViteDevServerGraphAfterRevertFirstToken:
      installedViteDevServerReport.graphAfterRevertFirstToken ?? null,
    installedViteDevServerUndoHistoryAfterRevertStatus:
      installedViteDevServerReport.undoHistoryAfterRevertStatus ?? null,
    installedViteDevServerUndoHistoryAfterRevertCount:
      installedViteDevServerReport.undoHistoryAfterRevertCount ?? 0,
    installedViteDevServerRevertRefreshMs: installedViteDevServerReport.revertRefreshMs ?? 0,
    installedViteDevServerRevertRefreshTargetMs:
      installedViteDevServerReport.revertRefreshTargetMs ?? 500,
    installedViteDevServerRevertRefreshTargetPass:
      installedViteDevServerReport.revertRefreshTargetPass === true,
    installedViteDevServerMultiFileOk: installedViteDevServerReport.multiFileOk === true,
    installedViteDevServerMultiFileInitialEntryCount:
      installedViteDevServerReport.multiFileInitialEntryCount ?? 0,
    installedViteDevServerMultiFileAfterChangeEntryCount:
      installedViteDevServerReport.multiFileAfterChangeEntryCount ?? 0,
    installedViteDevServerMultiFileChangedFileTokenBefore:
      installedViteDevServerReport.multiFileChangedFileTokenBefore ?? null,
    installedViteDevServerMultiFileChangedFileTokenAfter:
      installedViteDevServerReport.multiFileChangedFileTokenAfter ?? null,
    installedViteDevServerMultiFileUnchangedFilesRetained:
      installedViteDevServerReport.multiFileUnchangedFilesRetained === true,
    installedViteDevServerMultiFileGraphGeneratedAtChanged:
      installedViteDevServerReport.multiFileGraphGeneratedAtChanged === true,
    installedViteDevServerMultiFileModuleAfterChangeIncludesNextToken:
      installedViteDevServerReport.multiFileModuleAfterChangeIncludesNextToken === true,
    installedViteDevServerMultiFileRefreshMs:
      installedViteDevServerReport.multiFileRefreshMs ?? 0,
    installedViteDevServerMultiFileRefreshTargetMs:
      installedViteDevServerReport.multiFileRefreshTargetMs ?? 500,
    installedViteDevServerMultiFileRefreshTargetPass:
      installedViteDevServerReport.multiFileRefreshTargetPass === true,
    installedViteDevServerMultiFileMs: installedViteDevServerReport.multiFileMs ?? 0,
    installedViteDevServerMs: installedViteDevServerReport.ms ?? 0,
    dryRunMs: dryRun.ms,
    packMs: pack.ms,
    installMs: install.ms,
    helpMs: help.ms,
    viteImportMs: viteImport.ms,
    installedViteTransformMs: installedViteTransform.ms,
    stdoutBytes:
      dryRun.stdout.length +
      pack.stdout.length +
      install.stdout.length +
      help.stdout.length +
      viteImport.stdout.length +
      installedViteTransform.stdout.length +
      installedViteDevServer.stdout.length,
    stderrBytes:
      dryRun.stderr.length +
      pack.stderr.length +
      install.stderr.length +
      help.stderr.length +
      viteImport.stderr.length +
      installedViteTransform.stderr.length +
      installedViteDevServer.stderr.length
  };
}

function sourceFiles(input: string): string[] {
  const full = path.resolve(rootDir, input);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return /\.[jt]sx$/.test(full) ? [full] : [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .flatMap((entry) => {
      const next = path.join(full, entry.name);
      return entry.isDirectory() ? sourceFiles(next) : /\.[jt]sx$/.test(next) ? [next] : [];
    })
    .sort();
}

function parseSyntaxErrorCount(file: string): number {
  const code = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    reportDiagnostics: true
  });
  return (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return Number(sorted[index].toFixed(3));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function largeTransformFixture(cardCount: number): string {
  const cards = Array.from({ length: cardCount }, (_, index) =>
    [
      `        <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">`,
      `          <h2 className="text-lg font-semibold text-slate-950">Metric ${index}</h2>`,
      `          <p className={cn("text-sm leading-6 text-slate-600", active && "text-teal-700")}>Generated row</p>`,
      `          <button className={clsx("rounded-lg px-4 py-2 text-sm font-semibold", selected && "bg-teal-700 text-white")}>Inspect</button>`,
      "        </article>"
    ].join("\n")
  ).join("\n");

  return [
    "declare function cn(...value: Array<string | false | undefined>): string;",
    "declare function clsx(...value: Array<string | false | undefined>): string;",
    "export function LargeTransformFixture({ active, selected }: { active: boolean; selected: boolean }) {",
    "  return (",
    "    <section className=\"grid grid-cols-4 gap-4 rounded-2xl bg-slate-50 p-8\">",
    cards,
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n");
}

interface ProductGraphWriteThrottleSample {
  label: string;
  transformMs: number;
  transformReturnedCode: boolean;
  generatedAt: string | null;
  entries: number;
  graphBytes: number;
}

interface ProductGraphWriteThrottleReport {
  file: string;
  graphFile: string;
  cardCount: number;
  inputBytes: number;
  changedInputBytes: number;
  repeatCount: number;
  samples: ProductGraphWriteThrottleSample[];
  firstGeneratedAt: string | null;
  repeatedGeneratedAt: string[];
  changedGeneratedAt: string | null;
  changedRepeatGeneratedAt: string | null;
  sameCodeStable: boolean;
  changedCodeUpdates: boolean;
  changedRepeatStable: boolean;
  entriesStable: boolean;
  inferredWriteCount: number;
  inferredSkippedWriteCount: number;
  pass: boolean;
}

interface ProductMultiFileGraphRefreshSample {
  relativeFile: string;
  transformMs: number;
  transformReturnedCode: boolean;
  generatedAt: string | null;
  entries: number;
  graphBytes: number;
}

interface ProductMultiFileGraphRefreshReport {
  rootDir: string;
  graphFile: string;
  fileCount: number;
  cardsPerFile: number;
  expectedEntryCount: number;
  initialEntryCount: number;
  repeatEntryCount: number;
  changedEntryCount: number;
  changedRepeatEntryCount: number;
  graphBytes: number;
  changedFile: string;
  changedFileTokenBefore: string | null;
  changedFileTokenAfter: string | null;
  unchangedSampleFiles: string[];
  unchangedFilesRetained: boolean;
  generatedAtInitial: string | null;
  generatedAtRepeat: string | null;
  generatedAtChanged: string | null;
  generatedAtChangedRepeat: string | null;
  sameCodeStable: boolean;
  changedCodeUpdates: boolean;
  changedRepeatStable: boolean;
  entryCountStable: boolean;
  initialSamples: ProductMultiFileGraphRefreshSample[];
  repeatSamples: ProductMultiFileGraphRefreshSample[];
  changedSample: ProductMultiFileGraphRefreshSample;
  changedRepeatSample: ProductMultiFileGraphRefreshSample;
  initialTotalMs: number;
  repeatTotalMs: number;
  changedFileTransformMs: number;
  changedRepeatTransformMs: number;
  changedFileTargetMs: number;
  pass: boolean;
}

interface ExternalProductGraphRefreshCorpusReport {
  label: string;
  corpusDir: string;
  filesDir: string;
  available: boolean;
  unavailableReason: string | null;
  sourceFileCount: number;
  measuredFileCount: number;
  graphFile: string | null;
  initialEntryCount: number;
  repeatEntryCount: number;
  changedEntryCount: number;
  changedRepeatEntryCount: number;
  graphBytes: number;
  changedFile: string | null;
  changedTokenBefore: string | null;
  changedTokenAfter: string | null;
  unchangedSampleFiles: string[];
  unchangedFilesRetained: boolean;
  generatedAtInitial: string | null;
  generatedAtRepeat: string | null;
  generatedAtChanged: string | null;
  generatedAtChangedRepeat: string | null;
  sameCodeStable: boolean;
  changedCodeUpdates: boolean;
  changedRepeatStable: boolean;
  entryCountStable: boolean;
  initialTotalMs: number;
  repeatTotalMs: number;
  changedFileTransformMs: number;
  changedRepeatTransformMs: number;
  changedFileTargetMs: number;
  pass: boolean;
}

interface ExternalProductGraphRefreshReport {
  fileLimitPerCorpus: number;
  availableCorpusCount: number;
  passCount: number;
  corpora: ExternalProductGraphRefreshCorpusReport[];
  pass: boolean;
  note: string;
}

function resetTmpSubdir(name: string): string {
  const target = path.resolve(tmpDir, name);
  const tmpRoot = path.resolve(tmpDir);

  if (target !== tmpRoot && !target.startsWith(`${tmpRoot}${path.sep}`)) {
    throw new Error(`Refusing to reset temp path outside ${tmpRoot}: ${target}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function measureProductGraphWriteThrottle(
  code: string,
  cardCount: number
): ProductGraphWriteThrottleReport {
  const throttleRoot = resetTmpSubdir("vite-graph-write-throttle");
  const fixtureFile = path.join(throttleRoot, "ProductGraphWriteThrottleFixture.tsx");
  const graphFile = path.join(throttleRoot, ".intent", "graph.intent.json");
  const plugin = intentLayer();
  const configResolved = plugin.configResolved as unknown;

  if (typeof configResolved === "function") {
    (configResolved as (config: { root: string }) => void)({ root: throttleRoot });
  }

  const transformSource = plugin.transform as unknown;
  const transform =
    typeof transformSource === "function"
      ? transformSource
      : transformSource &&
          typeof transformSource === "object" &&
          "handler" in transformSource &&
          typeof (transformSource as { handler?: unknown }).handler === "function"
        ? (transformSource as { handler: unknown }).handler
        : null;

  if (!transform) {
    throw new Error("intentLayer plugin did not expose a callable transform hook");
  }

  function sample(label: string, inputCode: string): ProductGraphWriteThrottleSample {
    fs.writeFileSync(fixtureFile, inputCode);
    const started = performance.now();
    const transformed = (transform as (code: string, id: string) => unknown)(inputCode, fixtureFile);
    const transformMs = Number((performance.now() - started).toFixed(3));

    if (transformed && typeof (transformed as PromiseLike<unknown>).then === "function") {
      throw new Error("Product graph write throttle fixture expected a synchronous transform");
    }

    const graph = fs.existsSync(graphFile)
      ? (JSON.parse(fs.readFileSync(graphFile, "utf8")) as IntentGraph)
      : null;

    return {
      label,
      transformMs,
      transformReturnedCode: transformed !== null,
      generatedAt: graph?.generatedAt ?? null,
      entries: graph ? Object.keys(graph.entries).length : 0,
      graphBytes: fs.existsSync(graphFile) ? fs.statSync(graphFile).size : 0
    };
  }

  const changedCode = code.replace("grid grid-cols-4 gap-4", "grid grid-cols-4 gap-6");
  const repeatCount = 4;
  const first = sample("initial", code);
  const repeats = Array.from({ length: repeatCount }, (_, index) =>
    sample(`repeat-${index + 1}`, code)
  );
  const changed = sample("changed-token", changedCode);
  const changedRepeat = sample("changed-token-repeat", changedCode);
  const allSamples = [first, ...repeats, changed, changedRepeat];
  const sameCodeStable = repeats.every((item) => item.generatedAt === first.generatedAt);
  const changedCodeUpdates = Boolean(
    first.generatedAt &&
      changed.generatedAt &&
      changed.generatedAt !== first.generatedAt &&
      changedCode !== code
  );
  const changedRepeatStable = changedRepeat.generatedAt === changed.generatedAt;
  const entriesStable = allSamples.every((item) => item.entries === first.entries);
  const uniqueGeneratedAt = new Set(
    allSamples.map((item) => item.generatedAt).filter((value): value is string => Boolean(value))
  );
  const inferredSkippedWriteCount =
    repeats.filter((item) => item.generatedAt === first.generatedAt).length +
    (changedRepeat.generatedAt === changed.generatedAt ? 1 : 0);

  return {
    file: reportPath(fixtureFile),
    graphFile: reportPath(graphFile),
    cardCount,
    inputBytes: code.length,
    changedInputBytes: changedCode.length,
    repeatCount,
    samples: allSamples,
    firstGeneratedAt: first.generatedAt,
    repeatedGeneratedAt: repeats
      .map((item) => item.generatedAt)
      .filter((value): value is string => Boolean(value)),
    changedGeneratedAt: changed.generatedAt,
    changedRepeatGeneratedAt: changedRepeat.generatedAt,
    sameCodeStable,
    changedCodeUpdates,
    changedRepeatStable,
    entriesStable,
    inferredWriteCount: uniqueGeneratedAt.size,
    inferredSkippedWriteCount,
    pass:
      sameCodeStable &&
      changedCodeUpdates &&
      changedRepeatStable &&
      entriesStable &&
      uniqueGeneratedAt.size === 2 &&
      inferredSkippedWriteCount === repeatCount + 1
  };
}

function productMultiFileFixture(fileIndex: number, cardsPerFile: number, gapToken = "gap-4"): string {
  const componentName = `ProductScreen${String(fileIndex).padStart(2, "0")}`;
  const cards = Array.from({ length: cardsPerFile }, (_, index) =>
    [
      `        <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">`,
      `          <h2 className="text-lg font-semibold text-slate-950">Metric ${fileIndex}-${index}</h2>`,
      `          <p className={cn("text-sm leading-6 text-slate-600", active && "text-teal-700")}>Generated row</p>`,
      `          <button className={clsx("rounded-lg px-4 py-2 text-sm font-semibold", selectedIndex === ${index} && "bg-teal-700 text-white")}>Inspect</button>`,
      "        </article>"
    ].join("\n")
  ).join("\n");

  return [
    "declare function cn(...value: Array<string | false | undefined>): string;",
    "declare function clsx(...value: Array<string | false | undefined>): string;",
    `export function ${componentName}({ active, selectedIndex }: { active: boolean; selectedIndex: number }) {`,
    "  return (",
    "    <main className=\"min-h-screen bg-slate-50 p-6\">",
    `      <section className="grid grid-cols-3 ${gapToken} rounded-2xl border border-slate-200 bg-white p-6">`,
    cards,
    "      </section>",
    "    </main>",
    "  );",
    "}",
    ""
  ].join("\n");
}

function readIntentGraph(graphFile: string): IntentGraph {
  return JSON.parse(fs.readFileSync(graphFile, "utf8")) as IntentGraph;
}

function graphEntryCount(graph: IntentGraph): number {
  return Object.keys(graph.entries).length;
}

function graphHasFileToken(graph: IntentGraph, relativeFile: string, token: string): boolean {
  return Object.values(graph.entries).some(
    (entry) =>
      entry.relativeFile === relativeFile && entry.tokens.some((item) => item.token === token)
  );
}

function firstGraphFileToken(
  graph: IntentGraph,
  relativeFile: string,
  token: string
): string | null {
  return graphHasFileToken(graph, relativeFile, token) ? token : null;
}

function callableTransform(plugin: ReturnType<typeof intentLayer>): (code: string, id: string) => unknown {
  const transformSource = plugin.transform as unknown;
  const transform =
    typeof transformSource === "function"
      ? transformSource
      : transformSource &&
          typeof transformSource === "object" &&
          "handler" in transformSource &&
          typeof (transformSource as { handler?: unknown }).handler === "function"
        ? (transformSource as { handler: unknown }).handler
        : null;

  if (!transform) {
    throw new Error("intentLayer plugin did not expose a callable transform hook");
  }

  return transform as (code: string, id: string) => unknown;
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "external";
}

function replacementForToken(token: string): string | null {
  const replacements: Record<string, string> = {
    "gap-2": "gap-4",
    "gap-3": "gap-4",
    "gap-4": "gap-6",
    "p-4": "p-6",
    "p-6": "p-8",
    "px-4": "px-6",
    "py-2": "py-3",
    "w-full": "w-1/2",
    flex: "grid",
    grid: "flex",
    hidden: "block",
    "flex-1": "flex-auto"
  };

  return replacements[token] ?? null;
}

function findPatchableGraphToken(
  graph: IntentGraph,
  files: Array<{ file: string; relativeFile: string; code: string }>
): {
  file: string;
  relativeFile: string;
  oldToken: string;
  nextToken: string;
  sourceStart: number;
  sourceEnd: number;
} | null {
  const entries = Object.values(graph.entries);

  for (const file of files) {
    const fileEntries = entries.filter((entry) => entry.relativeFile === file.relativeFile);
    for (const entry of fileEntries) {
      for (const token of entry.tokens) {
        const nextToken = token.editable ? replacementForToken(token.token) : null;
        if (!nextToken) continue;
        if (file.code.slice(token.sourceStart, token.sourceEnd) !== token.token) continue;
        return {
          file: file.file,
          relativeFile: file.relativeFile,
          oldToken: token.token,
          nextToken,
          sourceStart: token.sourceStart,
          sourceEnd: token.sourceEnd
        };
      }
    }
  }

  return null;
}

function entryCountForFile(graph: IntentGraph, relativeFile: string): number {
  return Object.values(graph.entries)
    .filter((entry: IntentBinding) => entry.relativeFile === relativeFile).length;
}

function readExternalCorpusLabel(corpusDir: string): string {
  const manifestFile = path.join(corpusDir, "manifest.json");
  if (!fs.existsSync(manifestFile)) return path.basename(corpusDir);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { label?: string };
  return manifest.label ?? path.basename(corpusDir);
}

function measureExternalCorpusGraphRefresh(
  corpusDir: string,
  fileLimit: number
): ExternalProductGraphRefreshCorpusReport {
  const filesDir = path.join(corpusDir, "files");
  const label = readExternalCorpusLabel(corpusDir);
  const baseReport = {
    label,
    corpusDir: reportPath(corpusDir),
    filesDir: reportPath(filesDir),
    available: false,
    unavailableReason: null as string | null,
    sourceFileCount: 0,
    measuredFileCount: 0,
    graphFile: null as string | null,
    initialEntryCount: 0,
    repeatEntryCount: 0,
    changedEntryCount: 0,
    changedRepeatEntryCount: 0,
    graphBytes: 0,
    changedFile: null as string | null,
    changedTokenBefore: null as string | null,
    changedTokenAfter: null as string | null,
    unchangedSampleFiles: [] as string[],
    unchangedFilesRetained: false,
    generatedAtInitial: null as string | null,
    generatedAtRepeat: null as string | null,
    generatedAtChanged: null as string | null,
    generatedAtChangedRepeat: null as string | null,
    sameCodeStable: false,
    changedCodeUpdates: false,
    changedRepeatStable: false,
    entryCountStable: false,
    initialTotalMs: 0,
    repeatTotalMs: 0,
    changedFileTransformMs: 0,
    changedRepeatTransformMs: 0,
    changedFileTargetMs: 50,
    pass: false
  };

  if (!fs.existsSync(filesDir)) {
    return { ...baseReport, unavailableReason: "missing external corpus files directory" };
  }

  const source = sourceFiles(filesDir).slice(0, fileLimit);
  if (source.length === 0) {
    return { ...baseReport, unavailableReason: "no TSX/JSX files in external corpus files directory" };
  }

  const refreshRoot = resetTmpSubdir(`external-product-graph-refresh-${safeName(label)}`);
  const sourceRoot = path.join(refreshRoot, "src", "external");
  const graphFile = path.join(refreshRoot, ".intent", "graph.intent.json");
  fs.mkdirSync(sourceRoot, { recursive: true });

  const files = source.map((inputFile, index) => {
    const file = path.join(sourceRoot, `${String(index + 1).padStart(3, "0")}-${path.basename(inputFile)}`);
    const code = fs.readFileSync(inputFile, "utf8");
    return {
      file,
      relativeFile: path.relative(refreshRoot, file).replace(/\\/g, "/"),
      code
    };
  });

  const plugin = intentLayer();
  const configResolved = plugin.configResolved as unknown;
  if (typeof configResolved === "function") {
    (configResolved as (config: { root: string }) => void)({ root: refreshRoot });
  }
  const transform = callableTransform(plugin);

  function sample(file: string, inputCode: string): number {
    fs.writeFileSync(file, inputCode);
    const started = performance.now();
    const transformed = transform(inputCode, file);
    const transformMs = Number((performance.now() - started).toFixed(3));
    if (transformed && typeof (transformed as PromiseLike<unknown>).then === "function") {
      throw new Error("External product graph refresh expected a synchronous transform");
    }
    return transformMs;
  }

  const initialStarted = performance.now();
  for (const item of files) sample(item.file, item.code);
  const initialTotalMs = Number((performance.now() - initialStarted).toFixed(3));
  const initialGraph = readIntentGraph(graphFile);

  const repeatStarted = performance.now();
  for (const item of files) sample(item.file, item.code);
  const repeatTotalMs = Number((performance.now() - repeatStarted).toFixed(3));
  const repeatGraph = readIntentGraph(graphFile);

  const patch = findPatchableGraphToken(initialGraph, files);
  if (!patch) {
    return {
      ...baseReport,
      available: true,
      unavailableReason: "no editable external token with a deterministic replacement was found",
      sourceFileCount: sourceFiles(filesDir).length,
      measuredFileCount: files.length,
      graphFile: reportPath(graphFile),
      initialEntryCount: graphEntryCount(initialGraph),
      repeatEntryCount: graphEntryCount(repeatGraph),
      graphBytes: fs.existsSync(graphFile) ? fs.statSync(graphFile).size : 0,
      generatedAtInitial: initialGraph.generatedAt,
      generatedAtRepeat: repeatGraph.generatedAt,
      sameCodeStable: repeatGraph.generatedAt === initialGraph.generatedAt,
      initialTotalMs,
      repeatTotalMs
    };
  }

  const changedFile = files.find((item) => item.relativeFile === patch.relativeFile);
  if (!changedFile) {
    throw new Error(`Missing changed file for external graph refresh: ${patch.relativeFile}`);
  }
  const changedCode = `${changedFile.code.slice(0, patch.sourceStart)}${patch.nextToken}${changedFile.code.slice(
    patch.sourceEnd
  )}`;
  const changedFileTransformMs = sample(changedFile.file, changedCode);
  const changedGraph = readIntentGraph(graphFile);
  const changedRepeatTransformMs = sample(changedFile.file, changedCode);
  const changedRepeatGraph = readIntentGraph(graphFile);
  const unchangedSampleFiles = files
    .filter((item) => item.relativeFile !== patch.relativeFile)
    .slice(0, 5)
    .map((item) => item.relativeFile);
  const unchangedFilesRetained = unchangedSampleFiles.every(
    (relativeFile) => entryCountForFile(changedGraph, relativeFile) === entryCountForFile(initialGraph, relativeFile)
  );
  const initialEntryCount = graphEntryCount(initialGraph);
  const repeatEntryCount = graphEntryCount(repeatGraph);
  const changedEntryCount = graphEntryCount(changedGraph);
  const changedRepeatEntryCount = graphEntryCount(changedRepeatGraph);
  const sameCodeStable = repeatGraph.generatedAt === initialGraph.generatedAt;
  const changedCodeUpdates = changedGraph.generatedAt !== initialGraph.generatedAt;
  const changedRepeatStable = changedRepeatGraph.generatedAt === changedGraph.generatedAt;
  const entryCountStable =
    repeatEntryCount === initialEntryCount &&
    changedEntryCount === initialEntryCount &&
    changedRepeatEntryCount === initialEntryCount;
  const changedTokenAfter = graphHasFileToken(changedGraph, patch.relativeFile, patch.nextToken)
    ? patch.nextToken
    : null;
  const changedFileTargetMs = 50;

  return {
    ...baseReport,
    available: true,
    sourceFileCount: sourceFiles(filesDir).length,
    measuredFileCount: files.length,
    graphFile: reportPath(graphFile),
    initialEntryCount,
    repeatEntryCount,
    changedEntryCount,
    changedRepeatEntryCount,
    graphBytes: fs.statSync(graphFile).size,
    changedFile: patch.relativeFile,
    changedTokenBefore: patch.oldToken,
    changedTokenAfter,
    unchangedSampleFiles,
    unchangedFilesRetained,
    generatedAtInitial: initialGraph.generatedAt,
    generatedAtRepeat: repeatGraph.generatedAt,
    generatedAtChanged: changedGraph.generatedAt,
    generatedAtChangedRepeat: changedRepeatGraph.generatedAt,
    sameCodeStable,
    changedCodeUpdates,
    changedRepeatStable,
    entryCountStable,
    initialTotalMs,
    repeatTotalMs,
    changedFileTransformMs,
    changedRepeatTransformMs,
    changedFileTargetMs,
    pass:
      initialEntryCount > 0 &&
      patch.oldToken !== patch.nextToken &&
      changedTokenAfter === patch.nextToken &&
      unchangedFilesRetained &&
      sameCodeStable &&
      changedCodeUpdates &&
      changedRepeatStable &&
      entryCountStable &&
      changedFileTransformMs <= changedFileTargetMs
  };
}

function measureExternalProductGraphRefresh(fileLimitPerCorpus: number): ExternalProductGraphRefreshReport {
  const corpusDirs = [
    path.join(rootDir, ".intent", "external-corpus"),
    path.join(rootDir, ".intent", "external-corpus-skateshop"),
    path.join(rootDir, ".intent", "external-corpus-chatbot-ui")
  ];
  const corpora = corpusDirs.map((corpusDir) =>
    measureExternalCorpusGraphRefresh(corpusDir, fileLimitPerCorpus)
  );
  const available = corpora.filter((corpus) => corpus.available);
  const passCount = available.filter((corpus) => corpus.pass).length;

  return {
    fileLimitPerCorpus,
    availableCorpusCount: available.length,
    passCount,
    corpora,
    pass: available.length === 0 ? true : passCount === available.length,
    note:
      available.length === 0
        ? "Optional external graph refresh measurement skipped because no local .intent/external-corpus*/ files were available."
        : "Optional external graph refresh measurement uses local ignored corpus copies and does not commit third-party source."
  };
}

function measureProductMultiFileGraphRefresh(
  fileCount: number,
  cardsPerFile: number
): ProductMultiFileGraphRefreshReport {
  const refreshRoot = resetTmpSubdir("vite-product-multi-file-graph-refresh");
  const sourceDir = path.join(refreshRoot, "src", "screens");
  const graphFile = path.join(refreshRoot, ".intent", "graph.intent.json");
  fs.mkdirSync(sourceDir, { recursive: true });

  const files = Array.from({ length: fileCount }, (_, index) => {
    const file = path.join(sourceDir, `ProductScreen${String(index).padStart(2, "0")}.tsx`);
    return {
      file,
      relativeFile: path.relative(refreshRoot, file).replace(/\\/g, "/"),
      code: productMultiFileFixture(index, cardsPerFile)
    };
  });

  const plugin = intentLayer();
  const configResolved = plugin.configResolved as unknown;

  if (typeof configResolved === "function") {
    (configResolved as (config: { root: string }) => void)({ root: refreshRoot });
  }

  const transformSource = plugin.transform as unknown;
  const transform =
    typeof transformSource === "function"
      ? transformSource
      : transformSource &&
          typeof transformSource === "object" &&
          "handler" in transformSource &&
          typeof (transformSource as { handler?: unknown }).handler === "function"
        ? (transformSource as { handler: unknown }).handler
        : null;

  if (!transform) {
    throw new Error("intentLayer plugin did not expose a callable transform hook");
  }

  function sample(file: string, relativeFile: string, inputCode: string): ProductMultiFileGraphRefreshSample {
    fs.writeFileSync(file, inputCode);
    const started = performance.now();
    const transformed = (transform as (code: string, id: string) => unknown)(inputCode, file);
    const transformMs = Number((performance.now() - started).toFixed(3));

    if (transformed && typeof (transformed as PromiseLike<unknown>).then === "function") {
      throw new Error("Product multi-file graph refresh fixture expected a synchronous transform");
    }

    const graph = fs.existsSync(graphFile) ? readIntentGraph(graphFile) : null;
    return {
      relativeFile,
      transformMs,
      transformReturnedCode: transformed !== null,
      generatedAt: graph?.generatedAt ?? null,
      entries: graph ? graphEntryCount(graph) : 0,
      graphBytes: fs.existsSync(graphFile) ? fs.statSync(graphFile).size : 0
    };
  }

  const initialStarted = performance.now();
  const initialSamples = files.map((item) => sample(item.file, item.relativeFile, item.code));
  const initialTotalMs = Number((performance.now() - initialStarted).toFixed(3));
  const initialGraph = readIntentGraph(graphFile);

  const repeatStarted = performance.now();
  const repeatSamples = files.map((item) => sample(item.file, item.relativeFile, item.code));
  const repeatTotalMs = Number((performance.now() - repeatStarted).toFixed(3));
  const repeatGraph = readIntentGraph(graphFile);

  const changedFileIndex = Math.min(7, files.length - 1);
  const changedFile = files[changedFileIndex];
  const changedCode = changedFile.code.replace(
    "className=\"grid grid-cols-3 gap-4",
    "className=\"grid grid-cols-3 gap-8"
  );
  const changedFileTokenBefore = firstGraphFileToken(
    initialGraph,
    changedFile.relativeFile,
    "gap-4"
  );
  const changedSample = sample(changedFile.file, changedFile.relativeFile, changedCode);
  const changedGraph = readIntentGraph(graphFile);
  const changedRepeatSample = sample(changedFile.file, changedFile.relativeFile, changedCode);
  const changedRepeatGraph = readIntentGraph(graphFile);
  const unchangedSampleFiles = files
    .filter((item) => item.relativeFile !== changedFile.relativeFile)
    .slice(0, 5)
    .map((item) => item.relativeFile);
  const unchangedFilesRetained = unchangedSampleFiles.every((relativeFile) =>
    graphHasFileToken(changedGraph, relativeFile, "gap-4")
  );
  const initialEntryCount = graphEntryCount(initialGraph);
  const repeatEntryCount = graphEntryCount(repeatGraph);
  const changedEntryCount = graphEntryCount(changedGraph);
  const changedRepeatEntryCount = graphEntryCount(changedRepeatGraph);
  const sameCodeStable = repeatGraph.generatedAt === initialGraph.generatedAt;
  const changedCodeUpdates = changedGraph.generatedAt !== initialGraph.generatedAt;
  const changedRepeatStable = changedRepeatGraph.generatedAt === changedGraph.generatedAt;
  const entryCountStable =
    repeatEntryCount === initialEntryCount &&
    changedEntryCount === initialEntryCount &&
    changedRepeatEntryCount === initialEntryCount;
  const changedFileTargetMs = 50;

  return {
    rootDir: reportPath(refreshRoot),
    graphFile: reportPath(graphFile),
    fileCount,
    cardsPerFile,
    expectedEntryCount: initialEntryCount,
    initialEntryCount,
    repeatEntryCount,
    changedEntryCount,
    changedRepeatEntryCount,
    graphBytes: fs.statSync(graphFile).size,
    changedFile: changedFile.relativeFile,
    changedFileTokenBefore,
    changedFileTokenAfter: firstGraphFileToken(changedGraph, changedFile.relativeFile, "gap-8"),
    unchangedSampleFiles,
    unchangedFilesRetained,
    generatedAtInitial: initialGraph.generatedAt,
    generatedAtRepeat: repeatGraph.generatedAt,
    generatedAtChanged: changedGraph.generatedAt,
    generatedAtChangedRepeat: changedRepeatGraph.generatedAt,
    sameCodeStable,
    changedCodeUpdates,
    changedRepeatStable,
    entryCountStable,
    initialSamples,
    repeatSamples,
    changedSample,
    changedRepeatSample,
    initialTotalMs,
    repeatTotalMs,
    changedFileTransformMs: changedSample.transformMs,
    changedRepeatTransformMs: changedRepeatSample.transformMs,
    changedFileTargetMs,
    pass:
      initialEntryCount > 0 &&
      changedFileTokenBefore === "gap-4" &&
      firstGraphFileToken(changedGraph, changedFile.relativeFile, "gap-8") === "gap-8" &&
      unchangedFilesRetained &&
      sameCodeStable &&
      changedCodeUpdates &&
      changedRepeatStable &&
      entryCountStable &&
      changedSample.transformMs <= changedFileTargetMs
  };
}

interface TaskComponentSnapshot {
  file: string;
  componentName: string | null;
  range: {
    start: number;
    end: number;
  };
  excerpt: string;
}

interface TaskRelatedSourceSnapshot {
  file: string;
  kind: string;
  identifier: string;
  range: {
    start: number;
    end: number;
  };
  excerpt: string;
}

interface TaskRelatedDependencySnapshot extends TaskRelatedSourceSnapshot {
  referencedBy?: string;
}

interface TaskExternalImportReference {
  kind: string;
  usageKind: string;
  specifier: string;
  packageName: string;
  subpath: string;
  importKind: string;
  importedName: string;
  localName: string;
  referencedName: string;
  usage: string;
  editable: boolean;
  reason: string;
  guidance: string[];
}

function parseTaskJsonSection<T>(markdown: string, heading: string): T | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## ${escapedHeading}\\s+\`\`\`json\\s+([\\s\\S]*?)\\s+\`\`\``));
  if (!match) return null;

  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const corpus = analyzeClassNames(["fixtures/corpus", "src/App.tsx"], rootDir);
const aiGeneratedCorpus = analyzeClassNames(["fixtures/ai-generated"], rootDir);
const { records: _aiGeneratedCorpusRecords, ...aiGeneratedCorpusSummary } = aiGeneratedCorpus;
const externalCorpusHarnessSourceDir = path.join(tmpDir, "external-corpus-source");
const externalCorpusHarnessOutDir = path.join(tmpDir, "external-corpus-import");
const externalCorpusHarnessReportFile = path.join(tmpDir, "external-corpus-audit.json");
fs.rmSync(externalCorpusHarnessSourceDir, { recursive: true, force: true });
fs.mkdirSync(externalCorpusHarnessSourceDir, { recursive: true });
fs.writeFileSync(
  path.join(externalCorpusHarnessSourceDir, "ExternalDashboard.tsx"),
  [
    "export function ExternalDashboard() {",
    "  return (",
    "    <section className=\"grid grid-cols-3 gap-4 rounded-xl bg-white p-6 shadow-sm\">",
    "      <article className=\"flex flex-col gap-2 rounded-lg border border-slate-200 p-4\">One</article>",
    "      <article className=\"flex flex-col gap-2 rounded-lg border border-slate-200 p-4\">Two</article>",
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n")
);
fs.writeFileSync(
  path.join(externalCorpusHarnessSourceDir, "ExternalCn.tsx"),
  [
    "declare function cn(...value: Array<string | false | undefined>): string;",
    "",
    "export function ExternalCn({ active = false }: { active?: boolean }) {",
    "  return <button className={cn(\"rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white\", active && \"ring-2 ring-teal-300\")}>Run</button>;",
    "}",
    ""
  ].join("\n")
);
fs.writeFileSync(
  path.join(externalCorpusHarnessSourceDir, "ExternalReadonly.tsx"),
  [
    "const shellClass = \"rounded-xl border border-slate-200 bg-white p-5\";",
    "",
    "export function ExternalReadonly() {",
    "  return (",
    "    <section className={shellClass}>",
    "      <p className=\"text-sm leading-6 text-slate-600\">Static fallback still counts.</p>",
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n")
);
fs.writeFileSync(
  path.join(externalCorpusHarnessSourceDir, "ExternalExample.stories.tsx"),
  [
    "export function ExternalExampleStory() {",
    "  return <div className=\"p-4\">Story files are skipped by default.</div>;",
    "}",
    ""
  ].join("\n")
);
const externalCorpusHarnessImport = runCommand(
  localTsxCommand(),
  [
    "scripts/import-external-corpus.ts",
    path.relative(rootDir, externalCorpusHarnessSourceDir),
    "--out",
    path.relative(rootDir, externalCorpusHarnessOutDir),
    "--report",
    path.relative(rootDir, externalCorpusHarnessReportFile),
    "--label",
    "eval-external-corpus-harness",
    "--sample-source",
    "local-smoke-fixture",
    "--limit",
    String(externalCorpusHarnessMinFiles),
    "--min-files",
    String(externalCorpusHarnessMinFiles),
    "--min-supported-direct",
    String(externalCorpusHarnessCoverageTarget),
    "--fail-on-gate"
  ],
  rootDir
);
const externalCorpusHarnessReport = fs.existsSync(externalCorpusHarnessReportFile)
  ? JSON.parse(fs.readFileSync(externalCorpusHarnessReportFile, "utf8")) as {
      available?: boolean;
      sample?: {
        label?: string;
        sourceKind?: string;
        independent?: boolean;
        localSmokeFixture?: boolean;
        generatedFixture?: boolean;
      };
      selectedFileCount?: number;
      skipped?: Record<string, number>;
      gates?: {
        minFilesPass?: boolean;
        staticAndSimpleCoveragePass?: boolean;
        supportedDirectCoveragePass?: boolean;
        allObservedCoveragePass?: boolean;
      };
      analysis?: {
        filesScanned?: number;
        classNameOccurrences?: number;
        editableCoverage?: {
          staticAndSimpleCnClsx?: number;
          supportedDirect?: number;
          allObservedTokens?: number;
        };
      };
      summary?: {
        readOnlyClassNameRatio?: number;
        editableTokenCoverage?: number;
        topUnsupportedReasons?: Array<{ reason?: string; count?: number }>;
      };
      gateFailures?: Array<unknown>;
      mvpEvidence?: {
        usableAsMvpEvidence?: boolean;
        decision?: string;
      };
      targets?: {
        minFiles?: number;
        editableCoverage?: number;
        mvpIndependentFiles?: number;
      };
      filesDir?: string;
      manifestFile?: string;
    }
  : null;

const transformIterations = 5;
const warmTransformTargetMs = 5;
const coldTransformTargetMs = 10;
const transformMeasurements = sourceFiles("src")
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => {
    const code = fs.readFileSync(file, "utf8");
    const cold = instrumentSource({ code, file, rootDir });
    const warmups = Array.from({ length: 2 }, () => instrumentSource({ code, file, rootDir }));
    const samples = Array.from({ length: transformIterations }, () =>
      instrumentSource({ code, file, rootDir })
    );
    const times = samples.map((sample) => sample.transformMs);
    const last = samples[samples.length - 1];
    return {
      file: path.relative(rootDir, file).replace(/\\/g, "/"),
      entries: last.entries.length,
      coldMs: cold.transformMs,
      warmupSamples: warmups.map((sample) => sample.transformMs),
      samples: times,
      averageMs: average(times),
      p95Ms: percentile(times, 0.95),
      maxMs: Number(Math.max(...times).toFixed(3))
    };
  });

const transformTimes = transformMeasurements.flatMap((item) => item.samples);
const coldTransformTimes = transformMeasurements.map((item) => item.coldMs);
const largeTransformCardCount = 100;
const largeTransformIterations = 20;
const largeColdTransformTargetMs = 40;
const largeWarmTransformTargetMs = 20;
const largeTransformFile = path.join(tmpDir, "LargeTransformFixture.tsx");
const largeTransformCode = largeTransformFixture(largeTransformCardCount);
fs.writeFileSync(largeTransformFile, largeTransformCode);
const largeColdTransform = instrumentSource({ code: largeTransformCode, file: largeTransformFile, rootDir });
const largeWarmupTransforms = Array.from({ length: 2 }, () =>
  instrumentSource({ code: largeTransformCode, file: largeTransformFile, rootDir })
);
const largeTransformSamples = Array.from({ length: largeTransformIterations }, () =>
  instrumentSource({ code: largeTransformCode, file: largeTransformFile, rootDir })
);
const largeTransformTimes = largeTransformSamples.map((sample) => sample.transformMs);
const largeTransformP95Ms = percentile(largeTransformTimes, 0.95);
const largeTransformLast = largeTransformSamples[largeTransformSamples.length - 1];
const productGraphWriteThrottle = measureProductGraphWriteThrottle(
  largeTransformCode,
  largeTransformCardCount
);
const productMultiFileGraphRefresh = measureProductMultiFileGraphRefresh(24, 6);
const externalProductGraphRefresh = measureExternalProductGraphRefresh(24);

const patchFixture = path.join(tmpDir, "StaticPatchFixture.tsx");
fs.writeFileSync(
  patchFixture,
  [
    "export function StaticPatchFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Patch target</div>;",
    "}",
    ""
  ].join("\n")
);

const patchInstrument = instrumentSource({
  code: fs.readFileSync(patchFixture, "utf8"),
  file: patchFixture,
  rootDir
});
const patchEntry = patchInstrument.entries[0];

const previewStarted = performance.now();
const preview = planTokenPatch(patchEntry, {
  id: patchEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceStart,
  sourceEnd: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceEnd
});
const previewRoundTripMs = Number((performance.now() - previewStarted).toFixed(3));

const apply = applyTokenPatch(rootDir, patchEntry, {
  id: patchEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceStart,
  sourceEnd: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceEnd
});

const syntaxErrorsAfterPatch = parseSyntaxErrorCount(patchFixture);
const revert = revertTokenPatch(rootDir, apply.ok ? apply : null, patchEntry);
const syntaxErrorsAfterRevert = parseSyntaxErrorCount(patchFixture);
const agentTask = createAgentTask(rootDir, patchEntry, {
  id: patchEntry.id,
  desiredChange: "Increase the selected grid radius and padding, then document the result as a semantic intent diff."
});
const agentTaskMarkdown = agentTask.ok ? agentTask.markdown : "";
const agentTaskRequiredSections = [
  "## Goal",
  "## Selected Component",
  "## Current Intent Document",
  "## Component Snapshot",
  "## Related Source Snapshot",
  "## External Import Reference",
  "## Source Snapshot",
  "## Desired Change",
  "## Constraints",
  "## Files That May Be Edited",
  "## Files That Should Not Be Edited",
  "## Required Checks"
];
const agentTaskSectionsPresent = agentTaskRequiredSections.every((section) =>
  agentTaskMarkdown.includes(section)
);
if (agentTask.ok) {
  fs.writeFileSync(
    patchFixture,
    fs
      .readFileSync(patchFixture, "utf8")
      .replace("rounded-lg p-6", "rounded-xl p-8")
      .replace("Patch target", "Patch target with semantic className change")
  );
}
const agentResult = recordAgentResult(rootDir, patchEntry, {
  id: patchEntry.id,
  taskFile: agentTask.ok ? agentTask.taskFile : undefined,
  summary:
    "Agent result fixture: increased radius and padding on the selected grid without making an unrelated source rewrite.",
  changedFiles: [path.relative(rootDir, patchFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes: "Evaluation fixture only; no LLM call is made."
});
const agentResultMarkdown = agentResult.ok ? agentResult.markdown : "";
const agentTaskMetadataAfterResult =
  agentTask.ok ? readAgentTaskMetadata(rootDir, agentTask.taskFile)?.metadata ?? null : null;
const agentResultRequiredSections = [
  "## Summary",
  "## Source Binding",
  "## Task",
  "## Changed Files",
  "## Checks",
  "## Source Diff",
  "## Semantic Intent Diff",
  "## Related Source Diff",
  "## Related Semantic Intent Diff",
  "## Component Source Diff",
  "## Component Semantic Intent Diff",
  "## Intent Diff"
];
const agentResultSectionsPresent = agentResultRequiredSections.every((section) =>
  agentResultMarkdown.includes(section)
);
const agentResultFilesExist =
  agentResult.ok && fs.existsSync(agentResult.resultFile) && fs.existsSync(agentResult.diffFile);

const componentSnapshotFixtureCases = [
  {
    name: "function-nested-map-conditional-fragment",
    componentName: "ComponentSnapshotFunction",
    expectedMarkers: ["export function ComponentSnapshotFunction", "items.map", "<>", "active ?"],
    source: [
      "export function ComponentSnapshotFunction({ active, items }: { active: boolean; items: string[] }) {",
      "  return (",
      "    <>",
      "      <section className=\"grid grid-cols-2 gap-4 rounded-lg p-6\">",
      "        {items.map((item) => (",
      "          <article key={item} className={active ? \"rounded-lg p-4\" : \"rounded-xl p-6\"}>",
      "            <span className=\"text-sm font-medium\">{item}</span>",
      "          </article>",
      "        ))}",
      "      </section>",
      "    </>",
      "  );",
      "}",
      ""
    ].join("\n")
  },
  {
    name: "arrow-block",
    componentName: "ComponentSnapshotArrowBlock",
    expectedMarkers: ["export const ComponentSnapshotArrowBlock", "return (", "items.map"],
    source: [
      "export const ComponentSnapshotArrowBlock = ({ items }: { items: string[] }) => {",
      "  return (",
      "    <section className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">",
      "      {items.map((item) => <article key={item} className=\"rounded-lg p-4\">{item}</article>)}",
      "    </section>",
      "  );",
      "};",
      ""
    ].join("\n")
  },
  {
    name: "arrow-parenthesized-expression",
    componentName: "ComponentSnapshotArrowParen",
    expectedMarkers: ["export const ComponentSnapshotArrowParen", "<section", "</section>"],
    source: [
      "export const ComponentSnapshotArrowParen = ({ active }: { active: boolean }) => (",
      "  <section className=\"grid gap-4 rounded-lg p-6\">",
      "    {active ? <article className=\"rounded-lg p-4\">Active</article> : null}",
      "  </section>",
      ");",
      ""
    ].join("\n")
  },
  {
    name: "arrow-jsx-no-parens",
    componentName: "ComponentSnapshotArrowJsx",
    expectedMarkers: ["export const ComponentSnapshotArrowJsx", "<section", "No parens"],
    source: [
      "export const ComponentSnapshotArrowJsx = () => <section className=\"grid gap-4 rounded-lg p-6\">No parens</section>;",
      ""
    ].join("\n")
  },
  {
    name: "memo-wrapped-function",
    componentName: "ComponentSnapshotMemo",
    expectedMarkers: ["export const ComponentSnapshotMemo", "memo(function", "<section", "Memo"],
    source: [
      "export const ComponentSnapshotMemo = memo(function ComponentSnapshotMemoInner({ active }: { active: boolean }) {",
      "  return (",
      "    <section className={active ? \"grid gap-4 rounded-lg p-6\" : \"grid gap-6 rounded-xl p-8\"}>",
      "      Memo",
      "    </section>",
      "  );",
      "});",
      ""
    ].join("\n")
  },
  {
    name: "forward-ref-wrapped-function",
    componentName: "ComponentSnapshotForwardRef",
    expectedMarkers: ["export const ComponentSnapshotForwardRef", "forwardRef", "ref={ref}", "<section"],
    source: [
      "export const ComponentSnapshotForwardRef = forwardRef<HTMLDivElement, { active: boolean }>(function ComponentSnapshotForwardRefInner(",
      "  { active },",
      "  ref",
      ") {",
      "  return (",
      "    <section ref={ref} className={active ? \"grid gap-4 rounded-lg p-6\" : \"grid gap-6 rounded-xl p-8\"}>",
      "      Forward ref",
      "    </section>",
      "  );",
      "});",
      ""
    ].join("\n")
  },
  {
    name: "hoc-wrapped-function",
    componentName: "ComponentSnapshotHoc",
    expectedMarkers: ["export const ComponentSnapshotHoc", "withPanel(function", "items.map", "<section"],
    source: [
      "export const ComponentSnapshotHoc = withPanel(function ComponentSnapshotHocInner({ items }: { items: string[] }) {",
      "  return (",
      "    <section className=\"grid grid-cols-2 gap-4 rounded-lg p-6\">",
      "      {items.map((item) => <article key={item} className=\"rounded-lg p-4\">{item}</article>)}",
      "    </section>",
      "  );",
      "});",
      ""
    ].join("\n")
  },
  {
    name: "namespace-object-export",
    componentName: "ComponentSnapshotNamespace",
    expectedMarkers: ["export const ComponentSnapshotNamespace", "Card:", "Empty:", "<section"],
    source: [
      "export const ComponentSnapshotNamespace = {",
      "  Card: ({ active }: { active: boolean }) => (",
      "    <section className={active ? \"grid gap-4 rounded-lg p-6\" : \"grid gap-6 rounded-xl p-8\"}>",
      "      Namespace card",
      "    </section>",
      "  ),",
      "  Empty: () => null",
      "};",
      ""
    ].join("\n")
  }
];

const componentSnapshotFixtures = componentSnapshotFixtureCases.map((fixtureCase) => {
  const file = path.join(tmpDir, `${fixtureCase.componentName}.tsx`);
  fs.writeFileSync(file, fixtureCase.source);
  const instrumented = instrumentSource({
    code: fixtureCase.source,
    file,
    rootDir
  });
  const entry = instrumented.entries.find((candidate) => candidate.componentName === fixtureCase.componentName);
  const task = createAgentTask(rootDir, entry, {
    id: entry?.id ?? `missing-${fixtureCase.name}`,
    desiredChange: `Fixture only: capture component snapshot for ${fixtureCase.name}.`
  });
  const snapshot = task.ok
    ? parseTaskJsonSection<TaskComponentSnapshot | null>(task.markdown, "Component Snapshot")
    : null;
  const markersPresent = fixtureCase.expectedMarkers.every((marker) =>
    snapshot?.excerpt.includes(marker)
  );

  return {
    name: fixtureCase.name,
    componentName: fixtureCase.componentName,
    entryCreated: Boolean(entry),
    entryCount: instrumented.entries.length,
    taskOk: task.ok,
    taskMs: task.ok ? task.metrics.taskMs : task.metrics?.taskMs,
    snapshotAvailable: Boolean(snapshot),
    snapshotComponentName: snapshot?.componentName ?? null,
    markersPresent,
    pass:
      Boolean(entry) &&
      task.ok &&
      Boolean(snapshot) &&
      snapshot?.componentName === fixtureCase.componentName &&
      markersPresent
  };
});
const componentSnapshotFixturePassCount = componentSnapshotFixtures.filter((fixture) => fixture.pass).length;

const readOnlyFixture = path.join(tmpDir, "ReadOnlyBindingFixture.tsx");
fs.writeFileSync(
  readOnlyFixture,
  [
    "const cardClass = \"grid grid-cols-3 gap-4 rounded-lg p-6\";",
    "export function ReadOnlyBindingFixture() {",
    "  return <div className={cardClass}>Read-only target</div>;",
    "}",
    ""
  ].join("\n")
);

const readOnlyInstrument = instrumentSource({
  code: fs.readFileSync(readOnlyFixture, "utf8"),
  file: readOnlyFixture,
  rootDir
});
const readOnlyEntry = readOnlyInstrument.entries[0];
const readOnlyTask = createAgentTask(rootDir, readOnlyEntry, {
  id: readOnlyEntry?.id ?? "missing-read-only-binding",
  desiredChange: "Change this variable-backed className through an agent handoff."
});
if (readOnlyTask.ok) {
  fs.writeFileSync(
    readOnlyFixture,
    fs
      .readFileSync(readOnlyFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
  );
}
const readOnlySyntaxErrorsAfterResult = parseSyntaxErrorCount(readOnlyFixture);
const readOnlyResult = recordAgentResult(rootDir, readOnlyEntry, {
  id: readOnlyEntry?.id ?? "missing-read-only-binding",
  taskFile: readOnlyTask.ok ? readOnlyTask.taskFile : undefined,
  summary:
    "Read-only fixture: updated the variable-backed className through an agent handoff result.",
  changedFiles: [path.relative(rootDir, readOnlyFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes: "Evaluation fixture for related source diff; no LLM call is made."
});

const readOnlyCnVariableFixture = path.join(tmpDir, "ReadOnlyCnVariableFixture.tsx");
fs.writeFileSync(
  readOnlyCnVariableFixture,
  [
    "declare function cn(...value: Array<string | false>): string;",
    "export function ReadOnlyCnVariableFixture({ active }: { active: boolean }) {",
    "  const cardClass = cn(\"grid grid-cols-3 gap-4 rounded-lg p-6\", active && \"bg-teal-50\");",
    "  return <div className={cardClass}>Read-only cn variable target</div>;",
    "}",
    ""
  ].join("\n")
);

const readOnlyCnVariableInstrument = instrumentSource({
  code: fs.readFileSync(readOnlyCnVariableFixture, "utf8"),
  file: readOnlyCnVariableFixture,
  rootDir
});
const readOnlyCnVariableEntry = readOnlyCnVariableInstrument.entries[0];
const readOnlyCnVariableTask = createAgentTask(rootDir, readOnlyCnVariableEntry, {
  id: readOnlyCnVariableEntry?.id ?? "missing-read-only-cn-variable-binding",
  desiredChange: "Change this cn-backed variable className through an agent handoff."
});
if (readOnlyCnVariableTask.ok) {
  fs.writeFileSync(
    readOnlyCnVariableFixture,
    fs
      .readFileSync(readOnlyCnVariableFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
      .replace("bg-teal-50", "bg-cyan-50")
  );
}
const readOnlyCnVariableSyntaxErrorsAfterResult = parseSyntaxErrorCount(readOnlyCnVariableFixture);
const readOnlyCnVariableResult = recordAgentResult(rootDir, readOnlyCnVariableEntry, {
  id: readOnlyCnVariableEntry?.id ?? "missing-read-only-cn-variable-binding",
  taskFile: readOnlyCnVariableTask.ok ? readOnlyCnVariableTask.taskFile : undefined,
  summary:
    "Read-only cn variable fixture: updated literal segments through an agent handoff result.",
  changedFiles: [path.relative(rootDir, readOnlyCnVariableFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes: "Evaluation fixture for related source semantic diff across cn literal segments; no LLM call is made."
});

const readOnlyCompositeVariableFixture = path.join(tmpDir, "ReadOnlyCompositeVariableFixture.tsx");
fs.writeFileSync(
  readOnlyCompositeVariableFixture,
  [
    "export function ReadOnlyCompositeVariableFixture({ active }: { active: boolean }) {",
    "  const cardClass = [",
    "    \"grid grid-cols-3 gap-4 rounded-lg p-6\",",
    "    active ? \"bg-teal-50\" : \"bg-slate-50\",",
    "    {",
    "      active: \"border-teal-200\",",
    "      muted: \"border-slate-200\"",
    "    }[active ? \"active\" : \"muted\"],",
    "    `text-sm ${active ? \"text-teal-700\" : \"text-slate-600\"}`",
    "  ].join(\" \");",
    "  return <div className={cardClass}>Read-only composite variable target</div>;",
    "}",
    ""
  ].join("\n")
);

const readOnlyCompositeVariableInstrument = instrumentSource({
  code: fs.readFileSync(readOnlyCompositeVariableFixture, "utf8"),
  file: readOnlyCompositeVariableFixture,
  rootDir
});
const readOnlyCompositeVariableEntry = readOnlyCompositeVariableInstrument.entries[0];
const readOnlyCompositeVariableTask = createAgentTask(rootDir, readOnlyCompositeVariableEntry, {
  id: readOnlyCompositeVariableEntry?.id ?? "missing-read-only-composite-variable-binding",
  desiredChange: "Change this array/object/template variable className through an agent handoff."
});
if (readOnlyCompositeVariableTask.ok) {
  fs.writeFileSync(
    readOnlyCompositeVariableFixture,
    fs
      .readFileSync(readOnlyCompositeVariableFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
      .replace("bg-teal-50", "bg-cyan-50")
      .replace("border-teal-200", "border-cyan-200")
      .replace("text-teal-700", "text-cyan-700")
  );
}
const readOnlyCompositeVariableSyntaxErrorsAfterResult = parseSyntaxErrorCount(
  readOnlyCompositeVariableFixture
);
const readOnlyCompositeVariableResult = recordAgentResult(rootDir, readOnlyCompositeVariableEntry, {
  id: readOnlyCompositeVariableEntry?.id ?? "missing-read-only-composite-variable-binding",
  taskFile: readOnlyCompositeVariableTask.ok ? readOnlyCompositeVariableTask.taskFile : undefined,
  summary:
    "Read-only composite variable fixture: updated array, object map, and template literal segments.",
  changedFiles: [path.relative(rootDir, readOnlyCompositeVariableFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes:
    "Evaluation fixture for related source semantic diff across arrays, object maps, and template literals; no LLM call is made."
});

const crossVariableDependencyFixture = path.join(tmpDir, "CrossVariableDependencyFixture.tsx");
fs.writeFileSync(
  crossVariableDependencyFixture,
  [
    "declare function cn(...value: Array<string | false>): string;",
    "const baseCardClass = \"grid grid-cols-3 gap-4 rounded-lg p-6\";",
    "const toneClass = \"bg-teal-50 text-teal-700\";",
    "const cardClass = cn(baseCardClass, toneClass);",
    "",
    "export function CrossVariableDependencyFixture() {",
    "  return <section className={cardClass}>Cross-variable dependency target</section>;",
    "}",
    ""
  ].join("\n")
);

const crossVariableDependencyInstrument = instrumentSource({
  code: fs.readFileSync(crossVariableDependencyFixture, "utf8"),
  file: crossVariableDependencyFixture,
  rootDir
});
const crossVariableDependencyEntry = crossVariableDependencyInstrument.entries[0];
const crossVariableDependencyTask = createAgentTask(rootDir, crossVariableDependencyEntry, {
  id: crossVariableDependencyEntry?.id ?? "missing-cross-variable-dependency-binding",
  desiredChange:
    "Change this className whose handoff variable depends on sibling class variables."
});
const crossVariableDependencySnapshots = crossVariableDependencyTask.ok
  ? parseTaskJsonSection<TaskRelatedDependencySnapshot[] | null>(
      crossVariableDependencyTask.markdown,
      "Related Dependency Snapshots"
    ) ?? []
  : [];
if (crossVariableDependencyTask.ok) {
  fs.writeFileSync(
    crossVariableDependencyFixture,
    fs
      .readFileSync(crossVariableDependencyFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
      .replace("bg-teal-50 text-teal-700", "bg-cyan-50 text-cyan-700")
  );
}
const crossVariableDependencySyntaxErrorsAfterResult = parseSyntaxErrorCount(
  crossVariableDependencyFixture
);
const crossVariableDependencyResult = recordAgentResult(rootDir, crossVariableDependencyEntry, {
  id: crossVariableDependencyEntry?.id ?? "missing-cross-variable-dependency-binding",
  taskFile: crossVariableDependencyTask.ok ? crossVariableDependencyTask.taskFile : undefined,
  summary:
    "Cross-variable dependency fixture: updated sibling variables referenced by the related className declaration.",
  changedFiles: [path.relative(rootDir, crossVariableDependencyFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes:
    "Evaluation fixture for one-hop same-file dependency handoff context; no LLM call is made."
});

const importedVariableRoot = resetTmpSubdir("imported-variable-handoff");
const importedVariableStylesDir = path.join(importedVariableRoot, "src", "styles");
const importedVariableThemeDir = path.join(importedVariableRoot, "src", "theme");
const importedVariableScreensDir = path.join(importedVariableRoot, "src", "screens");
fs.mkdirSync(importedVariableStylesDir, { recursive: true });
fs.mkdirSync(importedVariableThemeDir, { recursive: true });
fs.mkdirSync(importedVariableScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(importedVariableRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"]
        }
      }
    },
    null,
    2
  )}\n`
);
const importedVariableDefinitionFixture = path.join(importedVariableStylesDir, "cardClass.ts");
fs.writeFileSync(
  importedVariableDefinitionFixture,
  [
    "export const cardClass = \"grid grid-cols-3 gap-4 rounded-lg bg-white p-6 shadow-sm\";",
    ""
  ].join("\n")
);
const importedVariableStylesIndexFixture = path.join(importedVariableStylesDir, "index.ts");
fs.writeFileSync(importedVariableStylesIndexFixture, "export { cardClass } from \"./cardClass\";\n");
const importedVariableThemeIndexFixture = path.join(importedVariableThemeDir, "index.ts");
fs.writeFileSync(importedVariableThemeIndexFixture, "export { cardClass } from \"../styles\";\n");
const importedVariableHandoffFixture = path.join(
  importedVariableScreensDir,
  "ImportedVariableHandoffFixture.tsx"
);
fs.writeFileSync(
  importedVariableHandoffFixture,
  [
    "import { cardClass as shellClass } from \"@/theme\";",
    "",
    "export function ImportedVariableHandoffFixture() {",
    "  return <article className={shellClass}>Imported variable handoff target</article>;",
    "}",
    ""
  ].join("\n")
);
const importedVariableHandoffInstrument = instrumentSource({
  code: fs.readFileSync(importedVariableHandoffFixture, "utf8"),
  file: importedVariableHandoffFixture,
  rootDir: importedVariableRoot
});
const importedVariableHandoffEntry = importedVariableHandoffInstrument.entries[0];
const importedVariableHandoffTask = createAgentTask(
  importedVariableRoot,
  importedVariableHandoffEntry,
  {
    id: importedVariableHandoffEntry?.id ?? "missing-imported-variable-handoff-binding",
    desiredChange: "Change this imported variable-backed className through an agent handoff."
  }
);
const importedVariableHandoffRelatedSnapshot = importedVariableHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      importedVariableHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (importedVariableHandoffTask.ok) {
  fs.writeFileSync(
    importedVariableDefinitionFixture,
    fs
      .readFileSync(importedVariableDefinitionFixture, "utf8")
      .replace(
        "grid grid-cols-3 gap-4 rounded-lg bg-white p-6 shadow-sm",
        "grid grid-cols-2 gap-6 rounded-xl bg-slate-50 p-8 shadow-md"
      )
  );
}
const importedVariableHandoffSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(importedVariableDefinitionFixture) +
  parseSyntaxErrorCount(importedVariableStylesIndexFixture) +
  parseSyntaxErrorCount(importedVariableThemeIndexFixture) +
  parseSyntaxErrorCount(importedVariableHandoffFixture);
const importedVariableHandoffResult = recordAgentResult(
  importedVariableRoot,
  importedVariableHandoffEntry,
  {
    id: importedVariableHandoffEntry?.id ?? "missing-imported-variable-handoff-binding",
    taskFile: importedVariableHandoffTask.ok ? importedVariableHandoffTask.taskFile : undefined,
    summary:
      "Imported variable handoff fixture: updated the related className variable behind an alias and multi-hop barrel chain.",
    changedFiles: ["src/styles/cardClass.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for imported variable related source handoff context; no LLM call is made."
  }
);

const importedVariableDependencyRoot = resetTmpSubdir("imported-variable-dependency-handoff");
const importedVariableDependencyStylesDir = path.join(
  importedVariableDependencyRoot,
  "src",
  "styles"
);
const importedVariableDependencyThemeDir = path.join(
  importedVariableDependencyRoot,
  "src",
  "theme"
);
const importedVariableDependencyScreensDir = path.join(
  importedVariableDependencyRoot,
  "src",
  "screens"
);
fs.mkdirSync(importedVariableDependencyStylesDir, { recursive: true });
fs.mkdirSync(importedVariableDependencyThemeDir, { recursive: true });
fs.mkdirSync(importedVariableDependencyScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(importedVariableDependencyRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"]
        }
      }
    },
    null,
    2
  )}\n`
);
const importedVariableDependencyDefinitionFixture = path.join(
  importedVariableDependencyStylesDir,
  "cardClass.ts"
);
fs.writeFileSync(
  importedVariableDependencyDefinitionFixture,
  [
    "export const baseCardClass = \"grid grid-cols-3 gap-4 rounded-lg p-6\";",
    "export const toneClass = \"bg-white text-slate-700 shadow-sm\";",
    "export const cardClass = cn(baseCardClass, toneClass, \"border border-slate-200\");",
    ""
  ].join("\n")
);
const importedVariableDependencyStylesIndexFixture = path.join(
  importedVariableDependencyStylesDir,
  "index.ts"
);
fs.writeFileSync(
  importedVariableDependencyStylesIndexFixture,
  "export { cardClass } from \"./cardClass\";\n"
);
const importedVariableDependencyThemeIndexFixture = path.join(
  importedVariableDependencyThemeDir,
  "index.ts"
);
fs.writeFileSync(
  importedVariableDependencyThemeIndexFixture,
  "export { cardClass } from \"../styles\";\n"
);
const importedVariableDependencyHandoffFixture = path.join(
  importedVariableDependencyScreensDir,
  "ImportedVariableDependencyHandoffFixture.tsx"
);
fs.writeFileSync(
  importedVariableDependencyHandoffFixture,
  [
    "import { cardClass as shellClass } from \"@/theme\";",
    "",
    "export function ImportedVariableDependencyHandoffFixture() {",
    "  return <article className={shellClass}>Imported variable dependency handoff target</article>;",
    "}",
    ""
  ].join("\n")
);
const importedVariableDependencyHandoffInstrument = instrumentSource({
  code: fs.readFileSync(importedVariableDependencyHandoffFixture, "utf8"),
  file: importedVariableDependencyHandoffFixture,
  rootDir: importedVariableDependencyRoot
});
const importedVariableDependencyHandoffEntry =
  importedVariableDependencyHandoffInstrument.entries[0];
const importedVariableDependencyHandoffTask = createAgentTask(
  importedVariableDependencyRoot,
  importedVariableDependencyHandoffEntry,
  {
    id:
      importedVariableDependencyHandoffEntry?.id ??
      "missing-imported-variable-dependency-handoff-binding",
    desiredChange:
      "Change this imported variable-backed className by editing its source dependency variables."
  }
);
const importedVariableDependencyRelatedSnapshot = importedVariableDependencyHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      importedVariableDependencyHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
const importedVariableDependencySnapshots = importedVariableDependencyHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedDependencySnapshot[] | null>(
      importedVariableDependencyHandoffTask.markdown,
      "Related Dependency Snapshots"
    ) ?? []
  : [];
if (importedVariableDependencyHandoffTask.ok) {
  fs.writeFileSync(
    importedVariableDependencyDefinitionFixture,
    fs
      .readFileSync(importedVariableDependencyDefinitionFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-2 gap-6 rounded-xl p-8")
      .replace("bg-white text-slate-700 shadow-sm", "bg-cyan-50 text-cyan-700 shadow-md")
  );
}
const importedVariableDependencySyntaxErrorsAfterResult =
  parseSyntaxErrorCount(importedVariableDependencyDefinitionFixture) +
  parseSyntaxErrorCount(importedVariableDependencyStylesIndexFixture) +
  parseSyntaxErrorCount(importedVariableDependencyThemeIndexFixture) +
  parseSyntaxErrorCount(importedVariableDependencyHandoffFixture);
const importedVariableDependencyHandoffResult = recordAgentResult(
  importedVariableDependencyRoot,
  importedVariableDependencyHandoffEntry,
  {
    id:
      importedVariableDependencyHandoffEntry?.id ??
      "missing-imported-variable-dependency-handoff-binding",
    taskFile: importedVariableDependencyHandoffTask.ok
      ? importedVariableDependencyHandoffTask.taskFile
      : undefined,
    summary:
      "Imported variable dependency handoff fixture: updated dependency variables behind an imported related className declaration.",
    changedFiles: ["src/styles/cardClass.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for imported variable one-hop dependency handoff context; no LLM call is made."
  }
);

const transitiveDependencyRoot = resetTmpSubdir("transitive-dependency-handoff");
const transitiveDependencyStylesDir = path.join(transitiveDependencyRoot, "src", "styles");
const transitiveDependencyTokensDir = path.join(transitiveDependencyRoot, "src", "tokens");
const transitiveDependencyThemeDir = path.join(transitiveDependencyRoot, "src", "theme");
const transitiveDependencyScreensDir = path.join(transitiveDependencyRoot, "src", "screens");
fs.mkdirSync(transitiveDependencyStylesDir, { recursive: true });
fs.mkdirSync(transitiveDependencyTokensDir, { recursive: true });
fs.mkdirSync(transitiveDependencyThemeDir, { recursive: true });
fs.mkdirSync(transitiveDependencyScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(transitiveDependencyRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"]
        }
      }
    },
    null,
    2
  )}\n`
);
const transitiveDependencyTokensFixture = path.join(
  transitiveDependencyTokensDir,
  "cardTokens.ts"
);
fs.writeFileSync(
  transitiveDependencyTokensFixture,
  [
    "export const baseCardClass = \"grid grid-cols-3 gap-4 rounded-lg p-6\";",
    "export const toneClass = \"bg-white text-slate-700 shadow-sm\";",
    ""
  ].join("\n")
);
const transitiveDependencyDefinitionFixture = path.join(
  transitiveDependencyStylesDir,
  "cardClass.ts"
);
fs.writeFileSync(
  transitiveDependencyDefinitionFixture,
  [
    "import { baseCardClass, toneClass as importedToneClass } from \"@/tokens/cardTokens\";",
    "",
    "export const cardClass = cn(baseCardClass, importedToneClass, \"border border-slate-200\");",
    ""
  ].join("\n")
);
const transitiveDependencyStylesIndexFixture = path.join(
  transitiveDependencyStylesDir,
  "index.ts"
);
fs.writeFileSync(transitiveDependencyStylesIndexFixture, "export { cardClass } from \"./cardClass\";\n");
const transitiveDependencyThemeIndexFixture = path.join(
  transitiveDependencyThemeDir,
  "index.ts"
);
fs.writeFileSync(transitiveDependencyThemeIndexFixture, "export { cardClass } from \"../styles\";\n");
const transitiveDependencyHandoffFixture = path.join(
  transitiveDependencyScreensDir,
  "TransitiveDependencyHandoffFixture.tsx"
);
fs.writeFileSync(
  transitiveDependencyHandoffFixture,
  [
    "import { cardClass as shellClass } from \"@/theme\";",
    "",
    "export function TransitiveDependencyHandoffFixture() {",
    "  return <article className={shellClass}>Transitive dependency handoff target</article>;",
    "}",
    ""
  ].join("\n")
);
const transitiveDependencyHandoffInstrument = instrumentSource({
  code: fs.readFileSync(transitiveDependencyHandoffFixture, "utf8"),
  file: transitiveDependencyHandoffFixture,
  rootDir: transitiveDependencyRoot
});
const transitiveDependencyHandoffEntry = transitiveDependencyHandoffInstrument.entries[0];
const transitiveDependencyHandoffTask = createAgentTask(
  transitiveDependencyRoot,
  transitiveDependencyHandoffEntry,
  {
    id:
      transitiveDependencyHandoffEntry?.id ??
      "missing-transitive-dependency-handoff-binding",
    desiredChange:
      "Change this imported className by editing dependency variables imported by its source declaration."
  }
);
const transitiveDependencyRelatedSnapshot = transitiveDependencyHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      transitiveDependencyHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
const transitiveDependencySnapshots = transitiveDependencyHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedDependencySnapshot[] | null>(
      transitiveDependencyHandoffTask.markdown,
      "Related Dependency Snapshots"
    ) ?? []
  : [];
if (transitiveDependencyHandoffTask.ok) {
  fs.writeFileSync(
    transitiveDependencyTokensFixture,
    fs
      .readFileSync(transitiveDependencyTokensFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-2 gap-6 rounded-xl p-8")
      .replace("bg-white text-slate-700 shadow-sm", "bg-cyan-50 text-cyan-700 shadow-md")
  );
}
const transitiveDependencySyntaxErrorsAfterResult =
  parseSyntaxErrorCount(transitiveDependencyTokensFixture) +
  parseSyntaxErrorCount(transitiveDependencyDefinitionFixture) +
  parseSyntaxErrorCount(transitiveDependencyStylesIndexFixture) +
  parseSyntaxErrorCount(transitiveDependencyThemeIndexFixture) +
  parseSyntaxErrorCount(transitiveDependencyHandoffFixture);
const transitiveDependencyHandoffResult = recordAgentResult(
  transitiveDependencyRoot,
  transitiveDependencyHandoffEntry,
  {
    id:
      transitiveDependencyHandoffEntry?.id ??
      "missing-transitive-dependency-handoff-binding",
    taskFile: transitiveDependencyHandoffTask.ok
      ? transitiveDependencyHandoffTask.taskFile
      : undefined,
    summary:
      "Transitive dependency handoff fixture: updated imported token variables referenced by the related className declaration.",
    changedFiles: ["src/tokens/cardTokens.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for bounded cross-file dependency handoff context; no LLM call is made."
  }
);

const propertyAccessRoot = resetTmpSubdir("property-access-handoff");
const propertyAccessStylesDir = path.join(propertyAccessRoot, "src", "styles");
const propertyAccessThemeDir = path.join(propertyAccessRoot, "src", "theme");
const propertyAccessScreensDir = path.join(propertyAccessRoot, "src", "screens");
fs.mkdirSync(propertyAccessStylesDir, { recursive: true });
fs.mkdirSync(propertyAccessThemeDir, { recursive: true });
fs.mkdirSync(propertyAccessScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(propertyAccessRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"]
        }
      }
    },
    null,
    2
  )}\n`
);
const propertyAccessDefinitionFixture = path.join(propertyAccessStylesDir, "titleStyles.ts");
fs.writeFileSync(
  propertyAccessDefinitionFixture,
  [
    "export const styles = {",
    "  title: \"text-xl font-semibold text-gray-950\",",
    "  eyebrow: \"text-xs font-semibold uppercase tracking-wide text-teal-700\"",
    "};",
    ""
  ].join("\n")
);
const propertyAccessStylesIndexFixture = path.join(propertyAccessStylesDir, "index.ts");
fs.writeFileSync(propertyAccessStylesIndexFixture, "export { styles } from \"./titleStyles\";\n");
const propertyAccessThemeIndexFixture = path.join(propertyAccessThemeDir, "index.ts");
fs.writeFileSync(propertyAccessThemeIndexFixture, "export { styles } from \"../styles\";\n");
const propertyAccessHandoffFixture = path.join(
  propertyAccessScreensDir,
  "PropertyAccessHandoffFixture.tsx"
);
fs.writeFileSync(
  propertyAccessHandoffFixture,
  [
    "import { styles as cardStyles } from \"@/theme\";",
    "",
    "export function PropertyAccessHandoffFixture() {",
    "  return <h2 className={cardStyles.title}>Property access handoff target</h2>;",
    "}",
    ""
  ].join("\n")
);
const propertyAccessHandoffInstrument = instrumentSource({
  code: fs.readFileSync(propertyAccessHandoffFixture, "utf8"),
  file: propertyAccessHandoffFixture,
  rootDir: propertyAccessRoot
});
const propertyAccessHandoffEntry = propertyAccessHandoffInstrument.entries[0];
const propertyAccessHandoffTask = createAgentTask(
  propertyAccessRoot,
  propertyAccessHandoffEntry,
  {
    id: propertyAccessHandoffEntry?.id ?? "missing-property-access-handoff-binding",
    desiredChange:
      "Change this property-access-backed className through an agent handoff."
  }
);
const propertyAccessHandoffRelatedSnapshot = propertyAccessHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      propertyAccessHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (propertyAccessHandoffTask.ok) {
  fs.writeFileSync(
    propertyAccessDefinitionFixture,
    fs
      .readFileSync(propertyAccessDefinitionFixture, "utf8")
      .replace(
        "text-xl font-semibold text-gray-950",
        "text-2xl font-bold tracking-tight text-cyan-700"
      )
  );
}
const propertyAccessHandoffSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(propertyAccessDefinitionFixture) +
  parseSyntaxErrorCount(propertyAccessStylesIndexFixture) +
  parseSyntaxErrorCount(propertyAccessThemeIndexFixture) +
  parseSyntaxErrorCount(propertyAccessHandoffFixture);
const propertyAccessHandoffResult = recordAgentResult(
  propertyAccessRoot,
  propertyAccessHandoffEntry,
  {
    id: propertyAccessHandoffEntry?.id ?? "missing-property-access-handoff-binding",
    taskFile: propertyAccessHandoffTask.ok ? propertyAccessHandoffTask.taskFile : undefined,
    summary:
      "Property access handoff fixture: updated the object property className behind an imported object alias.",
    changedFiles: ["src/styles/titleStyles.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for property-access related source handoff context; no LLM call is made."
  }
);

const externalPackageImportRoot = resetTmpSubdir("external-package-import-handoff");
const externalPackageImportScreensDir = path.join(externalPackageImportRoot, "src", "screens");
fs.mkdirSync(externalPackageImportScreensDir, { recursive: true });
const externalPackageImportFixture = path.join(
  externalPackageImportScreensDir,
  "ExternalPackageImportHandoffFixture.tsx"
);
fs.writeFileSync(
  externalPackageImportFixture,
  [
    "import { buttonVariants } from \"@external-ui/react\";",
    "",
    "export function ExternalPackageImportHandoffFixture() {",
    "  return <button className={buttonVariants({ variant: \"primary\" })}>External package handoff target</button>;",
    "}",
    ""
  ].join("\n")
);
const externalPackageImportInstrument = instrumentSource({
  code: fs.readFileSync(externalPackageImportFixture, "utf8"),
  file: externalPackageImportFixture,
  rootDir: externalPackageImportRoot
});
const externalPackageImportEntry = externalPackageImportInstrument.entries[0];
const externalPackageImportTask = createAgentTask(
  externalPackageImportRoot,
  externalPackageImportEntry,
  {
    id:
      externalPackageImportEntry?.id ??
      "missing-external-package-import-handoff-binding",
    desiredChange:
      "Change this external package variant-backed className without editing node_modules."
  }
);
const externalPackageImportRelatedSnapshot = externalPackageImportTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      externalPackageImportTask.markdown,
      "Related Source Snapshot"
    )
  : null;
const externalPackageImportReference = externalPackageImportTask.ok
  ? parseTaskJsonSection<TaskExternalImportReference | null>(
      externalPackageImportTask.markdown,
      "External Import Reference"
    )
  : null;
if (externalPackageImportTask.ok) {
  fs.writeFileSync(
    externalPackageImportFixture,
    fs
      .readFileSync(externalPackageImportFixture, "utf8")
      .replace(
        "className={buttonVariants({ variant: \"primary\" })}",
        "className={`${buttonVariants({ variant: \"primary\" })} rounded-xl px-6 ring-1 ring-cyan-200`}"
      )
  );
}
const externalPackageImportSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(externalPackageImportFixture);
const externalPackageImportResult = recordAgentResult(
  externalPackageImportRoot,
  externalPackageImportEntry,
  {
    id:
      externalPackageImportEntry?.id ??
      "missing-external-package-import-handoff-binding",
    taskFile: externalPackageImportTask.ok ? externalPackageImportTask.taskFile : undefined,
    summary:
      "External package import handoff fixture: kept third-party package source read-only and added a local className override in the selected component.",
    changedFiles: ["src/screens/ExternalPackageImportHandoffFixture.tsx"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for external npm package import handoff context; no LLM call is made."
  }
);

const packageImportRoot = resetTmpSubdir("workspace-package-import-handoff");
const packageImportUiDir = path.join(packageImportRoot, "packages", "ui");
const packageImportUiSrcDir = path.join(packageImportUiDir, "src");
const packageImportScreensDir = path.join(packageImportRoot, "src", "screens");
fs.mkdirSync(packageImportUiSrcDir, { recursive: true });
fs.mkdirSync(packageImportScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(packageImportRoot, "package.json"),
  `${JSON.stringify(
    {
      private: true,
      workspaces: ["packages/*"]
    },
    null,
    2
  )}\n`
);
fs.writeFileSync(
  path.join(packageImportUiDir, "package.json"),
  `${JSON.stringify(
    {
      name: "@intent-fixtures/ui",
      version: "0.0.0",
      exports: {
        "./styles": "./src/styles.ts"
      }
    },
    null,
    2
  )}\n`
);
const packageImportDefinitionFixture = path.join(packageImportUiSrcDir, "styles.ts");
fs.writeFileSync(
  packageImportDefinitionFixture,
  [
    "export const cardClass = \"grid grid-cols-3 gap-4 rounded-lg bg-white p-6 shadow-sm\";",
    ""
  ].join("\n")
);
const packageImportHandoffFixture = path.join(
  packageImportScreensDir,
  "PackageImportHandoffFixture.tsx"
);
fs.writeFileSync(
  packageImportHandoffFixture,
  [
    "import { cardClass as packageCardClass } from \"@intent-fixtures/ui/styles\";",
    "",
    "export function PackageImportHandoffFixture() {",
    "  return <article className={packageCardClass}>Package import handoff target</article>;",
    "}",
    ""
  ].join("\n")
);
const packageImportHandoffInstrument = instrumentSource({
  code: fs.readFileSync(packageImportHandoffFixture, "utf8"),
  file: packageImportHandoffFixture,
  rootDir: packageImportRoot
});
const packageImportHandoffEntry = packageImportHandoffInstrument.entries[0];
const packageImportHandoffTask = createAgentTask(
  packageImportRoot,
  packageImportHandoffEntry,
  {
    id: packageImportHandoffEntry?.id ?? "missing-package-import-handoff-binding",
    desiredChange:
      "Change this workspace-package imported variable-backed className through an agent handoff."
  }
);
const packageImportHandoffRelatedSnapshot = packageImportHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      packageImportHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (packageImportHandoffTask.ok) {
  fs.writeFileSync(
    packageImportDefinitionFixture,
    fs
      .readFileSync(packageImportDefinitionFixture, "utf8")
      .replace(
        "grid grid-cols-3 gap-4 rounded-lg bg-white p-6 shadow-sm",
        "grid grid-cols-2 gap-6 rounded-xl bg-slate-50 p-8 shadow-md"
      )
  );
}
const packageImportHandoffSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(packageImportDefinitionFixture) +
  parseSyntaxErrorCount(packageImportHandoffFixture);
const packageImportHandoffResult = recordAgentResult(
  packageImportRoot,
  packageImportHandoffEntry,
  {
    id: packageImportHandoffEntry?.id ?? "missing-package-import-handoff-binding",
    taskFile: packageImportHandoffTask.ok ? packageImportHandoffTask.taskFile : undefined,
    summary:
      "Workspace package import handoff fixture: updated the related className variable behind a package export.",
    changedFiles: ["packages/ui/src/styles.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for workspace package import handoff context; no LLM call is made."
  }
);

const variantHandoffFixture = path.join(tmpDir, "VariantHandoffFixture.tsx");
fs.writeFileSync(
  variantHandoffFixture,
  [
    "declare function cva(base: string, options: unknown): (value: { variant: \"primary\" | \"ghost\" }) => string;",
    "const buttonVariants = cva(\"inline-flex items-center gap-4 rounded-lg px-4 py-2\", {",
    "  variants: {",
    "    variant: {",
    "      primary: \"bg-teal-700 text-white\",",
    "      ghost: \"bg-white text-slate-700\"",
    "    }",
    "  }",
    "});",
    "",
    "export function VariantHandoffFixture() {",
    "  return <button className={buttonVariants({ variant: \"primary\" })}>Variant handoff target</button>;",
    "}",
    ""
  ].join("\n")
);

const variantHandoffInstrument = instrumentSource({
  code: fs.readFileSync(variantHandoffFixture, "utf8"),
  file: variantHandoffFixture,
  rootDir
});
const variantHandoffEntry = variantHandoffInstrument.entries[0];
const variantHandoffTask = createAgentTask(rootDir, variantHandoffEntry, {
  id: variantHandoffEntry?.id ?? "missing-variant-handoff-binding",
  desiredChange: "Change this variant-backed className through an agent handoff."
});
const variantHandoffRelatedSnapshot = variantHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      variantHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (variantHandoffTask.ok) {
  fs.writeFileSync(
    variantHandoffFixture,
    fs
      .readFileSync(variantHandoffFixture, "utf8")
      .replace(
        "inline-flex items-center gap-4 rounded-lg px-4 py-2",
        "inline-flex items-center gap-6 rounded-xl px-5 py-3"
      )
      .replace("bg-teal-700", "bg-cyan-700")
  );
}
const variantHandoffSyntaxErrorsAfterResult = parseSyntaxErrorCount(variantHandoffFixture);
const variantHandoffResult = recordAgentResult(rootDir, variantHandoffEntry, {
  id: variantHandoffEntry?.id ?? "missing-variant-handoff-binding",
  taskFile: variantHandoffTask.ok ? variantHandoffTask.taskFile : undefined,
  summary:
    "Variant handoff fixture: updated the cva-like variant declaration through an agent handoff result.",
  changedFiles: [path.relative(rootDir, variantHandoffFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes:
    "Evaluation fixture for variant-function related source handoff context; no LLM call is made."
});

const importedVariantDefinitionFixture = path.join(tmpDir, "ImportedVariantDefinition.ts");
fs.writeFileSync(
  importedVariantDefinitionFixture,
  [
    "declare function cva(base: string, options: unknown): (value: { variant: \"primary\" | \"ghost\" }) => string;",
    "export const buttonVariants = cva(\"inline-flex items-center gap-4 rounded-lg px-4 py-2\", {",
    "  variants: {",
    "    variant: {",
    "      primary: \"bg-teal-700 text-white\",",
    "      ghost: \"bg-white text-slate-700\"",
    "    }",
    "  }",
    "});",
    ""
  ].join("\n")
);

const importedVariantHandoffFixture = path.join(tmpDir, "ImportedVariantHandoffFixture.tsx");
fs.writeFileSync(
  importedVariantHandoffFixture,
  [
    "import { buttonVariants } from \"./ImportedVariantDefinition\";",
    "",
    "export function ImportedVariantHandoffFixture() {",
    "  return <button className={buttonVariants({ variant: \"primary\" })}>Imported variant handoff target</button>;",
    "}",
    ""
  ].join("\n")
);

const importedVariantHandoffInstrument = instrumentSource({
  code: fs.readFileSync(importedVariantHandoffFixture, "utf8"),
  file: importedVariantHandoffFixture,
  rootDir
});
const importedVariantHandoffEntry = importedVariantHandoffInstrument.entries[0];
const importedVariantHandoffTask = createAgentTask(rootDir, importedVariantHandoffEntry, {
  id: importedVariantHandoffEntry?.id ?? "missing-imported-variant-handoff-binding",
  desiredChange: "Change this imported variant-backed className through an agent handoff."
});
const importedVariantHandoffRelatedSnapshot = importedVariantHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      importedVariantHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (importedVariantHandoffTask.ok) {
  fs.writeFileSync(
    importedVariantDefinitionFixture,
    fs
      .readFileSync(importedVariantDefinitionFixture, "utf8")
      .replace(
        "inline-flex items-center gap-4 rounded-lg px-4 py-2",
        "inline-flex items-center gap-6 rounded-xl px-5 py-3"
      )
      .replace("bg-teal-700", "bg-cyan-700")
  );
}
const importedVariantHandoffSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(importedVariantDefinitionFixture) +
  parseSyntaxErrorCount(importedVariantHandoffFixture);
const importedVariantHandoffResult = recordAgentResult(rootDir, importedVariantHandoffEntry, {
  id: importedVariantHandoffEntry?.id ?? "missing-imported-variant-handoff-binding",
  taskFile: importedVariantHandoffTask.ok ? importedVariantHandoffTask.taskFile : undefined,
  summary:
    "Imported variant handoff fixture: updated the related cva-like variant declaration in another file.",
  changedFiles: [path.relative(rootDir, importedVariantDefinitionFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes:
    "Evaluation fixture for one-hop relative named import variant-function handoff context; no LLM call is made."
});

const aliasBarrelVariantRoot = resetTmpSubdir("alias-barrel-variant-handoff");
const aliasBarrelUiDir = path.join(aliasBarrelVariantRoot, "src", "ui");
const aliasBarrelScreensDir = path.join(aliasBarrelVariantRoot, "src", "screens");
fs.mkdirSync(aliasBarrelUiDir, { recursive: true });
fs.mkdirSync(aliasBarrelScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(aliasBarrelVariantRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"]
        }
      }
    },
    null,
    2
  )}\n`
);
const aliasBarrelVariantDefinitionFixture = path.join(aliasBarrelUiDir, "buttonVariants.ts");
fs.writeFileSync(
  aliasBarrelVariantDefinitionFixture,
  [
    "declare function cva(base: string, options: unknown): (value: { variant: \"primary\" | \"ghost\" }) => string;",
    "export const buttonVariants = cva(\"inline-flex items-center gap-4 rounded-lg px-4 py-2\", {",
    "  variants: {",
    "    variant: {",
    "      primary: \"bg-teal-700 text-white\",",
    "      ghost: \"bg-white text-slate-700\"",
    "    }",
    "  }",
    "});",
    ""
  ].join("\n")
);
const aliasBarrelIndexFixture = path.join(aliasBarrelUiDir, "index.ts");
fs.writeFileSync(aliasBarrelIndexFixture, "export { buttonVariants } from \"./buttonVariants\";\n");
const aliasBarrelVariantHandoffFixture = path.join(
  aliasBarrelScreensDir,
  "AliasBarrelVariantHandoffFixture.tsx"
);
fs.writeFileSync(
  aliasBarrelVariantHandoffFixture,
  [
    "import { buttonVariants } from \"@/ui\";",
    "",
    "export function AliasBarrelVariantHandoffFixture() {",
    "  return <button className={buttonVariants({ variant: \"primary\" })}>Alias barrel handoff target</button>;",
    "}",
    ""
  ].join("\n")
);
const aliasBarrelVariantHandoffInstrument = instrumentSource({
  code: fs.readFileSync(aliasBarrelVariantHandoffFixture, "utf8"),
  file: aliasBarrelVariantHandoffFixture,
  rootDir: aliasBarrelVariantRoot
});
const aliasBarrelVariantHandoffEntry = aliasBarrelVariantHandoffInstrument.entries[0];
const aliasBarrelVariantHandoffTask = createAgentTask(
  aliasBarrelVariantRoot,
  aliasBarrelVariantHandoffEntry,
  {
    id: aliasBarrelVariantHandoffEntry?.id ?? "missing-alias-barrel-variant-handoff-binding",
    desiredChange: "Change this path-alias barrel variant-backed className through an agent handoff."
  }
);
const aliasBarrelVariantHandoffRelatedSnapshot = aliasBarrelVariantHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      aliasBarrelVariantHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (aliasBarrelVariantHandoffTask.ok) {
  fs.writeFileSync(
    aliasBarrelVariantDefinitionFixture,
    fs
      .readFileSync(aliasBarrelVariantDefinitionFixture, "utf8")
      .replace(
        "inline-flex items-center gap-4 rounded-lg px-4 py-2",
        "inline-flex items-center gap-6 rounded-xl px-5 py-3"
      )
      .replace("bg-teal-700", "bg-cyan-700")
  );
}
const aliasBarrelVariantHandoffSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(aliasBarrelVariantDefinitionFixture) +
  parseSyntaxErrorCount(aliasBarrelIndexFixture) +
  parseSyntaxErrorCount(aliasBarrelVariantHandoffFixture);
const aliasBarrelVariantHandoffResult = recordAgentResult(
  aliasBarrelVariantRoot,
  aliasBarrelVariantHandoffEntry,
  {
    id: aliasBarrelVariantHandoffEntry?.id ?? "missing-alias-barrel-variant-handoff-binding",
    taskFile: aliasBarrelVariantHandoffTask.ok ? aliasBarrelVariantHandoffTask.taskFile : undefined,
    summary:
      "Alias barrel variant handoff fixture: updated the related cva-like declaration behind a tsconfig path alias and barrel export.",
    changedFiles: ["src/ui/buttonVariants.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for tsconfig paths plus one-hop barrel variant-function handoff context; no LLM call is made."
  }
);

const multiHopVariantRoot = resetTmpSubdir("multi-hop-variant-handoff");
const multiHopVariantTokensDir = path.join(multiHopVariantRoot, "src", "tokens");
const multiHopVariantUiDir = path.join(multiHopVariantRoot, "src", "ui");
const multiHopVariantThemeDir = path.join(multiHopVariantRoot, "src", "theme");
const multiHopVariantScreensDir = path.join(multiHopVariantRoot, "src", "screens");
fs.mkdirSync(multiHopVariantTokensDir, { recursive: true });
fs.mkdirSync(multiHopVariantUiDir, { recursive: true });
fs.mkdirSync(multiHopVariantThemeDir, { recursive: true });
fs.mkdirSync(multiHopVariantScreensDir, { recursive: true });
fs.writeFileSync(
  path.join(multiHopVariantRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"]
        }
      }
    },
    null,
    2
  )}\n`
);
const multiHopVariantDefinitionFixture = path.join(multiHopVariantTokensDir, "buttonVariants.ts");
fs.writeFileSync(
  multiHopVariantDefinitionFixture,
  [
    "declare function cva(base: string, options: unknown): (value: { variant: \"primary\" | \"ghost\" }) => string;",
    "export const buttonVariants = cva(\"inline-flex items-center gap-4 rounded-lg px-4 py-2\", {",
    "  variants: {",
    "    variant: {",
    "      primary: \"bg-teal-700 text-white\",",
    "      ghost: \"bg-white text-slate-700\"",
    "    }",
    "  }",
    "});",
    ""
  ].join("\n")
);
const multiHopVariantUiIndexFixture = path.join(multiHopVariantUiDir, "index.ts");
fs.writeFileSync(multiHopVariantUiIndexFixture, "export { buttonVariants } from \"../tokens/buttonVariants\";\n");
const multiHopVariantThemeIndexFixture = path.join(multiHopVariantThemeDir, "index.ts");
fs.writeFileSync(multiHopVariantThemeIndexFixture, "export { buttonVariants } from \"../ui\";\n");
const multiHopVariantHandoffFixture = path.join(
  multiHopVariantScreensDir,
  "MultiHopVariantHandoffFixture.tsx"
);
fs.writeFileSync(
  multiHopVariantHandoffFixture,
  [
    "import { buttonVariants as actionVariants } from \"@/theme\";",
    "",
    "export function MultiHopVariantHandoffFixture() {",
    "  return <button className={actionVariants({ variant: \"primary\" })}>Multi-hop variant handoff target</button>;",
    "}",
    ""
  ].join("\n")
);
const multiHopVariantHandoffInstrument = instrumentSource({
  code: fs.readFileSync(multiHopVariantHandoffFixture, "utf8"),
  file: multiHopVariantHandoffFixture,
  rootDir: multiHopVariantRoot
});
const multiHopVariantHandoffEntry = multiHopVariantHandoffInstrument.entries[0];
const multiHopVariantHandoffTask = createAgentTask(
  multiHopVariantRoot,
  multiHopVariantHandoffEntry,
  {
    id: multiHopVariantHandoffEntry?.id ?? "missing-multi-hop-variant-handoff-binding",
    desiredChange: "Change this multi-hop barrel variant-backed className through an agent handoff."
  }
);
const multiHopVariantHandoffRelatedSnapshot = multiHopVariantHandoffTask.ok
  ? parseTaskJsonSection<TaskRelatedSourceSnapshot | null>(
      multiHopVariantHandoffTask.markdown,
      "Related Source Snapshot"
    )
  : null;
if (multiHopVariantHandoffTask.ok) {
  fs.writeFileSync(
    multiHopVariantDefinitionFixture,
    fs
      .readFileSync(multiHopVariantDefinitionFixture, "utf8")
      .replace(
        "inline-flex items-center gap-4 rounded-lg px-4 py-2",
        "inline-flex items-center gap-6 rounded-xl px-5 py-3"
      )
      .replace("bg-teal-700", "bg-cyan-700")
  );
}
const multiHopVariantHandoffSyntaxErrorsAfterResult =
  parseSyntaxErrorCount(multiHopVariantDefinitionFixture) +
  parseSyntaxErrorCount(multiHopVariantUiIndexFixture) +
  parseSyntaxErrorCount(multiHopVariantThemeIndexFixture) +
  parseSyntaxErrorCount(multiHopVariantHandoffFixture);
const multiHopVariantHandoffResult = recordAgentResult(
  multiHopVariantRoot,
  multiHopVariantHandoffEntry,
  {
    id: multiHopVariantHandoffEntry?.id ?? "missing-multi-hop-variant-handoff-binding",
    taskFile: multiHopVariantHandoffTask.ok ? multiHopVariantHandoffTask.taskFile : undefined,
    summary:
      "Multi-hop variant handoff fixture: updated the related cva-like declaration behind an alias and multi-hop barrel export.",
    changedFiles: ["src/tokens/buttonVariants.ts"],
    checks: ["npm run typecheck", "npm run eval", "npm run build"],
    notes:
      "Evaluation fixture for multi-hop variant-function handoff context; no LLM call is made."
  }
);

const cnPatchFixture = path.join(tmpDir, "CnPatchFixture.tsx");
fs.writeFileSync(
  cnPatchFixture,
  [
    "declare function cn(...value: Array<string | false>): string;",
    "export function CnPatchFixture({ active }: { active: boolean }) {",
    "  return <div className={cn(\"grid grid-cols-3 gap-4 rounded-lg p-6\", active && \"bg-teal-50\")}>Patch target</div>;",
    "}",
    ""
  ].join("\n")
);

const cnPatchInstrument = instrumentSource({
  code: fs.readFileSync(cnPatchFixture, "utf8"),
  file: cnPatchFixture,
  rootDir
});
const cnPatchEntry = cnPatchInstrument.entries[0];
const cnPatchTarget = cnPatchEntry.tokens.find((token) => token.token === "gap-4");
const cnApply = applyTokenPatch(rootDir, cnPatchEntry, {
  id: cnPatchEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: cnPatchTarget?.sourceStart,
  sourceEnd: cnPatchTarget?.sourceEnd
});
const syntaxErrorsAfterCnPatch = parseSyntaxErrorCount(cnPatchFixture);

const staleFixture = path.join(tmpDir, "StalePatchFixture.tsx");
fs.writeFileSync(
  staleFixture,
  [
    "export function StalePatchFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Stale target</div>;",
    "}",
    ""
  ].join("\n")
);
const staleInstrument = instrumentSource({
  code: fs.readFileSync(staleFixture, "utf8"),
  file: staleFixture,
  rootDir
});
const staleEntry = staleInstrument.entries[0];
fs.writeFileSync(staleFixture, fs.readFileSync(staleFixture, "utf8").replace("gap-4", "gap-8"));
const staleApply = applyTokenPatch(rootDir, staleEntry, {
  id: staleEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6"
});

const operationLogFile = path.join(rootDir, ".intent", "operations", "operation-log.json");
if (fs.existsSync(operationLogFile)) {
  fs.unlinkSync(operationLogFile);
}
const conflictsDir = path.join(rootDir, ".intent", "conflicts");
if (fs.existsSync(conflictsDir)) {
  fs.rmSync(conflictsDir, { recursive: true, force: true });
}
const operationStackFixture = path.join(tmpDir, "OperationStackFixture.tsx");
fs.writeFileSync(
  operationStackFixture,
  [
    "export function OperationStackFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Stack target</div>;",
    "}",
    ""
  ].join("\n")
);
const operationStackInstrument = instrumentSource({
  code: fs.readFileSync(operationStackFixture, "utf8"),
  file: operationStackFixture,
  rootDir
});
const operationStackEntry = operationStackInstrument.entries[0];
const operationStackGap = operationStackEntry.tokens.find((token) => token.token === "gap-4");
const operationApplyOne = applyTokenPatch(rootDir, operationStackEntry, {
  id: operationStackEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: operationStackGap?.sourceStart,
  sourceEnd: operationStackGap?.sourceEnd
});
if (operationApplyOne.ok) {
  recordPatchApplyInOperationLog(rootDir, operationApplyOne);
}
const operationStackAfterOne = instrumentSource({
  code: fs.readFileSync(operationStackFixture, "utf8"),
  file: operationStackFixture,
  rootDir
});
const operationStackEntryAfterOne = operationStackAfterOne.entries[0];
const operationStackPadding = operationStackEntryAfterOne.tokens.find((token) => token.token === "p-6");
const operationApplyTwo = applyTokenPatch(rootDir, operationStackEntryAfterOne, {
  id: operationStackEntryAfterOne.id,
  oldToken: "p-6",
  nextToken: "p-8",
  sourceStart: operationStackPadding?.sourceStart,
  sourceEnd: operationStackPadding?.sourceEnd
});
if (operationApplyTwo.ok) {
  recordPatchApplyInOperationLog(rootDir, operationApplyTwo);
}
const pendingAfterApply = pendingUndoStackFromOperationLog(rootDir);
const historyAfterApply = pendingUndoHistoryFromOperationLog(rootDir);
const operationRevertOne = revertTokenPatch(
  rootDir,
  pendingAfterApply[pendingAfterApply.length - 1],
  operationStackEntryAfterOne
);
if (operationRevertOne.ok) {
  recordPatchRevertInOperationLog(rootDir, operationRevertOne);
}
const pendingAfterFirstRevert = pendingUndoStackFromOperationLog(rootDir);
const historyAfterFirstRevert = pendingUndoHistoryFromOperationLog(rootDir);
const operationRevertTwo = revertTokenPatch(
  rootDir,
  pendingAfterFirstRevert[pendingAfterFirstRevert.length - 1],
  operationStackEntry
);
if (operationRevertTwo.ok) {
  recordPatchRevertInOperationLog(rootDir, operationRevertTwo);
}
const pendingAfterSecondRevert = pendingUndoStackFromOperationLog(rootDir);
const historyAfterSecondRevert = pendingUndoHistoryFromOperationLog(rootDir);
const syntaxErrorsAfterOperationStack = parseSyntaxErrorCount(operationStackFixture);

const operationBranchDiscardFixture = path.join(tmpDir, "OperationBranchDiscardFixture.tsx");
fs.writeFileSync(
  operationBranchDiscardFixture,
  [
    "export function OperationBranchDiscardFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Branch discard target</div>;",
    "}",
    ""
  ].join("\n")
);
const operationBranchDiscardInstrument = instrumentSource({
  code: fs.readFileSync(operationBranchDiscardFixture, "utf8"),
  file: operationBranchDiscardFixture,
  rootDir
});
const operationBranchDiscardEntry = operationBranchDiscardInstrument.entries[0];
const operationBranchDiscardGap = operationBranchDiscardEntry.tokens.find((token) => token.token === "gap-4");
const operationBranchApplyOne = applyTokenPatch(rootDir, operationBranchDiscardEntry, {
  id: operationBranchDiscardEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: operationBranchDiscardGap?.sourceStart,
  sourceEnd: operationBranchDiscardGap?.sourceEnd
});
if (operationBranchApplyOne.ok) {
  recordPatchApplyInOperationLog(rootDir, operationBranchApplyOne);
}
const operationBranchDiscardAfterOne = instrumentSource({
  code: fs.readFileSync(operationBranchDiscardFixture, "utf8"),
  file: operationBranchDiscardFixture,
  rootDir
});
const operationBranchDiscardEntryAfterOne = operationBranchDiscardAfterOne.entries[0];
const operationBranchDiscardPadding = operationBranchDiscardEntryAfterOne.tokens.find((token) => token.token === "p-6");
const operationBranchApplyTwo = applyTokenPatch(rootDir, operationBranchDiscardEntryAfterOne, {
  id: operationBranchDiscardEntryAfterOne.id,
  oldToken: "p-6",
  nextToken: "p-8",
  sourceStart: operationBranchDiscardPadding?.sourceStart,
  sourceEnd: operationBranchDiscardPadding?.sourceEnd
});
if (operationBranchApplyTwo.ok) {
  recordPatchApplyInOperationLog(rootDir, operationBranchApplyTwo);
}
const pendingAfterBranchApply = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchApply = pendingUndoHistoryFromOperationLog(rootDir);
const operationBranchDiscard = operationBranchApplyOne.ok
  ? discardPendingUndo(rootDir, {
      operationFile: operationBranchApplyOne.operationFile,
      note: "Evaluation fixture discarded a non-top pending undo."
    })
  : {
      ok: false as const,
      reason: "missing-branch-apply",
      detail: "The first branch discard apply failed."
    };
const pendingAfterBranchDiscard = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchDiscard = pendingUndoHistoryFromOperationLog(rootDir);
const operationBranchDiscardAfterTwo = instrumentSource({
  code: fs.readFileSync(operationBranchDiscardFixture, "utf8"),
  file: operationBranchDiscardFixture,
  rootDir
});
const operationBranchDiscardEntryAfterTwo = operationBranchDiscardAfterTwo.entries[0];
const operationBranchRevert = revertTokenPatch(
  rootDir,
  pendingAfterBranchDiscard[pendingAfterBranchDiscard.length - 1],
  operationBranchDiscardEntryAfterTwo
);
if (operationBranchRevert.ok) {
  recordPatchRevertInOperationLog(rootDir, operationBranchRevert);
}
const pendingAfterBranchRevert = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchRevert = pendingUndoHistoryFromOperationLog(rootDir);
const syntaxErrorsAfterBranchDiscard = parseSyntaxErrorCount(operationBranchDiscardFixture);

const operationBranchRevertFixture = path.join(tmpDir, "OperationBranchRevertFixture.tsx");
fs.writeFileSync(
  operationBranchRevertFixture,
  [
    "export function OperationBranchRevertFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Branch revert target</div>;",
    "}",
    ""
  ].join("\n")
);
const operationBranchRevertInstrument = instrumentSource({
  code: fs.readFileSync(operationBranchRevertFixture, "utf8"),
  file: operationBranchRevertFixture,
  rootDir
});
const operationBranchRevertEntry = operationBranchRevertInstrument.entries[0];
const operationBranchRevertGap = operationBranchRevertEntry.tokens.find((token) => token.token === "gap-4");
const operationBranchRevertApplyOne = applyTokenPatch(rootDir, operationBranchRevertEntry, {
  id: operationBranchRevertEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: operationBranchRevertGap?.sourceStart,
  sourceEnd: operationBranchRevertGap?.sourceEnd
});
if (operationBranchRevertApplyOne.ok) {
  recordPatchApplyInOperationLog(rootDir, operationBranchRevertApplyOne);
}
const operationBranchRevertAfterOne = instrumentSource({
  code: fs.readFileSync(operationBranchRevertFixture, "utf8"),
  file: operationBranchRevertFixture,
  rootDir
});
const operationBranchRevertEntryAfterOne = operationBranchRevertAfterOne.entries[0];
const operationBranchRevertPadding = operationBranchRevertEntryAfterOne.tokens.find((token) => token.token === "p-6");
const operationBranchRevertApplyTwo = applyTokenPatch(rootDir, operationBranchRevertEntryAfterOne, {
  id: operationBranchRevertEntryAfterOne.id,
  oldToken: "p-6",
  nextToken: "p-8",
  sourceStart: operationBranchRevertPadding?.sourceStart,
  sourceEnd: operationBranchRevertPadding?.sourceEnd
});
if (operationBranchRevertApplyTwo.ok) {
  recordPatchApplyInOperationLog(rootDir, operationBranchRevertApplyTwo);
}
const pendingAfterBranchRevertApply = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchRevertApply = pendingUndoHistoryFromOperationLog(rootDir);
const operationBranchRevertAfterTwo = instrumentSource({
  code: fs.readFileSync(operationBranchRevertFixture, "utf8"),
  file: operationBranchRevertFixture,
  rootDir
});
const operationBranchRevertEntryAfterTwo = operationBranchRevertAfterTwo.entries[0];
const operationBranchRevertNonTop = operationBranchRevertApplyOne.ok
  ? revertPendingUndo(rootDir, operationBranchRevertEntryAfterTwo, {
      operationFile: operationBranchRevertApplyOne.operationFile
    })
  : {
      ok: false as const,
      reason: "missing-branch-revert-apply",
      detail: "The first branch revert apply failed."
    };
const pendingAfterBranchRevertNonTop = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchRevertNonTop = pendingUndoHistoryFromOperationLog(rootDir);
const branchRevertSourceAfterNonTop = fs.readFileSync(operationBranchRevertFixture, "utf8");
const operationBranchRevertAfterNonTop = instrumentSource({
  code: branchRevertSourceAfterNonTop,
  file: operationBranchRevertFixture,
  rootDir
});
const operationBranchRevertEntryAfterNonTop = operationBranchRevertAfterNonTop.entries[0];
const operationBranchRevertTop = operationBranchRevertApplyTwo.ok
  ? revertPendingUndo(rootDir, operationBranchRevertEntryAfterNonTop, {
      operationFile: operationBranchRevertApplyTwo.operationFile
    })
  : {
      ok: false as const,
      reason: "missing-branch-revert-apply",
      detail: "The second branch revert apply failed."
    };
const pendingAfterBranchRevertTop = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchRevertTop = pendingUndoHistoryFromOperationLog(rootDir);
const branchRevertSourceAfterTop = fs.readFileSync(operationBranchRevertFixture, "utf8");
const operationBranchRevertAfterTop = instrumentSource({
  code: branchRevertSourceAfterTop,
  file: operationBranchRevertFixture,
  rootDir
});
const operationBranchRevertOldest = operationBranchRevertApplyOne.ok
  ? revertPendingUndo(rootDir, operationBranchRevertAfterTop.entries[0], {
      operationFile: operationBranchRevertApplyOne.operationFile
    })
  : {
      ok: false as const,
      reason: "missing-branch-revert-apply",
      detail: "The first branch revert apply failed."
    };
const pendingAfterBranchRevertOldest = pendingUndoStackFromOperationLog(rootDir);
const historyAfterBranchRevertOldest = pendingUndoHistoryFromOperationLog(rootDir);
const branchRevertSourceAfterOldest = fs.readFileSync(operationBranchRevertFixture, "utf8");
const syntaxErrorsAfterBranchRevert = parseSyntaxErrorCount(operationBranchRevertFixture);

const operationConflictFixture = path.join(tmpDir, "OperationConflictFixture.tsx");
fs.writeFileSync(
  operationConflictFixture,
  [
    "export function OperationConflictFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Conflict target</div>;",
    "}",
    ""
  ].join("\n")
);
const operationConflictInstrument = instrumentSource({
  code: fs.readFileSync(operationConflictFixture, "utf8"),
  file: operationConflictFixture,
  rootDir
});
const operationConflictEntry = operationConflictInstrument.entries[0];
const operationConflictApply = applyTokenPatch(rootDir, operationConflictEntry, {
  id: operationConflictEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: operationConflictEntry.tokens.find((token) => token.token === "gap-4")?.sourceStart,
  sourceEnd: operationConflictEntry.tokens.find((token) => token.token === "gap-4")?.sourceEnd
});
if (operationConflictApply.ok) {
  recordPatchApplyInOperationLog(rootDir, operationConflictApply);
  fs.writeFileSync(
    operationConflictFixture,
    fs.readFileSync(operationConflictFixture, "utf8").replace("gap-6", "gap-8")
  );
}
const operationConflictRevert = revertTokenPatch(
  rootDir,
  operationConflictApply.ok ? operationConflictApply : null,
  operationConflictEntry
);
const operationConflictFile = !operationConflictRevert.ok
  ? operationConflictRevert.conflictFile
  : undefined;
const operationConflictArtifact =
  operationConflictFile && fs.existsSync(operationConflictFile)
    ? JSON.parse(fs.readFileSync(operationConflictFile, "utf8"))
    : null;
const pendingAfterOperationConflict = pendingUndoStackFromOperationLog(rootDir);
const operationConflictReport = readPatchConflictReport(rootDir);
const operationConflictResolve =
  operationConflictFile !== undefined
    ? resolvePatchConflict(rootDir, {
        conflictFile: operationConflictFile,
        action: "discard-pending-undo",
        note: "Evaluation fixture discarded the pending undo after inspecting the conflict artifact."
      })
    : {
        ok: false as const,
        reason: "missing-conflict-file",
        detail: "No conflict file was generated."
      };
const operationConflictResolvedArtifact =
  operationConflictFile && fs.existsSync(operationConflictFile)
    ? JSON.parse(fs.readFileSync(operationConflictFile, "utf8"))
    : null;
const pendingAfterOperationConflictResolve = pendingUndoStackFromOperationLog(rootDir);
const operationConflictReportAfterResolve = readPatchConflictReport(rootDir);
const syntaxErrorsAfterOperationConflict = parseSyntaxErrorCount(operationConflictFixture);

const cliScan = runCli(["scan", "fixtures/corpus", "src/App.tsx"], rootDir);
const cliScanReport = cliScan.report?.command === "scan" ? cliScan.report : null;
const cliInit = runCli(["init"], rootDir);
const cliInitReport = cliInit.report?.command === "init" ? cliInit.report : null;
const cliDev = runCli(["dev", "--dry-run"], rootDir);
const cliDevReport = cliDev.report?.command === "dev" ? cliDev.report : null;
const cliInitSchemaExists =
  fs.existsSync(path.join(rootDir, ".intent", "schema", "intent-op.schema.json")) &&
  fs.existsSync(path.join(rootDir, ".intent", "schema", "intent-diff.schema.json")) &&
  fs.existsSync(path.join(rootDir, ".intent", "schema", "graph.intent.schema.json"));
const cliCheck = runCli(
  [
    "check",
    "fixtures/corpus",
    "src/App.tsx",
    "--min-supported-direct",
    "0.5",
    "--max-file-transform-ms",
    "20"
  ],
  rootDir
);
const cliCheckReport = cliCheck.report?.command === "check" ? cliCheck.report : null;
const cliGraphScan = runCli(["scan", "fixtures/corpus", "src/App.tsx", "--write-graph"], rootDir);
const cliGraphFile = path.join(rootDir, ".intent", "graph.intent.json");
const cliGraph = fs.existsSync(cliGraphFile)
  ? (JSON.parse(fs.readFileSync(cliGraphFile, "utf8")) as IntentGraph)
  : null;
const cliDoctor = runCli(["doctor"], rootDir);
const cliDoctorReport = cliDoctor.report?.command === "doctor" ? cliDoctor.report : null;
const cliDoctorMissingPluginRoot = resetTmpSubdir("doctor-missing-plugin");
fs.mkdirSync(path.join(cliDoctorMissingPluginRoot, "src"), { recursive: true });
fs.writeFileSync(
  path.join(cliDoctorMissingPluginRoot, "package.json"),
  `${JSON.stringify(
    {
      private: true,
      type: "module",
      dependencies: {
        "intent-layer": "0.0.1",
        vite: "^6.0.5",
        react: "^18.3.1"
      }
    },
    null,
    2
  )}\n`
);
fs.writeFileSync(
  path.join(cliDoctorMissingPluginRoot, "tailwind.config.cjs"),
  "module.exports = { content: ['./src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] };\n"
);
fs.writeFileSync(
  path.join(cliDoctorMissingPluginRoot, "vite.config.ts"),
  [
    "import { defineConfig } from 'vite';",
    "",
    "export default defineConfig({",
    "  plugins: []",
    "});",
    ""
  ].join("\n")
);
fs.writeFileSync(
  path.join(cliDoctorMissingPluginRoot, "src", "App.tsx"),
  [
    "export function App() {",
    "  return <main className=\"flex gap-4 rounded-lg p-4\">Missing plugin fixture</main>;",
    "}",
    ""
  ].join("\n")
);
const cliDoctorMissingPlugin = runCli(["doctor"], cliDoctorMissingPluginRoot);
const cliDoctorMissingPluginReport =
  cliDoctorMissingPlugin.report?.command === "doctor" ? cliDoctorMissingPlugin.report : null;
const cliDoctorMissingPluginHasVitePluginFailure =
  cliDoctorMissingPluginReport?.checks.some((check) => check.name === "vite-plugin" && check.status === "fail") ??
  false;
const cliDoctorMissingPluginSourceFilesPass =
  cliDoctorMissingPluginReport?.checks.some((check) => check.name === "source-files" && check.status === "pass") ??
  false;
const cliDoctorMissingPluginGuidanceIncludesVite =
  cliDoctorMissingPluginReport?.guidance.some((item) => item.includes("intent-layer/vite")) ?? false;
const cliAgentTaskBinding =
  cliGraph &&
  Object.values(cliGraph.entries).find(
    (entry) => entry.relativeFile === "fixtures/corpus/DynamicRuntime.tsx" && entry.className.kind === "read-only"
  );
const cliAgentContextSubject = cliAgentTaskBinding?.componentName ?? null;
const cliAgentContext = runCli(
  cliAgentContextSubject
    ? ["agent-context", cliAgentContextSubject]
    : ["agent-context", "--id", cliAgentTaskBinding?.id ?? "missing-cli-agent-context-id"],
  rootDir
);
const cliAgentContextReport =
  cliAgentContext.report?.command === "agent-context" ? cliAgentContext.report : null;
const cliAgentContextMarkdown =
  cliAgentContextReport?.contextFile && fs.existsSync(path.join(rootDir, cliAgentContextReport.contextFile))
    ? fs.readFileSync(path.join(rootDir, cliAgentContextReport.contextFile), "utf8")
    : "";
const cliAgentContextSectionsPresent = [
  "## Scope",
  "## Graph Summary",
  "## Selected Binding",
  "## Editable Surface",
  "## Read-only Surface",
  "## Agent Rules",
  "## Required Checks"
].every((section) => cliAgentContextMarkdown.includes(section));
const cliAgentTask = runCli(
  [
    "agent-task",
    "--id",
    cliAgentTaskBinding?.id ?? "missing-cli-agent-task-id",
    "--change",
    "CLI fixture: create structured handoff for a selected read-only className."
  ],
  rootDir
);
const cliAgentTaskReport = cliAgentTask.report?.command === "agent-task" ? cliAgentTask.report : null;
const cliAgentTaskMarkdown =
  cliAgentTaskReport?.taskFile && fs.existsSync(path.join(rootDir, cliAgentTaskReport.taskFile))
    ? fs.readFileSync(path.join(rootDir, cliAgentTaskReport.taskFile), "utf8")
    : "";
const cliAgentTaskSectionsPresent = [
  "## Goal",
  "## Selected Component",
  "## Current Intent Document",
  "## Source Snapshot",
  "## Required Checks"
].every((section) => cliAgentTaskMarkdown.includes(section));
const cliAgentQueue = runCli(["agent-queue"], rootDir);
const cliAgentQueueReport = cliAgentQueue.report?.command === "agent-queue" ? cliAgentQueue.report : null;
const cliAgentClaimCodex = runCli(
  [
    "agent-claim",
    "--provider",
    "codex",
    "--task",
    cliAgentTaskReport?.taskFile ?? "missing-cli-agent-task-file.md",
    "--session",
    "eval-smoke"
  ],
  rootDir
);
const cliAgentClaimCodexReport =
  cliAgentClaimCodex.report?.command === "agent-claim" ? cliAgentClaimCodex.report : null;
const cliAgentLaunchCodex = runCli(
  [
    "agent-launch",
    "--provider",
    "codex",
    "--id",
    cliAgentTaskBinding?.id ?? "missing-cli-agent-launch-id",
    "--change",
    "CLI fixture: plan a Codex handoff launch for a selected read-only className."
  ],
  rootDir
);
const cliAgentLaunchCodexReport =
  cliAgentLaunchCodex.report?.command === "agent-launch" ? cliAgentLaunchCodex.report : null;
const cliAgentLaunchClaude = runCli(
  [
    "agent-launch",
    "--provider",
    "claude",
    "--task",
    cliAgentTaskReport?.taskFile ?? "missing-cli-agent-task-file.md"
  ],
  rootDir
);
const cliAgentLaunchClaudeReport =
  cliAgentLaunchClaude.report?.command === "agent-launch" ? cliAgentLaunchClaude.report : null;

const cliAgentResultFixture = path.join(tmpDir, "CliAgentResultFixture.tsx");
fs.writeFileSync(
  cliAgentResultFixture,
  [
    "export function CliAgentResultFixture() {",
    "  return <section className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">CLI result target</section>;",
    "}",
    ""
  ].join("\n")
);
const cliAgentResultFixtureRelative = path.relative(rootDir, cliAgentResultFixture).replace(/\\/g, "/");
const cliAgentResultGraphScan = runCli(["scan", cliAgentResultFixtureRelative, "--write-graph"], rootDir);
const cliAgentResultGraph = fs.existsSync(cliGraphFile)
  ? (JSON.parse(fs.readFileSync(cliGraphFile, "utf8")) as IntentGraph)
  : null;
const cliAgentResultBinding =
  cliAgentResultGraph &&
  Object.values(cliAgentResultGraph.entries).find(
    (entry) => entry.relativeFile === cliAgentResultFixtureRelative
  );
const cliAgentResultTask = runCli(
  [
    "agent-task",
    "--id",
    cliAgentResultBinding?.id ?? "missing-cli-agent-result-id",
    "--change",
    "CLI fixture: increase radius and padding, then record a result."
  ],
  rootDir
);
const cliAgentResultTaskReport =
  cliAgentResultTask.report?.command === "agent-task" ? cliAgentResultTask.report : null;
if (cliAgentResultTaskReport?.ok) {
  fs.writeFileSync(
    cliAgentResultFixture,
    fs
      .readFileSync(cliAgentResultFixture, "utf8")
      .replace("gap-4 rounded-lg p-6", "gap-6 rounded-xl p-8")
  );
}
const cliAgentResult = runCli(
  [
    "agent-result",
    "--id",
    cliAgentResultBinding?.id ?? "missing-cli-agent-result-id",
    "--task",
    cliAgentResultTaskReport?.taskFile ?? "",
    "--summary",
    "CLI agent-result fixture: updated spacing, radius, and padding through a recorded handoff result.",
    "--changed",
    cliAgentResultFixtureRelative,
    "--check",
    "npm run typecheck"
  ],
  rootDir
);
const cliAgentResultReport =
  cliAgentResult.report?.command === "agent-result" ? cliAgentResult.report : null;
const cliAgentResultMarkdown =
  cliAgentResultReport?.resultFile && fs.existsSync(path.join(rootDir, cliAgentResultReport.resultFile))
    ? fs.readFileSync(path.join(rootDir, cliAgentResultReport.resultFile), "utf8")
    : "";
const cliAgentResultSectionsPresent = [
  "## Summary",
  "## Source Binding",
  "## Source Diff",
  "## Semantic Intent Diff",
  "## Intent Diff"
].every((section) => cliAgentResultMarkdown.includes(section));
const cliAgentResultSyntaxErrors = parseSyntaxErrorCount(cliAgentResultFixture);

const cliApplyFixture = path.join(tmpDir, "CliApplyFixture.tsx");
fs.writeFileSync(
  cliApplyFixture,
  [
    "export function CliApplyFixture() {",
    "  return <section className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">CLI apply target</section>;",
    "}",
    ""
  ].join("\n")
);
const cliApplyFixtureRelative = path.relative(rootDir, cliApplyFixture).replace(/\\/g, "/");
const cliApplyGraphScan = runCli(["scan", cliApplyFixtureRelative, "--write-graph"], rootDir);
const cliApplyGraph = fs.existsSync(cliGraphFile)
  ? (JSON.parse(fs.readFileSync(cliGraphFile, "utf8")) as IntentGraph)
  : null;
const cliApplyBinding =
  cliApplyGraph &&
  Object.values(cliApplyGraph.entries).find((entry) => entry.relativeFile === cliApplyFixtureRelative);
const cliApplyToken = cliApplyBinding?.tokens.find((token) => token.token === "gap-4");
const cliApplyOpFile = path.join(tmpDir, "cli-apply.intent-op.json");
fs.writeFileSync(
  cliApplyOpFile,
  `${JSON.stringify(
    {
      version: 1,
      kind: "tailwind-token-replace",
      target: {
        id: cliApplyBinding?.id ?? "missing-cli-apply-id",
        file: cliApplyFixtureRelative,
        range: cliApplyToken
          ? {
              start: cliApplyToken.sourceStart,
              end: cliApplyToken.sourceEnd
            }
          : undefined
      },
      change: {
        from: "gap-4",
        to: "gap-6"
      }
    },
    null,
    2
  )}\n`
);
const cliApply = runCli(["apply", "--op", path.relative(rootDir, cliApplyOpFile).replace(/\\/g, "/")], rootDir);
const cliApplyReport = cliApply.report?.command === "apply" ? cliApply.report : null;
const cliDiff = runCli(
  ["diff", "--diff", cliApplyReport?.diffFile ?? ".intent/diffs/missing-cli-apply.intent-diff.yml"],
  rootDir
);
const cliDiffReport = cliDiff.report?.command === "diff" ? cliDiff.report : null;
const cliApplySyntaxErrors = parseSyntaxErrorCount(cliApplyFixture);

const packageInstallSmoke = packageSmoke();

const graphLookupIterations = 1000;
const graphLookup = new Map(patchInstrument.entries.map((entry) => [entry.id, entry]));
const lookupStarted = performance.now();
for (let index = 0; index < graphLookupIterations; index += 1) {
  graphLookup.get(patchEntry.id);
}
const graphLookupTotalMs = performance.now() - lookupStarted;

const report = {
  generatedAt: new Date().toISOString(),
  contextPackUsed: true,
  corpus,
  aiGeneratedCorpus: {
    ...aiGeneratedCorpusSummary,
    gates: {
      minFilesPass: aiGeneratedCorpus.filesScanned >= aiCorpusMinFiles,
      staticAndSimpleCoveragePass:
        aiGeneratedCorpus.editableCoverage.staticAndSimpleCnClsx >= aiCorpusCoverageTarget,
      supportedDirectCoveragePass:
        aiGeneratedCorpus.editableCoverage.supportedDirect >= aiCorpusCoverageTarget,
      allObservedCoveragePass:
        aiGeneratedCorpus.editableCoverage.allObservedTokens >= aiCorpusCoverageTarget
    },
    targets: {
      minFiles: aiCorpusMinFiles,
      editableCoverage: aiCorpusCoverageTarget
    },
    caveat:
      "This is a committed Codex-generated React/Tailwind corpus for reproducible MVP coverage auditing, not an independently sourced external benchmark."
  },
  externalCorpusHarness: {
    importExitCode: externalCorpusHarnessImport.exitCode,
    importMs: externalCorpusHarnessImport.ms,
    stdoutBytes: externalCorpusHarnessImport.stdout.length,
    stderrBytes: externalCorpusHarnessImport.stderr.length,
    available: externalCorpusHarnessReport?.available ?? false,
    sample: externalCorpusHarnessReport?.sample ?? null,
    filesDir: externalCorpusHarnessReport?.filesDir ?? null,
    manifestFile: externalCorpusHarnessReport?.manifestFile ?? null,
    selectedFileCount: externalCorpusHarnessReport?.selectedFileCount ?? 0,
    filesScanned: externalCorpusHarnessReport?.analysis?.filesScanned ?? 0,
    classNameOccurrences: externalCorpusHarnessReport?.analysis?.classNameOccurrences ?? 0,
    skippedStoryFiles: externalCorpusHarnessReport?.skipped?.["test-story-file"] ?? 0,
    staticAndSimpleCoverage:
      externalCorpusHarnessReport?.analysis?.editableCoverage?.staticAndSimpleCnClsx ?? 0,
    supportedDirectCoverage:
      externalCorpusHarnessReport?.analysis?.editableCoverage?.supportedDirect ?? 0,
    allObservedCoverage:
      externalCorpusHarnessReport?.analysis?.editableCoverage?.allObservedTokens ?? 0,
    readOnlyClassNameRatio: externalCorpusHarnessReport?.summary?.readOnlyClassNameRatio ?? 0,
    topUnsupportedReasons: externalCorpusHarnessReport?.summary?.topUnsupportedReasons ?? [],
    gateFailureCount: externalCorpusHarnessReport?.gateFailures?.length ?? 0,
    mvpEvidence: externalCorpusHarnessReport?.mvpEvidence ?? null,
    gates: externalCorpusHarnessReport?.gates ?? null,
    targets: externalCorpusHarnessReport?.targets ?? {
      minFiles: externalCorpusHarnessMinFiles,
      editableCoverage: externalCorpusHarnessCoverageTarget
    }
  },
  transform: {
    filesMeasured: transformMeasurements.length,
    iterationsPerFile: transformIterations,
    measurements: transformMeasurements,
    averageMs: average(transformTimes),
    p95Ms: percentile(transformTimes, 0.95),
    maxMs: transformTimes.length ? Number(Math.max(...transformTimes).toFixed(3)) : 0,
    coldMaxMs: coldTransformTimes.length ? Number(Math.max(...coldTransformTimes).toFixed(3)) : 0,
    warmAverageMs: average(transformTimes),
    warmP95Ms: percentile(transformTimes, 0.95),
    warmMaxMs: transformTimes.length ? Number(Math.max(...transformTimes).toFixed(3)) : 0,
    warmTargetMs: warmTransformTargetMs,
    coldTargetMs: coldTransformTargetMs
  },
  largeTransform: {
    file: path.relative(rootDir, largeTransformFile).replace(/\\/g, "/"),
    cardCount: largeTransformCardCount,
    entries: largeTransformLast.entries.length,
    bytes: largeTransformCode.length,
    iterations: largeTransformIterations,
    coldMs: largeColdTransform.transformMs,
    coldTargetMs: largeColdTransformTargetMs,
    coldPass: largeColdTransform.transformMs <= largeColdTransformTargetMs,
    warmupSamples: largeWarmupTransforms.map((sample) => sample.transformMs),
    samples: largeTransformTimes,
    averageMs: average(largeTransformTimes),
    p95Ms: largeTransformP95Ms,
    maxMs: Number(Math.max(...largeTransformTimes).toFixed(3)),
    targetMs: largeWarmTransformTargetMs,
    gateMetric: "p95",
    pass: largeTransformP95Ms <= largeWarmTransformTargetMs
  },
  productGraphWriteThrottle,
  productMultiFileGraphRefresh,
  externalProductGraphRefresh,
  graphLookupProxy: {
    iterations: graphLookupIterations,
    totalMs: Number(graphLookupTotalMs.toFixed(3)),
    averageMs: Number((graphLookupTotalMs / graphLookupIterations).toFixed(6)),
    note: "This measures id-to-binding graph lookup only, not a real browser click event."
  },
  cli: {
    initExitCode: cliInit.exitCode,
    doctorExitCode: cliDoctor.exitCode,
    devExitCode: cliDev.exitCode,
    scanExitCode: cliScan.exitCode,
    checkExitCode: cliCheck.exitCode,
    graphScanExitCode: cliGraphScan.exitCode,
    applyGraphScanExitCode: cliApplyGraphScan.exitCode,
    applyExitCode: cliApply.exitCode,
    diffExitCode: cliDiff.exitCode,
    agentContextExitCode: cliAgentContext.exitCode,
    agentTaskExitCode: cliAgentTask.exitCode,
    agentQueueExitCode: cliAgentQueue.exitCode,
    agentClaimCodexExitCode: cliAgentClaimCodex.exitCode,
    agentLaunchCodexExitCode: cliAgentLaunchCodex.exitCode,
    agentLaunchClaudeExitCode: cliAgentLaunchClaude.exitCode,
    agentResultExitCode: cliAgentResult.exitCode,
    initCommand: cliInitReport?.command ?? null,
    doctorCommand: cliDoctorReport?.command ?? null,
    devCommand: cliDevReport?.command ?? null,
    scanCommand: cliScanReport?.command ?? null,
    checkCommand: cliCheckReport?.command ?? null,
    applyCommand: cliApplyReport?.command ?? null,
    diffCommand: cliDiffReport?.command ?? null,
    agentContextCommand: cliAgentContextReport?.command ?? null,
    agentTaskCommand: cliAgentTaskReport?.command ?? null,
    agentQueueCommand: cliAgentQueueReport?.command ?? null,
    agentClaimCodexCommand: cliAgentClaimCodexReport?.command ?? null,
    agentLaunchCodexCommand: cliAgentLaunchCodexReport?.command ?? null,
    agentLaunchClaudeCommand: cliAgentLaunchClaudeReport?.command ?? null,
    agentResultCommand: cliAgentResultReport?.command ?? null,
    initOk: cliInitReport?.ok ?? false,
    initCreatedPathCount: cliInitReport?.createdPaths.length ?? 0,
    initExistingPathCount: cliInitReport?.existingPaths.length ?? 0,
    initSchemaExists: cliInitSchemaExists,
    doctorOk: cliDoctorReport?.ok ?? false,
    doctorPassCount: cliDoctorReport?.summary.passCount ?? 0,
    doctorWarnCount: cliDoctorReport?.summary.warnCount ?? 0,
    doctorFailCount: cliDoctorReport?.summary.failCount ?? 0,
    doctorCheckCount: cliDoctorReport?.checks.length ?? 0,
    doctorGuidanceCount: cliDoctorReport?.guidance.length ?? 0,
    doctorMs: cliDoctorReport?.doctorMs ?? null,
    doctorMissingPluginExitCode: cliDoctorMissingPlugin.exitCode,
    doctorMissingPluginOk: cliDoctorMissingPluginReport?.ok ?? true,
    doctorMissingPluginPassCount: cliDoctorMissingPluginReport?.summary.passCount ?? 0,
    doctorMissingPluginWarnCount: cliDoctorMissingPluginReport?.summary.warnCount ?? 0,
    doctorMissingPluginFailCount: cliDoctorMissingPluginReport?.summary.failCount ?? 0,
    doctorMissingPluginCheckCount: cliDoctorMissingPluginReport?.checks.length ?? 0,
    doctorMissingPluginGuidanceCount: cliDoctorMissingPluginReport?.guidance.length ?? 0,
    doctorMissingPluginHasVitePluginFailure: cliDoctorMissingPluginHasVitePluginFailure,
    doctorMissingPluginSourceFilesPass: cliDoctorMissingPluginSourceFilesPass,
    doctorMissingPluginGuidanceIncludesVite: cliDoctorMissingPluginGuidanceIncludesVite,
    doctorMissingPluginMs: cliDoctorMissingPluginReport?.doctorMs ?? null,
    devOk: cliDevReport?.ok ?? false,
    devDryRun: cliDevReport?.dryRun ?? false,
    devHost: cliDevReport?.host ?? null,
    devPort: cliDevReport?.port ?? null,
    devUrl: cliDevReport?.url ?? null,
    devUsesLocalVite: cliDevReport?.usesLocalVite ?? false,
    devExecutablePresent: Boolean(cliDevReport?.executable),
    devArgCount: cliDevReport?.args.length ?? 0,
    devMs: cliDevReport?.devMs ?? null,
    filesScanned: cliCheckReport?.summary.filesScanned ?? 0,
    bindingCount: cliCheckReport?.summary.bindingCount ?? 0,
    directEditBindingCount: cliCheckReport?.summary.directEditBindingCount ?? 0,
    readOnlyBindingCount: cliCheckReport?.summary.readOnlyBindingCount ?? 0,
    supportedDirectCoverage: cliCheckReport?.summary.supportedDirectCoverage ?? 0,
    editableTokenCoverage: cliCheckReport?.summary.editableTokenCoverage ?? 0,
    syntaxErrorCount: cliCheckReport?.summary.syntaxErrorCount ?? 0,
    maxTransformMs: cliCheckReport?.summary.maxTransformMs ?? 0,
    gates: cliCheckReport?.gates ?? null,
    graphFileExists: fs.existsSync(cliGraphFile),
    graphEntryCount: cliGraph ? Object.keys(cliGraph.entries).length : 0,
    agentContextSubject: cliAgentContextSubject,
    agentContextOk: cliAgentContextReport?.ok ?? false,
    agentContextFile: cliAgentContextReport?.contextFile ?? null,
    agentContextSelectedBindingId: cliAgentContextReport?.selectedBindingId ?? null,
    agentContextSelectedRelativeFile: cliAgentContextReport?.selectedRelativeFile ?? null,
    agentContextGraphEntryCount: cliAgentContextReport?.graphEntryCount ?? 0,
    agentContextDirectEditBindingCount: cliAgentContextReport?.directEditBindingCount ?? 0,
    agentContextReadOnlyBindingCount: cliAgentContextReport?.readOnlyBindingCount ?? 0,
    agentContextEditableTokenCoverage: cliAgentContextReport?.editableTokenCoverage ?? 0,
    agentContextMarkdownBytes: cliAgentContextReport?.markdownBytes ?? 0,
    agentContextMs: cliAgentContextReport?.contextMs ?? null,
    agentContextSectionsPresent: cliAgentContextSectionsPresent,
    agentTaskBindingId: cliAgentTaskBinding?.id ?? null,
    agentTaskOk: cliAgentTaskReport?.ok ?? false,
    agentTaskFile: cliAgentTaskReport?.taskFile ?? null,
    agentTaskRelativeFile: cliAgentTaskReport?.relativeFile ?? null,
    agentTaskMarkdownBytes: cliAgentTaskReport?.markdownBytes ?? 0,
    agentTaskMs: cliAgentTaskReport?.taskMs ?? null,
    agentTaskSectionsPresent: cliAgentTaskSectionsPresent,
    agentQueueOk: cliAgentQueueReport?.ok ?? false,
    agentQueuePendingTaskCount: cliAgentQueueReport?.pendingTaskCount ?? 0,
    agentQueueLatestTask: cliAgentQueueReport?.latestTask ?? null,
    agentClaimCodexOk: cliAgentClaimCodexReport?.ok ?? false,
    agentClaimCodexTaskFile: cliAgentClaimCodexReport?.taskFile ?? null,
    agentClaimCodexStatus: cliAgentClaimCodexReport?.status ?? null,
    agentClaimCodexLockFile: cliAgentClaimCodexReport?.lockFile ?? null,
    agentLaunchCodexOk: cliAgentLaunchCodexReport?.ok ?? false,
    agentLaunchCodexTaskCreated: cliAgentLaunchCodexReport?.taskCreated ?? false,
    agentLaunchCodexTaskFile: cliAgentLaunchCodexReport?.taskFile ?? null,
    agentLaunchCodexExecuted: cliAgentLaunchCodexReport?.executed ?? true,
    agentLaunchCodexEnabled: cliAgentLaunchCodexReport?.enabled ?? true,
    agentLaunchCodexCommandText: cliAgentLaunchCodexReport?.commandText ?? null,
    agentLaunchCodexMs: cliAgentLaunchCodexReport?.launchMs ?? null,
    agentLaunchClaudeOk: cliAgentLaunchClaudeReport?.ok ?? false,
    agentLaunchClaudeTaskCreated: cliAgentLaunchClaudeReport?.taskCreated ?? true,
    agentLaunchClaudeTaskFile: cliAgentLaunchClaudeReport?.taskFile ?? null,
    agentLaunchClaudeExecuted: cliAgentLaunchClaudeReport?.executed ?? true,
    agentLaunchClaudeEnabled: cliAgentLaunchClaudeReport?.enabled ?? true,
    agentLaunchClaudeCommandText: cliAgentLaunchClaudeReport?.commandText ?? null,
    agentLaunchClaudeMs: cliAgentLaunchClaudeReport?.launchMs ?? null,
    agentResultGraphScanExitCode: cliAgentResultGraphScan.exitCode,
    agentResultTaskExitCode: cliAgentResultTask.exitCode,
    agentResultOk: cliAgentResultReport?.ok ?? false,
    agentResultFile: cliAgentResultReport?.resultFile ?? null,
    agentResultDiffFile: cliAgentResultReport?.diffFile ?? null,
    agentResultRelativeFile: cliAgentResultReport?.relativeFile ?? null,
    agentResultMarkdownBytes: cliAgentResultReport?.resultMarkdownBytes ?? 0,
    agentResultMs: cliAgentResultReport?.resultMs ?? null,
    agentResultSourceDiffLineCount: cliAgentResultReport?.sourceDiffLineCount ?? 0,
    agentResultSemanticChangeCount: cliAgentResultReport?.semanticChangeCount ?? 0,
    agentResultSectionsPresent: cliAgentResultSectionsPresent,
    agentResultSyntaxErrors: cliAgentResultSyntaxErrors,
    applyBindingId: cliApplyBinding?.id ?? null,
    applyOk: cliApplyReport?.ok ?? false,
    applyRelativeFile: cliApplyReport?.relativeFile ?? null,
    applyOperationFile: cliApplyReport?.operationFile ?? null,
    applyDiffFile: cliApplyReport?.diffFile ?? null,
    applyOperationLogFile: cliApplyReport?.operationLogFile ?? null,
    applyMs: cliApplyReport?.applyMs ?? null,
    applySyntaxErrors: cliApplySyntaxErrors,
    diffOk: cliDiffReport?.ok ?? false,
    diffFile: cliDiffReport?.diffFile ?? null,
    diffBytes: cliDiffReport?.bytes ?? 0,
    diffChangeCount: cliDiffReport?.changeCount ?? 0,
    initStdoutBytes: cliInit.stdout.length,
    devStdoutBytes: cliDev.stdout.length,
    scanStdoutBytes: cliScan.stdout.length,
    checkStdoutBytes: cliCheck.stdout.length,
    applyStdoutBytes: cliApply.stdout.length,
    diffStdoutBytes: cliDiff.stdout.length,
    doctorStdoutBytes: cliDoctor.stdout.length,
    doctorMissingPluginStdoutBytes: cliDoctorMissingPlugin.stdout.length,
    agentContextStdoutBytes: cliAgentContext.stdout.length,
    agentTaskStdoutBytes: cliAgentTask.stdout.length,
    agentQueueStdoutBytes: cliAgentQueue.stdout.length,
    agentClaimCodexStdoutBytes: cliAgentClaimCodex.stdout.length,
    agentLaunchCodexStdoutBytes: cliAgentLaunchCodex.stdout.length,
    agentLaunchClaudeStdoutBytes: cliAgentLaunchClaude.stdout.length,
    agentResultStdoutBytes: cliAgentResult.stdout.length
  },
  packageInstall: packageInstallSmoke,
  patch: {
    previewOk: preview.ok,
    previewMs: preview.ok ? preview.metrics.previewMs : preview.metrics?.previewMs,
    previewRoundTripMs,
    applyOk: apply.ok,
    applyMs: apply.ok ? apply.metrics.applyMs : apply.metrics?.applyMs,
    syntaxErrorsAfterPatch,
    revertOk: revert.ok,
    revertMs: revert.ok ? revert.metrics.revertMs : revert.metrics?.applyMs,
    syntaxErrorsAfterRevert,
    staleRejectionOk: !staleApply.ok && staleApply.reason === "source-hash-mismatch",
    staleRejectionReason: staleApply.ok ? null : staleApply.reason,
    simpleCnClsx: {
      applyOk: cnApply.ok,
      applyMs: cnApply.ok ? cnApply.metrics.applyMs : cnApply.metrics?.applyMs,
      syntaxErrorsAfterPatch: syntaxErrorsAfterCnPatch,
      bindingKind: cnPatchEntry.className.kind,
      callee: cnPatchEntry.className.callee,
      dynamicSegments: cnPatchEntry.className.dynamicSegments
    }
  },
  operationLog: {
    logFile: path.relative(rootDir, operationLogFile).replace(/\\/g, "/"),
    firstApplyOk: operationApplyOne.ok,
    secondApplyOk: operationApplyTwo.ok,
    pendingAfterApply: pendingAfterApply.length,
    historyAfterApplyCount: historyAfterApply.pendingCount,
    historyAfterApplyNextToken:
      historyAfterApply.entries.find((entry) => entry.next)?.nextToken ?? null,
    firstRevertOk: operationRevertOne.ok,
    pendingAfterFirstRevert: pendingAfterFirstRevert.length,
    historyAfterFirstRevertCount: historyAfterFirstRevert.pendingCount,
    secondRevertOk: operationRevertTwo.ok,
    pendingAfterSecondRevert: pendingAfterSecondRevert.length,
    historyAfterSecondRevertCount: historyAfterSecondRevert.pendingCount,
    syntaxErrorsAfterRevert: syntaxErrorsAfterOperationStack
  },
  operationBranchUndo: {
    firstApplyOk: operationBranchApplyOne.ok,
    secondApplyOk: operationBranchApplyTwo.ok,
    pendingAfterApply: pendingAfterBranchApply.length,
    historyAfterApplyCount: historyAfterBranchApply.pendingCount,
    discardOk: operationBranchDiscard.ok,
    discardMs: operationBranchDiscard.ok ? operationBranchDiscard.metrics.discardMs : null,
    discardedToken: operationBranchDiscard.ok ? operationBranchDiscard.discardedPatch.nextToken : null,
    pendingAfterDiscard: pendingAfterBranchDiscard.length,
    historyAfterDiscardCount: historyAfterBranchDiscard.pendingCount,
    historyAfterDiscardNextToken: historyAfterBranchDiscard.entries.find((entry) => entry.next)?.nextToken ?? null,
    revertAfterDiscardOk: operationBranchRevert.ok,
    pendingAfterRevert: pendingAfterBranchRevert.length,
    historyAfterRevertCount: historyAfterBranchRevert.pendingCount,
    syntaxErrorsAfterDiscard: syntaxErrorsAfterBranchDiscard
  },
  operationBranchRevert: {
    firstApplyOk: operationBranchRevertApplyOne.ok,
    secondApplyOk: operationBranchRevertApplyTwo.ok,
    pendingAfterApply: pendingAfterBranchRevertApply.length,
    historyAfterApplyCount: historyAfterBranchRevertApply.pendingCount,
    nonTopRevertOk: operationBranchRevertNonTop.ok,
    nonTopRevertMs: operationBranchRevertNonTop.ok ? operationBranchRevertNonTop.metrics.revertMs : null,
    nonTopRevertReason: operationBranchRevertNonTop.ok ? null : operationBranchRevertNonTop.reason,
    pendingAfterNonTopRevert: pendingAfterBranchRevertNonTop.length,
    historyAfterNonTopRevertCount: historyAfterBranchRevertNonTop.pendingCount,
    historyAfterNonTopRevertNextToken:
      historyAfterBranchRevertNonTop.entries.find((entry) => entry.next)?.nextToken ?? null,
    sourceKeepsNonTopPatchToken: branchRevertSourceAfterNonTop.includes("gap-6"),
    sourceKeepsTopPatchToken: branchRevertSourceAfterNonTop.includes("p-8"),
    topRevertOk: operationBranchRevertTop.ok,
    pendingAfterTopRevert: pendingAfterBranchRevertTop.length,
    historyAfterTopRevertCount: historyAfterBranchRevertTop.pendingCount,
    sourceAfterTopRevert:
      branchRevertSourceAfterTop.includes("gap-6") && branchRevertSourceAfterTop.includes("p-6"),
    oldestRevertOk: operationBranchRevertOldest.ok,
    pendingAfterOldestRevert: pendingAfterBranchRevertOldest.length,
    historyAfterOldestRevertCount: historyAfterBranchRevertOldest.pendingCount,
    sourceRestoredAfterOrderedRevert:
      branchRevertSourceAfterOldest.includes("gap-4") && branchRevertSourceAfterOldest.includes("p-6"),
    syntaxErrorsAfterRevert: syntaxErrorsAfterBranchRevert
  },
  operationConflict: {
    applyOk: operationConflictApply.ok,
    revertOk: operationConflictRevert.ok,
    revertReason: operationConflictRevert.ok ? null : operationConflictRevert.reason,
    conflictFile: operationConflictFile
      ? path.relative(rootDir, operationConflictFile).replace(/\\/g, "/")
      : null,
    conflictFileExists: operationConflictFile ? fs.existsSync(operationConflictFile) : false,
    conflictKind: operationConflictArtifact?.kind ?? null,
    conflictExpectedToken: operationConflictArtifact?.expectedToken ?? null,
    conflictActualToken: operationConflictArtifact?.actualToken ?? null,
    conflictRestoreToken: operationConflictArtifact?.restoreToken ?? null,
    conflictGuidanceCount: Array.isArray(operationConflictArtifact?.guidance)
      ? operationConflictArtifact.guidance.length
      : 0,
    pendingAfterConflict: pendingAfterOperationConflict.length,
    activeConflictCountBeforeResolve: operationConflictReport.conflictCount,
    resolveOk: operationConflictResolve.ok,
    resolveAction: operationConflictResolve.ok ? operationConflictResolve.action : null,
    resolveMs: operationConflictResolve.ok ? operationConflictResolve.metrics.resolveMs : null,
    resolvedAtPresent: Boolean(operationConflictResolvedArtifact?.resolvedAt),
    resolutionAction: operationConflictResolvedArtifact?.resolution?.action ?? null,
    pendingAfterResolve: pendingAfterOperationConflictResolve.length,
    activeConflictCountAfterResolve: operationConflictReportAfterResolve.conflictCount,
    syntaxErrorsAfterConflict: syntaxErrorsAfterOperationConflict
  },
  agentTask: {
    ok: agentTask.ok,
    taskMs: agentTask.ok ? agentTask.metrics.taskMs : agentTask.metrics?.taskMs,
    sectionsPresent: agentTaskSectionsPresent,
    taskFile: agentTask.ok ? path.relative(rootDir, agentTask.taskFile).replace(/\\/g, "/") : null,
    taskId: agentTask.ok ? agentTask.taskId : null,
    initialStatus: agentTask.ok ? agentTask.status : null,
    statusAfterResult: agentTaskMetadataAfterResult?.status ?? null,
    doneAfterResult: agentTaskMetadataAfterResult?.status === "done"
  },
  agentResult: {
    ok: agentResult.ok,
    resultMs: agentResult.ok ? agentResult.metrics.resultMs : agentResult.metrics?.resultMs,
    sectionsPresent: agentResultSectionsPresent,
    filesExist: agentResultFilesExist,
    resultFile: agentResult.ok
      ? path.relative(rootDir, agentResult.resultFile).replace(/\\/g, "/")
      : null,
    diffFile: agentResult.ok ? path.relative(rootDir, agentResult.diffFile).replace(/\\/g, "/") : null,
    sourceHashChanged: agentResult.ok ? agentResult.source.sourceHashChanged : null,
    snapshotAvailable: agentResult.ok ? agentResult.source.snapshotAvailable : false,
    diffLineCount: agentResult.ok ? agentResult.source.diffLineCount : 0,
    sourceDiffPresent: agentResult.ok ? Boolean(agentResult.sourceDiff) : false,
    semanticChangeCount: agentResult.ok ? agentResult.source.semanticChangeCount : 0,
    semanticDiffPresent: agentResult.ok ? Boolean(agentResult.semanticDiff) : false,
    semanticTokenAddedCount: agentResult.ok ? agentResult.semanticDiff?.tokenAddedCount ?? 0 : 0,
    semanticTokenRemovedCount: agentResult.ok ? agentResult.semanticDiff?.tokenRemovedCount ?? 0 : 0,
    componentSnapshotAvailable: agentResult.ok
      ? agentResult.source.componentSnapshotAvailable
      : false,
    componentDiffLineCount: agentResult.ok ? agentResult.source.componentDiffLineCount : 0,
    componentSourceDiffPresent: agentResult.ok ? Boolean(agentResult.componentSourceDiff) : false,
    componentSemanticChangeCount: agentResult.ok
      ? agentResult.source.componentSemanticChangeCount
      : 0,
    componentSemanticDiffPresent: agentResult.ok
      ? Boolean(agentResult.componentSemanticDiff)
      : false,
    componentSemanticTokenAddedCount: agentResult.ok
      ? agentResult.componentSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    componentSemanticTokenRemovedCount: agentResult.ok
      ? agentResult.componentSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  componentSnapshotFixtures: {
    cases: componentSnapshotFixtures.length,
    passCount: componentSnapshotFixturePassCount,
    passRate: componentSnapshotFixtures.length
      ? Number((componentSnapshotFixturePassCount / componentSnapshotFixtures.length).toFixed(4))
      : 0,
    results: componentSnapshotFixtures
  },
  readOnlyBinding: {
    entryCreated: Boolean(readOnlyEntry),
    kind: readOnlyEntry?.className.kind ?? null,
    unsupportedReason: readOnlyEntry?.className.unsupportedReason ?? null,
    tokenCount: readOnlyEntry?.tokens.length ?? 0,
    taskOk: readOnlyTask.ok,
    taskMs: readOnlyTask.ok ? readOnlyTask.metrics.taskMs : readOnlyTask.metrics?.taskMs,
    resultOk: readOnlyResult.ok,
    resultMs: readOnlyResult.ok ? readOnlyResult.metrics.resultMs : readOnlyResult.metrics?.resultMs,
    syntaxErrorsAfterResult: readOnlySyntaxErrorsAfterResult,
    sourceDiffLineCount: readOnlyResult.ok ? readOnlyResult.source.diffLineCount : 0,
    sourceDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.sourceDiff) : false,
    componentDiffLineCount: readOnlyResult.ok ? readOnlyResult.source.componentDiffLineCount : 0,
    componentSourceDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.componentSourceDiff) : false,
    relatedSnapshotAvailable: readOnlyResult.ok ? readOnlyResult.source.relatedSnapshotAvailable : false,
    relatedDiffLineCount: readOnlyResult.ok ? readOnlyResult.source.relatedDiffLineCount : 0,
    relatedSourceDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.relatedSourceDiff) : false,
    relatedSemanticChangeCount: readOnlyResult.ok
      ? readOnlyResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.relatedSemanticDiff) : false,
    relatedSemanticTokenAddedCount: readOnlyResult.ok
      ? readOnlyResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: readOnlyResult.ok
      ? readOnlyResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  readOnlyCnVariableBinding: {
    entryCreated: Boolean(readOnlyCnVariableEntry),
    kind: readOnlyCnVariableEntry?.className.kind ?? null,
    unsupportedReason: readOnlyCnVariableEntry?.className.unsupportedReason ?? null,
    tokenCount: readOnlyCnVariableEntry?.tokens.length ?? 0,
    taskOk: readOnlyCnVariableTask.ok,
    taskMs: readOnlyCnVariableTask.ok
      ? readOnlyCnVariableTask.metrics.taskMs
      : readOnlyCnVariableTask.metrics?.taskMs,
    resultOk: readOnlyCnVariableResult.ok,
    resultMs: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.metrics.resultMs
      : readOnlyCnVariableResult.metrics?.resultMs,
    syntaxErrorsAfterResult: readOnlyCnVariableSyntaxErrorsAfterResult,
    sourceDiffLineCount: readOnlyCnVariableResult.ok ? readOnlyCnVariableResult.source.diffLineCount : 0,
    sourceDiffPresent: readOnlyCnVariableResult.ok ? Boolean(readOnlyCnVariableResult.sourceDiff) : false,
    componentDiffLineCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: readOnlyCnVariableResult.ok
      ? Boolean(readOnlyCnVariableResult.componentSourceDiff)
      : false,
    relatedSnapshotAvailable: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: readOnlyCnVariableResult.ok
      ? Boolean(readOnlyCnVariableResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: readOnlyCnVariableResult.ok
      ? Boolean(readOnlyCnVariableResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  readOnlyCompositeVariableBinding: {
    entryCreated: Boolean(readOnlyCompositeVariableEntry),
    kind: readOnlyCompositeVariableEntry?.className.kind ?? null,
    unsupportedReason: readOnlyCompositeVariableEntry?.className.unsupportedReason ?? null,
    tokenCount: readOnlyCompositeVariableEntry?.tokens.length ?? 0,
    taskOk: readOnlyCompositeVariableTask.ok,
    taskMs: readOnlyCompositeVariableTask.ok
      ? readOnlyCompositeVariableTask.metrics.taskMs
      : readOnlyCompositeVariableTask.metrics?.taskMs,
    resultOk: readOnlyCompositeVariableResult.ok,
    resultMs: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.metrics.resultMs
      : readOnlyCompositeVariableResult.metrics?.resultMs,
    syntaxErrorsAfterResult: readOnlyCompositeVariableSyntaxErrorsAfterResult,
    sourceDiffLineCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.diffLineCount
      : 0,
    sourceDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.sourceDiff)
      : false,
    componentDiffLineCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.componentSourceDiff)
      : false,
    relatedSnapshotAvailable: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  crossVariableDependencyBinding: {
    entryCreated: Boolean(crossVariableDependencyEntry),
    kind: crossVariableDependencyEntry?.className.kind ?? null,
    unsupportedReason: crossVariableDependencyEntry?.className.unsupportedReason ?? null,
    value: crossVariableDependencyEntry?.className.value ?? null,
    tokenCount: crossVariableDependencyEntry?.tokens.length ?? 0,
    taskOk: crossVariableDependencyTask.ok,
    taskMs: crossVariableDependencyTask.ok
      ? crossVariableDependencyTask.metrics.taskMs
      : crossVariableDependencyTask.metrics?.taskMs,
    dependencySnapshotCount: crossVariableDependencySnapshots.length,
    dependencySnapshotFiles: crossVariableDependencySnapshots.map((snapshot) => snapshot.file),
    dependencySnapshotIdentifiers: crossVariableDependencySnapshots.map(
      (snapshot) => snapshot.identifier
    ),
    dependencySnapshotsReferenceCardClass: crossVariableDependencySnapshots.every(
      (snapshot) => snapshot.referencedBy === "cardClass"
    ),
    dependencySnapshotsIncludeClassTokens: crossVariableDependencySnapshots.every((snapshot) =>
      snapshot.excerpt.includes("Class")
    ),
    resultOk: crossVariableDependencyResult.ok,
    resultMs: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.metrics.resultMs
      : crossVariableDependencyResult.metrics?.resultMs,
    syntaxErrorsAfterResult: crossVariableDependencySyntaxErrorsAfterResult,
    sourceDiffLineCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.source.diffLineCount
      : 0,
    sourceDiffPresent: crossVariableDependencyResult.ok
      ? Boolean(crossVariableDependencyResult.sourceDiff)
      : false,
    relatedDiffLineCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: crossVariableDependencyResult.ok
      ? Boolean(crossVariableDependencyResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.source.relatedSemanticChangeCount
      : 0,
    relatedDependencySnapshotCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.source.relatedDependencySnapshotCount
      : 0,
    relatedDependencyDiffLineCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.source.relatedDependencyDiffLineCount
      : 0,
    relatedDependencySourceDiffPresent: crossVariableDependencyResult.ok
      ? Boolean(crossVariableDependencyResult.relatedDependencySourceDiff)
      : false,
    relatedDependencySemanticChangeCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.source.relatedDependencySemanticChangeCount
      : 0,
    relatedDependencySemanticDiffPresent: crossVariableDependencyResult.ok
      ? Boolean(crossVariableDependencyResult.relatedDependencySemanticDiff)
      : false,
    relatedDependencySemanticTokenAddedCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.relatedDependencySemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedDependencySemanticTokenRemovedCount: crossVariableDependencyResult.ok
      ? crossVariableDependencyResult.relatedDependencySemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  importedVariableHandoffBinding: {
    entryCreated: Boolean(importedVariableHandoffEntry),
    root: reportPath(importedVariableRoot),
    kind: importedVariableHandoffEntry?.className.kind ?? null,
    unsupportedReason: importedVariableHandoffEntry?.className.unsupportedReason ?? null,
    value: importedVariableHandoffEntry?.className.value ?? null,
    tokenCount: importedVariableHandoffEntry?.tokens.length ?? 0,
    taskOk: importedVariableHandoffTask.ok,
    taskMs: importedVariableHandoffTask.ok
      ? importedVariableHandoffTask.metrics.taskMs
      : importedVariableHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(importedVariableHandoffRelatedSnapshot),
    relatedSnapshotFile: importedVariableHandoffRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: importedVariableHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: importedVariableHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesClass: Boolean(
      importedVariableHandoffRelatedSnapshot?.excerpt.includes("grid grid-cols-3")
    ),
    resultOk: importedVariableHandoffResult.ok,
    resultMs: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.metrics.resultMs
      : importedVariableHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: importedVariableHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: importedVariableHandoffResult.ok
      ? Boolean(importedVariableHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: importedVariableHandoffResult.ok
      ? Boolean(importedVariableHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: importedVariableHandoffResult.ok
      ? Boolean(importedVariableHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: importedVariableHandoffResult.ok
      ? Boolean(importedVariableHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: importedVariableHandoffResult.ok
      ? importedVariableHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  importedVariableDependencyHandoffBinding: {
    entryCreated: Boolean(importedVariableDependencyHandoffEntry),
    root: reportPath(importedVariableDependencyRoot),
    kind: importedVariableDependencyHandoffEntry?.className.kind ?? null,
    unsupportedReason:
      importedVariableDependencyHandoffEntry?.className.unsupportedReason ?? null,
    value: importedVariableDependencyHandoffEntry?.className.value ?? null,
    tokenCount: importedVariableDependencyHandoffEntry?.tokens.length ?? 0,
    taskOk: importedVariableDependencyHandoffTask.ok,
    taskMs: importedVariableDependencyHandoffTask.ok
      ? importedVariableDependencyHandoffTask.metrics.taskMs
      : importedVariableDependencyHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(importedVariableDependencyRelatedSnapshot),
    relatedSnapshotFile: importedVariableDependencyRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: importedVariableDependencyRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: importedVariableDependencyRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesDependencyReferences: Boolean(
      importedVariableDependencyRelatedSnapshot?.excerpt.includes("baseCardClass") &&
        importedVariableDependencyRelatedSnapshot.excerpt.includes("toneClass")
    ),
    dependencySnapshotCount: importedVariableDependencySnapshots.length,
    dependencySnapshotFiles: importedVariableDependencySnapshots.map((snapshot) => snapshot.file),
    dependencySnapshotIdentifiers: importedVariableDependencySnapshots.map(
      (snapshot) => snapshot.identifier
    ),
    dependencySnapshotsReferenceCardClass: importedVariableDependencySnapshots.every(
      (snapshot) => snapshot.referencedBy === "cardClass"
    ),
    dependencySnapshotsAreImportedSource: importedVariableDependencySnapshots.every(
      (snapshot) => snapshot.file === "src/styles/cardClass.ts"
    ),
    dependencySnapshotsIncludeClassTokens: importedVariableDependencySnapshots.every((snapshot) =>
      /grid|bg-|text-|shadow|gap-/.test(snapshot.excerpt)
    ),
    resultOk: importedVariableDependencyHandoffResult.ok,
    resultMs: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.metrics.resultMs
      : importedVariableDependencyHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: importedVariableDependencySyntaxErrorsAfterResult,
    sourceDiffLineCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: importedVariableDependencyHandoffResult.ok
      ? Boolean(importedVariableDependencyHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: importedVariableDependencyHandoffResult.ok
      ? Boolean(importedVariableDependencyHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: importedVariableDependencyHandoffResult.ok
      ? Boolean(importedVariableDependencyHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedDependencySnapshotCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.relatedDependencySnapshotCount
      : 0,
    relatedDependencyDiffLineCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.relatedDependencyDiffLineCount
      : 0,
    relatedDependencySourceDiffPresent: importedVariableDependencyHandoffResult.ok
      ? Boolean(importedVariableDependencyHandoffResult.relatedDependencySourceDiff)
      : false,
    relatedDependencySemanticChangeCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.source.relatedDependencySemanticChangeCount
      : 0,
    relatedDependencySemanticDiffPresent: importedVariableDependencyHandoffResult.ok
      ? Boolean(importedVariableDependencyHandoffResult.relatedDependencySemanticDiff)
      : false,
    relatedDependencySemanticTokenAddedCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.relatedDependencySemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedDependencySemanticTokenRemovedCount: importedVariableDependencyHandoffResult.ok
      ? importedVariableDependencyHandoffResult.relatedDependencySemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  transitiveDependencyHandoffBinding: {
    entryCreated: Boolean(transitiveDependencyHandoffEntry),
    root: reportPath(transitiveDependencyRoot),
    kind: transitiveDependencyHandoffEntry?.className.kind ?? null,
    unsupportedReason: transitiveDependencyHandoffEntry?.className.unsupportedReason ?? null,
    value: transitiveDependencyHandoffEntry?.className.value ?? null,
    tokenCount: transitiveDependencyHandoffEntry?.tokens.length ?? 0,
    taskOk: transitiveDependencyHandoffTask.ok,
    taskMs: transitiveDependencyHandoffTask.ok
      ? transitiveDependencyHandoffTask.metrics.taskMs
      : transitiveDependencyHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(transitiveDependencyRelatedSnapshot),
    relatedSnapshotFile: transitiveDependencyRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: transitiveDependencyRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: transitiveDependencyRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesImportedDependencyReferences: Boolean(
      transitiveDependencyRelatedSnapshot?.excerpt.includes("baseCardClass") &&
        transitiveDependencyRelatedSnapshot.excerpt.includes("importedToneClass")
    ),
    dependencySnapshotCount: transitiveDependencySnapshots.length,
    dependencySnapshotFiles: transitiveDependencySnapshots.map((snapshot) => snapshot.file),
    dependencySnapshotIdentifiers: transitiveDependencySnapshots.map(
      (snapshot) => snapshot.identifier
    ),
    dependencySnapshotsReferenceCardClass: transitiveDependencySnapshots.every(
      (snapshot) => snapshot.referencedBy === "cardClass"
    ),
    dependencySnapshotsAreImportedTokenSource: transitiveDependencySnapshots.every(
      (snapshot) => snapshot.file === "src/tokens/cardTokens.ts"
    ),
    dependencySnapshotsIncludeClassTokens: transitiveDependencySnapshots.every((snapshot) =>
      /grid|bg-|text-|shadow|gap-/.test(snapshot.excerpt)
    ),
    resultOk: transitiveDependencyHandoffResult.ok,
    resultMs: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.metrics.resultMs
      : transitiveDependencyHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: transitiveDependencySyntaxErrorsAfterResult,
    sourceDiffLineCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: transitiveDependencyHandoffResult.ok
      ? Boolean(transitiveDependencyHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: transitiveDependencyHandoffResult.ok
      ? Boolean(transitiveDependencyHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: transitiveDependencyHandoffResult.ok
      ? Boolean(transitiveDependencyHandoffResult.relatedSourceDiff)
      : false,
    relatedDependencySnapshotCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.relatedDependencySnapshotCount
      : 0,
    relatedDependencyDiffLineCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.relatedDependencyDiffLineCount
      : 0,
    relatedDependencySourceDiffPresent: transitiveDependencyHandoffResult.ok
      ? Boolean(transitiveDependencyHandoffResult.relatedDependencySourceDiff)
      : false,
    relatedDependencySemanticChangeCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.source.relatedDependencySemanticChangeCount
      : 0,
    relatedDependencySemanticDiffPresent: transitiveDependencyHandoffResult.ok
      ? Boolean(transitiveDependencyHandoffResult.relatedDependencySemanticDiff)
      : false,
    relatedDependencySemanticTokenAddedCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.relatedDependencySemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedDependencySemanticTokenRemovedCount: transitiveDependencyHandoffResult.ok
      ? transitiveDependencyHandoffResult.relatedDependencySemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  propertyAccessHandoffBinding: {
    entryCreated: Boolean(propertyAccessHandoffEntry),
    root: reportPath(propertyAccessRoot),
    kind: propertyAccessHandoffEntry?.className.kind ?? null,
    unsupportedReason: propertyAccessHandoffEntry?.className.unsupportedReason ?? null,
    value: propertyAccessHandoffEntry?.className.value ?? null,
    tokenCount: propertyAccessHandoffEntry?.tokens.length ?? 0,
    taskOk: propertyAccessHandoffTask.ok,
    taskMs: propertyAccessHandoffTask.ok
      ? propertyAccessHandoffTask.metrics.taskMs
      : propertyAccessHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(propertyAccessHandoffRelatedSnapshot),
    relatedSnapshotFile: propertyAccessHandoffRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: propertyAccessHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: propertyAccessHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesPropertyClass: Boolean(
      propertyAccessHandoffRelatedSnapshot?.excerpt.includes(
        "text-xl font-semibold text-gray-950"
      )
    ),
    resultOk: propertyAccessHandoffResult.ok,
    resultMs: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.metrics.resultMs
      : propertyAccessHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: propertyAccessHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: propertyAccessHandoffResult.ok
      ? Boolean(propertyAccessHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: propertyAccessHandoffResult.ok
      ? Boolean(propertyAccessHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: propertyAccessHandoffResult.ok
      ? Boolean(propertyAccessHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: propertyAccessHandoffResult.ok
      ? Boolean(propertyAccessHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: propertyAccessHandoffResult.ok
      ? propertyAccessHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  externalPackageImportHandoffBinding: {
    entryCreated: Boolean(externalPackageImportEntry),
    root: reportPath(externalPackageImportRoot),
    kind: externalPackageImportEntry?.className.kind ?? null,
    unsupportedReason: externalPackageImportEntry?.className.unsupportedReason ?? null,
    value: externalPackageImportEntry?.className.value ?? null,
    tokenCount: externalPackageImportEntry?.tokens.length ?? 0,
    taskOk: externalPackageImportTask.ok,
    taskMs: externalPackageImportTask.ok
      ? externalPackageImportTask.metrics.taskMs
      : externalPackageImportTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(externalPackageImportRelatedSnapshot),
    externalReferenceAvailable: Boolean(externalPackageImportReference),
    externalReferenceKind: externalPackageImportReference?.kind ?? null,
    externalReferenceUsageKind: externalPackageImportReference?.usageKind ?? null,
    externalReferenceSpecifier: externalPackageImportReference?.specifier ?? null,
    externalReferencePackageName: externalPackageImportReference?.packageName ?? null,
    externalReferenceSubpath: externalPackageImportReference?.subpath ?? null,
    externalReferenceImportKind: externalPackageImportReference?.importKind ?? null,
    externalReferenceImportedName: externalPackageImportReference?.importedName ?? null,
    externalReferenceLocalName: externalPackageImportReference?.localName ?? null,
    externalReferenceReferencedName: externalPackageImportReference?.referencedName ?? null,
    externalReferenceEditable: externalPackageImportReference?.editable ?? null,
    externalReferenceReason: externalPackageImportReference?.reason ?? null,
    externalReferenceGuidanceCount: externalPackageImportReference?.guidance.length ?? 0,
    taskMentionsNodeModules: externalPackageImportTask.ok
      ? externalPackageImportTask.markdown.includes("node_modules/")
      : false,
    taskMentionsExternalEditGuard: externalPackageImportTask.ok
      ? externalPackageImportTask.markdown.includes("external package source for `@external-ui/react`")
      : false,
    resultOk: externalPackageImportResult.ok,
    resultMs: externalPackageImportResult.ok
      ? externalPackageImportResult.metrics.resultMs
      : externalPackageImportResult.metrics?.resultMs,
    syntaxErrorsAfterResult: externalPackageImportSyntaxErrorsAfterResult,
    sourceDiffLineCount: externalPackageImportResult.ok
      ? externalPackageImportResult.source.diffLineCount
      : 0,
    sourceDiffPresent: externalPackageImportResult.ok
      ? Boolean(externalPackageImportResult.sourceDiff)
      : false,
    semanticChangeCount: externalPackageImportResult.ok
      ? externalPackageImportResult.source.semanticChangeCount
      : 0,
    semanticDiffPresent: externalPackageImportResult.ok
      ? Boolean(externalPackageImportResult.semanticDiff)
      : false,
    semanticTokenAddedCount: externalPackageImportResult.ok
      ? externalPackageImportResult.semanticDiff?.tokenAddedCount ?? 0
      : 0,
    semanticTokenRemovedCount: externalPackageImportResult.ok
      ? externalPackageImportResult.semanticDiff?.tokenRemovedCount ?? 0
      : 0,
    componentDiffLineCount: externalPackageImportResult.ok
      ? externalPackageImportResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: externalPackageImportResult.ok
      ? Boolean(externalPackageImportResult.componentSourceDiff)
      : false
  },
  packageImportHandoffBinding: {
    entryCreated: Boolean(packageImportHandoffEntry),
    root: reportPath(packageImportRoot),
    kind: packageImportHandoffEntry?.className.kind ?? null,
    unsupportedReason: packageImportHandoffEntry?.className.unsupportedReason ?? null,
    value: packageImportHandoffEntry?.className.value ?? null,
    tokenCount: packageImportHandoffEntry?.tokens.length ?? 0,
    taskOk: packageImportHandoffTask.ok,
    taskMs: packageImportHandoffTask.ok
      ? packageImportHandoffTask.metrics.taskMs
      : packageImportHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(packageImportHandoffRelatedSnapshot),
    relatedSnapshotFile: packageImportHandoffRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: packageImportHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: packageImportHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesClass: Boolean(
      packageImportHandoffRelatedSnapshot?.excerpt.includes("grid grid-cols-3")
    ),
    relatedSnapshotIsWorkspacePackageSource:
      packageImportHandoffRelatedSnapshot?.file === "packages/ui/src/styles.ts",
    resultOk: packageImportHandoffResult.ok,
    resultMs: packageImportHandoffResult.ok
      ? packageImportHandoffResult.metrics.resultMs
      : packageImportHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: packageImportHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: packageImportHandoffResult.ok
      ? packageImportHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: packageImportHandoffResult.ok
      ? Boolean(packageImportHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: packageImportHandoffResult.ok
      ? packageImportHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: packageImportHandoffResult.ok
      ? Boolean(packageImportHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: packageImportHandoffResult.ok
      ? packageImportHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: packageImportHandoffResult.ok
      ? packageImportHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: packageImportHandoffResult.ok
      ? Boolean(packageImportHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: packageImportHandoffResult.ok
      ? packageImportHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: packageImportHandoffResult.ok
      ? Boolean(packageImportHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: packageImportHandoffResult.ok
      ? packageImportHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: packageImportHandoffResult.ok
      ? packageImportHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  variantHandoffBinding: {
    entryCreated: Boolean(variantHandoffEntry),
    kind: variantHandoffEntry?.className.kind ?? null,
    unsupportedReason: variantHandoffEntry?.className.unsupportedReason ?? null,
    value: variantHandoffEntry?.className.value ?? null,
    tokenCount: variantHandoffEntry?.tokens.length ?? 0,
    taskOk: variantHandoffTask.ok,
    taskMs: variantHandoffTask.ok
      ? variantHandoffTask.metrics.taskMs
      : variantHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(variantHandoffRelatedSnapshot),
    relatedSnapshotKind: variantHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: variantHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesCva: Boolean(variantHandoffRelatedSnapshot?.excerpt.includes("cva(")),
    resultOk: variantHandoffResult.ok,
    resultMs: variantHandoffResult.ok
      ? variantHandoffResult.metrics.resultMs
      : variantHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: variantHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: variantHandoffResult.ok ? variantHandoffResult.source.diffLineCount : 0,
    sourceDiffPresent: variantHandoffResult.ok ? Boolean(variantHandoffResult.sourceDiff) : false,
    componentDiffLineCount: variantHandoffResult.ok
      ? variantHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: variantHandoffResult.ok
      ? Boolean(variantHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: variantHandoffResult.ok
      ? variantHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: variantHandoffResult.ok
      ? variantHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: variantHandoffResult.ok
      ? Boolean(variantHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: variantHandoffResult.ok
      ? variantHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: variantHandoffResult.ok
      ? Boolean(variantHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: variantHandoffResult.ok
      ? variantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: variantHandoffResult.ok
      ? variantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  importedVariantHandoffBinding: {
    entryCreated: Boolean(importedVariantHandoffEntry),
    kind: importedVariantHandoffEntry?.className.kind ?? null,
    unsupportedReason: importedVariantHandoffEntry?.className.unsupportedReason ?? null,
    value: importedVariantHandoffEntry?.className.value ?? null,
    tokenCount: importedVariantHandoffEntry?.tokens.length ?? 0,
    taskOk: importedVariantHandoffTask.ok,
    taskMs: importedVariantHandoffTask.ok
      ? importedVariantHandoffTask.metrics.taskMs
      : importedVariantHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(importedVariantHandoffRelatedSnapshot),
    relatedSnapshotFile: importedVariantHandoffRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: importedVariantHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: importedVariantHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesCva: Boolean(importedVariantHandoffRelatedSnapshot?.excerpt.includes("cva(")),
    resultOk: importedVariantHandoffResult.ok,
    resultMs: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.metrics.resultMs
      : importedVariantHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: importedVariantHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: importedVariantHandoffResult.ok
      ? Boolean(importedVariantHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: importedVariantHandoffResult.ok
      ? Boolean(importedVariantHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: importedVariantHandoffResult.ok
      ? Boolean(importedVariantHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: importedVariantHandoffResult.ok
      ? Boolean(importedVariantHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: importedVariantHandoffResult.ok
      ? importedVariantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  aliasBarrelVariantHandoffBinding: {
    entryCreated: Boolean(aliasBarrelVariantHandoffEntry),
    root: reportPath(aliasBarrelVariantRoot),
    kind: aliasBarrelVariantHandoffEntry?.className.kind ?? null,
    unsupportedReason: aliasBarrelVariantHandoffEntry?.className.unsupportedReason ?? null,
    value: aliasBarrelVariantHandoffEntry?.className.value ?? null,
    tokenCount: aliasBarrelVariantHandoffEntry?.tokens.length ?? 0,
    taskOk: aliasBarrelVariantHandoffTask.ok,
    taskMs: aliasBarrelVariantHandoffTask.ok
      ? aliasBarrelVariantHandoffTask.metrics.taskMs
      : aliasBarrelVariantHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(aliasBarrelVariantHandoffRelatedSnapshot),
    relatedSnapshotFile: aliasBarrelVariantHandoffRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: aliasBarrelVariantHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: aliasBarrelVariantHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesCva: Boolean(aliasBarrelVariantHandoffRelatedSnapshot?.excerpt.includes("cva(")),
    resultOk: aliasBarrelVariantHandoffResult.ok,
    resultMs: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.metrics.resultMs
      : aliasBarrelVariantHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: aliasBarrelVariantHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: aliasBarrelVariantHandoffResult.ok
      ? Boolean(aliasBarrelVariantHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: aliasBarrelVariantHandoffResult.ok
      ? Boolean(aliasBarrelVariantHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: aliasBarrelVariantHandoffResult.ok
      ? Boolean(aliasBarrelVariantHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: aliasBarrelVariantHandoffResult.ok
      ? Boolean(aliasBarrelVariantHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: aliasBarrelVariantHandoffResult.ok
      ? aliasBarrelVariantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  multiHopVariantHandoffBinding: {
    entryCreated: Boolean(multiHopVariantHandoffEntry),
    root: reportPath(multiHopVariantRoot),
    kind: multiHopVariantHandoffEntry?.className.kind ?? null,
    unsupportedReason: multiHopVariantHandoffEntry?.className.unsupportedReason ?? null,
    value: multiHopVariantHandoffEntry?.className.value ?? null,
    tokenCount: multiHopVariantHandoffEntry?.tokens.length ?? 0,
    taskOk: multiHopVariantHandoffTask.ok,
    taskMs: multiHopVariantHandoffTask.ok
      ? multiHopVariantHandoffTask.metrics.taskMs
      : multiHopVariantHandoffTask.metrics?.taskMs,
    relatedSnapshotAvailable: Boolean(multiHopVariantHandoffRelatedSnapshot),
    relatedSnapshotFile: multiHopVariantHandoffRelatedSnapshot?.file ?? null,
    relatedSnapshotKind: multiHopVariantHandoffRelatedSnapshot?.kind ?? null,
    relatedSnapshotIdentifier: multiHopVariantHandoffRelatedSnapshot?.identifier ?? null,
    relatedSnapshotIncludesCva: Boolean(multiHopVariantHandoffRelatedSnapshot?.excerpt.includes("cva(")),
    resultOk: multiHopVariantHandoffResult.ok,
    resultMs: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.metrics.resultMs
      : multiHopVariantHandoffResult.metrics?.resultMs,
    syntaxErrorsAfterResult: multiHopVariantHandoffSyntaxErrorsAfterResult,
    sourceDiffLineCount: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.source.diffLineCount
      : 0,
    sourceDiffPresent: multiHopVariantHandoffResult.ok
      ? Boolean(multiHopVariantHandoffResult.sourceDiff)
      : false,
    componentDiffLineCount: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: multiHopVariantHandoffResult.ok
      ? Boolean(multiHopVariantHandoffResult.componentSourceDiff)
      : false,
    relatedResultSnapshotAvailable: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: multiHopVariantHandoffResult.ok
      ? Boolean(multiHopVariantHandoffResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: multiHopVariantHandoffResult.ok
      ? Boolean(multiHopVariantHandoffResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: multiHopVariantHandoffResult.ok
      ? multiHopVariantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  gates: {
    staticEditableTokenCoveragePass: corpus.editableCoverage.staticOnly >= 0.3,
    staticAndSimpleCoveragePass: corpus.editableCoverage.staticAndSimpleCnClsx >= 0.5,
    supportedDirectCoveragePass: corpus.editableCoverage.supportedDirect >= 0.5,
    aiGeneratedCorpusMinFilesPass: aiGeneratedCorpus.filesScanned >= aiCorpusMinFiles,
    aiGeneratedStaticAndSimpleCoveragePass:
      aiGeneratedCorpus.editableCoverage.staticAndSimpleCnClsx >= aiCorpusCoverageTarget,
    aiGeneratedSupportedDirectCoveragePass:
      aiGeneratedCorpus.editableCoverage.supportedDirect >= aiCorpusCoverageTarget,
    aiGeneratedAllObservedCoveragePass:
      aiGeneratedCorpus.editableCoverage.allObservedTokens >= aiCorpusCoverageTarget,
    externalCorpusHarnessPass:
      externalCorpusHarnessImport.exitCode === 0 &&
      externalCorpusHarnessReport?.available === true &&
      externalCorpusHarnessReport.selectedFileCount === externalCorpusHarnessMinFiles &&
      externalCorpusHarnessReport.analysis?.filesScanned === externalCorpusHarnessMinFiles &&
      externalCorpusHarnessReport.sample?.label === "eval-external-corpus-harness" &&
      externalCorpusHarnessReport.sample?.sourceKind === "local-smoke-fixture" &&
      externalCorpusHarnessReport.sample?.localSmokeFixture === true &&
      externalCorpusHarnessReport.sample?.independent === false &&
      externalCorpusHarnessReport.skipped?.["test-story-file"] === 1 &&
      externalCorpusHarnessReport.gates?.minFilesPass === true &&
      externalCorpusHarnessReport.gates.staticAndSimpleCoveragePass === true &&
      externalCorpusHarnessReport.gates.supportedDirectCoveragePass === true &&
      externalCorpusHarnessReport.gates.allObservedCoveragePass === true &&
      externalCorpusHarnessReport.gateFailures?.length === 0 &&
      externalCorpusHarnessReport.mvpEvidence?.usableAsMvpEvidence === false &&
      externalCorpusHarnessReport.mvpEvidence?.decision === "measurement-smoke-only",
    coldTransformTargetPass:
      coldTransformTimes.length > 0 && Math.max(...coldTransformTimes) <= coldTransformTargetMs,
    warmTransformTargetPass:
      transformTimes.length > 0 && Math.max(...transformTimes) <= warmTransformTargetMs,
    largeColdTransformTargetPass: largeColdTransform.transformMs <= largeColdTransformTargetMs,
    largeTransformTargetPass: largeTransformP95Ms <= largeWarmTransformTargetMs,
    productGraphWriteThrottlePass: productGraphWriteThrottle.pass,
    productMultiFileGraphRefreshPass: productMultiFileGraphRefresh.pass,
    cliInitPass:
      cliInit.exitCode === 0 &&
      cliInitReport?.command === "init" &&
      cliInitReport.ok &&
      cliInitSchemaExists,
    cliDevDryRunPass:
      cliDev.exitCode === 0 &&
      cliDevReport?.command === "dev" &&
      cliDevReport.ok &&
      cliDevReport.dryRun &&
      cliDevReport.usesLocalVite &&
      cliDevReport.host === "127.0.0.1" &&
      cliDevReport.port === 5173 &&
      cliDevReport.args.some((arg) => arg.endsWith("vite.js")),
    cliDoctorPass:
      cliDoctor.exitCode === 0 &&
      cliDoctorReport?.command === "doctor" &&
      cliDoctorReport.ok &&
      cliDoctorReport.summary.failCount === 0 &&
      cliDoctorReport.summary.passCount >= 8 &&
      cliDoctorReport.checks.some((check) => check.name === "vite-plugin" && check.status === "pass") &&
      cliDoctorReport.checks.some((check) => check.name === "source-files" && check.status === "pass"),
    cliDoctorMissingPluginGuidancePass:
      cliDoctorMissingPlugin.exitCode === 1 &&
      cliDoctorMissingPluginReport?.command === "doctor" &&
      !cliDoctorMissingPluginReport.ok &&
      cliDoctorMissingPluginReport.summary.failCount === 1 &&
      cliDoctorMissingPluginHasVitePluginFailure &&
      cliDoctorMissingPluginSourceFilesPass &&
      cliDoctorMissingPluginGuidanceIncludesVite,
    packageInstallSmokePass:
      packageInstallSmoke.dryRunExitCode === 0 &&
      packageInstallSmoke.packExitCode === 0 &&
      packageInstallSmoke.installExitCode === 0 &&
      packageInstallSmoke.helpExitCode === 0 &&
      packageInstallSmoke.viteImportExitCode === 0 &&
      packageInstallSmoke.installedViteTransformExitCode === 0 &&
      packageInstallSmoke.installedViteDevServerExitCode === 0 &&
      packageInstallSmoke.binTarget === "dist/cli.js" &&
      packageInstallSmoke.viteExportTarget === "./dist/vite.js" &&
      packageInstallSmoke.cliShebang === "#!/usr/bin/env node" &&
      packageInstallSmoke.hasCliBundle &&
      packageInstallSmoke.hasViteBundle &&
      packageInstallSmoke.hasVirtualClientBundle &&
      !packageInstallSmoke.hasContextPackFiles &&
      packageInstallSmoke.hasReadmeDocs &&
      packageInstallSmoke.hasFailureModeDocs &&
      packageInstallSmoke.helpIncludesUsage &&
      packageInstallSmoke.helpIncludesDev &&
      packageInstallSmoke.helpIncludesDoctor &&
      packageInstallSmoke.viteImportOk &&
      packageInstallSmoke.packageName === "intent-layer" &&
      packageInstallSmoke.vitePluginName === "intent-layer" &&
      packageInstallSmoke.vitePluginEnforce === "pre" &&
      packageInstallSmoke.viteLegacyPluginName === "intent-layer" &&
      packageInstallSmoke.installedViteTransformOk &&
      packageInstallSmoke.installedViteTransformIncludesIntentId &&
      packageInstallSmoke.installedViteTransformGraphExists &&
      packageInstallSmoke.installedViteTransformGraphEntryCount === 1 &&
      packageInstallSmoke.installedViteTransformFirstRelativeFile === "src/App.tsx" &&
      packageInstallSmoke.installedViteTransformFirstToken !== null &&
      packageInstallSmoke.installedViteDevServerOk &&
      packageInstallSmoke.installedViteDevServerHomeStatus === 200 &&
      packageInstallSmoke.installedViteDevServerModuleStatus === 200 &&
      packageInstallSmoke.installedViteDevServerGraphStatus === 200 &&
      packageInstallSmoke.installedViteDevServerModuleIncludesIntentId &&
      packageInstallSmoke.installedViteDevServerGraphEntryCount === 1 &&
      packageInstallSmoke.installedViteDevServerFirstRelativeFile === "src/App.tsx" &&
      packageInstallSmoke.installedViteDevServerFirstToken !== null &&
      packageInstallSmoke.installedViteDevServerSetupStatus === 200 &&
      packageInstallSmoke.installedViteDevServerSetupApplyStatus === 200 &&
      packageInstallSmoke.installedViteDevServerSetupLanguage === "ko" &&
      packageInstallSmoke.installedViteDevServerSetupWorkspaceReady &&
      packageInstallSmoke.installedViteDevServerSetupSettingsReady &&
      packageInstallSmoke.installedViteDevServerSetupGraphReady &&
      packageInstallSmoke.installedViteDevServerSetupSettingsFileExists &&
      packageInstallSmoke.installedViteDevServerSetupSchemaExists &&
      packageInstallSmoke.installedViteDevServerSetupQueueSignalExists &&
      packageInstallSmoke.installedViteDevServerSetupQueueStatus === 200 &&
      packageInstallSmoke.installedViteDevServerSetupCodexSkillExists &&
      packageInstallSmoke.installedViteDevServerSetupClaudeSettingsExists &&
      packageInstallSmoke.installedViteDevServerSetupClaudeHookConfigured &&
      packageInstallSmoke.installedViteDevServerSettingsUpdateStatus === 200 &&
      packageInstallSmoke.installedViteDevServerSettingsLanguage === "en" &&
      packageInstallSmoke.installedViteDevServerSettingsDock === "left" &&
      packageInstallSmoke.installedViteDevServerSettingsDensity === "compact" &&
      packageInstallSmoke.installedViteDevServerSettingsDefaultCollapsed &&
      !packageInstallSmoke.installedViteDevServerSettingsAutoOpenSetup &&
      packageInstallSmoke.installedViteDevServerSettingsAgentRunEnabled &&
      packageInstallSmoke.installedViteDevServerSettingsCodexSkillEnabled &&
      packageInstallSmoke.installedViteDevServerSettingsClaudeHookEnabled &&
      packageInstallSmoke.installedViteDevServerSetupAgentRunEnabled &&
      packageInstallSmoke.installedViteDevServerSetupAgentRunSource === "settings" &&
      packageInstallSmoke.installedViteDevServerSetupQueueSignalReady &&
      packageInstallSmoke.installedViteDevServerSetupCodexSkillReady &&
      packageInstallSmoke.installedViteDevServerSetupClaudeHookReady &&
      packageInstallSmoke.installedViteDevServerSettingsCodexCommand === "codex-custom" &&
      packageInstallSmoke.installedViteDevServerSettingsClaudeCommand === "claude-custom" &&
      packageInstallSmoke.installedViteDevServerSettingsCommandSource === "settings" &&
      packageInstallSmoke.installedViteDevServerSettingsUpdateOk &&
      packageInstallSmoke.installedViteDevServerPreviewStatus === 200 &&
      packageInstallSmoke.installedViteDevServerPreviewOk &&
      packageInstallSmoke.installedViteDevServerApplyStatus === 200 &&
      packageInstallSmoke.installedViteDevServerApplyOk &&
      packageInstallSmoke.installedViteDevServerSourcePatched &&
      packageInstallSmoke.installedViteDevServerOperationFileExists &&
      packageInstallSmoke.installedViteDevServerDiffFileExists &&
      packageInstallSmoke.installedViteDevServerOperationLogExists &&
      packageInstallSmoke.installedViteDevServerModuleAfterApplyStatus === 200 &&
      packageInstallSmoke.installedViteDevServerModuleAfterApplyIncludesNextToken &&
      packageInstallSmoke.installedViteDevServerGraphAfterApplyStatus === 200 &&
      packageInstallSmoke.installedViteDevServerGraphAfterApplyEntryCount === 1 &&
      packageInstallSmoke.installedViteDevServerGraphAfterApplyFirstToken === "gap-6" &&
      packageInstallSmoke.installedViteDevServerApplyRefreshTargetPass &&
      packageInstallSmoke.installedViteDevServerUndoHistoryAfterApplyStatus === 200 &&
      packageInstallSmoke.installedViteDevServerUndoHistoryAfterApplyCount >= 1 &&
      packageInstallSmoke.installedViteDevServerRevertStatus === 200 &&
      packageInstallSmoke.installedViteDevServerRevertOk &&
      packageInstallSmoke.installedViteDevServerSourceReverted &&
      packageInstallSmoke.installedViteDevServerModuleAfterRevertStatus === 200 &&
      packageInstallSmoke.installedViteDevServerModuleAfterRevertIncludesOldToken &&
      packageInstallSmoke.installedViteDevServerGraphAfterRevertStatus === 200 &&
      packageInstallSmoke.installedViteDevServerGraphAfterRevertFirstToken === "gap-4" &&
      packageInstallSmoke.installedViteDevServerUndoHistoryAfterRevertStatus === 200 &&
      packageInstallSmoke.installedViteDevServerUndoHistoryAfterRevertCount === 0 &&
      packageInstallSmoke.installedViteDevServerRevertRefreshTargetPass &&
      packageInstallSmoke.installedViteDevServerMultiFileOk &&
      packageInstallSmoke.installedViteDevServerMultiFileInitialEntryCount === 3 &&
      packageInstallSmoke.installedViteDevServerMultiFileAfterChangeEntryCount === 3 &&
      packageInstallSmoke.installedViteDevServerMultiFileChangedFileTokenBefore === "gap-4" &&
      packageInstallSmoke.installedViteDevServerMultiFileChangedFileTokenAfter === "gap-8" &&
      packageInstallSmoke.installedViteDevServerMultiFileUnchangedFilesRetained &&
      packageInstallSmoke.installedViteDevServerMultiFileGraphGeneratedAtChanged &&
      packageInstallSmoke.installedViteDevServerMultiFileModuleAfterChangeIncludesNextToken &&
      packageInstallSmoke.installedViteDevServerMultiFileRefreshTargetPass,
    cliScanPass:
      cliScan.exitCode === 0 &&
      cliScanReport?.command === "scan" &&
      cliScanReport.summary.filesScanned >= 8 &&
      cliScanReport.summary.bindingCount > 0 &&
      cliScan.stdout.includes("\"command\": \"scan\""),
    cliCheckPass:
      cliCheck.exitCode === 0 &&
      cliCheckReport?.command === "check" &&
      cliCheckReport.ok &&
      cliCheckReport.gates.filesScanned.pass &&
      cliCheckReport.gates.syntaxClean.pass &&
      cliCheckReport.gates.supportedDirectCoverage.pass &&
      cliCheckReport.gates.maxFileTransformMs.pass,
    cliApplyDiffPass:
      cliApplyGraphScan.exitCode === 0 &&
      Boolean(cliApplyBinding) &&
      cliApply.exitCode === 0 &&
      cliApplyReport?.command === "apply" &&
      cliApplyReport.ok &&
      Boolean(cliApplyReport.operationFile) &&
      Boolean(cliApplyReport.diffFile) &&
      Boolean(cliApplyReport.operationLogFile) &&
      cliApplySyntaxErrors === 0 &&
      cliDiff.exitCode === 0 &&
      cliDiffReport?.command === "diff" &&
      cliDiffReport.ok &&
      cliDiffReport.changeCount > 0 &&
      cliDiffReport.bytes > 0,
    cliAgentContextPass:
      cliGraphScan.exitCode === 0 &&
      Boolean(cliAgentTaskBinding) &&
      cliAgentContext.exitCode === 0 &&
      cliAgentContextReport?.command === "agent-context" &&
      cliAgentContextReport.ok &&
      Boolean(cliAgentContextReport.contextFile) &&
      cliAgentContextReport.graphEntryCount === cliScanReport?.summary.bindingCount &&
      cliAgentContextReport.directEditBindingCount > 0 &&
      cliAgentContextReport.readOnlyBindingCount > 0 &&
      cliAgentContextReport.markdownBytes > 1000 &&
      cliAgentContextSectionsPresent,
    cliAgentTaskPass:
      cliGraphScan.exitCode === 0 &&
      fs.existsSync(cliGraphFile) &&
      (cliGraph ? Object.keys(cliGraph.entries).length : 0) === cliScanReport?.summary.bindingCount &&
      Boolean(cliAgentTaskBinding) &&
      cliAgentTask.exitCode === 0 &&
      cliAgentTaskReport?.command === "agent-task" &&
      cliAgentTaskReport.ok &&
      Boolean(cliAgentTaskReport.taskFile) &&
      cliAgentTaskSectionsPresent &&
      cliAgentQueue.exitCode === 0 &&
      cliAgentQueueReport?.command === "agent-queue" &&
      cliAgentQueueReport.ok &&
      cliAgentQueueReport.pendingTaskCount > 0 &&
      cliAgentClaimCodex.exitCode === 0 &&
      cliAgentClaimCodexReport?.command === "agent-claim" &&
      cliAgentClaimCodexReport.ok &&
      cliAgentClaimCodexReport.status === "claimed" &&
      Boolean(cliAgentClaimCodexReport.lockFile),
    cliAgentLaunchPass:
      cliGraphScan.exitCode === 0 &&
      Boolean(cliAgentTaskBinding) &&
      cliAgentLaunchCodex.exitCode === 0 &&
      cliAgentLaunchCodexReport?.command === "agent-launch" &&
      cliAgentLaunchCodexReport.ok &&
      cliAgentLaunchCodexReport.taskCreated &&
      cliAgentLaunchCodexReport.executed === false &&
      cliAgentLaunchCodexReport.commandPlan?.slice(1, 4).join(" ") === "exec --sandbox workspace-write" &&
      Boolean(cliAgentLaunchCodexReport.commandText?.includes("Read .intent/agent/")) &&
      cliAgentLaunchClaude.exitCode === 0 &&
      cliAgentLaunchClaudeReport?.command === "agent-launch" &&
      cliAgentLaunchClaudeReport.ok &&
      cliAgentLaunchClaudeReport.taskCreated === false &&
      cliAgentLaunchClaudeReport.executed === false &&
      cliAgentLaunchClaudeReport.commandPlan?.[1] === "-p" &&
      cliAgentLaunchClaudeReport.taskFile === cliAgentTaskReport?.taskFile,
    cliAgentResultPass:
      cliAgentResultGraphScan.exitCode === 0 &&
      Boolean(cliAgentResultBinding) &&
      cliAgentResultTask.exitCode === 0 &&
      cliAgentResultTaskReport?.ok &&
      cliAgentResult.exitCode === 0 &&
      cliAgentResultReport?.command === "agent-result" &&
      cliAgentResultReport.ok &&
      Boolean(cliAgentResultReport.resultFile) &&
      Boolean(cliAgentResultReport.diffFile) &&
      cliAgentResultReport.sourceDiffLineCount > 0 &&
      cliAgentResultReport.semanticChangeCount > 0 &&
      cliAgentResultSectionsPresent &&
      cliAgentResultSyntaxErrors === 0,
    supportedPatchPass: apply.ok && syntaxErrorsAfterPatch === 0,
    revertPatchPass: revert.ok && syntaxErrorsAfterRevert === 0,
    agentTaskPass: agentTask.ok && agentTaskSectionsPresent && agentTask.status === "queued",
    agentResultPass:
      agentResult.ok &&
      agentResultSectionsPresent &&
      agentResultFilesExist &&
      agentTaskMetadataAfterResult?.status === "done" &&
      agentResult.source.snapshotAvailable &&
      agentResult.source.diffLineCount > 0 &&
      agentResult.source.semanticChangeCount > 0 &&
      Boolean(agentResult.semanticDiff) &&
      agentResult.source.componentSnapshotAvailable &&
      agentResult.source.componentDiffLineCount > 0 &&
      agentResult.source.componentSemanticChangeCount > 0 &&
      Boolean(agentResult.componentSemanticDiff),
    componentSnapshotFixturePass:
      componentSnapshotFixtures.length > 0 &&
      componentSnapshotFixturePassCount === componentSnapshotFixtures.length,
    readOnlyHandoffPass:
      Boolean(readOnlyEntry) &&
      readOnlyEntry?.className.kind === "read-only" &&
      readOnlyEntry.tokens.length === 0 &&
      readOnlyTask.ok,
    readOnlyRelatedSourceDiffPass:
      readOnlyResult.ok &&
      readOnlyResult.source.relatedSnapshotAvailable &&
      readOnlyResult.source.relatedDiffLineCount > 0 &&
      Boolean(readOnlyResult.relatedSourceDiff) &&
      readOnlyResult.source.relatedSemanticChangeCount > 0 &&
      Boolean(readOnlyResult.relatedSemanticDiff) &&
      readOnlySyntaxErrorsAfterResult === 0,
    readOnlyCnVariableRelatedSemanticDiffPass:
      readOnlyCnVariableResult.ok &&
      readOnlyCnVariableResult.source.relatedSnapshotAvailable &&
      readOnlyCnVariableResult.source.relatedDiffLineCount > 0 &&
      Boolean(readOnlyCnVariableResult.relatedSourceDiff) &&
      readOnlyCnVariableResult.source.relatedSemanticChangeCount >= 2 &&
      (readOnlyCnVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 4 &&
      (readOnlyCnVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 4 &&
      readOnlyCnVariableSyntaxErrorsAfterResult === 0,
    readOnlyCompositeVariableRelatedSemanticDiffPass:
      readOnlyCompositeVariableResult.ok &&
      readOnlyCompositeVariableResult.source.relatedSnapshotAvailable &&
      readOnlyCompositeVariableResult.source.relatedDiffLineCount > 0 &&
      Boolean(readOnlyCompositeVariableResult.relatedSourceDiff) &&
      readOnlyCompositeVariableResult.source.relatedSemanticChangeCount >= 4 &&
      (readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 6 &&
      (readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 6 &&
      readOnlyCompositeVariableSyntaxErrorsAfterResult === 0,
    crossVariableDependencyHandoffPass:
      crossVariableDependencyEntry?.className.kind === "read-only" &&
      crossVariableDependencyEntry.className.unsupportedReason === "variable-reference" &&
      crossVariableDependencyTask.ok &&
      crossVariableDependencySnapshots.length === 2 &&
      crossVariableDependencySnapshots.some((snapshot) => snapshot.identifier === "baseCardClass") &&
      crossVariableDependencySnapshots.some((snapshot) => snapshot.identifier === "toneClass") &&
      crossVariableDependencySnapshots.every((snapshot) => snapshot.referencedBy === "cardClass") &&
      crossVariableDependencyResult.ok &&
      crossVariableDependencyResult.source.relatedDependencySnapshotCount === 2 &&
      crossVariableDependencyResult.source.relatedDependencyDiffLineCount > 0 &&
      Boolean(crossVariableDependencyResult.relatedDependencySourceDiff) &&
      crossVariableDependencyResult.source.relatedDependencySemanticChangeCount >= 2 &&
      (crossVariableDependencyResult.relatedDependencySemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (crossVariableDependencyResult.relatedDependencySemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      crossVariableDependencySyntaxErrorsAfterResult === 0,
    importedVariableRelatedSourcePass:
      importedVariableHandoffEntry?.className.kind === "read-only" &&
      importedVariableHandoffEntry.className.unsupportedReason === "variable-reference" &&
      importedVariableHandoffTask.ok &&
      importedVariableHandoffRelatedSnapshot?.kind === "variable-declaration" &&
      importedVariableHandoffRelatedSnapshot.identifier === "cardClass" &&
      importedVariableHandoffRelatedSnapshot.file === "src/styles/cardClass.ts" &&
      importedVariableHandoffRelatedSnapshot.excerpt.includes("grid grid-cols-3") &&
      importedVariableHandoffResult.ok &&
      importedVariableHandoffResult.source.relatedSnapshotAvailable &&
      importedVariableHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(importedVariableHandoffResult.relatedSourceDiff) &&
      importedVariableHandoffResult.source.relatedSemanticChangeCount >= 1 &&
      (importedVariableHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (importedVariableHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      importedVariableHandoffSyntaxErrorsAfterResult === 0,
    importedVariableDependencyHandoffPass:
      importedVariableDependencyHandoffEntry?.className.kind === "read-only" &&
      importedVariableDependencyHandoffEntry.className.unsupportedReason ===
        "variable-reference" &&
      importedVariableDependencyHandoffTask.ok &&
      importedVariableDependencyRelatedSnapshot?.kind === "variable-declaration" &&
      importedVariableDependencyRelatedSnapshot.identifier === "cardClass" &&
      importedVariableDependencyRelatedSnapshot.file === "src/styles/cardClass.ts" &&
      importedVariableDependencyRelatedSnapshot.excerpt.includes("baseCardClass") &&
      importedVariableDependencyRelatedSnapshot.excerpt.includes("toneClass") &&
      importedVariableDependencySnapshots.length === 2 &&
      importedVariableDependencySnapshots.some(
        (snapshot) => snapshot.identifier === "baseCardClass"
      ) &&
      importedVariableDependencySnapshots.some((snapshot) => snapshot.identifier === "toneClass") &&
      importedVariableDependencySnapshots.every(
        (snapshot) =>
          snapshot.file === "src/styles/cardClass.ts" && snapshot.referencedBy === "cardClass"
      ) &&
      importedVariableDependencyHandoffResult.ok &&
      importedVariableDependencyHandoffResult.source.relatedSnapshotAvailable &&
      importedVariableDependencyHandoffResult.source.relatedDependencySnapshotCount === 2 &&
      importedVariableDependencyHandoffResult.source.relatedDependencyDiffLineCount > 0 &&
      Boolean(importedVariableDependencyHandoffResult.relatedDependencySourceDiff) &&
      importedVariableDependencyHandoffResult.source.relatedDependencySemanticChangeCount >= 2 &&
      (importedVariableDependencyHandoffResult.relatedDependencySemanticDiff?.tokenAddedCount ??
        0) >= 5 &&
      (importedVariableDependencyHandoffResult.relatedDependencySemanticDiff?.tokenRemovedCount ??
        0) >= 5 &&
      importedVariableDependencySyntaxErrorsAfterResult === 0,
    transitiveDependencyHandoffPass:
      transitiveDependencyHandoffEntry?.className.kind === "read-only" &&
      transitiveDependencyHandoffEntry.className.unsupportedReason === "variable-reference" &&
      transitiveDependencyHandoffTask.ok &&
      transitiveDependencyRelatedSnapshot?.kind === "variable-declaration" &&
      transitiveDependencyRelatedSnapshot.identifier === "cardClass" &&
      transitiveDependencyRelatedSnapshot.file === "src/styles/cardClass.ts" &&
      transitiveDependencyRelatedSnapshot.excerpt.includes("baseCardClass") &&
      transitiveDependencyRelatedSnapshot.excerpt.includes("importedToneClass") &&
      transitiveDependencySnapshots.length === 2 &&
      transitiveDependencySnapshots.some((snapshot) => snapshot.identifier === "baseCardClass") &&
      transitiveDependencySnapshots.some((snapshot) => snapshot.identifier === "toneClass") &&
      transitiveDependencySnapshots.every(
        (snapshot) =>
          snapshot.file === "src/tokens/cardTokens.ts" &&
          snapshot.referencedBy === "cardClass"
      ) &&
      transitiveDependencyHandoffResult.ok &&
      transitiveDependencyHandoffResult.source.relatedSnapshotAvailable &&
      transitiveDependencyHandoffResult.source.relatedDependencySnapshotCount === 2 &&
      transitiveDependencyHandoffResult.source.relatedDependencyDiffLineCount > 0 &&
      Boolean(transitiveDependencyHandoffResult.relatedDependencySourceDiff) &&
      transitiveDependencyHandoffResult.source.relatedDependencySemanticChangeCount >= 2 &&
      (transitiveDependencyHandoffResult.relatedDependencySemanticDiff?.tokenAddedCount ?? 0) >=
        5 &&
      (transitiveDependencyHandoffResult.relatedDependencySemanticDiff?.tokenRemovedCount ?? 0) >=
        5 &&
      transitiveDependencySyntaxErrorsAfterResult === 0,
    propertyAccessHandoffPass:
      propertyAccessHandoffEntry?.className.kind === "read-only" &&
      propertyAccessHandoffEntry.className.unsupportedReason === "property-access-reference" &&
      propertyAccessHandoffTask.ok &&
      propertyAccessHandoffRelatedSnapshot?.kind === "object-property" &&
      propertyAccessHandoffRelatedSnapshot.identifier === "styles.title" &&
      propertyAccessHandoffRelatedSnapshot.file === "src/styles/titleStyles.ts" &&
      propertyAccessHandoffRelatedSnapshot.excerpt.includes(
        "text-xl font-semibold text-gray-950"
      ) &&
      propertyAccessHandoffResult.ok &&
      propertyAccessHandoffResult.source.relatedSnapshotAvailable &&
      propertyAccessHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(propertyAccessHandoffResult.relatedSourceDiff) &&
      propertyAccessHandoffResult.source.relatedSemanticChangeCount >= 1 &&
      (propertyAccessHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 4 &&
      (propertyAccessHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 3 &&
      propertyAccessHandoffSyntaxErrorsAfterResult === 0,
    externalPackageImportHandoffPass:
      externalPackageImportEntry?.className.kind === "read-only" &&
      externalPackageImportEntry.className.unsupportedReason === "variant-function" &&
      externalPackageImportTask.ok &&
      !externalPackageImportRelatedSnapshot &&
      externalPackageImportReference?.kind === "external-package-import" &&
      externalPackageImportReference.usageKind === "variant-function" &&
      externalPackageImportReference.specifier === "@external-ui/react" &&
      externalPackageImportReference.packageName === "@external-ui/react" &&
      externalPackageImportReference.subpath === "." &&
      externalPackageImportReference.importKind === "named" &&
      externalPackageImportReference.importedName === "buttonVariants" &&
      externalPackageImportReference.localName === "buttonVariants" &&
      externalPackageImportReference.referencedName === "buttonVariants" &&
      externalPackageImportReference.editable === false &&
      externalPackageImportReference.reason === "external-package-source-unresolved" &&
      externalPackageImportReference.guidance.length >= 3 &&
      externalPackageImportTask.markdown.includes("node_modules/") &&
      externalPackageImportTask.markdown.includes(
        "external package source for `@external-ui/react`"
      ) &&
      externalPackageImportResult.ok &&
      externalPackageImportResult.source.diffLineCount > 0 &&
      Boolean(externalPackageImportResult.sourceDiff) &&
      externalPackageImportResult.source.semanticChangeCount >= 1 &&
      (externalPackageImportResult.semanticDiff?.tokenAddedCount ?? 0) >= 3 &&
      externalPackageImportSyntaxErrorsAfterResult === 0,
    workspacePackageImportHandoffPass:
      packageImportHandoffEntry?.className.kind === "read-only" &&
      packageImportHandoffEntry.className.unsupportedReason === "variable-reference" &&
      packageImportHandoffTask.ok &&
      packageImportHandoffRelatedSnapshot?.kind === "variable-declaration" &&
      packageImportHandoffRelatedSnapshot.identifier === "cardClass" &&
      packageImportHandoffRelatedSnapshot.file === "packages/ui/src/styles.ts" &&
      packageImportHandoffRelatedSnapshot.excerpt.includes("grid grid-cols-3") &&
      packageImportHandoffResult.ok &&
      packageImportHandoffResult.source.relatedSnapshotAvailable &&
      packageImportHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(packageImportHandoffResult.relatedSourceDiff) &&
      packageImportHandoffResult.source.relatedSemanticChangeCount >= 1 &&
      (packageImportHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (packageImportHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      packageImportHandoffSyntaxErrorsAfterResult === 0,
    variantHandoffRelatedSourcePass:
      variantHandoffEntry?.className.kind === "read-only" &&
      variantHandoffEntry.className.unsupportedReason === "variant-function" &&
      variantHandoffTask.ok &&
      variantHandoffRelatedSnapshot?.kind === "variant-function" &&
      variantHandoffRelatedSnapshot.identifier === "buttonVariants" &&
      variantHandoffRelatedSnapshot.excerpt.includes("cva(") &&
      variantHandoffResult.ok &&
      variantHandoffResult.source.relatedSnapshotAvailable &&
      variantHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(variantHandoffResult.relatedSourceDiff) &&
      variantHandoffResult.source.relatedSemanticChangeCount >= 2 &&
      (variantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (variantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      variantHandoffSyntaxErrorsAfterResult === 0,
    importedVariantHandoffRelatedSourcePass:
      importedVariantHandoffEntry?.className.kind === "read-only" &&
      importedVariantHandoffEntry.className.unsupportedReason === "variant-function" &&
      importedVariantHandoffTask.ok &&
      importedVariantHandoffRelatedSnapshot?.kind === "variant-function" &&
      importedVariantHandoffRelatedSnapshot.identifier === "buttonVariants" &&
      importedVariantHandoffRelatedSnapshot.file.endsWith("ImportedVariantDefinition.ts") &&
      importedVariantHandoffRelatedSnapshot.excerpt.includes("cva(") &&
      importedVariantHandoffResult.ok &&
      importedVariantHandoffResult.source.relatedSnapshotAvailable &&
      importedVariantHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(importedVariantHandoffResult.relatedSourceDiff) &&
      importedVariantHandoffResult.source.relatedSemanticChangeCount >= 2 &&
      (importedVariantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (importedVariantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      importedVariantHandoffSyntaxErrorsAfterResult === 0,
    aliasBarrelVariantHandoffRelatedSourcePass:
      aliasBarrelVariantHandoffEntry?.className.kind === "read-only" &&
      aliasBarrelVariantHandoffEntry.className.unsupportedReason === "variant-function" &&
      aliasBarrelVariantHandoffTask.ok &&
      aliasBarrelVariantHandoffRelatedSnapshot?.kind === "variant-function" &&
      aliasBarrelVariantHandoffRelatedSnapshot.identifier === "buttonVariants" &&
      aliasBarrelVariantHandoffRelatedSnapshot.file === "src/ui/buttonVariants.ts" &&
      aliasBarrelVariantHandoffRelatedSnapshot.excerpt.includes("cva(") &&
      aliasBarrelVariantHandoffResult.ok &&
      aliasBarrelVariantHandoffResult.source.relatedSnapshotAvailable &&
      aliasBarrelVariantHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(aliasBarrelVariantHandoffResult.relatedSourceDiff) &&
      aliasBarrelVariantHandoffResult.source.relatedSemanticChangeCount >= 2 &&
      (aliasBarrelVariantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (aliasBarrelVariantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      aliasBarrelVariantHandoffSyntaxErrorsAfterResult === 0,
    multiHopVariantHandoffRelatedSourcePass:
      multiHopVariantHandoffEntry?.className.kind === "read-only" &&
      multiHopVariantHandoffEntry.className.unsupportedReason === "variant-function" &&
      multiHopVariantHandoffTask.ok &&
      multiHopVariantHandoffRelatedSnapshot?.kind === "variant-function" &&
      multiHopVariantHandoffRelatedSnapshot.identifier === "buttonVariants" &&
      multiHopVariantHandoffRelatedSnapshot.file === "src/tokens/buttonVariants.ts" &&
      multiHopVariantHandoffRelatedSnapshot.excerpt.includes("cva(") &&
      multiHopVariantHandoffResult.ok &&
      multiHopVariantHandoffResult.source.relatedSnapshotAvailable &&
      multiHopVariantHandoffResult.source.relatedDiffLineCount > 0 &&
      Boolean(multiHopVariantHandoffResult.relatedSourceDiff) &&
      multiHopVariantHandoffResult.source.relatedSemanticChangeCount >= 2 &&
      (multiHopVariantHandoffResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 5 &&
      (multiHopVariantHandoffResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 5 &&
      multiHopVariantHandoffSyntaxErrorsAfterResult === 0,
    simpleCnClsxPatchPass: cnApply.ok && syntaxErrorsAfterCnPatch === 0,
    staleRejectionPass: !staleApply.ok && staleApply.reason === "source-hash-mismatch",
    operationLogUndoStackPass:
      operationApplyOne.ok &&
      operationApplyTwo.ok &&
      pendingAfterApply.length === 2 &&
      historyAfterApply.pendingCount === 2 &&
      historyAfterApply.entries.some((entry) => entry.next && entry.nextToken === "p-8") &&
      operationRevertOne.ok &&
      pendingAfterFirstRevert.length === 1 &&
      historyAfterFirstRevert.pendingCount === 1 &&
      operationRevertTwo.ok &&
      pendingAfterSecondRevert.length === 0 &&
      historyAfterSecondRevert.pendingCount === 0 &&
      syntaxErrorsAfterOperationStack === 0,
    operationBranchUndoDiscardPass:
      operationBranchApplyOne.ok &&
      operationBranchApplyTwo.ok &&
      pendingAfterBranchApply.length === 2 &&
      historyAfterBranchApply.pendingCount === 2 &&
      operationBranchDiscard.ok &&
      operationBranchDiscard.discardedPatch.nextToken === "gap-6" &&
      pendingAfterBranchDiscard.length === 1 &&
      historyAfterBranchDiscard.pendingCount === 1 &&
      historyAfterBranchDiscard.entries.some((entry) => entry.next && entry.nextToken === "p-8") &&
      operationBranchRevert.ok &&
      pendingAfterBranchRevert.length === 0 &&
      historyAfterBranchRevert.pendingCount === 0 &&
      syntaxErrorsAfterBranchDiscard === 0,
    operationBranchUndoRevertPass:
      operationBranchRevertApplyOne.ok &&
      operationBranchRevertApplyTwo.ok &&
      pendingAfterBranchRevertApply.length === 2 &&
      historyAfterBranchRevertApply.pendingCount === 2 &&
      !operationBranchRevertNonTop.ok &&
      operationBranchRevertNonTop.reason === "undo-not-latest" &&
      pendingAfterBranchRevertNonTop.length === 2 &&
      historyAfterBranchRevertNonTop.pendingCount === 2 &&
      historyAfterBranchRevertNonTop.entries.some((entry) => entry.next && entry.nextToken === "p-8") &&
      branchRevertSourceAfterNonTop.includes("gap-6") &&
      branchRevertSourceAfterNonTop.includes("p-8") &&
      operationBranchRevertTop.ok &&
      pendingAfterBranchRevertTop.length === 1 &&
      historyAfterBranchRevertTop.pendingCount === 1 &&
      branchRevertSourceAfterTop.includes("gap-6") &&
      branchRevertSourceAfterTop.includes("p-6") &&
      operationBranchRevertOldest.ok &&
      pendingAfterBranchRevertOldest.length === 0 &&
      historyAfterBranchRevertOldest.pendingCount === 0 &&
      branchRevertSourceAfterOldest.includes("gap-4") &&
      branchRevertSourceAfterOldest.includes("p-6") &&
      syntaxErrorsAfterBranchRevert === 0,
    operationConflictArtifactPass:
      operationConflictApply.ok &&
      !operationConflictRevert.ok &&
      operationConflictRevert.reason === "revert-source-hash-mismatch" &&
      Boolean(operationConflictRevert.conflictFile) &&
      Boolean(operationConflictArtifact) &&
      operationConflictArtifact.kind === "revert-conflict" &&
      operationConflictArtifact.expectedToken === "gap-6" &&
      operationConflictArtifact.actualToken === "gap-8" &&
      operationConflictArtifact.restoreToken === "gap-4" &&
      Array.isArray(operationConflictArtifact.guidance) &&
      operationConflictArtifact.guidance.length >= 3 &&
      pendingAfterOperationConflict.length === 1 &&
      syntaxErrorsAfterOperationConflict === 0,
    operationConflictResolutionPass:
      operationConflictResolve.ok &&
      operationConflictReport.conflictCount === 1 &&
      Boolean(operationConflictResolvedArtifact?.resolvedAt) &&
      operationConflictResolvedArtifact?.resolution?.action === "discard-pending-undo" &&
      pendingAfterOperationConflictResolve.length === 0 &&
      operationConflictReportAfterResolve.conflictCount === 0 &&
      syntaxErrorsAfterOperationConflict === 0
  }
};

fs.writeFileSync(path.join(reportsDir, "corpus-audit.json"), `${JSON.stringify(corpus, null, 2)}\n`);
fs.writeFileSync(
  path.join(reportsDir, "ai-corpus-audit.json"),
  `${JSON.stringify(aiGeneratedCorpus, null, 2)}\n`
);
fs.writeFileSync(path.join(reportsDir, "spike-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`);

const failedGates = Object.entries(report.gates)
  .filter(([, passed]) => passed !== true)
  .map(([name]) => name);
process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: report.generatedAt,
      gateCount: Object.keys(report.gates).length,
      failedGateCount: failedGates.length,
      failedGates,
      gates: report.gates
    },
    null,
    2
  )}\n`
);
if (failedGates.length > 0) {
  process.stderr.write(`Evaluation failed: ${failedGates.join(", ")}\n`);
  process.exitCode = 1;
}
