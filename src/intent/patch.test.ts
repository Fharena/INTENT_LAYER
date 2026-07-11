import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
});
