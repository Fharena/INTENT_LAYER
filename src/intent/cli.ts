#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createAgentContext } from "./agentContext";
import { launchAgentTask } from "./agentLaunch";
import { recordAgentResult } from "./agentResult";
import { createAgentTask } from "./agentTask";
import { instrumentSource } from "./instrument";
import { applyTokenPatch, recordPatchApplyInOperationLog } from "./patch";
import type { AgentLaunchResult, IntentBinding, IntentGraph, PatchFailure } from "./types";

type CliCommand =
  | "init"
  | "doctor"
  | "dev"
  | "scan"
  | "check"
  | "diff"
  | "apply"
  | "agent-context"
  | "agent-task"
  | "agent-launch"
  | "agent-result";

interface CliOptions {
  inputs: string[];
  positionals: string[];
  out: string | null;
  writeGraph: boolean;
  graph: string;
  op: string | null;
  diff: string | null;
  id: string | null;
  component: string | null;
  host: string;
  port: number;
  dryRun: boolean;
  provider: string | null;
  executeAgent: boolean;
  desiredChange: string | null;
  taskFile: string | null;
  summary: string | null;
  changedFiles: string[];
  checks: string[];
  notes: string | null;
  minSupportedDirectCoverage: number;
  maxFileTransformMs: number;
}

interface CliInitReport {
  version: 1;
  command: "init";
  generatedAt: string;
  ok: boolean;
  root: string;
  createdPaths: string[];
  existingPaths: string[];
  initMs: number;
}

type CliDoctorStatus = "pass" | "warn" | "fail";

interface CliDoctorCheck {
  name: string;
  status: CliDoctorStatus;
  detail: string;
  file: string | null;
}

interface CliDoctorReport {
  version: 1;
  command: "doctor";
  generatedAt: string;
  ok: boolean;
  root: string;
  inputs: string[];
  checks: CliDoctorCheck[];
  summary: {
    passCount: number;
    warnCount: number;
    failCount: number;
  };
  guidance: string[];
  doctorMs: number;
}

interface CliDevReport {
  version: 1;
  command: "dev";
  generatedAt: string;
  ok: boolean;
  dryRun: boolean;
  cwd: string;
  executable: string | null;
  args: string[];
  host: string;
  port: number;
  url: string;
  usesLocalVite: boolean;
  devMs: number;
  reason: string | null;
  detail: string | null;
}

interface ScanFileResult {
  file: string;
  bindingCount: number;
  directEditBindingCount: number;
  readOnlyBindingCount: number;
  tokenCount: number;
  editableTokenCount: number;
  transformMs: number;
  syntaxErrorCount: number;
  unsupportedReasons: Record<string, number>;
}

interface ScanSummary {
  filesScanned: number;
  filesWithBindings: number;
  bindingCount: number;
  directEditBindingCount: number;
  readOnlyBindingCount: number;
  tokenCount: number;
  editableTokenCount: number;
  supportedDirectCoverage: number;
  editableTokenCoverage: number;
  syntaxErrorCount: number;
  averageTransformMs: number;
  maxTransformMs: number;
  unsupportedReasons: Record<string, number>;
}

interface CliScanReport {
  version: 1;
  command: "scan";
  generatedAt: string;
  inputs: string[];
  summary: ScanSummary;
  files: ScanFileResult[];
  graphFile: string | null;
}

interface CliCheckReport {
  version: 1;
  command: "check";
  generatedAt: string;
  ok: boolean;
  inputs: string[];
  summary: ScanSummary;
  gates: {
    filesScanned: { pass: boolean; actual: number; min: number };
    syntaxClean: { pass: boolean; actual: number; expected: number };
    supportedDirectCoverage: { pass: boolean; actual: number; min: number };
    maxFileTransformMs: { pass: boolean; actual: number; max: number };
  };
  files: ScanFileResult[];
  graphFile: string | null;
}

interface CliDiffReport {
  version: 1;
  command: "diff";
  generatedAt: string;
  ok: boolean;
  diffFile: string | null;
  bytes: number;
  lineCount: number;
  changeCount: number;
  kind: string | null;
  source: string | null;
  createdAt: string | null;
  diffMs: number;
  reason: string | null;
  detail: string | null;
}

interface CliApplyReport {
  version: 1;
  command: "apply";
  generatedAt: string;
  ok: boolean;
  opFile: string | null;
  graphFile: string;
  id: string | null;
  relativeFile: string | null;
  oldToken: string | null;
  nextToken: string | null;
  range: { start: number; end: number } | null;
  operationFile: string | null;
  diffFile: string | null;
  operationLogFile: string | null;
  applyMs: number | null;
  reason: string | null;
  detail: string | null;
}

interface CliAgentContextReport {
  version: 1;
  command: "agent-context";
  generatedAt: string;
  ok: boolean;
  id: string | null;
  component: string | null;
  graphFile: string;
  contextFile: string | null;
  selectedBindingId: string | null;
  selectedRelativeFile: string | null;
  graphEntryCount: number;
  directEditBindingCount: number;
  readOnlyBindingCount: number;
  editableTokenCoverage: number;
  markdownBytes: number;
  contextMs: number | null;
  reason: string | null;
  detail: string | null;
}

interface CliAgentTaskReport {
  version: 1;
  command: "agent-task";
  generatedAt: string;
  ok: boolean;
  id: string | null;
  graphFile: string;
  taskFile: string | null;
  relativeFile: string | null;
  markdownBytes: number;
  taskMs: number | null;
  reason: string | null;
  detail: string | null;
}

