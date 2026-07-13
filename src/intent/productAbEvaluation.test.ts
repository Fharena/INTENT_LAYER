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
  repository = `repo-${taskId}`,
  participantId = `${condition}-${repository}-${taskId}`,
  agentProfile = "codex-app:gpt-5-default",
  runOrder = 1
): ProductAbObservation {
  return {
    version: 2,
    participantId,
    runOrder,
    agentProfile,
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

  it("does not call a same-participant pair independent", () => {
    const report = summarizeProductAb(
      [
        observation("one", "intent-layer", 800, true, "repo-a", "participant-a", undefined, 1),
        observation("one", "prompt-only", 1000, true, "repo-a", "participant-a", undefined, 2)
      ],
      "observations.jsonl"
    );

    expect(report.gates.differentParticipantPerPair).toBe(false);
    expect(report.status).toBe("collecting");
  });

  it("requires the same agent profile inside each task pair", () => {
    const report = summarizeProductAb(
      [
        observation("one", "intent-layer", 800, true, "repo-a", "participant-a", "codex-app:gpt-5"),
        observation("one", "prompt-only", 1000, true, "repo-a", "participant-b", "claude-code:sonnet")
      ],
      "observations.jsonl"
    );

    expect(report.gates.sameAgentProfilePerPair).toBe(false);
    expect(report.status).toBe("collecting");
  });

  it("completes only a counterbalanced independent sample", () => {
    const observations: ProductAbObservation[] = [];
    const participants = ["p01", "p02", "p03", "p04", "p05"];
    const runOrders = new Map<string, number>();
    const nextRunOrder = (participantId: string): number => {
      const next = (runOrders.get(participantId) ?? 0) + 1;
      runOrders.set(participantId, next);
      return next;
    };
    for (let index = 0; index < 20; index += 1) {
      const repository = `repo-${index % 5}`;
      const intentParticipant = participants[index % participants.length];
      const promptParticipant = participants[(index + 1) % participants.length];
      observations.push(
        observation(
          `task-${index}`,
          "intent-layer",
          800,
          true,
          repository,
          intentParticipant,
          undefined,
          nextRunOrder(intentParticipant)
        ),
        observation(
          `task-${index}`,
          "prompt-only",
          1000,
          true,
          repository,
          promptParticipant,
          undefined,
          nextRunOrder(promptParticipant)
        )
      );
    }

    const report = summarizeProductAb(observations, "observations.jsonl");

    expect(report).toMatchObject({
      status: "complete",
      participantCount: 5,
      repositoryCount: 5,
      pairedTaskCount: 20,
      observationCount: 40,
      gates: {
        atLeastFiveParticipants: true,
        differentParticipantPerPair: true,
        everyParticipantHasBothConditions: true,
        balancedConditionsPerParticipant: true,
        sameAgentProfilePerPair: true,
        complete: true
      }
    });
  });

  it("rejects a duplicate run order for one participant", () => {
    expect(() =>
      summarizeProductAb(
        [
          observation("one", "intent-layer", 800, true, "repo-a", "participant-a", undefined, 1),
          observation("two", "prompt-only", 1000, true, "repo-b", "participant-a", undefined, 1)
        ],
        "observations.jsonl"
      )
    ).toThrow(/runOrder/);
  });
});
