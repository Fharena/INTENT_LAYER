#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { instrumentSource } from "./instrument";
import type { IntentBinding, IntentGraph } from "./types";

type CliCommand = "scan" | "check";

interface CliOptions {
  inputs: string[];
  out: string | null;
  writeGraph: boolean;
  minSupportedDirectCoverage: number;
  maxFileTransformMs: number;
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

export interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  report: CliScanReport | CliCheckReport | null;
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

function usage(): string {
  return [
    "Usage:",
    "  intent-layer scan [inputs...] [--out file] [--write-graph]",
    "  intent-layer check [inputs...] [--min-supported-direct n] [--max-file-transform-ms n] [--out file]",
    "",
    "Defaults:",
    "  inputs: src",
    "  min-supported-direct: 0.5",
    "  max-file-transform-ms: 20"
  ].join("\n");
}

function parseOptions(args: string[]): CliOptions {
  const inputs: string[] = [];
  let out: string | null = null;
  let writeGraph = false;
  let minSupportedDirectCoverage = 0.5;
  let maxFileTransformMs = 20;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      out = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--write-graph") {
      writeGraph = true;
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
    out,
    writeGraph,
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

  if (command !== "scan" && command !== "check") {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unknown command: ${command}\n\n${usage()}\n`,
      report: null
    };
  }

  const options = parseOptions(argv.slice(1));
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
  const result = runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
