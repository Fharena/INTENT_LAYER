import { describe, expect, it } from "vitest";
import {
  summarizeProductAb,
  type ProductAbCondition,
  type ProductAbObservation
} from "../../scripts/summarize-product-ab";

function observation(
  taskId: string,
  condition: ProductAbCondition,
  durationMs: number,
  success = true,
  repository = `repo-${taskId}`
): ProductAbObservation {
  return {
    version: 1,
    taskId,
    repository,
    repositoryCommit: "abc123",
    condition,
    success,
    durationMs,
    retryCount: 0,
    wrongTargetCount: 0,
    undoCount: 0,
    unsupported: false,
    evaluator: "independent-user",
    recordedAt: "2026-07-12T00:00:00.000Z"
  };
}

describe("product A/B report", () => {
  it("keeps an undersized paired sample in collecting state", () => {
    const report = summarizeProductAb(
      [
        observation("one", "intent-layer", 800),
        observation("one", "prompt-only", 1200),
        observation("two", "intent-layer", 900, false),
        observation("two", "prompt-only", 1500)
      ],
      "observations.jsonl"
    );

    expect(report).toMatchObject({
      status: "collecting",
      pairedTaskCount: 2,
      paired: { intentFasterCount: 1, promptOnlySuccessCount: 1 },
      gates: { complete: false }
    });
  });

  it("rejects duplicate conditions instead of averaging them", () => {
    expect(() =>
      summarizeProductAb(
        [observation("one", "intent-layer", 800), observation("one", "intent-layer", 900)],
        "observations.jsonl"
      )
    ).toThrow(/Duplicate/);
  });

  it("keeps equal task ids in different repositories independent", () => {
    const report = summarizeProductAb(
      [
        observation("same", "intent-layer", 800, true, "repo-a"),
        observation("same", "prompt-only", 1000, true, "repo-a"),
        observation("same", "intent-layer", 900, true, "repo-b"),
        observation("same", "prompt-only", 1100, true, "repo-b")
      ],
      "observations.jsonl"
    );

    expect(report).toMatchObject({ repositoryCount: 2, pairedTaskCount: 2, observationCount: 4 });
  });
});
