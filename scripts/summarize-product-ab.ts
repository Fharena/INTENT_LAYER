import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type ProductAbCondition = "intent-layer" | "prompt-only";

export interface ProductAbObservation {
  version: 2;
  participantId: string;
  runOrder: number;
  agentProfile: string;
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
  version: 2;
  generatedAt: string;
  status: "collecting" | "complete";
  scope: string;
  inputFile: string;
  participantCount: number;
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
    atLeastFiveParticipants: boolean;
    atLeastFiveRepositories: boolean;
    atLeastTwentyPairedTasks: boolean;
    everyTaskHasBothConditions: boolean;
    differentParticipantPerPair: boolean;
    everyParticipantHasBothConditions: boolean;
    balancedConditionsPerParticipant: boolean;
    sameAgentProfilePerPair: boolean;
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
    item.version === 2 &&
    [
      item.participantId,
      item.agentProfile,
      item.taskId,
      item.repository,
      item.repositoryCommit,
      item.evaluator,
      item.recordedAt
    ].every(nonEmptyString) &&
    Number.isFinite(Date.parse(item.recordedAt as string)) &&
    Number.isInteger(item.runOrder) &&
    Number(item.runOrder) >= 1 &&
    (item.condition === "intent-layer" || item.condition === "prompt-only") &&
    typeof item.success === "boolean" &&
    typeof item.unsupported === "boolean" &&
    typeof item.durationMs === "number" &&
    Number.isFinite(item.durationMs) &&
    item.durationMs >= 0 &&
    [item.retryCount, item.wrongTargetCount, item.undoCount].every(
      (number) => typeof number === "number" && Number.isInteger(number) && number >= 0
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
  const participantRunOrders = new Set<string>();
  for (const observation of observations) {
    const key = `${taskKey(observation)}\0${observation.condition}`;
    if (unique.has(key)) {
      throw new Error(
        `Duplicate product A/B condition for ${observation.repository}@${observation.repositoryCommit}:${observation.taskId}.`
      );
    }
    unique.add(key);
    const runOrderKey = `${observation.participantId}\0${observation.runOrder}`;
    if (participantRunOrders.has(runOrderKey)) {
      throw new Error(
        `Duplicate product A/B runOrder for ${observation.participantId}:${observation.runOrder}.`
      );
    }
    participantRunOrders.add(runOrderKey);
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
  const participantCount = new Set(observations.map((item) => item.participantId)).size;
  const participantConditions = new Map<string, Set<ProductAbCondition>>();
  const participantConditionCounts = new Map<string, Record<ProductAbCondition, number>>();
  for (const observation of observations) {
    const conditions = participantConditions.get(observation.participantId) ?? new Set<ProductAbCondition>();
    conditions.add(observation.condition);
    participantConditions.set(observation.participantId, conditions);
    const counts = participantConditionCounts.get(observation.participantId) ?? {
      "intent-layer": 0,
      "prompt-only": 0
    };
    counts[observation.condition] += 1;
    participantConditionCounts.set(observation.participantId, counts);
  }
  const atLeastFiveParticipants = participantCount >= 5;
  const everyTaskHasBothConditions = byTask.size > 0 && pairs.length === byTask.size;
  const differentParticipantPerPair =
    pairs.length > 0 &&
    pairs.every((pair) => pair["intent-layer"].participantId !== pair["prompt-only"].participantId);
  const everyParticipantHasBothConditions =
    participantConditions.size > 0 && [...participantConditions.values()].every((conditions) => conditions.size === 2);
  const balancedConditionsPerParticipant =
    participantConditionCounts.size > 0 &&
    [...participantConditionCounts.values()].every(
      (counts) => Math.abs(counts["intent-layer"] - counts["prompt-only"]) <= 1
    );
  const sameAgentProfilePerPair =
    pairs.length > 0 &&
    pairs.every((pair) => pair["intent-layer"].agentProfile === pair["prompt-only"].agentProfile);
  const atLeastFiveRepositories = repositoryCount >= 5;
  const atLeastTwentyPairedTasks = pairs.length >= 20;
  const complete =
    atLeastFiveParticipants &&
    atLeastFiveRepositories &&
    atLeastTwentyPairedTasks &&
    everyTaskHasBothConditions &&
    differentParticipantPerPair &&
    everyParticipantHasBothConditions &&
    balancedConditionsPerParticipant &&
    sameAgentProfilePerPair;

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    status: complete ? "complete" : "collecting",
    scope:
      "Independent paired user-task outcomes only. Completion requires different participants and one agent profile per pair. Corpus coverage, synthetic fixtures, and mechanical latency are excluded.",
    inputFile,
    participantCount,
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
      atLeastFiveParticipants,
      atLeastFiveRepositories,
      atLeastTwentyPairedTasks,
      everyTaskHasBothConditions,
      differentParticipantPerPair,
      everyParticipantHasBothConditions,
      balancedConditionsPerParticipant,
      sameAgentProfilePerPair,
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
