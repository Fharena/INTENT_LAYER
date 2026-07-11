import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withIntentFileLock } from "./fileLock";
import { IntentGraphStore } from "./graphStore";
import { instrumentSource } from "./instrument";
import { IntentService } from "./intentService";

const roots: string[] = [];

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-service-"));
  roots.push(rootDir);
  const file = path.join(rootDir, "src", "App.tsx");
  const source =
    'export function App(){ return <main className="gap-4 bg-slate-50 p-4">App</main>; }';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf8");
  const store = new IntentGraphStore(rootDir);
  const entries = instrumentSource({ code: source, file, rootDir }).entries;
  store.replaceFileEntries(file, entries);
  store.publish();
  return { rootDir, file, source, entry: entries[0], store, service: new IntentService(store) };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("IntentService semantic edits", () => {
  it("inspects, previews, applies, verifies, replays, and undoes one semantic token edit", () => {
    const { file, source, entry, service } = fixture();
    const inspected = service.inspectElement(entry.id);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.element.properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "layout.gap", value: "4" }),
        expect.objectContaining({ property: "color.background", value: "slate-50" })
      ])
    );

    const preview = service.previewSemanticEdit({
      targetId: entry.id,
      property: "layout.gap",
      value: "6"
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.patch.after).toContain("gap-6");
    expect(fs.readFileSync(file, "utf8")).toBe(source);

    const applied = service.applySemanticEdit({
      previewId: preview.previewId,
      idempotencyKey: "service-gap-edit"
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(fs.readFileSync(file, "utf8")).toBe(source.replace("gap-4", "gap-6"));
    expect(service.verifySemanticEdit(applied.operationId)).toMatchObject({
      ok: true,
      source: "verified",
      runtime: "unavailable"
    });

    const replay = service.applySemanticEdit({
      previewId: preview.previewId,
      idempotencyKey: "service-gap-edit"
    });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true });

    const undone = service.undoSemanticEdit(applied.operationId);
    expect(undone.ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("rejects stale previews before writing", () => {
    const { file, entry, service } = fixture();
    const preview = service.previewSemanticEdit({
      targetId: entry.id,
      property: "layout.gap",
      value: "6"
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    fs.appendFileSync(file, "\n// external edit\n", "utf8");
    const drifted = fs.readFileSync(file, "utf8");

    const result = service.applySemanticEdit({
      previewId: preview.previewId,
      idempotencyKey: "stale-preview-edit"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("source-hash-mismatch");
    expect(fs.readFileSync(file, "utf8")).toBe(drifted);
  });

  it("rejects a concurrent apply while the source lock is held", () => {
    const { rootDir, file, entry, service } = fixture();
    const preview = service.previewSemanticEdit({
      targetId: entry.id,
      property: "layout.gap",
      value: "6"
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const result = withIntentFileLock(rootDir, file, () =>
      service.applySemanticEdit({
        previewId: preview.previewId,
        idempotencyKey: "locked-source-edit"
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("file-locked");
  });

  it("reloads a graph published by another process", () => {
    const { rootDir, entry } = fixture();
    const diskStore = new IntentGraphStore(rootDir);
    const service = new IntentService(diskStore, { graphMode: "disk" });

    expect(service.findElements({ token: "gap-4" })).toMatchObject({
      ok: true,
      count: 1,
      elements: [expect.objectContaining({ id: entry.id })]
    });
  });

  it("refuses graph bindings that point outside the project root", () => {
    const { rootDir, entry } = fixture();
    const graphFile = path.join(rootDir, ".intent", "graph.intent.json");
    fs.writeFileSync(
      graphFile,
      `${JSON.stringify(
        {
          version: 1,
          generatedAt: new Date().toISOString(),
          entries: {
            [entry.id]: {
              ...entry,
              file: path.resolve(rootDir, "..", "outside.tsx"),
              relativeFile: "../outside.tsx"
            }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    const service = new IntentService(new IntentGraphStore(rootDir), { graphMode: "disk" });

    expect(service.findElements()).toMatchObject({ ok: true, count: 0, elements: [] });
    expect(service.inspectElement(entry.id)).toMatchObject({ ok: false, reason: "missing-binding" });
  });
});
