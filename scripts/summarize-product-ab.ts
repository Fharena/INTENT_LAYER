import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type ProductAbCondition = "intent-layer" | "prompt-only";

export interface ProductAbObservation {
  version: 1;
  taskId: string;
  repository: string;
  repositoryCommit: string;
  condition: ProductAbCondition;
  success: boolean;
  durationMs: number;
  retryCount: number;
  wrongTargetCount: number;
  undoCount: number;
  unsupported: boolean;
  evaluator: string;
  recordedAt: string;
}

interface ConditionSummary {
  observationCount: number;
  successCount: number;
  successRate: number;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  averageRetryCount: number;
  wrongTargetCount: number;
  undoCount: number;
  unsupportedCount: number;
}

export interface ProductAbReport {
  version: 1;
  generatedAt: string;
  status: "collecting" | "complete";
  scope: string;
  inputFile: string;
  repositoryCount: number;
  pairedTaskCount: number;
  observationCount: number;
  conditions: Record<ProductAbCondition, ConditionSummary>;
  paired: {
    intentFasterCount: number;
    promptFasterCount: number;
    tiedDurationCount: number;
    intentOnlySuccessCount: number;
    promptOnlySuccessCount: number;
    medianIntentMinusPromptMs: number | null;
  };
  gates: {
    atLeastFiveRepositories: boolean;
    atLeastTwentyPairedTasks: boolean;
    everyTaskHasBothConditions: boolean;
    complete: boolean;
  };
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : rounded(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function summarizeCondition(observations: ProductAbObservation[]): ConditionSummary {
  const successfulDurations = observations.filter((item) => item.success).map((item) => item.durationMs);
  return {
    observationCount: observations.length,
    successCount: observations.filter((item) => item.success).length,
    successRate: observations.length
      ? rounded(observations.filter((item) => item.success).length / observations.length)
      : 0,
    medianDurationMs: percentile(successfulDurations, 0.5),
    p95DurationMs: percentile(successfulDurations, 0.95),
    averageRetryCount: average(observations.map((item) => item.retryCount)),
    wrongTargetCount: observations.reduce((sum, item) => sum + item.wrongTargetCount, 0),
    undoCount: observations.reduce((sum, item) => sum + item.undoCount, 0),
    unsupportedCount: observations.filter((item) => item.unsupported).length
  };
}

function validObservation(value: unknown): value is ProductAbObservation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProductAbObservation>;
  return (
    item.version === 1 &&
    Boolean(item.taskId && item.repository && item.repositoryCommit && item.evaluator && item.recordedAt) &&
    (item.condition === "intent-layer" || item.condition === "prompt-only") &&
    typeof item.success === "boolean" &&
    typeof item.unsupported === "boolean" &&
    [item.durationMs, item.retryCount, item.wrongTargetCount, item.undoCount].every(
      (number) => typeof number === "number" && Number.isFinite(number) && number >= 0
    )
  );
}

export function readProductAbObservations(file: string): ProductAbObservation[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const value = JSON.parse(line) as unknown;
      if (!validObservation(value)) throw new Error(`Invalid product A/B observation on line ${index + 1}.`);
      return value;
    });
}

export function summarizeProductAb(
  observations: ProductAbObservation[],
  inputFile: string
): ProductAbReport {
  const taskKey = (observation: ProductAbObservation) =>
    `${observation.repository}\0${observation.repositoryCommit}\0${observation.taskId}`;
  const unique = new Set<string>();
  for (const observation of observations) {
    const key = `${taskKey(observation)}\0${observation.condition}`;
    if (unique.has(key)) {
      throw new Error(
        `Duplicate product A/B condition for ${observation.repository}@${observation.repositoryCommit}:${observation.taskId}.`
      );
    }
    unique.add(key);
  }

  const byTask = new Map<string, Partial<Record<ProductAbCondition, ProductAbObservation>>>();
  for (const observation of observations) {
    const key = taskKey(observation);
    const pair = byTask.get(key) ?? {};
    pair[observation.condition] = observation;
    byTask.set(key, pair);
  }
  const pairs = [...byTask.values()].filter(
    (pair): pair is Record<ProductAbCondition, ProductAbObservation> =>
      Boolean(pair["intent-layer"] && pair["prompt-only"])
  );
  const deltas = pairs
    .filter((pair) => pair["intent-layer"].success && pair["prompt-only"].success)
    .map((pair) => pair["intent-layer"].durationMs - pair["prompt-only"].durationMs);
  const repositoryCount = new Set(observations.map((item) => item.repository)).size;
  const everyTaskHasBothConditions = pairs.length === byTask.size;
  const atLeastFiveRepositories = repositoryCount >= 5;
  const atLeastTwentyPairedTasks = pairs.length >= 20;
  const complete = atLeastFiveRepositories && atLeastTwentyPairedTasks && everyTaskHasBothConditions;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    status: complete ? "complete" : "collecting",
    scope:
      "Independent paired user-task outcomes only. Corpus coverage, synthetic fixtures, and mechanical latency are excluded.",
    inputFile,
    repositoryCount,
    pairedTaskCount: pairs.length,
    observationCount: observations.length,
    conditions: {
      "intent-layer": summarizeCondition(observations.filter((item) => item.condition === "intent-layer")),
      "prompt-only": summarizeCondition(observations.filter((item) => item.condition === "prompt-only"))
    },
    paired: {
      intentFasterCount: deltas.filter((value) => value < 0).length,
      promptFasterCount: deltas.filter((value) => value > 0).length,
      tiedDurationCount: deltas.filter((value) => value === 0).length,
      intentOnlySuccessCount: pairs.filter(
        (pair) => pair["intent-layer"].success && !pair["prompt-only"].success
      ).length,
      promptOnlySuccessCount: pairs.filter(
        (pair) => !pair["intent-layer"].success && pair["prompt-only"].success
      ).length,
      medianIntentMinusPromptMs: percentile(deltas, 0.5)
    },
    gates: {
      atLeastFiveRepositories,
      atLeastTwentyPairedTasks,
      everyTaskHasBothConditions,
      complete
    }
  };
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function main(): void {
  const root = process.cwd();
  const input = path.resolve(root, argument("--input", "reports/performance/product-ab-observations.jsonl"));
  const output = path.resolve(root, argument("--out", "reports/performance/product-ab-evaluation.json"));
  const report = summarizeProductAb(
    readProductAbObservations(input),
    path.relative(root, input).replace(/\\/g, "/")
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
