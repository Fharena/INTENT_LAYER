import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IntentGraphStore } from "./graphStore";
import { planGridLayout } from "./gridLayout";
import { sourceHash } from "./hash";
import { instrumentSource } from "./instrument";
import { IntentService } from "./intentService";
import { applyPlannedPatch } from "./patch";

const roots: string[] = [];

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-grid-"));
  roots.push(rootDir);
  const file = path.join(rootDir, "src", "App.tsx");
  const source = [
    "export function App(){ return (",
    '  <section className="grid grid-cols-12 gap-4">',
    '    <article className="col-span-4 rounded-lg bg-red-50">A</article>',
    '    <article className="col-span-4 rounded-lg bg-blue-50">B</article>',
    '    <article className="col-span-4 rounded-lg bg-green-50">C</article>',
    "  </section>",
    "); }"
  ].join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf8");
  const entries = instrumentSource({ code: source, file, rootDir }).entries;
  const parent = entries.find((entry) => entry.tokens.some((token) => token.token === "grid-cols-12"))!;
  const children = entries.filter((entry) => entry.tagName === "article").sort((a, b) => a.className.start - b.className.start);
  const store = new IntentGraphStore(rootDir);
  store.replaceFileEntries(file, entries);
  store.publish();
  return { rootDir, file, source, parent, children, store, service: new IntentService(store) };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Grid Layout Composer", () => {
  it("previews, applies, journals, and atomically undoes one grouped layout", () => {
    const { file, source, parent, children, service } = fixture();
    const childIds = children.map((child) => child.id);
    const inspection = service.inspectGridLayout({ parentId: parent.id, childIds, breakpoint: "base" });
    expect(inspection).toMatchObject({ ok: true, columns: { explicit: 12, effective: 12 } });
    if (!inspection.ok) return;
    expect(inspection.items).toHaveLength(3);
    expect(inspection.items[0]).toMatchObject({
      columnStart: { explicit: null, effective: null },
      columnSpan: { explicit: 4, effective: 4 }
    });

    const preview = service.previewGridLayout({
      parentId: parent.id,
      childIds,
      breakpoint: "base",
      columns: 10,
      items: [
        { id: children[0].id, columnStart: 1, columnSpan: 6 },
        { id: children[1].id, columnStart: 7, columnSpan: 4 },
        { id: children[2].id, columnStart: null, columnSpan: 10 }
      ]
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.affectedBindingCount).toBe(4);
    expect(preview.patch.edits).toHaveLength(4);
    expect(fs.readFileSync(file, "utf8")).toBe(source);

    const applied = service.applyGridLayout({ previewId: preview.previewId });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const changed = fs.readFileSync(file, "utf8");
    expect(changed).toContain("grid-cols-10");
    expect(changed).toContain("col-span-6 rounded-lg bg-red-50 col-start-1");
    expect(changed).toContain("col-span-4 rounded-lg bg-blue-50 col-start-7");
    expect(changed).toContain("col-span-10");

    const reverted = service.revertLatest();
    expect(reverted.ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
    expect(service.undoHistory().pendingCount).toBe(0);
  });

  it("keeps inherited values separate from explicit responsive values", () => {
    const { parent, children, service } = fixture();
    const childIds = children.map((child) => child.id);
    const inspection = service.inspectGridLayout({ parentId: parent.id, childIds, breakpoint: "md" });
    expect(inspection).toMatchObject({ ok: true, columns: { explicit: null, effective: 12 } });
    if (!inspection.ok) return;
    expect(inspection.items).toHaveLength(3);
    expect(inspection.items[0].columnSpan).toEqual({ explicit: null, effective: 4 });

    const preview = service.previewGridLayout({
      parentId: parent.id,
      childIds,
      breakpoint: "md",
      columns: 8,
      items: [{ id: children[0].id, columnStart: 1, columnSpan: 5 }]
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.patch.after).toContain("md:grid-cols-8");
    expect(preview.patch.after).toContain("md:col-start-1 md:col-span-5");
  });

  it("uses project breakpoints and edits row tracks in the grouped transaction", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-grid-rows-"));
    roots.push(rootDir);
    const file = path.join(rootDir, "src", "App.tsx");
    const source = [
      "export function App(){ return (",
      '  <section className="grid grid-cols-6 grid-rows-2 gap-4">',
      '    <article className="col-span-3 row-span-1">A</article>',
      '    <article className="col-span-3 row-span-1">B</article>',
      "  </section>",
      "); }"
    ].join("\n");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, "tailwind.config.ts"),
      'export default { theme: { extend: { screens: { dashboard: "90rem" } } } };\n',
      "utf8"
    );
    fs.writeFileSync(file, source, "utf8");
    const entries = instrumentSource({ code: source, file, rootDir }).entries;
    const parent = entries.find((entry) => entry.tagName === "section")!;
    const children = entries.filter((entry) => entry.tagName === "article");
    const store = new IntentGraphStore(rootDir);
    store.replaceFileEntries(file, entries);
    const service = new IntentService(store);
    const childIds = children.map((child) => child.id);

    const inspection = service.inspectGridLayout({ parentId: parent.id, childIds, breakpoint: "dashboard" });
    expect(inspection).toMatchObject({
      ok: true,
      supportedBreakpoints: ["base", "sm", "md", "lg", "xl", "dashboard", "2xl"],
      rows: { explicit: null, effective: 2 }
    });
    if (!inspection.ok) return;
    expect(inspection.items[0]).toMatchObject({
      rowStart: { explicit: null, effective: null },
      rowSpan: { explicit: null, effective: 1 }
    });

    const preview = service.previewGridLayout({
      parentId: parent.id,
      childIds,
      breakpoint: "dashboard",
      rows: 4,
      items: [{ id: children[0].id, rowStart: 2, rowSpan: 2 }]
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.patch.after).toContain("dashboard:grid-rows-4");
    expect(preview.patch.after).toContain("dashboard:row-start-2 dashboard:row-span-2");
    expect(service.applyGridLayout({ previewId: preview.previewId }).ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("dashboard:grid-rows-4");
    expect(service.revertLatest().ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("edits simple fractional templates used by asymmetric production grids", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-grid-template-"));
    roots.push(rootDir);
    const file = path.join(rootDir, "src", "App.tsx");
    const source = [
      "export function App(){ return (",
      '  <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">',
      '    <article className="rounded-lg">A</article>',
      '    <article className="rounded-lg">B</article>',
      "  </section>",
      "); }"
    ].join("\n");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source, "utf8");
    const entries = instrumentSource({ code: source, file, rootDir }).entries;
    const parent = entries.find((entry) => entry.tagName === "section")!;
    const children = entries.filter((entry) => entry.tagName === "article");
    const store = new IntentGraphStore(rootDir);
    store.replaceFileEntries(file, entries);
    store.publish();
    const service = new IntentService(store);
    const childIds = children.map((child) => child.id);

    expect(service.inspectGridLayout({ parentId: parent.id, childIds, breakpoint: "base" })).toMatchObject({
      ok: true,
      columns: { explicit: null, effective: 1 },
      columnTemplate: { explicit: null, effective: null }
    });
    const inspection = service.inspectGridLayout({ parentId: parent.id, childIds, breakpoint: "md" });
    expect(inspection).toMatchObject({
      ok: true,
      columns: { explicit: 2, effective: 2 },
      columnTemplate: { explicit: [1.2, 0.8], effective: [1.2, 0.8] }
    });

    const preview = service.previewGridLayout({
      parentId: parent.id,
      childIds,
      breakpoint: "md",
      columnTemplate: [0.75, 1.25],
      items: []
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.patch.after).toContain("md:grid-cols-[0.75fr_1.25fr]");
    const applied = service.applyGridLayout({ previewId: preview.previewId });
    expect(applied.ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("md:grid-cols-[0.75fr_1.25fr]");
    expect(service.revertLatest().ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("rejects repeated runtime bindings, unbound children, and overflowing placements", () => {
    const { parent, children, service } = fixture();
    expect(
      service.inspectGridLayout({
        parentId: parent.id,
        childIds: [children[0].id, children[0].id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "repeated-grid-binding" });
    expect(
      service.inspectGridLayout({
        parentId: parent.id,
        childIds: children.map((child) => child.id),
        unboundChildCount: 1,
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "unbound-grid-child" });
    expect(
      service.previewGridLayout({
        parentId: parent.id,
        childIds: children.map((child) => child.id),
        breakpoint: "base",
        columns: 8,
        items: [{ id: children[0].id, columnStart: 7, columnSpan: 3 }]
      })
    ).toMatchObject({ ok: false, reason: "grid-placement-overflow" });
    expect(
      service.previewGridLayout({
        parentId: parent.id,
        childIds: children.map((child) => child.id),
        breakpoint: "base",
        rows: 2,
        items: [{ id: children[0].id, rowStart: 2, rowSpan: 2 }]
      })
    ).toMatchObject({ ok: false, reason: "grid-row-placement-overflow" });
  });

  it("rejects dynamic className and cross-file child transactions", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-grid-boundary-"));
    roots.push(rootDir);
    const dynamicFile = path.join(rootDir, "src", "Dynamic.tsx");
    const dynamicSource = [
      "const cn = (...values: string[]) => values.join(' ');",
      "export function Dynamic(){ return (",
      '  <section className="grid grid-cols-12">',
      '    <article className={cn("col-span-4")}>A</article>',
      "  </section>",
      "); }"
    ].join("\n");
    fs.mkdirSync(path.dirname(dynamicFile), { recursive: true });
    fs.writeFileSync(dynamicFile, dynamicSource, "utf8");
    const dynamicEntries = instrumentSource({ code: dynamicSource, file: dynamicFile, rootDir }).entries;
    const dynamicStore = new IntentGraphStore(rootDir);
    dynamicStore.replaceFileEntries(dynamicFile, dynamicEntries);
    const dynamicService = new IntentService(dynamicStore);
    expect(
      dynamicService.inspectGridLayout({
        parentId: dynamicEntries.find((entry) => entry.tagName === "section")!.id,
        childIds: [dynamicEntries.find((entry) => entry.tagName === "article")!.id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "dynamic-grid-classname" });

    const whitespaceFile = path.join(rootDir, "src", "Whitespace.tsx");
    const whitespaceSource =
      'export function Whitespace(){ return <section className="grid  grid-cols-12"><article className="col-span-4">A</article></section>; }';
    fs.writeFileSync(whitespaceFile, whitespaceSource, "utf8");
    const whitespaceEntries = instrumentSource({ code: whitespaceSource, file: whitespaceFile, rootDir }).entries;
    const whitespaceStore = new IntentGraphStore(rootDir);
    whitespaceStore.replaceFileEntries(whitespaceFile, whitespaceEntries);
    const whitespaceService = new IntentService(whitespaceStore);
    expect(
      whitespaceService.inspectGridLayout({
        parentId: whitespaceEntries.find((entry) => entry.tagName === "section")!.id,
        childIds: [whitespaceEntries.find((entry) => entry.tagName === "article")!.id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "noncanonical-grid-classname" });

    const parentFile = path.join(rootDir, "src", "Parent.tsx");
    const childFile = path.join(rootDir, "src", "Child.tsx");
    const parentSource = 'export function Parent(){ return <section className="grid grid-cols-12" />; }';
    const childSource = 'export function Child(){ return <article className="col-span-4">A</article>; }';
    fs.writeFileSync(parentFile, parentSource, "utf8");
    fs.writeFileSync(childFile, childSource, "utf8");
    const parentEntry = instrumentSource({ code: parentSource, file: parentFile, rootDir }).entries[0];
    const childEntry = instrumentSource({ code: childSource, file: childFile, rootDir }).entries[0];
    const crossFileStore = new IntentGraphStore(rootDir);
    crossFileStore.replaceFileEntries(parentFile, [parentEntry]);
    crossFileStore.replaceFileEntries(childFile, [childEntry]);
    const crossFileService = new IntentService(crossFileStore);
    expect(
      crossFileService.inspectGridLayout({
        parentId: parentEntry.id,
        childIds: [childEntry.id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "cross-file-grid" });
  });

  it("writes nothing when a grouped preview hash or class range is stale", () => {
    const { rootDir, file, parent, children, store } = fixture();
    const plan = planGridLayout((id) => store.get(id), {
      parentId: parent.id,
      childIds: children.map((child) => child.id),
      breakpoint: "base",
      columns: 10,
      items: [{ id: children[0].id, columnSpan: 6 }]
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const drifted = fs.readFileSync(file, "utf8").replace("bg-red-50", "bg-rose-50");
    fs.writeFileSync(file, drifted, "utf8");
    expect(applyPlannedPatch(rootDir, parent, plan.patch)).toMatchObject({
      ok: false,
      reason: "source-hash-mismatch"
    });
    expect(fs.readFileSync(file, "utf8")).toBe(drifted);

    const forged = {
      ...plan.patch,
      sourceHashBefore: sourceHash(drifted)
    };
    expect(applyPlannedPatch(rootDir, parent, forged)).toMatchObject({
      ok: false,
      reason: "planned-range-mismatch"
    });
    expect(fs.readFileSync(file, "utf8")).toBe(drifted);
  });
});
