import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IntentGraphStore } from "./graphStore";
import { instrumentSource } from "./instrument";
import { IntentService } from "./intentService";

const roots: string[] = [];

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-flex-"));
  roots.push(rootDir);
  const file = path.join(rootDir, "src", "App.tsx");
  const source = [
    "export function App(){ return (",
    '  <section className="flex flex-row flex-nowrap items-stretch justify-start gap-4">',
    '    <article className="rounded-lg self-auto">A</article>',
    '    <article className="rounded-lg">B</article>',
    "  </section>",
    "); }"
  ].join("\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, "utf8");
  fs.writeFileSync(
    path.join(rootDir, "tailwind.config.ts"),
    'export default { theme: { extend: { spacing: { panel: "1.125rem" }, screens: { dashboard: "90rem" } } } };\n',
    "utf8"
  );
  const entries = instrumentSource({ code: source, file, rootDir }).entries;
  const parent = entries.find((entry) => entry.tagName === "section")!;
  const children = entries.filter((entry) => entry.tagName === "article");
  const store = new IntentGraphStore(rootDir);
  store.replaceFileEntries(file, entries);
  store.publish();
  return { rootDir, file, source, parent, children, store, service: new IntentService(store) };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Flex Layout Composer", () => {
  it("previews, applies, journals, and exactly undoes grouped parent and child edits", () => {
    const { file, source, parent, children, service } = fixture();
    const childIds = children.map((child) => child.id);
    const inspection = service.inspectFlexLayout({ parentId: parent.id, childIds, breakpoint: "base" });
    expect(inspection).toMatchObject({
      ok: true,
      direction: { explicit: "row", effective: "row" },
      wrap: { explicit: "nowrap", effective: "nowrap" },
      justify: { explicit: "start", effective: "start" },
      align: { explicit: "stretch", effective: "stretch" },
      gap: { explicit: "gap-4", effective: "gap-4" }
    });
    if (!inspection.ok) return;
    expect(inspection.gap.candidates).toContain("gap-panel");
    expect(inspection.items[0].alignSelf).toEqual({ explicit: "auto", effective: "auto" });

    const preview = service.previewFlexLayout({
      parentId: parent.id,
      childIds,
      breakpoint: "base",
      direction: "col",
      wrap: "wrap",
      justify: "between",
      align: "center",
      gap: "gap-panel",
      items: [{ id: children[1].id, alignSelf: "end" }]
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.affectedBindingCount).toBe(2);
    expect(preview.patch.kind).toBe("flex-layout");
    expect(preview.patch.after).toContain("flex-col flex-wrap items-center justify-between gap-panel");
    expect(preview.patch.after).toContain("rounded-lg self-end");
    expect(fs.readFileSync(file, "utf8")).toBe(source);

    expect(service.applyFlexLayout({ previewId: preview.previewId }).ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("flex-col flex-wrap items-center justify-between gap-panel");
    const operation = service.undoHistory().entries[0];
    expect(service.verifySemanticEdit(operation.operationFile)).toMatchObject({
      ok: true,
      source: "verified",
      runtime: "unavailable"
    });
    expect(service.revertLatest().ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("inherits through project breakpoints and writes only changed responsive properties", () => {
    const { parent, children, service } = fixture();
    const childIds = children.map((child) => child.id);
    const inspection = service.inspectFlexLayout({ parentId: parent.id, childIds, breakpoint: "dashboard" });
    expect(inspection).toMatchObject({
      ok: true,
      supportedBreakpoints: ["base", "sm", "md", "lg", "xl", "dashboard", "2xl"],
      direction: { explicit: null, effective: "row" },
      gap: { explicit: null, effective: "gap-4" }
    });

    const preview = service.previewFlexLayout({
      parentId: parent.id,
      childIds,
      breakpoint: "dashboard",
      direction: "row-reverse",
      items: [{ id: children[0].id, alignSelf: "center" }]
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.patch.after).toContain("dashboard:flex-row-reverse");
    expect(preview.patch.after).toContain("dashboard:self-center");
    expect(preview.patch.after).not.toContain("dashboard:gap-4");
  });

  it("rejects repeated, unbound, unsupported axis-gap, and stale grouped edits", () => {
    const { file, parent, children, service } = fixture();
    expect(
      service.inspectFlexLayout({
        parentId: parent.id,
        childIds: [children[0].id, children[0].id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "repeated-flex-binding" });
    expect(
      service.inspectFlexLayout({
        parentId: parent.id,
        childIds: children.map((child) => child.id),
        unboundChildCount: 1,
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "unbound-flex-child" });

    const preview = service.previewFlexLayout({
      parentId: parent.id,
      childIds: children.map((child) => child.id),
      breakpoint: "base",
      direction: "col",
      items: []
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const drifted = fs.readFileSync(file, "utf8").replace("rounded-lg", "rounded-xl");
    fs.writeFileSync(file, drifted, "utf8");
    expect(service.applyFlexLayout({ previewId: preview.previewId })).toMatchObject({
      ok: false,
      reason: "source-hash-mismatch"
    });
    expect(fs.readFileSync(file, "utf8")).toBe(drifted);

    const axisSource = fs.readFileSync(file, "utf8").replace("gap-4", "gap-x-4");
    fs.writeFileSync(file, axisSource, "utf8");
    const entries = instrumentSource({ code: axisSource, file, rootDir: path.dirname(path.dirname(file)) }).entries;
    const axisStore = new IntentGraphStore(path.dirname(path.dirname(file)));
    axisStore.replaceFileEntries(file, entries);
    const axisParent = entries.find((entry) => entry.tagName === "section")!;
    const axisChildren = entries.filter((entry) => entry.tagName === "article");
    expect(
      new IntentService(axisStore).inspectFlexLayout({
        parentId: axisParent.id,
        childIds: axisChildren.map((child) => child.id),
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "unsupported-flex-token" });
  });

  it("rejects dynamic and cross-file participants instead of partially editing", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "intent-layer-flex-boundary-"));
    roots.push(rootDir);
    const dynamicFile = path.join(rootDir, "src", "Dynamic.tsx");
    const dynamicSource = [
      "const cn = (...values: string[]) => values.join(' ');",
      "export function Dynamic(){ return (",
      '  <section className="flex gap-4">',
      '    <article className={cn("self-auto")}>A</article>',
      "  </section>",
      "); }"
    ].join("\n");
    fs.mkdirSync(path.dirname(dynamicFile), { recursive: true });
    fs.writeFileSync(dynamicFile, dynamicSource, "utf8");
    const dynamicEntries = instrumentSource({ code: dynamicSource, file: dynamicFile, rootDir }).entries;
    const dynamicStore = new IntentGraphStore(rootDir);
    dynamicStore.replaceFileEntries(dynamicFile, dynamicEntries);
    expect(
      new IntentService(dynamicStore).inspectFlexLayout({
        parentId: dynamicEntries.find((entry) => entry.tagName === "section")!.id,
        childIds: [dynamicEntries.find((entry) => entry.tagName === "article")!.id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "dynamic-flex-classname" });

    const parentFile = path.join(rootDir, "src", "Parent.tsx");
    const childFile = path.join(rootDir, "src", "Child.tsx");
    const parentSource = 'export function Parent(){ return <section className="flex" />; }';
    const childSource = 'export function Child(){ return <article className="self-auto">A</article>; }';
    fs.writeFileSync(parentFile, parentSource, "utf8");
    fs.writeFileSync(childFile, childSource, "utf8");
    const parentEntry = instrumentSource({ code: parentSource, file: parentFile, rootDir }).entries[0];
    const childEntry = instrumentSource({ code: childSource, file: childFile, rootDir }).entries[0];
    const crossStore = new IntentGraphStore(rootDir);
    crossStore.replaceFileEntries(parentFile, [parentEntry]);
    crossStore.replaceFileEntries(childFile, [childEntry]);
    expect(
      new IntentService(crossStore).inspectFlexLayout({
        parentId: parentEntry.id,
        childIds: [childEntry.id],
        breakpoint: "base"
      })
    ).toMatchObject({ ok: false, reason: "cross-file-flex" });
  });
});
