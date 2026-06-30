# INTENT_LAYER Technical Spike

## 1. Purpose

This spike does not try to build the full product.
It validates the riskiest implementation assumption in the smallest useful form.

Validation question:

```text
In a React/Vite/Tailwind project, can the user click a DOM element,
map it back to the original TSX source range,
and replace one Tailwind token through a minimal range patch?
```

This phase intentionally avoids a large package architecture, a complete intent schema, Next.js support, and full shadcn/ui support.

## 2. Scope

Included:

- React + Vite + Tailwind demo app
- Vite compile-time instrumentation
- `data-intent-id` injection for intrinsic JSX elements
- `.intent/graph.intent.json` sidecar graph generation
- floating browser overlay
- element pick -> intent binding display
- static `className` token display
- simple `cn()` / `clsx()` literal segment token display
- read-only bindings for unsupported `className` expressions
- supported Tailwind token candidate selection
- patch preview before apply
- source hash validation
- old token validation
- range patch apply
- operation-log-backed undo stack and patch revert
- non-destructive pending undo discard
- undo conflict artifact output at `.intent/conflicts/*.intent-conflict.json`
- undo conflict listing and discard-pending-undo resolution
- structured agent handoff task generation
- structured agent result artifact generation
- agent handoff source snapshots, result source diffs, and selected/component/related `className` semantic token diffs
- browser click-to-panel, preview, apply, and revert round-trip latency measurement
- minimal intent operation/diff output
- corpus analysis script
- Codex-generated 50-file React/Tailwind corpus fixture and coverage report
- performance and safety evaluation script

Excluded:

- polished product UI
- full dynamic `cn()` / `clsx()` patching
- full shadcn/ui direct editing
- Next.js
- portal mapping
- props className forwarding
- always-on whole-project AST analysis
- large `.intent.yml` schema
- npm release

## 3. Key Implementation Decisions

### 3.1 Compile-time instrumentation

DOM-to-source mapping is not inferred in the browser at runtime.

The current Vite plugin parses TSX files and injects `data-intent-id` into intrinsic JSX elements that have static `className` values.
Common MVP patterns, including static `className`, simple/partial `cn()` / `clsx()`, and read-only expressions, are handled by a low-level JSX/className scanner first.
Patterns the scanner cannot handle can still fall back to the TypeScript AST path.

Input example:

```tsx
<section className="grid grid-cols-3 gap-4 p-6">
```

Output direction:

```tsx
<section className="grid grid-cols-3 gap-4 p-6" data-intent-id="il_...">
```

The sidecar graph records:

```text
intent id
source file
component name
tag name
className source range
className value
token list
source hash
transform time
```

Unsupported cases such as `className={someVariable}`, runtime template literals, and variant functions are still recorded as `read-only` bindings.
Those bindings have no editable tokens and keep an `unsupportedReason`.
The user can still select the element and create an agent handoff task instead of applying a direct patch.

### 3.2 Range patch only

The spike does not regenerate source files from an AST.

Patch flow:

1. Look up the source binding by `intent id`.
2. Read the file from disk.
3. Compare the stored `sourceHash` with the current file hash.
4. Validate the old token at the stored token source range.
5. Replace only the exact token range.
6. Write minimal operation/diff artifacts.

Revert flow:

1. After a successful apply, the dev server pushes the patch result onto an in-memory undo stack.
2. The same apply is appended to `.intent/operations/operation-log.json`.
3. `/__intent/revert-last` checks whether `nextToken` still exists at the last patch range.
4. If it matches, the range is replaced with `oldToken`.
5. Revert operation/diff artifacts are written and a revert entry is appended to the operation log.
6. If the in-memory stack is empty, pending apply entries are restored from the operation log.
7. `/__intent/undo-history` returns the pending undo stack as JSON, and the overlay displays recent pending undo entries.
8. `/__intent/discard-undo` discards a selected pending undo entry from the operation log without changing source.
9. `/__intent/revert-undo` applies a selected non-top pending undo only when the stored range still contains `nextToken`.
10. If the stored range no longer contains `nextToken`, revert is rejected and `.intent/conflicts/*.intent-conflict.json` records the expected, actual, and restore tokens with review guidance.
11. `/__intent/conflicts` returns unresolved conflict artifacts, and `/__intent/resolve-conflict` lets a reviewed conflict discard the matching pending undo entry.