interface CliAgentLaunchReport {
  version: 1;
  command: "agent-launch";
  generatedAt: string;
  ok: boolean;
  id: string | null;
  provider: string | null;
  graphFile: string;
  taskCreated: boolean;
  taskFile: string | null;
  commandPlan: string[] | null;
  commandText: string | null;
  enabled: boolean;
  executed: boolean;
  pid: number | null;
  stdoutFile: string | null;
  stderrFile: string | null;
  launchMs: number | null;
  reason: string | null;
  detail: string | null;
}

interface CliAgentResultReport {
  version: 1;
  command: "agent-result";
  generatedAt: string;
  ok: boolean;
  id: string | null;
  graphFile: string;
  taskFile: string | null;
  resultFile: string | null;
  diffFile: string | null;
  relativeFile: string | null;
  resultMs: number | null;
  sourceDiffLineCount: number;
  semanticChangeCount: number;
  componentDiffLineCount: number;
  componentSemanticChangeCount: number;
  relatedDiffLineCount: number;
  relatedSemanticChangeCount: number;
  resultMarkdownBytes: number;
  reason: string | null;
  detail: string | null;
}

export interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  report:
    | CliInitReport
    | CliDoctorReport
    | CliDevReport
    | CliScanReport
    | CliCheckReport
    | CliDiffReport
    | CliApplyReport
    | CliAgentContextReport
    | CliAgentTaskReport
    | CliAgentLaunchReport
    | CliAgentResultReport
    | null;
}

function isSourceFile(file: string): boolean {
  return /\.[jt]sx$/.test(file);
}

function collectFiles(input: string): string[] {
  if (!fs.existsSync(input)) return [];

  const stat = fs.statSync(input);
  if (stat.isFile()) return isSourceFile(input) ? [input] : [];

  const ignored = new Set(["node_modules", ".git", "dist", ".vite", ".intent"]);
  const files: string[] = [];
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;

    const next = path.join(input, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(next));
    } else if (isSourceFile(next)) {
      files.push(next);
    }
  }
  return files;
}

function sourceFiles(rootDir: string, inputs: string[]): string[] {
  return [
    ...new Set(inputs.flatMap((input) => collectFiles(path.resolve(rootDir, input))))
  ].sort();
}

function syntaxErrorCount(file: string, code: string): number {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: file,
    reportDiagnostics: true
  });
  return (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  ).length;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function ratio(value: number, total: number): number {
  if (total === 0) return 0;
  return Number((value / total).toFixed(4));
}

function mergeReasons(target: Record<string, number>, source: Record<string, number>) {
  for (const [reason, count] of Object.entries(source)) {
    target[reason] = (target[reason] ?? 0) + count;
  }
}

function reasonsForBindings(bindings: IntentBinding[]): Record<string, number> {
  const reasons: Record<string, number> = {};
  for (const binding of bindings) {
    const reason = binding.className.unsupportedReason;
    if (binding.className.kind === "read-only" && reason) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }
  return reasons;
}

function summarizeFiles(files: ScanFileResult[]): ScanSummary {
  const unsupportedReasons: Record<string, number> = {};
  for (const file of files) mergeReasons(unsupportedReasons, file.unsupportedReasons);

  const bindingCount = files.reduce((sum, file) => sum + file.bindingCount, 0);
  const tokenCount = files.reduce((sum, file) => sum + file.tokenCount, 0);
  const editableTokenCount = files.reduce((sum, file) => sum + file.editableTokenCount, 0);
  const transformTimes = files.map((file) => file.transformMs);

  return {
    filesScanned: files.length,
    filesWithBindings: files.filter((file) => file.bindingCount > 0).length,
    bindingCount,
    directEditBindingCount: files.reduce((sum, file) => sum + file.directEditBindingCount, 0),
    readOnlyBindingCount: files.reduce((sum, file) => sum + file.readOnlyBindingCount, 0),
    tokenCount,
    editableTokenCount,
    supportedDirectCoverage: ratio(
      files.reduce((sum, file) => sum + file.directEditBindingCount, 0),
      bindingCount
    ),
    editableTokenCoverage: ratio(editableTokenCount, tokenCount),
    syntaxErrorCount: files.reduce((sum, file) => sum + file.syntaxErrorCount, 0),
    averageTransformMs: average(transformTimes),
    maxTransformMs: transformTimes.length ? Number(Math.max(...transformTimes).toFixed(3)) : 0,
    unsupportedReasons
  };
}

function scan(rootDir: string, inputs: string[]) {
  const files = sourceFiles(rootDir, inputs);
  const entries: IntentBinding[] = [];
  const results = files.map((file) => {
    const code = fs.readFileSync(file, "utf8");
    const instrumented = instrumentSource({ code, file, rootDir });
    entries.push(...instrumented.entries);

    const unsupportedReasons = reasonsForBindings(instrumented.entries);
    const tokenCount = instrumented.entries.reduce((sum, entry) => sum + entry.tokens.length, 0);
    const editableTokenCount = instrumented.entries.reduce(
      (sum, entry) => sum + entry.tokens.filter((token) => token.editable).length,
      0
    );

    return {
      file: path.relative(rootDir, file).replace(/\\/g, "/"),
      bindingCount: instrumented.entries.length,
      directEditBindingCount: instrumented.entries.filter(
        (entry) => entry.className.kind !== "read-only" && entry.tokens.some((token) => token.editable)
      ).length,
      readOnlyBindingCount: instrumented.entries.filter((entry) => entry.className.kind === "read-only").length,
      tokenCount,
      editableTokenCount,
      transformMs: instrumented.transformMs,
      syntaxErrorCount: syntaxErrorCount(file, code),
      unsupportedReasons
    };
  });

  return {
    entries,
    files: results,
    summary: summarizeFiles(results)
  };
}

