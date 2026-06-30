import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { analyzeClassNames } from "./analyze-classnames";
import { recordAgentResult } from "../src/intent/agentResult";
import { createAgentTask } from "../src/intent/agentTask";
import { instrumentSource } from "../src/intent/instrument";
import {
  applyTokenPatch,
  pendingUndoHistoryFromOperationLog,
  pendingUndoStackFromOperationLog,
  planTokenPatch,
  recordPatchApplyInOperationLog,
  recordPatchRevertInOperationLog,
  revertTokenPatch
} from "../src/intent/patch";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "reports", "performance");
const tmpDir = path.join(rootDir, ".intent", "tmp");
const aiCorpusMinFiles = 50;
const aiCorpusCoverageTarget = 0.5;

function sourceFiles(input: string): string[] {
  const full = path.resolve(rootDir, input);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return /\.[jt]sx$/.test(full) ? [full] : [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .flatMap((entry) => {
      const next = path.join(full, entry.name);
      return entry.isDirectory() ? sourceFiles(next) : /\.[jt]sx$/.test(next) ? [next] : [];
    })
    .sort();
}

function parseSyntaxErrorCount(file: string): number {
  const code = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    reportDiagnostics: true
  });
  return (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Number(sorted[index].toFixed(3));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function largeTransformFixture(cardCount: number): string {
  const cards = Array.from({ length: cardCount }, (_, index) =>
    [
      `        <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">`,
      `          <h2 className="text-lg font-semibold text-slate-950">Metric ${index}</h2>`,
      `          <p className={cn("text-sm leading-6 text-slate-600", active && "text-teal-700")}>Generated row</p>`,
      `          <button className={clsx("rounded-lg px-4 py-2 text-sm font-semibold", selected && "bg-teal-700 text-white")}>Inspect</button>`,
      "        </article>"
    ].join("\n")
  ).join("\n");

  return [
    "declare function cn(...value: Array<string | false | undefined>): string;",
    "declare function clsx(...value: Array<string | false | undefined>): string;",
    "export function LargeTransformFixture({ active, selected }: { active: boolean; selected: boolean }) {",
    "  return (",
    "    <section className=\"grid grid-cols-4 gap-4 rounded-2xl bg-slate-50 p-8\">",
    cards,
    "    </section>",
    "  );",
    "}",
    ""
  ].join("\n");
}

interface TaskComponentSnapshot {
  file: string;
  componentName: string | null;
  range: {
    start: number;
    end: number;
  };
  excerpt: string;
}

function parseTaskJsonSection<T>(markdown: string, heading: string): T | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## ${escapedHeading}\\s+\`\`\`json\\s+([\\s\\S]*?)\\s+\`\`\``));
  if (!match) return null;

  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const corpus = analyzeClassNames(["fixtures/corpus", "src/App.tsx"], rootDir);
const aiGeneratedCorpus = analyzeClassNames(["fixtures/ai-generated"], rootDir);
const { records: _aiGeneratedCorpusRecords, ...aiGeneratedCorpusSummary } = aiGeneratedCorpus;

const transformIterations = 5;
const warmTransformTargetMs = 5;
const coldTransformTargetMs = 10;
const transformMeasurements = sourceFiles("src")
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => {
    const code = fs.readFileSync(file, "utf8");
    const samples = Array.from({ length: transformIterations }, () =>
      instrumentSource({ code, file, rootDir })
    );
    const times = samples.map((sample) => sample.transformMs);
    const last = samples[samples.length - 1];
    return {
      file: path.relative(rootDir, file).replace(/\\/g, "/"),
      entries: last.entries.length,
      samples: times,
      averageMs: average(times),
      p95Ms: percentile(times, 0.95),
      maxMs: Number(Math.max(...times).toFixed(3))
    };
  });

const transformTimes = transformMeasurements.flatMap((item) => item.samples);
const warmTransformTimes = transformMeasurements.flatMap((item) => item.samples.slice(1));
const largeTransformCardCount = 100;
const largeTransformTargetMs = 20;
const largeTransformFile = path.join(tmpDir, "LargeTransformFixture.tsx");
const largeTransformCode = largeTransformFixture(largeTransformCardCount);
fs.writeFileSync(largeTransformFile, largeTransformCode);
const largeTransformSamples = Array.from({ length: transformIterations }, () =>
  instrumentSource({ code: largeTransformCode, file: largeTransformFile, rootDir })
);
const largeTransformTimes = largeTransformSamples.map((sample) => sample.transformMs);
const largeTransformLast = largeTransformSamples[largeTransformSamples.length - 1];

const patchFixture = path.join(tmpDir, "StaticPatchFixture.tsx");
fs.writeFileSync(
  patchFixture,
  [
    "export function StaticPatchFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Patch target</div>;",
    "}",
    ""
  ].join("\n")
);

const patchInstrument = instrumentSource({
  code: fs.readFileSync(patchFixture, "utf8"),
  file: patchFixture,
  rootDir
});
const patchEntry = patchInstrument.entries[0];

const previewStarted = performance.now();
const preview = planTokenPatch(patchEntry, {
  id: patchEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceStart,
  sourceEnd: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceEnd
});
const previewRoundTripMs = Number((performance.now() - previewStarted).toFixed(3));

const apply = applyTokenPatch(rootDir, patchEntry, {
  id: patchEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceStart,
  sourceEnd: patchEntry.tokens.find((token) => token.token === "gap-4")?.sourceEnd
});

