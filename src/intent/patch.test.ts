import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { instrumentSource } from "./instrument";
import {
  applyTokenPatch,
  pendingUndoStackFromOperationLog,
  recordPatchApplyInOperationLog,
  revertPendingUndo,
  revertTokenPatch
} from "./patch";

const roots: string[] = [];

function fixture(source = "export function App(){ return <main className=\"gap-4 p-4\">App</main>; }") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-patch-"));
  roots.push(rootDir);
  const file = path.join(rootDir, "src", "App.tsx");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  const entry = instrumentSource({ code: source, file, rootDir }).entries[0];
  return { rootDir, file, source, entry };
}

function currentEntry(rootDir: string, file: string) {
  const source = fs.readFileSync(file, "utf8");
  return instrumentSource({ code: source, file, rootDir }).entries[0];
}

function runNodeEval(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Child operation writer exited ${code}: ${stderr}`));
    });
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("safe token patches", () => {
  it("applies a minimal token replacement and restores it with a matching hash", () => {
    const { rootDir, file, source, entry } = fixture();
    const applied = applyTokenPatch(rootDir, entry, { id: entry.id, oldToken: "gap-4", nextToken: "gap-6" });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(fs.readFileSync(file, "utf8")).toBe(source.replace("gap-4", "gap-6"));
    expect(applied.sourceHashAfter).not.toBe(applied.sourceHashBefore);

    const reverted = revertTokenPatch(rootDir, applied, currentEntry(rootDir, file));
    expect(reverted.ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("rejects apply when the binding source has gone stale", () => {
    const { rootDir, file, entry } = fixture();
    fs.appendFileSync(file, "\n// external edit\n");

    const result = applyTokenPatch(rootDir, entry, { id: entry.id, oldToken: "gap-4", nextToken: "gap-6" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("source-hash-mismatch");
  });

  it("rejects revert after any untracked source drift", () => {
    const { rootDir, file, entry } = fixture();
    const applied = applyTokenPatch(rootDir, entry, { id: entry.id, oldToken: "gap-4", nextToken: "gap-6" });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    fs.appendFileSync(file, "\n// external edit\n");
    const drifted = fs.readFileSync(file, "utf8");

    const result = revertTokenPatch(rootDir, applied, currentEntry(rootDir, file));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("revert-source-hash-mismatch");
    expect(fs.readFileSync(file, "utf8")).toBe(drifted);
  });

  it("enforces latest-first persistent undo", async () => {
    const { rootDir, file, entry } = fixture();
    const first = applyTokenPatch(rootDir, entry, { id: entry.id, oldToken: "gap-4", nextToken: "gap-6" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    recordPatchApplyInOperationLog(rootDir, first);
    await new Promise((resolve) => setTimeout(resolve, 2));

    const secondEntry = currentEntry(rootDir, file);
    const second = applyTokenPatch(rootDir, secondEntry, { id: secondEntry.id, oldToken: "p-4", nextToken: "p-6" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    recordPatchApplyInOperationLog(rootDir, second);

    const outOfOrder = revertPendingUndo(rootDir, currentEntry(rootDir, file), { operationFile: first.operationFile });
    expect(outOfOrder.ok).toBe(false);
    if (!outOfOrder.ok) expect(outOfOrder.reason).toBe("undo-not-latest");

    const latest = revertPendingUndo(rootDir, currentEntry(rootDir, file), { operationFile: second.operationFile });
    expect(latest.ok).toBe(true);
    const oldest = revertPendingUndo(rootDir, currentEntry(rootDir, file), { operationFile: first.operationFile });
    expect(oldest.ok).toBe(true);
    expect(pendingUndoStackFromOperationLog(rootDir)).toHaveLength(0);
  });

  it(
    "serializes operation-log writes across MCP-sized processes",
    async () => {
      const { rootDir } = fixture();
      const patchModule = pathToFileURL(path.resolve("src/intent/patch.ts")).href;
      const writers = Array.from({ length: 4 }, (_, index) => {
        const source = `
          import path from "node:path";
          import { recordPatchApplyInOperationLog } from ${JSON.stringify(patchModule)};
          const root = ${JSON.stringify(rootDir)};
          const index = ${index};
          recordPatchApplyInOperationLog(root, {
            ok: true,
            applied: true,
            id: "writer-" + index,
            file: path.join(root, "src", "Writer" + index + ".tsx"),
            relativeFile: "src/Writer" + index + ".tsx",
            oldToken: "gap-4",
            nextToken: "gap-6",
            range: { start: 0, end: 5 },
            before: "gap-4",
            after: "gap-6",
            sourceHashBefore: "before-" + index,
            sourceHashAfter: "after-" + index,
            operationFile: path.join(root, ".intent", "operations", "writer-" + index + ".intent-op.json"),
            diffFile: path.join(root, ".intent", "diffs", "writer-" + index + ".intent-diff.yml"),
            metrics: { previewMs: 0, applyMs: 0 }
          });
        `;
        return runNodeEval(source);
      });

      await Promise.all(writers);

      expect(pendingUndoStackFromOperationLog(rootDir).map((patch) => patch.id).sort()).toEqual([
        "writer-0",
        "writer-1",
        "writer-2",
        "writer-3"
      ]);
      expect(
        fs.readdirSync(path.join(rootDir, ".intent", "operations")).filter((file) => file.endsWith(".tmp"))
      ).toEqual([]);
    },
    20_000
  );
});