function writeGraph(rootDir: string, entries: IntentBinding[]): string {
  const graphEntries: Record<string, IntentBinding> = {};
  for (const entry of entries) graphEntries[entry.id] = entry;

  const graph: IntentGraph = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: graphEntries
  };
  const graphFile = path.join(rootDir, ".intent", "graph.intent.json");
  fs.mkdirSync(path.dirname(graphFile), { recursive: true });
  fs.writeFileSync(graphFile, `${JSON.stringify(graph, null, 2)}\n`);
  return path.relative(rootDir, graphFile).replace(/\\/g, "/");
}

function readGraph(rootDir: string, graphFile: string): IntentGraph | null {
  const fullPath = path.resolve(rootDir, graphFile);
  if (!fs.existsSync(fullPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as IntentGraph;
  } catch {
    return null;
  }
}

function toSlashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativeFromRoot(rootDir: string, file: string): string {
  return toSlashPath(path.relative(rootDir, file));
}

function writeFileIfMissing(
  rootDir: string,
  file: string,
  contents: string,
  createdPaths: string[],
  existingPaths: string[]
) {
  if (fs.existsSync(file)) {
    existingPaths.push(relativeFromRoot(rootDir, file));
    return;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  createdPaths.push(relativeFromRoot(rootDir, file));
}

function createDirIfMissing(rootDir: string, dir: string, createdPaths: string[], existingPaths: string[]) {
  if (fs.existsSync(dir)) {
    existingPaths.push(relativeFromRoot(rootDir, dir));
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  createdPaths.push(relativeFromRoot(rootDir, dir));
}

function firstExistingFile(rootDir: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const file = path.join(rootDir, candidate);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function firstExistingDir(rootDir: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const dir = path.join(rootDir, candidate);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }
  return null;
}

function readPackageJson(rootDir: string): { file: string; data: Record<string, unknown> } | null {
  const file = path.join(rootDir, "package.json");
  if (!fs.existsSync(file)) return null;

  try {
    return {
      file,
      data: JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>
    };
  } catch {
    return null;
  }
}

function hasPackageDependency(packageJson: Record<string, unknown>, dependency: string): boolean {
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = packageJson[field];
    if (dependencies && typeof dependencies === "object" && dependency in dependencies) return true;
  }
  return false;
}

function pushDoctorCheck(
  rootDir: string,
  checks: CliDoctorCheck[],
  name: string,
  status: CliDoctorStatus,
  detail: string,
  file: string | null
) {
  checks.push({
    name,
    status,
    detail,
    file: file ? relativeFromRoot(rootDir, file) : null
  });
}

function doctorReport(rootDir: string, options: CliOptions): CliDoctorReport {
  const started = performance.now();
  const checks: CliDoctorCheck[] = [];
  const guidance: string[] = [];
  const packageJson = readPackageJson(rootDir);
  const packageName =
    packageJson?.data.name && typeof packageJson.data.name === "string" ? packageJson.data.name : null;
  const viteConfig = firstExistingFile(rootDir, [
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cts",
    "vite.config.cjs"
  ]);
  const tailwindConfig = firstExistingFile(rootDir, [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs"
  ]);
  const sourceFileCount = sourceFiles(rootDir, options.inputs).length;
  const intentDir = firstExistingDir(rootDir, [".intent"]);
  const graphFile = firstExistingFile(rootDir, [path.join(".intent", "graph.intent.json")]);

  if (packageJson) {
    pushDoctorCheck(rootDir, checks, "package-json", "pass", `Found package.json${packageName ? ` for ${packageName}` : ""}.`, packageJson.file);
  } else {
    pushDoctorCheck(rootDir, checks, "package-json", "fail", "Missing package.json at the project root.", null);
    guidance.push("Run doctor from a React/Vite project root that contains package.json.");
  }

  if (packageJson?.data && (hasPackageDependency(packageJson.data, "intent-layer") || packageName === "intent-layer")) {
    pushDoctorCheck(
      rootDir,
      checks,
      "intent-layer-package",
      "pass",
      packageName === "intent-layer"
        ? "Current package is intent-layer."
        : "intent-layer is listed in package dependencies.",
      packageJson.file
    );
  } else {
    pushDoctorCheck(
      rootDir,
      checks,
      "intent-layer-package",
      "warn",
      "intent-layer is not listed in package dependencies.",
      packageJson?.file ?? null
    );
    guidance.push("Install the package in the target project before using the Vite plugin: npm install intent-layer.");
  }

  if (packageJson?.data && hasPackageDependency(packageJson.data, "vite")) {
    pushDoctorCheck(rootDir, checks, "vite-dependency", "pass", "Vite dependency found.", packageJson.file);
  } else {
    pushDoctorCheck(rootDir, checks, "vite-dependency", "fail", "Vite dependency was not found.", packageJson?.file ?? null);
    guidance.push("Add Vite to the target project before running intent-layer dev.");
  }

  if (packageJson?.data && hasPackageDependency(packageJson.data, "react")) {
    pushDoctorCheck(rootDir, checks, "react-dependency", "pass", "React dependency found.", packageJson.file);
  } else {
    pushDoctorCheck(rootDir, checks, "react-dependency", "warn", "React dependency was not found.", packageJson?.file ?? null);
    guidance.push("MVP support is optimized for React projects.");
  }

  if (tailwindConfig) {
    pushDoctorCheck(rootDir, checks, "tailwind-config", "pass", "Tailwind config found.", tailwindConfig);
  } else {
    pushDoctorCheck(rootDir, checks, "tailwind-config", "warn", "Tailwind config was not found.", null);
    guidance.push("MVP direct edits target Tailwind class tokens; add Tailwind config if this project uses Tailwind.");
  }

  if (viteConfig) {
    pushDoctorCheck(rootDir, checks, "vite-config", "pass", "Vite config found.", viteConfig);
    const configSource = fs.readFileSync(viteConfig, "utf8");
    const hasIntentImport =
      configSource.includes("intent-layer/vite") ||
      configSource.includes("src/intent/vitePlugin") ||
      configSource.includes("intent/vitePlugin");
    const hasIntentCall = /\bintentLayer\s*\(/.test(configSource);
    if (hasIntentImport && hasIntentCall) {
      pushDoctorCheck(rootDir, checks, "vite-plugin", "pass", "intentLayer() appears to be registered in Vite config.", viteConfig);
    } else {
      pushDoctorCheck(
        rootDir,
        checks,
        "vite-plugin",
        "fail",
        "intentLayer() was not found in the Vite config.",
        viteConfig
      );
      guidance.push("Add `import { intentLayer } from \"intent-layer/vite\"` and include `intentLayer()` in the Vite plugins array.");
    }
  } else {
    pushDoctorCheck(rootDir, checks, "vite-config", "fail", "No vite.config file was found.", null);
    guidance.push("Create a Vite config and register the intent-layer Vite plugin.");
  }

  if (sourceFileCount > 0) {
    pushDoctorCheck(rootDir, checks, "source-files", "pass", `${sourceFileCount} JSX/TSX source files found for inputs: ${options.inputs.join(", ")}.`, null);
  } else {
    pushDoctorCheck(rootDir, checks, "source-files", "fail", `No JSX/TSX source files found for inputs: ${options.inputs.join(", ")}.`, null);
    guidance.push("Pass source roots explicitly, for example: intent-layer doctor src app components.");
  }

  if (intentDir) {
    pushDoctorCheck(rootDir, checks, "intent-workspace", "pass", ".intent workspace directory exists.", intentDir);
  } else {
    pushDoctorCheck(rootDir, checks, "intent-workspace", "warn", ".intent workspace directory does not exist yet.", null);
    guidance.push("Run `intent-layer init` to create the local intent workspace folders and schemas.");
  }

  if (graphFile) {
    pushDoctorCheck(rootDir, checks, "intent-graph", "pass", "Intent graph file exists.", graphFile);
  } else {
    pushDoctorCheck(rootDir, checks, "intent-graph", "warn", "Intent graph file does not exist yet.", null);
    guidance.push("Run `intent-layer scan src --write-graph` or start the Vite dev server to generate `.intent/graph.intent.json`.");
  }

  const summary = {
    passCount: checks.filter((check) => check.status === "pass").length,
    warnCount: checks.filter((check) => check.status === "warn").length,
    failCount: checks.filter((check) => check.status === "fail").length
  };

  return {
    version: 1,
    command: "doctor",
    generatedAt: new Date().toISOString(),
    ok: summary.failCount === 0,
    root: rootDir,
    inputs: options.inputs,
    checks,
    summary,
    guidance: [...new Set(guidance)],
    doctorMs: Number((performance.now() - started).toFixed(3))
  };
}

function initIntentWorkspace(rootDir: string): CliInitReport {
  const started = performance.now();
  const createdPaths: string[] = [];
  const existingPaths: string[] = [];
  const intentDir = path.join(rootDir, ".intent");

  for (const dir of [
    intentDir,
    path.join(intentDir, "components"),
    path.join(intentDir, "operations"),
    path.join(intentDir, "diffs"),
    path.join(intentDir, "agent"),
    path.join(intentDir, "schema")
  ]) {
    createDirIfMissing(rootDir, dir, createdPaths, existingPaths);
  }

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "README.md"),
    [
      "# INTENT_LAYER Workspace",
      "",
      "Generated by `intent-layer init`.",
      "",
      "- `graph.intent.json`: latest source binding graph",
      "- `components/`: optional component intent documents",
      "- `operations/`: deterministic patch operations",
      "- `diffs/`: semantic intent diffs",
      "- `agent/`: AI handoff tasks and results",
      "- `schema/`: lightweight format contracts",
      ""
    ].join("\n"),
    createdPaths,
    existingPaths
  );

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "schema", "intent-op.schema.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "intent-op.schema",
        required: ["version", "kind", "target", "change"],
        supportedKinds: ["tailwind-token-replace"],
        target: {
          required: ["id"],
          optional: ["componentName", "file", "tagName", "range"]
        },
        change: {
          required: ["from", "to"]
        }
      },
      null,
      2
    )}\n`,
    createdPaths,
    existingPaths
  );

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "schema", "intent-diff.schema.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "intent-diff.schema",
        required: ["version", "kind", "createdAt", "changes"],
        note: "MVP diffs are YAML files with deterministic source/semantic change summaries."
      },
      null,
      2
    )}\n`,
    createdPaths,
    existingPaths
  );

  writeFileIfMissing(
    rootDir,
    path.join(intentDir, "schema", "graph.intent.schema.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "graph.intent.schema",
        required: ["version", "generatedAt", "entries"],
        entry: {
          required: ["id", "file", "relativeFile", "sourceHash", "className", "tokens"]
        }
      },
      null,
      2
    )}\n`,
    createdPaths,
    existingPaths
  );

  return {
    version: 1,
    command: "init",
    generatedAt: new Date().toISOString(),
    ok: true,
    root: rootDir,
    createdPaths,
    existingPaths,
    initMs: Number((performance.now() - started).toFixed(3))
  };
}

function devCommandReport(rootDir: string, options: CliOptions): CliDevReport {
  const started = performance.now();
  const validPort = Number.isInteger(options.port) && options.port > 0 && options.port <= 65535;
  const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
  const usesLocalVite = fs.existsSync(viteBin);
  const ok = usesLocalVite && validPort;
  const executable = ok ? process.execPath : null;
  const args = ok ? [viteBin, "--host", options.host, "--port", String(options.port)] : [];

  return {
    version: 1,
    command: "dev",
    generatedAt: new Date().toISOString(),
    ok,
    dryRun: options.dryRun,
    cwd: rootDir,
    executable,
    args,
    host: options.host,
    port: options.port,
    url: `http://${options.host}:${options.port}`,
    usesLocalVite,
    devMs: Number((performance.now() - started).toFixed(3)),
    reason: ok ? null : usesLocalVite ? "invalid-port" : "missing-local-vite",
    detail: ok
      ? null
      : usesLocalVite
        ? "Pass --port with an integer between 1 and 65535."
        : "Install dependencies first so node_modules/vite/bin/vite.js exists."
  };
}

