#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { recordAgentResult } from "./agentResult";
import { createAgentTask } from "./agentTask";
import { instrumentSource } from "./instrument";
import type { IntentBinding, IntentGraph } from "./types";

type CliCommand = "scan" | "check" | "agent-task" | "agent-result";

interface CliOptions {
  inputs: string[];
  out: string | null;
  writeGraph: boolean;
  graph: string;
  id: string | null;
  desiredChange: string | null;
  taskFile: string | null;
  summary: string | null;
  changedFiles: string[];
  checks: string[];
  notes: string | null;
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
  report: CliScanReport | CliCheckReport | CliAgentTaskReport | CliAgentResultReport | null;
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

function usage(): string {
  return [
    "Usage:",
    "  intent-layer scan [inputs...] [--out file] [--write-graph]",
    "  intent-layer check [inputs...] [--min-supported-direct n] [--max-file-transform-ms n] [--out file]",
    "  intent-layer agent-task --id intent-id --change text [--graph .intent/graph.intent.json] [--out file]",
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
  let id: string | null = null;
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
    } else if (arg === "--id") {
      id = args[index + 1] ?? null;
      index += 1;
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
    out,
    writeGraph,
    graph,
    id,
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

  if (command !== "scan" && command !== "check" && command !== "agent-task" && command !== "agent-result") {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unknown command: ${command}\n\n${usage()}\n`,
      report: null
    };
  }

  const options = parseOptions(argv.slice(1));
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
  const result = runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