const syntaxErrorsAfterPatch = parseSyntaxErrorCount(patchFixture);
const revert = revertTokenPatch(rootDir, apply.ok ? apply : null, patchEntry);
const syntaxErrorsAfterRevert = parseSyntaxErrorCount(patchFixture);
const agentTask = createAgentTask(rootDir, patchEntry, {
  id: patchEntry.id,
  desiredChange: "Increase the selected grid radius and padding, then document the result as a semantic intent diff."
});
const agentTaskMarkdown = agentTask.ok ? agentTask.markdown : "";
const agentTaskRequiredSections = [
  "## Goal",
  "## Selected Component",
  "## Current Intent Document",
  "## Component Snapshot",
  "## Related Source Snapshot",
  "## Source Snapshot",
  "## Desired Change",
  "## Constraints",
  "## Files That May Be Edited",
  "## Files That Should Not Be Edited",
  "## Required Checks"
];
const agentTaskSectionsPresent = agentTaskRequiredSections.every((section) =>
  agentTaskMarkdown.includes(section)
);
if (agentTask.ok) {
  fs.writeFileSync(
    patchFixture,
    fs
      .readFileSync(patchFixture, "utf8")
      .replace("rounded-lg p-6", "rounded-xl p-8")
      .replace("Patch target", "Patch target with semantic className change")
  );
}
const agentResult = recordAgentResult(rootDir, patchEntry, {
  id: patchEntry.id,
  taskFile: agentTask.ok ? agentTask.taskFile : undefined,
  summary:
    "Agent result fixture: increased radius and padding on the selected grid without making an unrelated source rewrite.",
  changedFiles: [path.relative(rootDir, patchFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes: "Evaluation fixture only; no LLM call is made."
});
const agentResultMarkdown = agentResult.ok ? agentResult.markdown : "";
const agentResultRequiredSections = [
  "## Summary",
  "## Source Binding",
  "## Task",
  "## Changed Files",
  "## Checks",
  "## Source Diff",
  "## Semantic Intent Diff",
  "## Related Source Diff",
  "## Related Semantic Intent Diff",
  "## Component Source Diff",
  "## Component Semantic Intent Diff",
  "## Intent Diff"
];
const agentResultSectionsPresent = agentResultRequiredSections.every((section) =>
  agentResultMarkdown.includes(section)
);
const agentResultFilesExist =
  agentResult.ok && fs.existsSync(agentResult.resultFile) && fs.existsSync(agentResult.diffFile);

const componentSnapshotFixtureCases = [
  {
    name: "function-nested-map-conditional-fragment",
    componentName: "ComponentSnapshotFunction",
    expectedMarkers: ["export function ComponentSnapshotFunction", "items.map", "<>", "active ?"],
    source: [
      "export function ComponentSnapshotFunction({ active, items }: { active: boolean; items: string[] }) {",
      "  return (",
      "    <>",
      "      <section className=\"grid grid-cols-2 gap-4 rounded-lg p-6\">",
      "        {items.map((item) => (",
      "          <article key={item} className={active ? \"rounded-lg p-4\" : \"rounded-xl p-6\"}>",
      "            <span className=\"text-sm font-medium\">{item}</span>",
      "          </article>",
      "        ))}",
      "      </section>",
      "    </>",
      "  );",
      "}",
      ""
    ].join("\n")
  },
  {
    name: "arrow-block",
    componentName: "ComponentSnapshotArrowBlock",
    expectedMarkers: ["export const ComponentSnapshotArrowBlock", "return (", "items.map"],
    source: [
      "export const ComponentSnapshotArrowBlock = ({ items }: { items: string[] }) => {",
      "  return (",
      "    <section className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">",
      "      {items.map((item) => <article key={item} className=\"rounded-lg p-4\">{item}</article>)}",
      "    </section>",
      "  );",
      "};",
      ""
    ].join("\n")
  },
  {
    name: "arrow-parenthesized-expression",
    componentName: "ComponentSnapshotArrowParen",
    expectedMarkers: ["export const ComponentSnapshotArrowParen", "<section", "</section>"],
    source: [
      "export const ComponentSnapshotArrowParen = ({ active }: { active: boolean }) => (",
      "  <section className=\"grid gap-4 rounded-lg p-6\">",
      "    {active ? <article className=\"rounded-lg p-4\">Active</article> : null}",
      "  </section>",
      ");",
      ""
    ].join("\n")
  },
  {
    name: "arrow-jsx-no-parens",
    componentName: "ComponentSnapshotArrowJsx",
    expectedMarkers: ["export const ComponentSnapshotArrowJsx", "<section", "No parens"],
    source: [
      "export const ComponentSnapshotArrowJsx = () => <section className=\"grid gap-4 rounded-lg p-6\">No parens</section>;",
      ""
    ].join("\n")
  },
  {
    name: "memo-wrapped-function",
    componentName: "ComponentSnapshotMemo",
    expectedMarkers: ["export const ComponentSnapshotMemo", "memo(function", "<section", "Memo"],
    source: [
      "export const ComponentSnapshotMemo = memo(function ComponentSnapshotMemoInner({ active }: { active: boolean }) {",
      "  return (",
      "    <section className={active ? \"grid gap-4 rounded-lg p-6\" : \"grid gap-6 rounded-xl p-8\"}>",
      "      Memo",
      "    </section>",
      "  );",
      "});",
      ""
    ].join("\n")
  },
  {
    name: "forward-ref-wrapped-function",
    componentName: "ComponentSnapshotForwardRef",
    expectedMarkers: ["export const ComponentSnapshotForwardRef", "forwardRef", "ref={ref}", "<section"],
    source: [
      "export const ComponentSnapshotForwardRef = forwardRef<HTMLDivElement, { active: boolean }>(function ComponentSnapshotForwardRefInner(",
      "  { active },",
      "  ref",
      ") {",
      "  return (",
      "    <section ref={ref} className={active ? \"grid gap-4 rounded-lg p-6\" : \"grid gap-6 rounded-xl p-8\"}>",
      "      Forward ref",
      "    </section>",
      "  );",
      "});",
      ""
    ].join("\n")
  },
  {
    name: "hoc-wrapped-function",
    componentName: "ComponentSnapshotHoc",
    expectedMarkers: ["export const ComponentSnapshotHoc", "withPanel(function", "items.map", "<section"],
    source: [
      "export const ComponentSnapshotHoc = withPanel(function ComponentSnapshotHocInner({ items }: { items: string[] }) {",
      "  return (",
      "    <section className=\"grid grid-cols-2 gap-4 rounded-lg p-6\">",
      "      {items.map((item) => <article key={item} className=\"rounded-lg p-4\">{item}</article>)}",
      "    </section>",
      "  );",
      "});",
      ""
    ].join("\n")
  },
  {
    name: "namespace-object-export",
    componentName: "ComponentSnapshotNamespace",
    expectedMarkers: ["export const ComponentSnapshotNamespace", "Card:", "Empty:", "<section"],
    source: [
      "export const ComponentSnapshotNamespace = {",
      "  Card: ({ active }: { active: boolean }) => (",
      "    <section className={active ? \"grid gap-4 rounded-lg p-6\" : \"grid gap-6 rounded-xl p-8\"}>",
      "      Namespace card",
      "    </section>",
      "  ),",
      "  Empty: () => null",
      "};",
      ""
    ].join("\n")
  }
];

const componentSnapshotFixtures = componentSnapshotFixtureCases.map((fixtureCase) => {
  const file = path.join(tmpDir, `${fixtureCase.componentName}.tsx`);
  fs.writeFileSync(file, fixtureCase.source);
  const instrumented = instrumentSource({
    code: fixtureCase.source,
    file,
    rootDir
  });
  const entry = instrumented.entries.find((candidate) => candidate.componentName === fixtureCase.componentName);
  const task = createAgentTask(rootDir, entry, {
    id: entry?.id ?? `missing-${fixtureCase.name}`,
    desiredChange: `Fixture only: capture component snapshot for ${fixtureCase.name}.`
  });
  const snapshot = task.ok
    ? parseTaskJsonSection<TaskComponentSnapshot | null>(task.markdown, "Component Snapshot")
    : null;
  const markersPresent = fixtureCase.expectedMarkers.every((marker) =>
    snapshot?.excerpt.includes(marker)
  );

  return {
    name: fixtureCase.name,
    componentName: fixtureCase.componentName,
    entryCreated: Boolean(entry),
    entryCount: instrumented.entries.length,
    taskOk: task.ok,
    taskMs: task.ok ? task.metrics.taskMs : task.metrics?.taskMs,
    snapshotAvailable: Boolean(snapshot),
    snapshotComponentName: snapshot?.componentName ?? null,
    markersPresent,
    pass:
      Boolean(entry) &&
      task.ok &&
      Boolean(snapshot) &&
      snapshot?.componentName === fixtureCase.componentName &&
      markersPresent
  };
});
const componentSnapshotFixturePassCount = componentSnapshotFixtures.filter((fixture) => fixture.pass).length;

const readOnlyFixture = path.join(tmpDir, "ReadOnlyBindingFixture.tsx");
fs.writeFileSync(
  readOnlyFixture,
  [
    "const cardClass = \"grid grid-cols-3 gap-4 rounded-lg p-6\";",
    "export function ReadOnlyBindingFixture() {",
    "  return <div className={cardClass}>Read-only target</div>;",
    "}",
    ""
  ].join("\n")
);

const readOnlyInstrument = instrumentSource({
  code: fs.readFileSync(readOnlyFixture, "utf8"),
  file: readOnlyFixture,
  rootDir
});
const readOnlyEntry = readOnlyInstrument.entries[0];
const readOnlyTask = createAgentTask(rootDir, readOnlyEntry, {
  id: readOnlyEntry?.id ?? "missing-read-only-binding",
  desiredChange: "Change this variable-backed className through an agent handoff."
});
if (readOnlyTask.ok) {
  fs.writeFileSync(
    readOnlyFixture,
    fs
      .readFileSync(readOnlyFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
  );
}
const readOnlySyntaxErrorsAfterResult = parseSyntaxErrorCount(readOnlyFixture);
const readOnlyResult = recordAgentResult(rootDir, readOnlyEntry, {
  id: readOnlyEntry?.id ?? "missing-read-only-binding",
  taskFile: readOnlyTask.ok ? readOnlyTask.taskFile : undefined,
  summary:
    "Read-only fixture: updated the variable-backed className through an agent handoff result.",
  changedFiles: [path.relative(rootDir, readOnlyFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes: "Evaluation fixture for related source diff; no LLM call is made."
});

const readOnlyCnVariableFixture = path.join(tmpDir, "ReadOnlyCnVariableFixture.tsx");
fs.writeFileSync(
  readOnlyCnVariableFixture,
  [
    "declare function cn(...value: Array<string | false>): string;",
    "export function ReadOnlyCnVariableFixture({ active }: { active: boolean }) {",
    "  const cardClass = cn(\"grid grid-cols-3 gap-4 rounded-lg p-6\", active && \"bg-teal-50\");",
    "  return <div className={cardClass}>Read-only cn variable target</div>;",
    "}",
    ""
  ].join("\n")
);

const readOnlyCnVariableInstrument = instrumentSource({
  code: fs.readFileSync(readOnlyCnVariableFixture, "utf8"),
  file: readOnlyCnVariableFixture,
  rootDir
});
const readOnlyCnVariableEntry = readOnlyCnVariableInstrument.entries[0];
const readOnlyCnVariableTask = createAgentTask(rootDir, readOnlyCnVariableEntry, {
  id: readOnlyCnVariableEntry?.id ?? "missing-read-only-cn-variable-binding",
  desiredChange: "Change this cn-backed variable className through an agent handoff."
});
if (readOnlyCnVariableTask.ok) {
  fs.writeFileSync(
    readOnlyCnVariableFixture,
    fs
      .readFileSync(readOnlyCnVariableFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
      .replace("bg-teal-50", "bg-cyan-50")
  );
}
const readOnlyCnVariableSyntaxErrorsAfterResult = parseSyntaxErrorCount(readOnlyCnVariableFixture);
const readOnlyCnVariableResult = recordAgentResult(rootDir, readOnlyCnVariableEntry, {
  id: readOnlyCnVariableEntry?.id ?? "missing-read-only-cn-variable-binding",
  taskFile: readOnlyCnVariableTask.ok ? readOnlyCnVariableTask.taskFile : undefined,
  summary:
    "Read-only cn variable fixture: updated literal segments through an agent handoff result.",
  changedFiles: [path.relative(rootDir, readOnlyCnVariableFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes: "Evaluation fixture for related source semantic diff across cn literal segments; no LLM call is made."
});

const readOnlyCompositeVariableFixture = path.join(tmpDir, "ReadOnlyCompositeVariableFixture.tsx");
fs.writeFileSync(
  readOnlyCompositeVariableFixture,
  [
    "export function ReadOnlyCompositeVariableFixture({ active }: { active: boolean }) {",
    "  const cardClass = [",
    "    \"grid grid-cols-3 gap-4 rounded-lg p-6\",",
    "    active ? \"bg-teal-50\" : \"bg-slate-50\",",
    "    {",
    "      active: \"border-teal-200\",",
    "      muted: \"border-slate-200\"",
    "    }[active ? \"active\" : \"muted\"],",
    "    `text-sm ${active ? \"text-teal-700\" : \"text-slate-600\"}`",
    "  ].join(\" \");",
    "  return <div className={cardClass}>Read-only composite variable target</div>;",
    "}",
    ""
  ].join("\n")
);

const readOnlyCompositeVariableInstrument = instrumentSource({
  code: fs.readFileSync(readOnlyCompositeVariableFixture, "utf8"),
  file: readOnlyCompositeVariableFixture,
  rootDir
});
const readOnlyCompositeVariableEntry = readOnlyCompositeVariableInstrument.entries[0];
const readOnlyCompositeVariableTask = createAgentTask(rootDir, readOnlyCompositeVariableEntry, {
  id: readOnlyCompositeVariableEntry?.id ?? "missing-read-only-composite-variable-binding",
  desiredChange: "Change this array/object/template variable className through an agent handoff."
});
if (readOnlyCompositeVariableTask.ok) {
  fs.writeFileSync(
    readOnlyCompositeVariableFixture,
    fs
      .readFileSync(readOnlyCompositeVariableFixture, "utf8")
      .replace("grid grid-cols-3 gap-4 rounded-lg p-6", "grid grid-cols-3 gap-6 rounded-xl p-8")
      .replace("bg-teal-50", "bg-cyan-50")
      .replace("border-teal-200", "border-cyan-200")
      .replace("text-teal-700", "text-cyan-700")
  );
}
const readOnlyCompositeVariableSyntaxErrorsAfterResult = parseSyntaxErrorCount(
  readOnlyCompositeVariableFixture
);
const readOnlyCompositeVariableResult = recordAgentResult(rootDir, readOnlyCompositeVariableEntry, {
  id: readOnlyCompositeVariableEntry?.id ?? "missing-read-only-composite-variable-binding",
  taskFile: readOnlyCompositeVariableTask.ok ? readOnlyCompositeVariableTask.taskFile : undefined,
  summary:
    "Read-only composite variable fixture: updated array, object map, and template literal segments.",
  changedFiles: [path.relative(rootDir, readOnlyCompositeVariableFixture).replace(/\\/g, "/")],
  checks: ["npm run typecheck", "npm run eval", "npm run build"],
  notes:
    "Evaluation fixture for related source semantic diff across arrays, object maps, and template literals; no LLM call is made."
});

const cnPatchFixture = path.join(tmpDir, "CnPatchFixture.tsx");
fs.writeFileSync(
  cnPatchFixture,
  [
    "declare function cn(...value: Array<string | false>): string;",
    "export function CnPatchFixture({ active }: { active: boolean }) {",
    "  return <div className={cn(\"grid grid-cols-3 gap-4 rounded-lg p-6\", active && \"bg-teal-50\")}>Patch target</div>;",
    "}",
    ""
  ].join("\n")
);

const cnPatchInstrument = instrumentSource({
  code: fs.readFileSync(cnPatchFixture, "utf8"),
  file: cnPatchFixture,
  rootDir
});
const cnPatchEntry = cnPatchInstrument.entries[0];
const cnPatchTarget = cnPatchEntry.tokens.find((token) => token.token === "gap-4");
const cnApply = applyTokenPatch(rootDir, cnPatchEntry, {
  id: cnPatchEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: cnPatchTarget?.sourceStart,
  sourceEnd: cnPatchTarget?.sourceEnd
});
const syntaxErrorsAfterCnPatch = parseSyntaxErrorCount(cnPatchFixture);

const staleFixture = path.join(tmpDir, "StalePatchFixture.tsx");
fs.writeFileSync(
  staleFixture,
  [
    "export function StalePatchFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Stale target</div>;",
    "}",
    ""
  ].join("\n")
);
const staleInstrument = instrumentSource({
  code: fs.readFileSync(staleFixture, "utf8"),
  file: staleFixture,
  rootDir
});
const staleEntry = staleInstrument.entries[0];
fs.writeFileSync(staleFixture, fs.readFileSync(staleFixture, "utf8").replace("gap-4", "gap-8"));
const staleApply = applyTokenPatch(rootDir, staleEntry, {
  id: staleEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6"
});

const operationLogFile = path.join(rootDir, ".intent", "operations", "operation-log.json");
if (fs.existsSync(operationLogFile)) {
  fs.unlinkSync(operationLogFile);
}
const operationStackFixture = path.join(tmpDir, "OperationStackFixture.tsx");
fs.writeFileSync(
  operationStackFixture,
  [
    "export function OperationStackFixture() {",
    "  return <div className=\"grid grid-cols-3 gap-4 rounded-lg p-6\">Stack target</div>;",
    "}",
    ""
  ].join("\n")
);
const operationStackInstrument = instrumentSource({
  code: fs.readFileSync(operationStackFixture, "utf8"),
  file: operationStackFixture,
  rootDir
});
const operationStackEntry = operationStackInstrument.entries[0];
const operationStackGap = operationStackEntry.tokens.find((token) => token.token === "gap-4");
const operationApplyOne = applyTokenPatch(rootDir, operationStackEntry, {
  id: operationStackEntry.id,
  oldToken: "gap-4",
  nextToken: "gap-6",
  sourceStart: operationStackGap?.sourceStart,
  sourceEnd: operationStackGap?.sourceEnd
});
if (operationApplyOne.ok) {
  recordPatchApplyInOperationLog(rootDir, operationApplyOne);
}
const operationStackAfterOne = instrumentSource({
  code: fs.readFileSync(operationStackFixture, "utf8"),
  file: operationStackFixture,
  rootDir
});
const operationStackEntryAfterOne = operationStackAfterOne.entries[0];
const operationStackPadding = operationStackEntryAfterOne.tokens.find((token) => token.token === "p-6");
const operationApplyTwo = applyTokenPatch(rootDir, operationStackEntryAfterOne, {
  id: operationStackEntryAfterOne.id,
  oldToken: "p-6",
  nextToken: "p-8",
  sourceStart: operationStackPadding?.sourceStart,
  sourceEnd: operationStackPadding?.sourceEnd
});
if (operationApplyTwo.ok) {
  recordPatchApplyInOperationLog(rootDir, operationApplyTwo);
}
const pendingAfterApply = pendingUndoStackFromOperationLog(rootDir);
const historyAfterApply = pendingUndoHistoryFromOperationLog(rootDir);
const operationRevertOne = revertTokenPatch(
  rootDir,
  pendingAfterApply[pendingAfterApply.length - 1],
  operationStackEntryAfterOne
);
if (operationRevertOne.ok) {
  recordPatchRevertInOperationLog(rootDir, operationRevertOne);
}
const pendingAfterFirstRevert = pendingUndoStackFromOperationLog(rootDir);
const historyAfterFirstRevert = pendingUndoHistoryFromOperationLog(rootDir);
const operationRevertTwo = revertTokenPatch(
  rootDir,
  pendingAfterFirstRevert[pendingAfterFirstRevert.length - 1],
  operationStackEntry
);
if (operationRevertTwo.ok) {
  recordPatchRevertInOperationLog(rootDir, operationRevertTwo);
}
const pendingAfterSecondRevert = pendingUndoStackFromOperationLog(rootDir);
const historyAfterSecondRevert = pendingUndoHistoryFromOperationLog(rootDir);
const syntaxErrorsAfterOperationStack = parseSyntaxErrorCount(operationStackFixture);

const graphLookupIterations = 1000;
const graphLookup = new Map(patchInstrument.entries.map((entry) => [entry.id, entry]));
const lookupStarted = performance.now();
for (let index = 0; index < graphLookupIterations; index += 1) {
  graphLookup.get(patchEntry.id);
}
const graphLookupTotalMs = performance.now() - lookupStarted;

const report = {
  generatedAt: new Date().toISOString(),
  contextPackUsed: true,
  corpus,
  aiGeneratedCorpus: {
    ...aiGeneratedCorpusSummary,
    gates: {
      minFilesPass: aiGeneratedCorpus.filesScanned >= aiCorpusMinFiles,
      staticAndSimpleCoveragePass:
        aiGeneratedCorpus.editableCoverage.staticAndSimpleCnClsx >= aiCorpusCoverageTarget,
      supportedDirectCoveragePass:
        aiGeneratedCorpus.editableCoverage.supportedDirect >= aiCorpusCoverageTarget,
      allObservedCoveragePass:
        aiGeneratedCorpus.editableCoverage.allObservedTokens >= aiCorpusCoverageTarget
    },
    targets: {
      minFiles: aiCorpusMinFiles,
      editableCoverage: aiCorpusCoverageTarget
    },
    caveat:
      "This is a committed Codex-generated React/Tailwind corpus for reproducible MVP coverage auditing, not an independently sourced external benchmark."
  },
  transform: {
    filesMeasured: transformMeasurements.length,
    iterationsPerFile: transformIterations,
    measurements: transformMeasurements,
    averageMs: average(transformTimes),
    p95Ms: percentile(transformTimes, 0.95),
    maxMs: transformTimes.length ? Number(Math.max(...transformTimes).toFixed(3)) : 0,
    warmAverageMs: average(warmTransformTimes),
    warmP95Ms: percentile(warmTransformTimes, 0.95),
    warmMaxMs: warmTransformTimes.length ? Number(Math.max(...warmTransformTimes).toFixed(3)) : 0,
    warmTargetMs: warmTransformTargetMs,
    coldTargetMs: coldTransformTargetMs
  },
  largeTransform: {
    file: path.relative(rootDir, largeTransformFile).replace(/\\/g, "/"),
    cardCount: largeTransformCardCount,
    entries: largeTransformLast.entries.length,
    bytes: largeTransformCode.length,
    iterations: transformIterations,
    samples: largeTransformTimes,
    averageMs: average(largeTransformTimes),
    p95Ms: percentile(largeTransformTimes, 0.95),
    maxMs: Number(Math.max(...largeTransformTimes).toFixed(3)),
    targetMs: largeTransformTargetMs,
    pass: Math.max(...largeTransformTimes) <= largeTransformTargetMs
  },
  graphLookupProxy: {
    iterations: graphLookupIterations,
    totalMs: Number(graphLookupTotalMs.toFixed(3)),
    averageMs: Number((graphLookupTotalMs / graphLookupIterations).toFixed(6)),
    note: "This measures id-to-binding graph lookup only, not a real browser click event."
  },
  patch: {
    previewOk: preview.ok,
    previewMs: preview.ok ? preview.metrics.previewMs : preview.metrics?.previewMs,
    previewRoundTripMs,
    applyOk: apply.ok,
    applyMs: apply.ok ? apply.metrics.applyMs : apply.metrics?.applyMs,
    syntaxErrorsAfterPatch,
    revertOk: revert.ok,
    revertMs: revert.ok ? revert.metrics.revertMs : revert.metrics?.applyMs,
    syntaxErrorsAfterRevert,
    staleRejectionOk: !staleApply.ok && staleApply.reason === "source-hash-mismatch",
    staleRejectionReason: staleApply.ok ? null : staleApply.reason,
    simpleCnClsx: {
      applyOk: cnApply.ok,
      applyMs: cnApply.ok ? cnApply.metrics.applyMs : cnApply.metrics?.applyMs,
      syntaxErrorsAfterPatch: syntaxErrorsAfterCnPatch,
      bindingKind: cnPatchEntry.className.kind,
      callee: cnPatchEntry.className.callee,
      dynamicSegments: cnPatchEntry.className.dynamicSegments
    }
  },
  operationLog: {
    logFile: path.relative(rootDir, operationLogFile).replace(/\\/g, "/"),
    firstApplyOk: operationApplyOne.ok,
    secondApplyOk: operationApplyTwo.ok,
    pendingAfterApply: pendingAfterApply.length,
    historyAfterApplyCount: historyAfterApply.pendingCount,
    historyAfterApplyNextToken:
      historyAfterApply.entries.find((entry) => entry.next)?.nextToken ?? null,
    firstRevertOk: operationRevertOne.ok,
    pendingAfterFirstRevert: pendingAfterFirstRevert.length,
    historyAfterFirstRevertCount: historyAfterFirstRevert.pendingCount,
    secondRevertOk: operationRevertTwo.ok,
    pendingAfterSecondRevert: pendingAfterSecondRevert.length,
    historyAfterSecondRevertCount: historyAfterSecondRevert.pendingCount,
    syntaxErrorsAfterRevert: syntaxErrorsAfterOperationStack
  },
  agentTask: {
    ok: agentTask.ok,
    taskMs: agentTask.ok ? agentTask.metrics.taskMs : agentTask.metrics?.taskMs,
    sectionsPresent: agentTaskSectionsPresent,
    taskFile: agentTask.ok ? path.relative(rootDir, agentTask.taskFile).replace(/\\/g, "/") : null
  },
  agentResult: {
    ok: agentResult.ok,
    resultMs: agentResult.ok ? agentResult.metrics.resultMs : agentResult.metrics?.resultMs,
    sectionsPresent: agentResultSectionsPresent,
    filesExist: agentResultFilesExist,
    resultFile: agentResult.ok
      ? path.relative(rootDir, agentResult.resultFile).replace(/\\/g, "/")
      : null,
    diffFile: agentResult.ok ? path.relative(rootDir, agentResult.diffFile).replace(/\\/g, "/") : null,
    sourceHashChanged: agentResult.ok ? agentResult.source.sourceHashChanged : null,
    snapshotAvailable: agentResult.ok ? agentResult.source.snapshotAvailable : false,
    diffLineCount: agentResult.ok ? agentResult.source.diffLineCount : 0,
    sourceDiffPresent: agentResult.ok ? Boolean(agentResult.sourceDiff) : false,
    semanticChangeCount: agentResult.ok ? agentResult.source.semanticChangeCount : 0,
    semanticDiffPresent: agentResult.ok ? Boolean(agentResult.semanticDiff) : false,
    semanticTokenAddedCount: agentResult.ok ? agentResult.semanticDiff?.tokenAddedCount ?? 0 : 0,
    semanticTokenRemovedCount: agentResult.ok ? agentResult.semanticDiff?.tokenRemovedCount ?? 0 : 0,
    componentSnapshotAvailable: agentResult.ok
      ? agentResult.source.componentSnapshotAvailable
      : false,
    componentDiffLineCount: agentResult.ok ? agentResult.source.componentDiffLineCount : 0,
    componentSourceDiffPresent: agentResult.ok ? Boolean(agentResult.componentSourceDiff) : false,
    componentSemanticChangeCount: agentResult.ok
      ? agentResult.source.componentSemanticChangeCount
      : 0,
    componentSemanticDiffPresent: agentResult.ok
      ? Boolean(agentResult.componentSemanticDiff)
      : false,
    componentSemanticTokenAddedCount: agentResult.ok
      ? agentResult.componentSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    componentSemanticTokenRemovedCount: agentResult.ok
      ? agentResult.componentSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  componentSnapshotFixtures: {
    cases: componentSnapshotFixtures.length,
    passCount: componentSnapshotFixturePassCount,
    passRate: componentSnapshotFixtures.length
      ? Number((componentSnapshotFixturePassCount / componentSnapshotFixtures.length).toFixed(4))
      : 0,
    results: componentSnapshotFixtures
  },
  readOnlyBinding: {
    entryCreated: Boolean(readOnlyEntry),
    kind: readOnlyEntry?.className.kind ?? null,
    unsupportedReason: readOnlyEntry?.className.unsupportedReason ?? null,
    tokenCount: readOnlyEntry?.tokens.length ?? 0,
    taskOk: readOnlyTask.ok,
    taskMs: readOnlyTask.ok ? readOnlyTask.metrics.taskMs : readOnlyTask.metrics?.taskMs,
    resultOk: readOnlyResult.ok,
    resultMs: readOnlyResult.ok ? readOnlyResult.metrics.resultMs : readOnlyResult.metrics?.resultMs,
    syntaxErrorsAfterResult: readOnlySyntaxErrorsAfterResult,
    sourceDiffLineCount: readOnlyResult.ok ? readOnlyResult.source.diffLineCount : 0,
    sourceDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.sourceDiff) : false,
    componentDiffLineCount: readOnlyResult.ok ? readOnlyResult.source.componentDiffLineCount : 0,
    componentSourceDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.componentSourceDiff) : false,
    relatedSnapshotAvailable: readOnlyResult.ok ? readOnlyResult.source.relatedSnapshotAvailable : false,
    relatedDiffLineCount: readOnlyResult.ok ? readOnlyResult.source.relatedDiffLineCount : 0,
    relatedSourceDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.relatedSourceDiff) : false,
    relatedSemanticChangeCount: readOnlyResult.ok
      ? readOnlyResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: readOnlyResult.ok ? Boolean(readOnlyResult.relatedSemanticDiff) : false,
    relatedSemanticTokenAddedCount: readOnlyResult.ok
      ? readOnlyResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: readOnlyResult.ok
      ? readOnlyResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  readOnlyCnVariableBinding: {
    entryCreated: Boolean(readOnlyCnVariableEntry),
    kind: readOnlyCnVariableEntry?.className.kind ?? null,
    unsupportedReason: readOnlyCnVariableEntry?.className.unsupportedReason ?? null,
    tokenCount: readOnlyCnVariableEntry?.tokens.length ?? 0,
    taskOk: readOnlyCnVariableTask.ok,
    taskMs: readOnlyCnVariableTask.ok
      ? readOnlyCnVariableTask.metrics.taskMs
      : readOnlyCnVariableTask.metrics?.taskMs,
    resultOk: readOnlyCnVariableResult.ok,
    resultMs: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.metrics.resultMs
      : readOnlyCnVariableResult.metrics?.resultMs,
    syntaxErrorsAfterResult: readOnlyCnVariableSyntaxErrorsAfterResult,
    sourceDiffLineCount: readOnlyCnVariableResult.ok ? readOnlyCnVariableResult.source.diffLineCount : 0,
    sourceDiffPresent: readOnlyCnVariableResult.ok ? Boolean(readOnlyCnVariableResult.sourceDiff) : false,
    componentDiffLineCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: readOnlyCnVariableResult.ok
      ? Boolean(readOnlyCnVariableResult.componentSourceDiff)
      : false,
    relatedSnapshotAvailable: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: readOnlyCnVariableResult.ok
      ? Boolean(readOnlyCnVariableResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: readOnlyCnVariableResult.ok
      ? Boolean(readOnlyCnVariableResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: readOnlyCnVariableResult.ok
      ? readOnlyCnVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  readOnlyCompositeVariableBinding: {
    entryCreated: Boolean(readOnlyCompositeVariableEntry),
    kind: readOnlyCompositeVariableEntry?.className.kind ?? null,
    unsupportedReason: readOnlyCompositeVariableEntry?.className.unsupportedReason ?? null,
    tokenCount: readOnlyCompositeVariableEntry?.tokens.length ?? 0,
    taskOk: readOnlyCompositeVariableTask.ok,
    taskMs: readOnlyCompositeVariableTask.ok
      ? readOnlyCompositeVariableTask.metrics.taskMs
      : readOnlyCompositeVariableTask.metrics?.taskMs,
    resultOk: readOnlyCompositeVariableResult.ok,
    resultMs: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.metrics.resultMs
      : readOnlyCompositeVariableResult.metrics?.resultMs,
    syntaxErrorsAfterResult: readOnlyCompositeVariableSyntaxErrorsAfterResult,
    sourceDiffLineCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.diffLineCount
      : 0,
    sourceDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.sourceDiff)
      : false,
    componentDiffLineCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.componentDiffLineCount
      : 0,
    componentSourceDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.componentSourceDiff)
      : false,
    relatedSnapshotAvailable: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.relatedSnapshotAvailable
      : false,
    relatedDiffLineCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.relatedDiffLineCount
      : 0,
    relatedSourceDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.relatedSourceDiff)
      : false,
    relatedSemanticChangeCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.source.relatedSemanticChangeCount
      : 0,
    relatedSemanticDiffPresent: readOnlyCompositeVariableResult.ok
      ? Boolean(readOnlyCompositeVariableResult.relatedSemanticDiff)
      : false,
    relatedSemanticTokenAddedCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0
      : 0,
    relatedSemanticTokenRemovedCount: readOnlyCompositeVariableResult.ok
      ? readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0
      : 0
  },
  gates: {
    staticEditableTokenCoveragePass: corpus.editableCoverage.staticOnly >= 0.3,
    staticAndSimpleCoveragePass: corpus.editableCoverage.staticAndSimpleCnClsx >= 0.5,
    supportedDirectCoveragePass: corpus.editableCoverage.supportedDirect >= 0.5,
    aiGeneratedCorpusMinFilesPass: aiGeneratedCorpus.filesScanned >= aiCorpusMinFiles,
    aiGeneratedStaticAndSimpleCoveragePass:
      aiGeneratedCorpus.editableCoverage.staticAndSimpleCnClsx >= aiCorpusCoverageTarget,
    aiGeneratedSupportedDirectCoveragePass:
      aiGeneratedCorpus.editableCoverage.supportedDirect >= aiCorpusCoverageTarget,
    aiGeneratedAllObservedCoveragePass:
      aiGeneratedCorpus.editableCoverage.allObservedTokens >= aiCorpusCoverageTarget,
    transformTargetPass:
      warmTransformTimes.length > 0 && Math.max(...warmTransformTimes) <= warmTransformTargetMs,
    coldTransformTargetPass:
      transformTimes.length > 0 && Math.max(...transformTimes) <= coldTransformTargetMs,
    warmTransformTargetPass:
      warmTransformTimes.length > 0 && Math.max(...warmTransformTimes) <= warmTransformTargetMs,
    largeTransformTargetPass: Math.max(...largeTransformTimes) <= largeTransformTargetMs,
    supportedPatchPass: apply.ok && syntaxErrorsAfterPatch === 0,
    revertPatchPass: revert.ok && syntaxErrorsAfterRevert === 0,
    agentTaskPass: agentTask.ok && agentTaskSectionsPresent,
    agentResultPass:
      agentResult.ok &&
      agentResultSectionsPresent &&
      agentResultFilesExist &&
      agentResult.source.snapshotAvailable &&
      agentResult.source.diffLineCount > 0 &&
      agentResult.source.semanticChangeCount > 0 &&
      Boolean(agentResult.semanticDiff) &&
      agentResult.source.componentSnapshotAvailable &&
      agentResult.source.componentDiffLineCount > 0 &&
      agentResult.source.componentSemanticChangeCount > 0 &&
      Boolean(agentResult.componentSemanticDiff),
    componentSnapshotFixturePass:
      componentSnapshotFixtures.length > 0 &&
      componentSnapshotFixturePassCount === componentSnapshotFixtures.length,
    readOnlyHandoffPass:
      Boolean(readOnlyEntry) &&
      readOnlyEntry?.className.kind === "read-only" &&
      readOnlyEntry.tokens.length === 0 &&
      readOnlyTask.ok,
    readOnlyRelatedSourceDiffPass:
      readOnlyResult.ok &&
      readOnlyResult.source.relatedSnapshotAvailable &&
      readOnlyResult.source.relatedDiffLineCount > 0 &&
      Boolean(readOnlyResult.relatedSourceDiff) &&
      readOnlyResult.source.relatedSemanticChangeCount > 0 &&
      Boolean(readOnlyResult.relatedSemanticDiff) &&
      readOnlySyntaxErrorsAfterResult === 0,
    readOnlyCnVariableRelatedSemanticDiffPass:
      readOnlyCnVariableResult.ok &&
      readOnlyCnVariableResult.source.relatedSnapshotAvailable &&
      readOnlyCnVariableResult.source.relatedDiffLineCount > 0 &&
      Boolean(readOnlyCnVariableResult.relatedSourceDiff) &&
      readOnlyCnVariableResult.source.relatedSemanticChangeCount >= 2 &&
      (readOnlyCnVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 4 &&
      (readOnlyCnVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 4 &&
      readOnlyCnVariableSyntaxErrorsAfterResult === 0,
    readOnlyCompositeVariableRelatedSemanticDiffPass:
      readOnlyCompositeVariableResult.ok &&
      readOnlyCompositeVariableResult.source.relatedSnapshotAvailable &&
      readOnlyCompositeVariableResult.source.relatedDiffLineCount > 0 &&
      Boolean(readOnlyCompositeVariableResult.relatedSourceDiff) &&
      readOnlyCompositeVariableResult.source.relatedSemanticChangeCount >= 4 &&
      (readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenAddedCount ?? 0) >= 6 &&
      (readOnlyCompositeVariableResult.relatedSemanticDiff?.tokenRemovedCount ?? 0) >= 6 &&
      readOnlyCompositeVariableSyntaxErrorsAfterResult === 0,
    simpleCnClsxPatchPass: cnApply.ok && syntaxErrorsAfterCnPatch === 0,
    staleRejectionPass: !staleApply.ok && staleApply.reason === "source-hash-mismatch",
    operationLogUndoStackPass:
      operationApplyOne.ok &&
      operationApplyTwo.ok &&
      pendingAfterApply.length === 2 &&
      historyAfterApply.pendingCount === 2 &&
      historyAfterApply.entries.some((entry) => entry.next && entry.nextToken === "p-8") &&
      operationRevertOne.ok &&
      pendingAfterFirstRevert.length === 1 &&
      historyAfterFirstRevert.pendingCount === 1 &&
      operationRevertTwo.ok &&
      pendingAfterSecondRevert.length === 0 &&
      historyAfterSecondRevert.pendingCount === 0 &&
      syntaxErrorsAfterOperationStack === 0
  }
};

fs.writeFileSync(path.join(reportsDir, "corpus-audit.json"), `${JSON.stringify(corpus, null, 2)}\n`);
fs.writeFileSync(
  path.join(reportsDir, "ai-corpus-audit.json"),
  `${JSON.stringify(aiGeneratedCorpus, null, 2)}\n`
);
fs.writeFileSync(path.join(reportsDir, "spike-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