This is a LIFO undo stack for the MVP.
Branching history currently supports pending undo discard and safe non-top revert.

If the source hash changed, the patch is rejected.
If the old token is missing, the patch is rejected.

## 4. Main Files

```text
vite.config.ts
src/App.tsx
src/intent/vitePlugin.ts
src/intent/instrument.ts
src/intent/patch.ts
src/intent/agentTask.ts
src/intent/agentResult.ts
src/intent/tailwind.ts
src/intent/client.ts
scripts/analyze-classnames.ts
scripts/evaluate-spike.ts
scripts/generate-ai-corpus.ts
scripts/import-external-corpus.ts
fixtures/corpus/*.tsx
fixtures/ai-generated/*.tsx
reports/performance/*.json
```

## 5. Usage

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm run eval
npm run build
```

Regenerate or inspect the AI corpus fixtures:

```bash
npm run generate:ai-corpus
npm run analyze:ai-corpus
```

Import and inspect a local external corpus:

```bash
npm run import:external-corpus -- <external-react-project-or-samples>
npm run analyze:external-corpus
```

External corpus copies are stored under `.intent/external-corpus/` and should not be committed.
The default report is written to `reports/performance/external-corpus-audit.json`.

`npm run eval` writes:

```text
reports/performance/corpus-audit.json
reports/performance/ai-corpus-audit.json
reports/performance/spike-evaluation.json
```

## 6. Context Pack Usage

External project used:

```text
https://github.com/Fharena/context-pack
```

Applied flow:

1. Ran `context-pack setup --dry-run` to inspect the planned files.
2. Ran `context-pack setup` to create the `.context-pack` context library.
3. Ran `context-pack start --task "Build INTENT_LAYER static className click-to-patch spike with numeric evaluation docs"`.
4. Read the generated read-first context documents before implementation.

For this task, context-pack routed the work toward the `docs` and `overview` areas instead of encouraging a broad repo scan.
Generated `.context-pack/packs/CONTEXT_PACK.md` files are temporary and are not committed.

## 6.1 AI-generated Corpus Audit

To measure a wider MVP direct-edit surface, `fixtures/ai-generated` now contains 50 Codex-generated React/Tailwind TSX samples.
The samples mix dashboards, landing sections, shadcn-like cards, workflow controls, and read-only variable/variant patterns.

Measured result:

```text
files: 50
className occurrences: 390
static className: 320 / 390 = 82.05%
simple cn/clsx: 20 / 390 = 5.13%
partial cn/clsx: 10 / 390 = 2.56%
read-only: 40 / 390 = 10.26%
supported direct editable coverage: 78.76%
```

Interpretation:

- In the 50-file Codex-generated corpus, directly editable token surface clears the 50% gate.
- Read-only cases are mainly variable references (20), property access references (10), and variant functions (10).
- This corpus is a reproducible local benchmark, not an independently collected external benchmark.

## 6.2 External Corpus Import Harness

`scripts/import-external-corpus.ts` was added so external project code does not need to be committed directly to this repo.

Behavior:

- scans external React/Tailwind TSX/JSX files from user-provided inputs
- skips files without `className`, test/spec/story files, build output, and `node_modules` by default
- stores selected file copies under `.intent/external-corpus/files/`
- records original path, copied path, SHA-256 hash, byte count, and `className` count in a manifest
- computes coverage with the same `analyzeClassNames` path and writes JSON gate results
- records `sample.sourceKind`, read-only ratio, top unsupported reasons, `gateFailures`, and `mvpEvidence.usableAsMvpEvidence` in the report
- `sample.sourceKind` is one of `independent-external`, `local-smoke-fixture`, or `generated-fixture`
- omits per-record `className` strings from the report so external source fragments are not committed

Small `npm run eval` smoke result:

```text
sample source: local-smoke-fixture
selected files: 3
files scanned: 3
className occurrences: 6
skipped story files: 1
supported direct editable coverage: 75.76%
read-only className ratio: 16.67%
top unsupported reason: variable-reference 1
gate failures: 0
mvp evidence usable: false
mvp evidence decision: measurement-smoke-only
gate: externalCorpusHarnessPass = true
```

This smoke verifies the importer/report/gate format.
The coverage gate passes, but `sample.sourceKind` is `local-smoke-fixture`, so it is not treated as MVP evidence.
The independent external baseline below is the first external number measured with `--sample-source independent-external`.

Independent external baseline:

```text
source: shadcn-ui/ui @ dbf9c5e
sample source: independent-external
selected files: 100
files scanned: 100
className occurrences: 915
static className: 881 / 915 = 96.28%
simple cn/clsx: 3 / 915 = 0.33%
partial cn/clsx: 20 / 915 = 2.19%
read-only: 11 / 915 = 1.20%
supported direct editable coverage: 46.21%
static + simple editable coverage: 46.35%
mvp evidence usable: false
mvp evidence decision: coverage-gate-failed
```

Interpretation:

- The failure is not caused by dynamic `className` usage. It comes from a narrow editable token taxonomy.
- Top non-editable tokens cluster around `flex`, `w-full`, `hidden`, `flex-1`, `absolute`, `h-*`, `size-*`, `relative`, `grid`, `overflow-*`, and `ring-*`.
- The next step is not broader agent handoff. It is deciding which Tailwind token families count as deterministic MVP direct-edit, then re-running the same external corpus.

### 3.3 Simple cn/clsx literal segment support

The current MVP can patch these patterns directly:

```tsx
className={cn("grid gap-4 p-6", active && "bg-teal-50")}
className={clsx("rounded-lg px-4 py-2", selected && "bg-teal-700")}
```

Support model:

- Only string literal segments inside `cn()` / `clsx()` calls are stored as source ranges.
- Conditions themselves are not interpreted.
- `className` variables, variant functions, and runtime template literals remain read-only.
- If dynamic arguments are mixed in, literal string segments can still be direct-edited as partial bindings.

## 7. Current Limitations

- Direct patch support covers static `className` and simple/partial `cn()` / `clsx()` string literal segments.
- `cn()` / `clsx()` patching is limited to string literal segments.
- `className={someVariable}` degrades to a read-only binding and agent handoff.
- Template literals degrade to read-only bindings and agent handoff.
- Variant functions and props forwarding degrade to read-only bindings and agent handoff.
- Undo uses an operation-log-backed LIFO stack and can revert multiple direct patches in order.
- After a dev server restart, the pending undo stack can be restored from the operation log once graph bindings are available again.
- The overlay displays up to 5 pending undo entries, highlights the next revert target, and can discard pending undo entries or safely non-top revert them.
- Undo conflicts where the stored `nextToken` changed reject direct revert and write `.intent/conflicts/*.intent-conflict.json`.
- The overlay displays unresolved undo conflicts and can discard a reviewed pending undo entry.
- Branch undo can revert a non-top patch from source when the expected token is still present at the stored range, and rejects mismatches as conflict artifacts.
- Agent handoff records a selected source-window snapshot, component snapshot, related source snapshot, related dependency snapshots, task/result markdown, and intent diffs.
- Agent results record before/after line diffs for both the selected source window and the selected component snapshot.
- Agent results record related source diffs and related semantic token diffs for same-file and imported variable-reference read-only bindings.
- Agent results follow object-property read-only bindings such as `styles.title` to local/imported object literal properties and record related source plus semantic token diffs.
- Agent results record bounded one-hop dependency source diffs and dependency semantic token diffs when a variable declaration references sibling variable declarations in the same file, an imported source file, or a named import inside the related declaration.
- Workspace package imports follow root `package.json` `workspaces` plus package `exports` and store the local package source as a related source snapshot.
- External npm package imports do not chase package source or patch `node_modules`; tasks record package/import/usage/guidance details in an `External Import Reference` section.
- Related semantic token diffing is covered by fixtures for simple quoted variable declarations, imported variable declarations, simple `cn()` / `clsx()` declarations, and array/object-map/template-literal declaration segments.
- Variant-function read-only bindings store same-file local `function` / `const` variant declarations, one-hop relative named imports, and variant declarations behind tsconfig paths aliases plus one-hop/multi-hop named barrel re-exports as related source snapshots, then record related source and semantic diffs on result.
- The package smoke now transforms an external temp fixture through the installed `vite.cjs` wrapper-backed `/vite` export after tarball install and verifies `data-intent-id` plus `.intent/graph.intent.json` output.
- In the same install folder, it starts a real Vite dev server and verifies the `/src/App.tsx` transform response plus the `/__intent/graph`, `/__intent/preview`, and `/__intent/apply` endpoints over HTTP.
- The installed Vite dev server smoke applies a real `gap-4 -> gap-6` source patch and verifies operation/diff/log artifacts plus post-apply module/graph refresh in 51.556ms.
- The installed Vite dev server smoke also loads App/Header/Card as three TSX graph files, changes only Card from `gap-4` to `gap-8`, and verifies three entries remain, the changed-file token updates, unchanged files remain, graph `generatedAt` changes, and module/graph refresh completes in 118.416ms.
- The `doctor` missing-plugin fixture verifies exit code 1, one `vite-plugin` failure, and guidance that mentions `intent-layer/vite` when `intentLayer()` is missing from the Vite config.
- `INSTALL_KR/EN.md` and `FAILURE_MODES_KR/EN.md` are included in the package tarball so local tarball setup and failure recovery have external-facing copy.
- Agent results record `className` semantic token diffs for both the selected source window and the selected component range.
- Component snapshot fixtures cover 8 cases: function + nested/map/conditional/fragment, arrow block, arrow parenthesized expression, arrow JSX no-parens, memo, forwardRef, HOC, and namespace object export.
- They still do not infer whole-file semantic changes, props/data-flow changes, or variant-function meaning automatically.
- Real browser click-to-panel, preview, apply, and revert times are measured in the overlay with `performance.now()` and posted to `/__intent/client-metric`.
- The latest browser measurement repeats 3 desktop samples and 3 mobile 390x844 viewport samples.
- The Codex-generated 50-file React/Tailwind corpus records 78.76% supported direct editable coverage.
- The external corpus import/analyze harness can create local `.intent/external-corpus/` copies, a manifest, and coverage gates; its eval smoke passes with 3 samples and 75.76% supported direct coverage.
- The independent external `shadcn-ui/ui` 100-file baseline records 46.21% supported direct editable coverage and fails the 50% gate.
- Current fixtures now meet the 5ms warm transform target and the 10ms cold transform target.
- The large TSX stress fixture with 100 cards and 401 bindings meets the 20ms stress target.
- The repeated-transform fixture with 100 cards and 401 bindings now passes semantic graph fingerprint based write throttling.
- A generated product-sized fixture with 24 TSX files and 624 bindings now verifies that changing only one file from `gap-4` to `gap-8` preserves graph entry count, updates the changed-file token, retains unchanged-file tokens, keeps same-input `generatedAt` stable, and completes the changed-file transform in 23.043ms.
- Real external-project product-sized multi-file HMR sessions still need cache, changed-file filtering, and graph write throttling re-measurement with real import graphs.

## 8. Next Work

Priority order:

1. Use the `shadcn-ui/ui` 100-file baseline's 46.21% failure to redefine the MVP direct-edit Tailwind token families.
2. Re-run the same independent external corpus gate after the token taxonomy change.
3. Do not widen external npm package source analysis or arbitrary-depth cross-file/transitive handoff context for now.
4. Re-measure component snapshot false positives/false negatives on an external corpus and product-sized TSX files.
5. Validate caching, changed-file filtering, and graph write throttling on real product-sized TSX files and HMR sessions.

## 9. Agent Handoff And Result

Unsupported or structural edits can be delegated as structured agent tasks from the overlay.

Task creation flow:

1. The user selects an element.
2. The user describes the desired change in the `Agent handoff` field.
3. The `/__intent/agent-task` endpoint looks up the selected source binding.
4. A `.intent/agent/task_*.md` file is generated.

The task document includes:

```text
Goal
Selected Component
Current Intent Document
Component Snapshot
Related Source Snapshot
Related Dependency Snapshots
Source Snapshot
Desired Change
Constraints
Files That May Be Edited
Files That Should Not Be Edited
Required Checks
Expected Result
```

This implementation does not call an LLM.
It only turns the selected source binding and desired change into markdown that can be handed to Codex, Cursor, Claude, or another agent.

Result recording flow:

1. After the agent finishes, the user records a result summary.
2. The `/__intent/agent-result` endpoint looks up the selected source binding.
3. A `.intent/agent/result_*.md` document is generated.
4. A `.intent/diffs/*_agent.intent-diff.yml` document is generated.

The result document includes:

```text
Summary
Source Binding
Task
Changed Files
Checks
Notes
Source Diff
Semantic Intent Diff
Related Source Diff
Related Semantic Intent Diff
Related Dependency Source Diff
Related Dependency Semantic Intent Diff
Component Source Diff
Component Semantic Intent Diff
Intent Diff
```

At this stage, result recording is a deterministic audit log.
Task creation stores both a selected source-window snapshot and a selected component snapshot, and result recording compares both with the current source to write line diffs.
Simple variable-reference read-only bindings store the related variable declaration as a related source snapshot, and result recording writes both a related source diff and a related semantic token diff.
Object-property read-only bindings such as `styles.title` store the matching top-level object literal property from a local or imported object as a related source snapshot, and result recording writes related source and semantic token diffs for that property.
When that related declaration references sibling variable declarations in the same file or imported source file, task creation stores one-hop related dependency snapshots and result recording writes dependency source and semantic token diffs separately.
When the related declaration references variables brought in through named imports, task creation follows that import one more step and stores the imported dependency declaration as a snapshot.
Variable declarations can be found in the same file or behind imported tsconfig path aliases plus multi-hop barrel re-exports.
Workspace package imports can be resolved through root `package.json` `workspaces` and package `exports` into local package source declarations.
External npm package imports are not source-analyzed directly; they are recorded as `External Import Reference` context that guides local wrapper/override work.
`className` values inside the selected source window and selected component range are also re-analyzed into before/after tokens so the intent diff records added/removed tokens and categories.
It also rereads the source file to record `sourceHashChanged`.
Component-level semantic diffing is currently limited to `className` tokens.
Related source/dependency semantic diffing re-analyzes simple quoted variable declarations, imported variable declarations, simple `cn()` / `clsx()` declarations, and array/object-map/template-literal literal segments as tokens.
Variant-function read-only bindings store same-file local variant function/variable declarations, one-hop relative named imports, and variant declarations behind tsconfig paths aliases plus one-hop/multi-hop named barrel re-exports as related source, producing source diffs and literal-token semantic diffs.
It does not yet analyze external npm package source, patch external package code directly, infer variant-function meaning, or follow arbitrary-depth cross-file/transitive variable data flow automatically.
It does not yet infer whole-file semantic changes, props/data-flow changes, or variant-function meaning automatically.

### 9.1 Read-only Handoff

Unsupported `className` expressions are still selectable source bindings.

Example:

```tsx
const cardClass = "grid grid-cols-3 gap-4 rounded-lg p-6";

export function Card() {
  return <div className={cardClass}>Card</div>;
}
```

The overlay shows:

```text
className: read-only
dynamic args read-only: 1
unsupported: variable-reference
```

No direct token patch buttons are shown, but the agent handoff task/result flow remains available.
For simple variable references, the task includes a related source snapshot for the variable declaration, and the result records both a line diff and a semantic token diff for that declaration.
For object property references, the task includes a related source snapshot for the top-level object property, and the result records both a line diff and a semantic token diff for that property.
Imported variable declarations can also resolve through tsconfig paths aliases and barrel re-exports to the final declaration file.
For external npm package imports, the task includes an `External Import Reference` instead of a source snapshot, plus `node_modules` edit guards and local wrapper/override guidance.

## 10. Browser Metrics

The overlay measures real interaction latency inside the browser.

Current fields:

```text
graphFetchMs
pickToPanelMs
clickToPanelMs
bindingLookupMs
renderMs
preview roundTripMs
preview serverMs
preview renderMs
apply roundTripMs
apply serverMs
apply renderMs
revert roundTripMs
revert serverMs
revert renderMs
```

Dev server endpoints:

```text
POST /__intent/client-metric
GET /__intent/client-metrics
DELETE /__intent/client-metrics
```

The latest real browser measurement used the in-app browser to click `Pick element`, select the visible `Patch Preview` heading, preview/apply the first typography token from `text-lg -> text-xl`, and revert it through `Undo last`.
Samples were split into 3 desktop default viewport runs and 3 mobile 390x844 viewport runs.

Summary:

```text
samples: 6 total = 3 desktop + 3 mobile
click-to-panel max: 2.3ms
preview round trip max: 5.9ms
apply round trip max: 32.3ms
revert round trip max: 36.5ms
```

The result is stored in `reports/performance/browser-click-metric.json`.
