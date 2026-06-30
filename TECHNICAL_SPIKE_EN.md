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
9. If the stored range no longer contains `nextToken`, revert is rejected and `.intent/conflicts/*.intent-conflict.json` records the expected, actual, and restore tokens with review guidance.
10. `/__intent/conflicts` returns unresolved conflict artifacts, and `/__intent/resolve-conflict` lets a reviewed conflict discard the matching pending undo entry.

This is a LIFO undo stack for the MVP.
Branching history currently supports pending undo discard only.

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
- The overlay displays up to 5 pending undo entries, highlights the next revert target, and can discard pending undo entries without changing source.
- Undo conflicts where the stored `nextToken` changed reject direct revert and write `.intent/conflicts/*.intent-conflict.json`.
- The overlay displays unresolved undo conflicts and can discard a reviewed pending undo entry.
- Branch undo currently supports pending undo discard only; arbitrary non-top patches are not reverted from source.
- Agent handoff records a selected source-window snapshot, component snapshot, related source snapshot, task/result markdown, and intent diffs.
- Agent results record before/after line diffs for both the selected source window and the selected component snapshot.
- Agent results record related source diffs and related semantic token diffs for simple variable-reference read-only bindings.
- Related semantic token diffing is covered by fixtures for simple quoted variable declarations, simple `cn()` / `clsx()` declarations, and array/object-map/template-literal declaration segments.
- Variant-function read-only bindings store same-file local `function` / `const` variant declarations, one-hop relative named imports, and variant declarations behind tsconfig paths aliases plus one-hop named barrel re-exports as related source snapshots, then record related source and semantic diffs on result.
- Agent results record `className` semantic token diffs for both the selected source window and the selected component range.
- Component snapshot fixtures cover 8 cases: function + nested/map/conditional/fragment, arrow block, arrow parenthesized expression, arrow JSX no-parens, memo, forwardRef, HOC, and namespace object export.
- They still do not infer whole-file semantic changes, props/data-flow changes, or variant-function meaning automatically.
- Real browser click-to-panel, preview, apply, and revert times are measured in the overlay with `performance.now()` and posted to `/__intent/client-metric`.
- The latest browser measurement repeats 3 desktop samples and 3 mobile 390x844 viewport samples.
- The Codex-generated 50-file React/Tailwind corpus records 78.76% supported direct editable coverage.
- Current fixtures now meet the 5ms warm transform target and the 10ms cold transform target.
- The large TSX stress fixture with 100 cards and 401 bindings meets the 20ms stress target.
- The repeated-transform fixture with 100 cards and 401 bindings now passes semantic graph fingerprint based write throttling.
- Real multi-file HMR sessions still need cache, changed-file filtering, and graph write throttling re-measurement.

## 8. Next Work

Priority order:

1. Re-measure editable coverage on an independently collected external 50-100 sample React/Tailwind corpus.
2. Decide whether to expand branch undo UI beyond pending undo discard into arbitrary non-top revert/visualization.
3. Improve agent handoff context for package imports, multi-hop import graphs, and cross-variable data flow.
4. Re-measure component snapshot false positives/false negatives on an external corpus and product-sized TSX files.
5. Validate caching and graph write throttling on product-sized TSX files.

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
Component Source Diff
Component Semantic Intent Diff
Intent Diff
```

At this stage, result recording is a deterministic audit log.
Task creation stores both a selected source-window snapshot and a selected component snapshot, and result recording compares both with the current source to write line diffs.
Simple variable-reference read-only bindings store the related variable declaration as a related source snapshot, and result recording writes both a related source diff and a related semantic token diff.
`className` values inside the selected source window and selected component range are also re-analyzed into before/after tokens so the intent diff records added/removed tokens and categories.
It also rereads the source file to record `sourceHashChanged`.
Component-level semantic diffing is currently limited to `className` tokens.
Related source semantic diffing re-analyzes simple quoted variable declarations, simple `cn()` / `clsx()` declarations, and array/object-map/template-literal literal segments as tokens.
Variant-function read-only bindings store same-file local variant function/variable declarations, one-hop relative named imports, and variant declarations behind tsconfig paths aliases plus one-hop named barrel re-exports as related source, producing source diffs and literal-token semantic diffs.
It does not yet analyze package imports, multi-hop import graphs, variant-function meaning, or cross-variable data flow automatically.
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