function latestDiffFile(rootDir: string): string | null {
  const diffsDir = path.join(rootDir, ".intent", "diffs");
  if (!fs.existsSync(diffsDir)) return null;

  const files = fs
    .readdirSync(diffsDir)
    .filter((name) => name.endsWith(".intent-diff.yml"))
    .map((name) => path.join(diffsDir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return files[0] ?? null;
}

function yamlTopLevelValue(source: string, key: string): string | null {
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(source);
  return match?.[1]?.replace(/^["']|["']$/g, "") ?? null;
}

function countYamlListItemsUnder(source: string, heading: string): number {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${heading}:`);
  if (start < 0) return 0;

  let count = 0;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && !line.startsWith("-")) break;
    if (/^ {2}-\s+/.test(line)) count += 1;
  }
  return count;
}

function summarizeDiff(rootDir: string, requestedDiff: string | null): CliDiffReport {
  const started = performance.now();
  const diffFile = requestedDiff ? path.resolve(rootDir, requestedDiff) : latestDiffFile(rootDir);
  if (!diffFile || !fs.existsSync(diffFile)) {
    return {
      version: 1,
      command: "diff",
      generatedAt: new Date().toISOString(),
      ok: false,
      diffFile: requestedDiff,
      bytes: 0,
      lineCount: 0,
      changeCount: 0,
      kind: null,
      source: null,
      createdAt: null,
      diffMs: Number((performance.now() - started).toFixed(3)),
      reason: "missing-diff",
      detail: "No intent diff file was found. Run a patch, agent-result, or pass --diff."
    };
  }

  const source = fs.readFileSync(diffFile, "utf8");
  return {
    version: 1,
    command: "diff",
    generatedAt: new Date().toISOString(),
    ok: true,
    diffFile: relativeFromRoot(rootDir, diffFile),
    bytes: Buffer.byteLength(source),
    lineCount: source.split(/\r?\n/).filter((line) => line.length > 0).length,
    changeCount: countYamlListItemsUnder(source, "changes"),
    kind: yamlTopLevelValue(source, "kind"),
    source: yamlTopLevelValue(source, "source"),
    createdAt: yamlTopLevelValue(source, "createdAt"),
    diffMs: Number((performance.now() - started).toFixed(3)),
    reason: null,
    detail: null
  };
}

interface CliIntentOp {
  version: 1;
  kind: string;
  target?: {
    id?: string;
    range?: {
      start?: number;
      end?: number;
    };
  };
  change?: {
    from?: string;
    to?: string;
  };
}

function readIntentOp(rootDir: string, opFile: string | null): { file: string | null; op: CliIntentOp | null } {
  if (!opFile) return { file: null, op: null };

  const file = path.resolve(rootDir, opFile);
  if (!fs.existsSync(file)) return { file, op: null };

  try {
    return {
      file,
      op: JSON.parse(fs.readFileSync(file, "utf8")) as CliIntentOp
    };
  } catch {
    return { file, op: null };
  }
}

function usage(): string {
  return [
    "Usage:",
    "  intent-layer init",
    "  intent-layer doctor [inputs...] [--out file]",
    "  intent-layer dev [--host 127.0.0.1] [--port 5173] [--dry-run]",
    "  intent-layer scan [inputs...] [--out file] [--write-graph]",
    "  intent-layer check [inputs...] [--min-supported-direct n] [--max-file-transform-ms n] [--out file]",
    "  intent-layer diff [--diff file] [--out file]",
    "  intent-layer apply --op file [--graph .intent/graph.intent.json] [--out file]",
    "  intent-layer agent-context [component] [--id intent-id] [--graph .intent/graph.intent.json]",
    "  intent-layer agent-task --id intent-id --change text [--graph .intent/graph.intent.json] [--out file]",
    "  intent-layer agent-launch --provider codex|claude [--id intent-id --change text] [--task file] [--execute]",
    "  intent-layer agent-result --id intent-id --summary text [--task file] [--changed file] [--check command]",
    "",
    "Defaults:",
    "  inputs: src",
    "  graph: .intent/graph.intent.json",
    "  min-supported-direct: 0.5",
    "  max-file-transform-ms: 20"
  ].join("\n");
}

function parseOptions(args: string[]): CliOptions {
  const inputs: string[] = [];
  let out: string | null = null;
  let writeGraph = false;
  let graph = ".intent/graph.intent.json";
  let op: string | null = null;
  let diff: string | null = null;
  let id: string | null = null;
  let component: string | null = null;
  let host = "127.0.0.1";
  let port = 5173;
  let dryRun = false;
  let provider: string | null = null;
  let executeAgent = false;
  let desiredChange: string | null = null;
  let taskFile: string | null = null;
  let summary: string | null = null;
  const changedFiles: string[] = [];
  const checks: string[] = [];
  let notes: string | null = null;
  let minSupportedDirectCoverage = 0.5;
  let maxFileTransformMs = 20;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      out = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--write-graph") {
      writeGraph = true;
    } else if (arg === "--graph") {
      graph = args[index + 1] ?? graph;
      index += 1;
    } else if (arg === "--op") {
      op = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--diff") {
      diff = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--id") {
      id = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--component") {
      component = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--host") {
      host = args[index + 1] ?? host;
      index += 1;
    } else if (arg === "--port") {
      port = Number(args[index + 1] ?? port);
      index += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--provider") {
      provider = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--execute") {
      executeAgent = true;
    } else if (arg === "--change") {
      desiredChange = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--task") {
      taskFile = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--summary") {
      summary = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--changed") {
      if (args[index + 1]) changedFiles.push(args[index + 1]);
      index += 1;
    } else if (arg === "--check") {
      if (args[index + 1]) checks.push(args[index + 1]);
      index += 1;
    } else if (arg === "--notes") {
      notes = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--min-supported-direct") {
      minSupportedDirectCoverage = Number(args[index + 1] ?? minSupportedDirectCoverage);
      index += 1;
    } else if (arg === "--max-file-transform-ms") {
      maxFileTransformMs = Number(args[index + 1] ?? maxFileTransformMs);
      index += 1;
    } else {
      inputs.push(arg);
    }
  }

  return {
    inputs: inputs.length > 0 ? inputs : ["src"],
    positionals: inputs,
    out,
    writeGraph,
    graph,
    op,
    diff,
    id,
    component,
    host,
    port,
    dryRun,
    provider,
    executeAgent,
    desiredChange,
    taskFile,
    summary,
    changedFiles,
    checks,
    notes,
    minSupportedDirectCoverage,
    maxFileTransformMs
  };
}

function writeOut(rootDir: string, out: string | null, json: string) {
  if (!out) return;

  const output = path.resolve(rootDir, out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, json);
}

export function runCli(argv: string[], rootDir = process.cwd()): CliRunResult {
  const command = argv[0] as CliCommand | "--help" | "-h" | undefined;
  if (!command || command === "--help" || command === "-h") {
    return {
      exitCode: command ? 0 : 1,
      stdout: `${usage()}\n`,
      stderr: command ? "" : "Missing command.\n",
      report: null
    };
  }

  if (
    command !== "init" &&
    command !== "doctor" &&
    command !== "dev" &&
    command !== "scan" &&
    command !== "check" &&
    command !== "diff" &&
    command !== "apply" &&
    command !== "agent-context" &&
    command !== "agent-task" &&
    command !== "agent-launch" &&
    command !== "agent-result"
  ) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unknown command: ${command}\n\n${usage()}\n`,
      report: null
    };
  }

  const options = parseOptions(argv.slice(1));
  if (command === "init") {
    const report = initIntentWorkspace(rootDir);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: 0, stdout: json, stderr: "", report };
  }

  if (command === "doctor") {
    const report = doctorReport(rootDir, options);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: report.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "dev") {
    const report = devCommandReport(rootDir, options);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: report.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "diff") {
    const report = summarizeDiff(rootDir, options.diff);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: report.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "apply") {
    const { file: opFile, op } = readIntentOp(rootDir, options.op);
    const graph = readGraph(rootDir, options.graph);
    const binding = op?.target?.id && graph ? graph.entries[op.target.id] : undefined;
    const started = performance.now();
    const invalidReason =
      !options.op
        ? {
            reason: "missing-op",
            detail: "Pass --op with a .intent-op.json file."
          }
        : !op
          ? {
              reason: "invalid-op",
              detail: "The requested operation file does not exist or is not valid JSON."
            }
          : op.version !== 1 || op.kind !== "tailwind-token-replace"
            ? {
                reason: "unsupported-op-kind",
                detail: "CLI apply currently supports only version 1 tailwind-token-replace operations."
              }
            : !op.target?.id
              ? {
                  reason: "missing-target-id",
                  detail: "The operation target must include an intent id."
                }
              : !op.change?.from || !op.change?.to
                ? {
                    reason: "missing-token-change",
                    detail: "The operation change must include from/to tokens."
                  }
                : !graph
                  ? {
                      reason: "missing-graph",
                      detail: "Run scan --write-graph first or pass --graph with an existing graph file."
                    }
                  : null;
    const result = invalidReason
      ? {
          ok: false as const,
          id: op?.target?.id,
          reason: invalidReason.reason,
          detail: invalidReason.detail,
          metrics: { applyMs: Number((performance.now() - started).toFixed(3)) }
        }
      : applyTokenPatch(rootDir, binding, {
          id: op!.target!.id!,
          oldToken: op!.change!.from!,
          nextToken: op!.change!.to!,
          sourceStart: op!.target!.range?.start,
          sourceEnd: op!.target!.range?.end
        });
    const operationLogFile = result.ok ? recordPatchApplyInOperationLog(rootDir, result) : null;
    const report: CliApplyReport = {
      version: 1,
      command,
      generatedAt: new Date().toISOString(),
      ok: result.ok,
      opFile: opFile ? relativeFromRoot(rootDir, opFile) : options.op,
      graphFile: options.graph,
      id: op?.target?.id ?? null,
      relativeFile: result.ok ? result.relativeFile : null,
      oldToken: op?.change?.from ?? null,
      nextToken: op?.change?.to ?? null,
      range: result.ok ? result.range : null,
      operationFile: result.ok ? relativeFromRoot(rootDir, result.operationFile) : null,
      diffFile: result.ok ? relativeFromRoot(rootDir, result.diffFile) : null,
      operationLogFile: operationLogFile ? relativeFromRoot(rootDir, operationLogFile) : null,
      applyMs: result.ok ? result.metrics.applyMs : result.metrics?.applyMs ?? null,
      reason: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail ?? null
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: result.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "agent-context") {
    const graph = readGraph(rootDir, options.graph);
    const component = options.component ?? options.positionals[0] ?? null;
    const result = createAgentContext(rootDir, graph, {
      id: options.id ?? undefined,
      component: component ?? undefined
    });
    const report: CliAgentContextReport = {
      version: 1,
      command,
      generatedAt: new Date().toISOString(),
      ok: result.ok,
      id: options.id,
      component,
      graphFile: options.graph,
      contextFile: result.ok ? relativeFromRoot(rootDir, result.contextFile) : null,
      selectedBindingId: result.ok ? result.selectedBinding?.id ?? null : null,
      selectedRelativeFile: result.ok ? result.selectedBinding?.relativeFile ?? null : null,
      graphEntryCount: result.ok ? result.summary.graphEntries : 0,
      directEditBindingCount: result.ok ? result.summary.directEditBindings : 0,
      readOnlyBindingCount: result.ok ? result.summary.readOnlyBindings : 0,
      editableTokenCoverage: result.ok ? result.summary.editableTokenCoverage : 0,
      markdownBytes: result.ok ? result.markdown.length : 0,
      contextMs: result.metrics.contextMs,
      reason: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: result.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "agent-launch") {
    const graph = readGraph(rootDir, options.graph);
    let taskFile = options.taskFile;
    let taskCreated = false;
    const failedPreflight =
      !options.provider
        ? {
            ok: false as const,
            id: options.id ?? undefined,
            reason: "missing-agent-provider",
            detail: "Pass --provider codex or --provider claude.",
            metrics: { launchMs: 0 }
          }
        : !taskFile && !options.id
          ? {
              ok: false as const,
              id: options.id ?? undefined,
              reason: "missing-id",
              detail: "Pass --id with an intent id, or pass --task with an existing agent task file.",
              metrics: { launchMs: 0 }
            }
          : !taskFile && !options.desiredChange
            ? {
                ok: false as const,
                id: options.id ?? undefined,
                reason: "missing-desired-change",
                detail: "Pass --change with the desired edit, or pass --task with an existing agent task file.",
                metrics: { launchMs: 0 }
              }
            : !taskFile && !graph
              ? {
                  ok: false as const,
                  id: options.id ?? undefined,
                  reason: "missing-graph",
                  detail: "Run scan --write-graph first or pass --graph with an existing graph file.",
                  metrics: { launchMs: 0 }
                }
              : null;

    let result: AgentLaunchResult | PatchFailure | null = failedPreflight;
    if (!result && !taskFile && options.id && options.desiredChange && graph) {
      const binding = graph.entries[options.id];
      const task = createAgentTask(rootDir, binding, {
        id: options.id,
        desiredChange: options.desiredChange
      });
      if (task.ok) {
        taskFile = path.relative(rootDir, task.taskFile).replace(/\\/g, "/");
        taskCreated = true;
      } else {
        result = {
          ok: false as const,
          id: options.id,
          reason: task.reason,
          detail: task.detail ?? "Agent task creation failed.",
          metrics: { launchMs: task.metrics?.taskMs ?? 0 }
        };
      }
    }

    result =
      result ??
      launchAgentTask(rootDir, {
        id: options.id ?? undefined,
        provider: options.provider as "codex" | "claude",
        desiredChange: options.desiredChange ?? undefined,
        taskFile: taskFile ?? undefined,
        execute: options.executeAgent
      });
    const report: CliAgentLaunchReport = {
      version: 1,
      command,
      generatedAt: new Date().toISOString(),
      ok: result.ok,
      id: options.id,
      provider: options.provider,
      graphFile: options.graph,
      taskCreated,
      taskFile: result.ok ? result.taskFile : taskFile,
      commandPlan: result.ok ? result.command : null,
      commandText: result.ok ? result.commandText : null,
      enabled: result.ok ? result.enabled : false,
      executed: result.ok ? result.executed : false,
      pid: result.ok ? result.pid : null,
      stdoutFile: result.ok ? result.stdoutFile : null,
      stderrFile: result.ok ? result.stderrFile : null,
      launchMs: result.ok ? result.metrics.launchMs : result.metrics?.launchMs ?? null,
      reason: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail ?? null
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: result.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "agent-result") {
    const graph = readGraph(rootDir, options.graph);
    const binding = options.id && graph ? graph.entries[options.id] : undefined;
    const result = !options.id
      ? {
          ok: false as const,
          id: undefined,
          reason: "missing-id",
          detail: "Pass --id with an intent id.",
          metrics: { resultMs: 0 }
        }
      : !options.summary
        ? {
            ok: false as const,
            id: options.id,
            reason: "missing-result-summary",
            detail: "Pass --summary with the agent result summary.",
            metrics: { resultMs: 0 }
          }
        : !graph
          ? {
              ok: false as const,
              id: options.id,
              reason: "missing-graph",
              detail: "Run scan --write-graph first or pass --graph with an existing graph file.",
              metrics: { resultMs: 0 }
            }
          : recordAgentResult(rootDir, binding, {
              id: options.id,
              taskFile: options.taskFile ?? undefined,
              summary: options.summary,
              changedFiles: options.changedFiles,
              checks: options.checks,
              notes: options.notes ?? undefined
            });
    const report: CliAgentResultReport = {
      version: 1,
      command,
      generatedAt: new Date().toISOString(),
      ok: result.ok,
      id: options.id,
      graphFile: options.graph,
      taskFile: options.taskFile,
      resultFile: result.ok ? path.relative(rootDir, result.resultFile).replace(/\\/g, "/") : null,
      diffFile: result.ok ? path.relative(rootDir, result.diffFile).replace(/\\/g, "/") : null,
      relativeFile: result.ok ? result.relativeFile : null,
      resultMs: result.ok ? result.metrics.resultMs : result.metrics?.resultMs ?? null,
      sourceDiffLineCount: result.ok ? result.source.diffLineCount : 0,
      semanticChangeCount: result.ok ? result.source.semanticChangeCount : 0,
      componentDiffLineCount: result.ok ? result.source.componentDiffLineCount : 0,
      componentSemanticChangeCount: result.ok ? result.source.componentSemanticChangeCount : 0,
      relatedDiffLineCount: result.ok ? result.source.relatedDiffLineCount : 0,
      relatedSemanticChangeCount: result.ok ? result.source.relatedSemanticChangeCount : 0,
      resultMarkdownBytes: result.ok ? result.markdown.length : 0,
      reason: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail ?? null
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: result.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  if (command === "agent-task") {
    const graph = readGraph(rootDir, options.graph);
    const binding = options.id && graph ? graph.entries[options.id] : undefined;
    const result = !options.id
      ? {
          ok: false as const,
          id: undefined,
          reason: "missing-id",
          detail: "Pass --id with an intent id.",
          metrics: { taskMs: 0 }
        }
      : !options.desiredChange
        ? {
            ok: false as const,
            id: options.id,
            reason: "missing-desired-change",
            detail: "Pass --change with the desired edit.",
            metrics: { taskMs: 0 }
          }
        : !graph
          ? {
              ok: false as const,
              id: options.id,
              reason: "missing-graph",
              detail: "Run scan --write-graph first or pass --graph with an existing graph file.",
              metrics: { taskMs: 0 }
            }
          : createAgentTask(rootDir, binding, {
              id: options.id,
              desiredChange: options.desiredChange
            });
    const report: CliAgentTaskReport = {
      version: 1,
      command,
      generatedAt: new Date().toISOString(),
      ok: result.ok,
      id: options.id,
      graphFile: options.graph,
      taskFile: result.ok ? path.relative(rootDir, result.taskFile).replace(/\\/g, "/") : null,
      relativeFile: result.ok ? result.relativeFile : null,
      markdownBytes: result.ok ? result.markdown.length : 0,
      taskMs: result.ok ? result.metrics.taskMs : result.metrics?.taskMs ?? null,
      reason: result.ok ? null : result.reason,
      detail: result.ok ? null : result.detail ?? null
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: result.ok ? 0 : 1, stdout: json, stderr: "", report };
  }

  const scanned = scan(rootDir, options.inputs);
  const graphFile = options.writeGraph ? writeGraph(rootDir, scanned.entries) : null;

  if (command === "scan") {
    const report: CliScanReport = {
      version: 1,
      command,
      generatedAt: new Date().toISOString(),
      inputs: options.inputs,
      summary: scanned.summary,
      files: scanned.files,
      graphFile
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeOut(rootDir, options.out, json);
    return { exitCode: 0, stdout: json, stderr: "", report };
  }

  const gates = {
    filesScanned: {
      pass: scanned.summary.filesScanned > 0,
      actual: scanned.summary.filesScanned,
      min: 1
    },
    syntaxClean: {
      pass: scanned.summary.syntaxErrorCount === 0,
      actual: scanned.summary.syntaxErrorCount,
      expected: 0
    },
    supportedDirectCoverage: {
      pass: scanned.summary.supportedDirectCoverage >= options.minSupportedDirectCoverage,
      actual: scanned.summary.supportedDirectCoverage,
      min: options.minSupportedDirectCoverage
    },
    maxFileTransformMs: {
      pass: scanned.summary.maxTransformMs <= options.maxFileTransformMs,
      actual: scanned.summary.maxTransformMs,
      max: options.maxFileTransformMs
    }
  };
  const ok = Object.values(gates).every((gate) => gate.pass);
  const report: CliCheckReport = {
    version: 1,
    command,
    generatedAt: new Date().toISOString(),
    ok,
    inputs: options.inputs,
    summary: scanned.summary,
    gates,
    files: scanned.files,
    graphFile
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeOut(rootDir, options.out, json);
  return { exitCode: ok ? 0 : 1, stdout: json, stderr: "", report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv[0] === "dev" && !argv.includes("--dry-run") && !argv.includes("--out")) {
    const options = parseOptions(argv.slice(1));
    const report = devCommandReport(process.cwd(), options);
    if (!report.ok || !report.executable) {
      process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`Starting intent-layer dev at ${report.url}\n`);
      const child = spawn(report.executable, report.args, {
        cwd: report.cwd,
        stdio: "inherit"
      });
      child.on("exit", (code) => {
        process.exitCode = code ?? 0;
      });
      child.on("error", (error) => {
        process.stderr.write(`intent-layer dev failed: ${error.message}\n`);
        process.exitCode = 1;
      });
    }
  } else {
    const result = runCli(argv);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
  }
}
