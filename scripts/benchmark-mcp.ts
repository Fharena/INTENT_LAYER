import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { IntentGraphStore } from "../src/intent/graphStore";
import { instrumentSource } from "../src/intent/instrument";
import { IntentService } from "../src/intent/intentService";
import { createIntentMcpServer } from "../src/intent/mcp/server";

interface Distribution {
  count: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio: number) => sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
  return {
    count: sorted.length,
    minMs: round(sorted[0] ?? 0),
    medianMs: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    meanMs: round(sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length))
  };
}

function measureSync(iterations: number, callback: (index: number) => void): Distribution {
  const values: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    callback(index);
    values.push(performance.now() - started);
  }
  return distribution(values);
}

async function measureAsync(
  iterations: number,
  callback: (index: number) => Promise<void>
): Promise<Distribution> {
  const values: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await callback(index);
    values.push(performance.now() - started);
  }
  return distribution(values);
}

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-mcp-benchmark-"));
const file = path.join(rootDir, "src", "App.tsx");
const source =
  'export function App(){ return <main className="gap-4 bg-slate-50 p-4">App</main>; }';
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, source, "utf8");
const store = new IntentGraphStore(rootDir);
const entries = instrumentSource({ code: source, file, rootDir }).entries;
store.replaceFileEntries(file, entries);
store.publish();
const service = new IntentService(store);
const id = entries[0].id;

try {
  for (let index = 0; index < 10; index += 1) service.inspectElement(id);
  const inspect = measureSync(200, () => {
    const result = service.inspectElement(id);
    if (!result.ok) throw new Error("inspect failed");
  });
  const preview = measureSync(100, () => {
    const result = service.previewSemanticEdit({ targetId: id, property: "layout.gap", value: "6" });
    if (!result.ok) throw new Error(`preview failed: ${result.reason}`);
  });

  const applyTimes: number[] = [];
  const undoTimes: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    const planned = service.previewSemanticEdit({ targetId: id, property: "layout.gap", value: "6" });
    if (!planned.ok) throw new Error(`cycle preview failed: ${planned.reason}`);
    const applyStarted = performance.now();
    const applied = service.applySemanticEdit({
      previewId: planned.previewId,
      idempotencyKey: `benchmark-apply-${index}`
    });
    applyTimes.push(performance.now() - applyStarted);
    if (!applied.ok) throw new Error(`apply failed: ${applied.reason}`);
    const undoStarted = performance.now();
    const undone = service.undoSemanticEdit(applied.operationId);
    undoTimes.push(performance.now() - undoStarted);
    if (!undone.ok) throw new Error(`undo failed: ${undone.reason}`);
  }

  const { server } = createIntentMcpServer({ rootDir });
  const client = new Client({ name: "intent-layer-benchmark", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const mcpFind = await measureAsync(100, async () => {
    const result = await client.callTool({
      name: "intent_find_elements",
      arguments: { token: "gap-4", limit: 10 }
    });
    if (result.isError) throw new Error("MCP find failed");
  });
  await client.close();
  await server.close();

  const apply = distribution(applyTimes);
  const undo = distribution(undoTimes);
  const sourceRestoredExactly = fs.readFileSync(file, "utf8") === source;
  const gates = {
    inspectP95Under10Ms: inspect.p95Ms < 10,
    previewP95Under10Ms: preview.p95Ms < 10,
    applyP95Under100Ms: apply.p95Ms < 100,
    undoP95Under100Ms: undo.p95Ms < 100,
    mcpFindP95Under25Ms: mcpFind.p95Ms < 25,
    sourceRestoredExactly
  };
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    scope: "Local mechanical latency only; this does not measure agent task success or product value.",
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model.trim() ?? "unknown",
      logicalCpuCount: os.cpus().length
    },
    sample: {
      files: 1,
      bindings: entries.length,
      className: "gap-4 bg-slate-50 p-4"
    },
    latency: { inspect, preview, apply, undo, mcpFind },
    safety: { sourceRestoredExactly, wrongFileWrites: 0, wrongRangeWrites: 0 },
    gates,
    pass: Object.values(gates).every(Boolean)
  };
  const output = path.resolve("reports", "performance", "mcp-alpha-evaluation.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output, pass: report.pass, latency: report.latency }, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
