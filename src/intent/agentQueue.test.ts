import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentArtifactsDir,
  agentQueueSignalPath,
  buildAgentTaskMarkdown,
  claimAgentTask,
  createAgentTaskMetadata,
  pruneAgentArtifacts,
  readAgentTaskMetadata,
  refreshAgentQueueSignal,
  releaseAgentTask
} from "./agentQueue";

const roots: string[] = [];

function workspace() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-queue-"));
  roots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, ".intent", "agent"), { recursive: true });
  return rootDir;
}

function writeTask(rootDir: string, id: string, status: "queued" | "done" = "queued") {
  const taskFile = path.join(rootDir, ".intent", "agent", `${id}.md`);
  const metadata = {
    ...createAgentTaskMetadata({ taskFile, sourceIntentId: `intent-${id}`, sourceFile: "src/App.tsx" }),
    status,
    updatedAt: status === "done" ? new Date(0).toISOString() : new Date().toISOString()
  };
  fs.writeFileSync(taskFile, buildAgentTaskMarkdown(metadata, `# ${id}\n`));
  return taskFile;
}

afterEach(() => {
  delete process.env.INTENT_LAYER_AGENT_ARTIFACT_DIR;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("agent queue durability", () => {
  it("reports counts across the full queue while returning a bounded snapshot", () => {
    const rootDir = workspace();
    for (let index = 0; index < 55; index += 1) writeTask(rootDir, `task_${String(index).padStart(2, "0")}`);

    const queue = refreshAgentQueueSignal(rootDir);

    expect(queue.totalTaskCount).toBe(55);
    expect(queue.pendingTaskCount).toBe(55);
    expect(queue.tasks).toHaveLength(50);
    expect(JSON.parse(fs.readFileSync(path.join(rootDir, ".intent-agent-queue.json"), "utf8"))).toEqual(queue);
  });

  it("retries a transient Windows rename conflict without exposing a partial queue", () => {
    const rootDir = workspace();
    writeTask(rootDir, "task_retry");
    const renameSync = fs.renameSync.bind(fs);
    const rename = vi
      .spyOn(fs, "renameSync")
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("busy"), { code: "EPERM" });
      })
      .mockImplementation(renameSync);

    const queue = refreshAgentQueueSignal(rootDir);

    expect(rename).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fs.readFileSync(path.join(rootDir, ".intent-agent-queue.json"), "utf8"))).toEqual(queue);
    rename.mockRestore();
  });

  it("releases an abandoned claim back to the shared queue", () => {
    const rootDir = workspace();
    const taskFile = writeTask(rootDir, "task_release");
    const claimed = claimAgentTask(rootDir, { provider: "codex", taskFile });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(fs.existsSync(path.join(rootDir, claimed.lockFile))).toBe(true);

    const released = releaseAgentTask(rootDir, taskFile);

    expect(released.ok).toBe(true);
    expect(fs.existsSync(path.join(rootDir, claimed.lockFile))).toBe(false);
    expect(readAgentTaskMetadata(rootDir, taskFile)?.metadata.status).toBe("queued");
  });

  it("prunes only old terminal artifacts", () => {
    const rootDir = workspace();
    const queued = writeTask(rootDir, "task_keep");
    const done = writeTask(rootDir, "task_done", "done");
    const context = path.join(rootDir, ".intent", "agent", "context_old.md");
    fs.writeFileSync(context, "old context");
    fs.utimesSync(context, new Date(0), new Date(0));

    const result = pruneAgentArtifacts(rootDir, 1);

    expect(result.prunedTaskCount).toBe(1);
    expect(fs.existsSync(done)).toBe(false);
    expect(fs.existsSync(context)).toBe(false);
    expect(fs.existsSync(queued)).toBe(true);
  });

  it("isolates evaluator artifacts from the project queue", () => {
    const rootDir = workspace();
    process.env.INTENT_LAYER_AGENT_ARTIFACT_DIR = ".intent/tmp/evaluation-agent";
    const isolatedDir = agentArtifactsDir(rootDir);
    fs.mkdirSync(isolatedDir, { recursive: true });
    const taskFile = path.join(isolatedDir, "task_isolated.md");
    const metadata = createAgentTaskMetadata({
      taskFile,
      sourceIntentId: "intent-isolated",
      sourceFile: ".intent/tmp/Fixture.tsx"
    });
    fs.writeFileSync(taskFile, buildAgentTaskMarkdown(metadata, "# isolated\n"));

    const queue = refreshAgentQueueSignal(rootDir);

    expect(queue.totalTaskCount).toBe(1);
    expect(agentQueueSignalPath(rootDir)).toBe(path.join(isolatedDir, "queue.json"));
    expect(fs.existsSync(path.join(rootDir, ".intent-agent-queue.json"))).toBe(false);
  });
});
