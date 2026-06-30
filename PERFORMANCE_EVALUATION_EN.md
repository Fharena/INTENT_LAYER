# INTENT_LAYER Performance Evaluation

## 1. Evaluation Scope

Commands:

```bash
npm run typecheck
npm run eval
npm run build
```

Measured inputs:

- `fixtures/corpus/*.tsx`
- `fixtures/ai-generated/*.tsx`
- `src/App.tsx`
- `src/**/*.tsx` instrumentation transform
- static patch fixture
- simple `cn()` patch fixture
- last-patch revert fixture
- operation-log undo stack fixture
- operation branch undo discard fixture
- operation conflict artifact fixture
- operation conflict resolution fixture
- pending undo history fixture
- agent handoff task fixture
- agent result artifact fixture
- agent result source diff fixture
- agent result selected `className` semantic diff fixture
- agent result component snapshot/source diff/semantic diff fixture
- component snapshot discovery fixture set
- read-only related source/semantic diff fixture
- read-only `cn()` variable related semantic diff fixture
- read-only composite variable related semantic diff fixture
- variant/cva related source handoff fixture
- imported variant/cva related source handoff fixture
- CLI `init`/`scan`/`check`/`apply`/`diff`/`agent-task`/`agent-result` fixture
- read-only binding handoff fixture
- in-app browser click-to-panel, preview, apply, and revert measurement

Important caveat:

The evaluation now has two corpora.

1. Initial fixture corpus: small samples for feature validation.
2. Codex-generated AI corpus: 50 committed React/Tailwind TSX samples.

The second corpus is a reproducible local benchmark for a wider AI-generated code surface.
It is still not an independently collected benchmark from external projects or real user code.

## 2. Corpus Analysis Results

Raw report:

```text
reports/performance/corpus-audit.json
```

Summary:

| Metric | Value |
| --- | ---: |
| Files scanned | 8 |
| `className` occurrences | 40 |
| static `className` | 28 / 40 = 70.0% |
| simple `cn()` / `clsx()` | 5 / 40 = 12.5% |
| partial `cn()` / `clsx()` | 2 / 40 = 5.0% |
| read-only | 5 / 40 = 12.5% |
| static token count | 137 |
| static editable token count | 112 |
| static editable coverage | 81.75% |
| static + simple token count | 175 |
| static + simple editable token count | 144 |
| static + simple editable coverage | 82.29% |
| supported direct token count | 185 |
| supported direct editable token count | 150 |
| supported direct editable coverage | 81.08% |
| all observed token count | 185 |
| all editable token count | 150 |
| all editable coverage | 81.08% |

Unsupported reasons:

| Reason | Count |
| --- | ---: |
| variable-reference | 2 |
| template-expression | 1 |
| variant-function | 1 |
| unsupported-expression | 1 |

Interpretation:

- In the fixture corpus, static `className` gives enough direct-edit surface area to keep moving.
- Simple/partial `cn()` / `clsx()` literal segments are now included in the direct-patch surface.
- Read-only cases now cluster around variables, template literals, and variant functions.

## 2.1 Codex-generated AI Corpus Results

Raw report:

```text
reports/performance/ai-corpus-audit.json
```

Summary:

| Metric | Value |
| --- | ---: |
| Files scanned | 50 |
| `className` occurrences | 390 |
| static `className` | 320 / 390 = 82.05% |
| simple `cn()` / `clsx()` | 20 / 390 = 5.13% |
| partial `cn()` / `clsx()` | 10 / 390 = 2.56% |
| read-only | 40 / 390 = 10.26% |
| static token count | 1,770 |
| static editable token count | 1,430 |
| static editable coverage | 80.79% |
| static + simple token count | 1,890 |
| static + simple editable token count | 1,500 |
| static + simple editable coverage | 79.37% |
| supported direct token count | 1,930 |
| supported direct editable token count | 1,520 |
| supported direct editable coverage | 78.76% |
| all observed token count | 1,930 |
| all editable token count | 1,520 |
| all editable coverage | 78.76% |

Unsupported reasons:

| Reason | Count |
| --- | ---: |
| variable-reference | 20 |
| property-access-reference | 10 |
| variant-function | 10 |

Gate:

| Gate | Threshold | Result |
| --- | --- | --- |
| sample count | files >= 50 | pass |
| static + simple coverage | editable coverage >= 50% | pass |
| supported direct coverage | editable coverage >= 50% | pass |
| all observed coverage | editable coverage >= 50% | pass |

Interpretation:

- The 50-file Codex-generated corpus records 78.76% directly editable token coverage.
- This reduces the risk that the product only works for a toy 10% slice.
- The 10.26% read-only surface clusters around variable references, property access, and variant functions.
- Because this is not an independently collected external corpus, it should not be treated as the final market-validation benchmark.

## 3. Transform Performance

Raw report:

```text
reports/performance/spike-evaluation.json
```

Measurements:

| File | Bindings | Transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 1.13ms / p95 3.813ms / max 3.813ms |
| `src/main.tsx` | 0 | avg 0.005ms / p95 0.009ms / max 0.009ms |

Summary:

| Metric | Value |
| --- | ---: |
| Files measured | 2 |
| Iterations per file | 5 |
| Overall average transform time | 0.567ms |
| Overall p95 transform time | 3.813ms |
| Overall max transform time | 3.813ms |
| Warm average transform time | 0.232ms |
| Warm p95 transform time | 0.618ms |
| Warm max transform time | 0.618ms |
| Warm target | <= 5ms |
| Cold target | <= 10ms |
| Result | warm pass / cold pass |

Interpretation:

- In the 5-iteration run, the maximum transform time, including the first cold transform, stayed under 10ms.
- Excluding the first sample, warm average, p95, and max transform time are under 5ms.
- MVP-supported patterns now go through a low-level JSX/className scanner before the TypeScript AST cold-parse path.
- The AST path remains as a fallback for patterns the scanner cannot handle.
- Files without the literal `className` string now use a fast path and skip AST parsing.
- Files with `className` still perform TypeScript AST parse and instrumentation in one pass.
- Repeated transforms cache source hashes and className tokenization results to stabilize the warm path.
- Larger files are measured separately with the stress fixture below.

## 3.1 Large TSX Transform Stress

| Metric | Value |
| --- | ---: |
| Fixture file | `.intent/tmp/LargeTransformFixture.tsx` |
| Repeated cards | 100 |
| Bindings | 401 |
| File size | 45,352 bytes |
| Iterations | 5 |
| Average transform time | 9.593ms |
| p95 transform time | 12.087ms |
| Max transform time | 12.087ms |
| Stress target | <= 20ms |
| Result | pass |

Interpretation:

- Separate from the 5ms gate for normal `src` files, the stress fixture measures 401 bindings against a 20ms target.
- This suggests the MVP scanner does not collapse immediately on larger AI-generated screens.
- Real product-sized files will still need caching, changed-file filtering, and graph write throttling.

## 4. Patch Performance and Safety

| Metric | Value |
| --- | ---: |
| Preview success | true |
| Preview time | 0.834ms |
| Preview round trip | 1.243ms |
| Apply success | true |
| Static apply time | 3.692ms |
| Simple `cn()` apply time | 2.117ms |
| Revert success | true |
| Revert time | 2.458ms |
| Syntax errors after patch | 0 |
| Syntax errors after revert | 0 |
| Simple `cn()` syntax errors after patch | 0 |
| Stale source rejection | true |
| Stale rejection reason | `source-hash-mismatch` |

Interpretation:

- Patch preview and apply are far below the 50ms target.
- Simple `cn()` literal segment patching also succeeds.
- Last-patch revert is also far below the 50ms target.
- Patches are rejected when the source hash does not match.
- No syntax error was produced after supported static/simple token patches.

## 4.1 Operation Log Undo Stack

| Metric | Value |
| --- | ---: |
| Operation log file | `.intent/operations/operation-log.json` |
| First apply success | true |
| Second apply success | true |
| Pending undo count after apply | 2 |
| History pending count after apply | 2 |
| Next undo token after apply | `p-8` |
| First revert success | true |
| Pending undo count after first revert | 1 |
| History pending count after first revert | 1 |
| Second revert success | true |
| Pending undo count after second revert | 0 |
| History pending count after second revert | 0 |
| Syntax errors after stack revert | 0 |

Interpretation:

- The fixture applies two direct patches, restores the pending undo stack from the operation log, then reverts both patches in order.
- Pending undo history exposes the same stack as JSON and records `p-8` as the next revert target after apply.
- This verifies the same LIFO flow used by `/__intent/revert-last`.
- The operation log is an append-only JSON file for apply/revert entries and does not require a database or external service.

## 4.2 Branch Undo Discard

| Metric | Value |
| --- | ---: |
| First apply success | true |
| Second apply success | true |
| Pending undo count after apply | 2 |
| History pending count after apply | 2 |
| Discard success | true |
| Discard time | 3.483ms |
| Discarded token | `gap-6` |
| Pending undo count after discard | 1 |
| History pending count after discard | 1 |
| Next undo token after discard | `p-8` |
| Revert after discard success | true |
| Pending undo count after revert | 0 |
| History pending count after revert | 0 |
| Syntax errors after discard | 0 |

Interpretation:

- The overlay can discard a selected pending undo entry without changing source.
- This fixture discards the older `gap-6` undo, then still reverts the newer `p-8` undo.
- Branch undo currently supports non-destructive discard only; it does not directly revert arbitrary non-top patches from source.

## 4.3 Operation Conflict Artifact And Resolution

| Metric | Value |
| --- | ---: |
| Apply success | true |
| Revert success | false |
| Revert rejection reason | `revert-token-mismatch` |
| Conflict file | `.intent/conflicts/2026-06-30T09-37-15-348Z.intent-conflict.json` |
| Conflict file exists | true |
| Conflict kind | `revert-conflict` |
| Expected token | `gap-6` |
| Actual token | `gap-8` |
| Restore token | `gap-4` |
| Guidance count | 3 |
| Pending undo count after conflict | 1 |
| Active conflict count before resolve | 1 |
| Resolve success | true |
| Resolve action | `discard-pending-undo` |
| Resolve time | 4.84ms |
| resolvedAt present | true |
| Pending undo count after resolve | 0 |
| Active conflict count after resolve | 0 |
| Syntax errors after conflict | 0 |

Interpretation:

- Direct revert is rejected when the stored patch range no longer contains the expected `nextToken`.
- The conflict artifact records expected, actual, and restore tokens plus review guidance.
- `/__intent/conflicts` returns only unresolved conflict artifacts.
- `/__intent/resolve-conflict` resolves a reviewed conflict as `discard-pending-undo` and removes the matching pending undo from the operation log.

## 5. Graph Lookup Proxy

| Metric | Value |
| --- | ---: |
| Iterations | 1000 |
| Total time | 0.06ms |
| Average lookup | 0.00006ms |

Caveat:

This remains an `intent id -> binding` Map lookup proxy.
Real click-to-panel time is measured separately in the browser metric below.

## 6. Browser Interaction Metrics

Raw report:

```text
reports/performance/browser-click-metric.json
```

Method:

```text
Opened the Vite dev server in the in-app browser,
clicked the overlay Pick element button,
clicked the visible Patch Preview heading,
changed the first typography token from text-lg to text-xl,
clicked Preview, clicked Apply, then clicked Undo last.
The overlay posted performance.now measurements to /__intent/client-metric.
```

| Metric | Value |
| --- | ---: |
| Test URL | `http://127.0.0.1:5183/` |
| Measurement plan | 3 desktop default viewport runs + 3 mobile 390x844 viewport runs |
| Total samples | 6 |
| Desktop samples | 3 |
| Mobile samples | 3 |
| All bindings selected | true |
| All previews succeeded | true |
| All applies succeeded | true |
| All reverts succeeded | true |
| Preview/apply token | `text-lg -> text-xl` |
| Revert token | `text-xl -> text-lg` |
| Click-to-panel target | max <= 100ms |
| Preview round trip target | max <= 50ms |
| Apply round trip target | max <= 50ms |
| Revert round trip target | max <= 50ms |
| Result | pass |

All-sample summary:

| Metric | Average | p95 | Max |
| --- | ---: | ---: | ---: |
| Graph fetch | 5.783ms | 7.5ms | 7.5ms |
| Click-to-panel | 1.7ms | 2.3ms | 2.3ms |
| Preview round trip | 5.017ms | 5.9ms | 5.9ms |
| Preview server | 0.804ms | 0.992ms | 0.992ms |
| Apply round trip | 28.4ms | 32.3ms | 32.3ms |
| Apply server | 23.711ms | 26.821ms | 26.821ms |
| Revert round trip | 19.883ms | 36.5ms | 36.5ms |
| Revert server | 15.978ms | 31.808ms | 31.808ms |

Viewport max summary:

| Metric | Desktop max | Mobile max |
| --- | ---: | ---: |
| Graph fetch | 6.5ms | 7.5ms |
| Click-to-panel | 2.3ms | 1.7ms |
| Preview round trip | 5.3ms | 5.9ms |
| Apply round trip | 32.3ms | 29.2ms |
| Revert round trip | 17.5ms | 36.5ms |

Interpretation:

- From the actual target-element click to the panel rendering the selected binding, max latency across all samples was 2.3ms.
- `pickToPanelMs` includes the time spent waiting for the user to click a target after entering pick mode, so it is not pure UI latency.
- From the preview button click to preview-state rendering, max real browser round trip across all samples was 5.9ms.
- From the apply button click to source patch completion and status rendering, max real browser round trip across all samples was 32.3ms.
- From the Undo last click to source revert completion and status rendering, max real browser round trip across all samples was 36.5ms.
- The metric has moved beyond the initial one-run check, but it is still a small sample on one local machine and browser environment.

## 7. Agent Task Generation

| Metric | Value |
| --- | ---: |
| Task generation success | true |
| Task generation time | 2.3ms |
| Required sections present | true |

Required sections checked:

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
```

## 8. Agent Result Generation

| Metric | Value |
| --- | ---: |
| Result generation success | true |
| Result generation time | 5.179ms |
| Required sections present | true |
| Result/diff files exist | true |
| Source hash changed | true |
| Source snapshot available | true |
| Source diff line count | 2 |
| Source diff present | true |
| Semantic className change count | 1 |
| Semantic token added count | 2 |
| Semantic token removed count | 2 |
| Semantic diff present | true |
| Component snapshot available | true |
| Component source diff line count | 2 |
| Component source diff present | true |
| Component semantic className change count | 1 |
| Component semantic token added count | 2 |
| Component semantic token removed count | 2 |
| Component semantic diff present | true |

Required sections checked:

```text
Summary
Source Binding
Task
Changed Files
Checks
Source Diff
Semantic Intent Diff
Related Source Diff
Related Semantic Intent Diff
Component Source Diff
Component Semantic Intent Diff
Intent Diff
```

Dev server endpoint smoke test:

| Metric | Value |
| --- | ---: |
| Test URL | `http://127.0.0.1:5178/__intent/agent-result` |
| Result generation success | true |
| Endpoint task time | 2.247ms |
| Endpoint result time | 13.282ms |
| Endpoint source snapshot available | true |
| Endpoint source diff line count | 0 |
| Result file returned | true |
| Diff file returned | true |

Interpretation:

- Agent result recording is still well below the 50ms target.
- This step structures the user's result summary into `.intent/agent/result_*.md` and `.intent/diffs/*_agent.intent-diff.yml`.
- Task creation stores a selected source-window snapshot, and result recording compares it with the current source window to write a line diff.
- Read-only variable references store the related variable declaration as a `Related Source Snapshot`, and result recording compares it as both `Related Source Diff` and `Related Semantic Intent Diff`.
- `className` values inside the selected source window are also analyzed into before/after tokens; this fixture records 2 added tokens (`rounded-xl`, `p-8`) and 2 removed tokens (`rounded-lg`, `p-6`).
- Task creation also stores a component snapshot; result recording now writes component-level source diff and `className` semantic token diff.
- The component-level semantic diff records the same fixture change: 2 added tokens (`rounded-xl`, `p-8`) and 2 removed tokens (`rounded-lg`, `p-6`).
- It does not yet infer whole-file semantic changes, props/data-flow changes, or variant-function meaning automatically.

## 8.1 Component Snapshot Discovery Fixture

| Metric | Value |
| --- | ---: |
| Fixture cases | 8 |
| Passing cases | 8 |
| Pass rate | 100% |
| Gate | pass |

Cases checked:

| Case | Component | Bindings | Task time | Result |
| --- | --- | ---: | ---: | --- |
| function + nested/map/conditional/fragment | `ComponentSnapshotFunction` | 3 | 1.205ms | pass |
| arrow block | `ComponentSnapshotArrowBlock` | 2 | 1.42ms | pass |
| arrow parenthesized expression | `ComponentSnapshotArrowParen` | 2 | 1.627ms | pass |
| arrow JSX no-parens | `ComponentSnapshotArrowJsx` | 1 | 1.416ms | pass |
| memo-wrapped function | `ComponentSnapshotMemo` | 1 | 1.416ms | pass |
| forwardRef-wrapped function | `ComponentSnapshotForwardRef` | 1 | 1.366ms | pass |
| HOC-wrapped function | `ComponentSnapshotHoc` | 2 | 1.127ms | pass |
| namespace object export | `ComponentSnapshotNamespace` | 1 | 1.37ms | pass |

Interpretation:

- The fixture caught a real bug where function component parameter destructuring/type annotation made body `{` detection stop too early.
- Body range discovery now balances the function parameter list before looking for the component body.
- Arrow components are covered for block body, parenthesized expression body, and no-parens JSX expression body.
- For memo, forwardRef, and HOC wrappers, the exported wrapper variable is preferred over the inner function name as the component identity.
- Namespace object exports are captured as the full object statement for component snapshots.

## 9. Read-only Binding Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variable-reference` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 1.287ms |
| Agent result created | true |
| Agent result generation time | 4.763ms |
| Syntax errors after result | 0 |
| Source diff line count | 2 |
| Component source diff line count | 0 |
| Related source snapshot available | true |
| Related source diff line count | 2 |
| Related source diff present | true |
| Related semantic className change count | 1 |
| Related semantic diff present | true |
| Related semantic token added count | 3 |
| Related semantic token removed count | 3 |

Interpretation:

- Elements such as `className={cardClass}` now receive `data-intent-id` and can be selected.
- Direct token patch buttons are not shown; the flow degrades to an unsupported reason and agent handoff.
- Simple variable-reference read-only bindings store the variable declaration range as related source.
- In the fixture, the component body does not change, so component diff stays at 0, while the `const cardClass = ...` change is recorded as related source diff line count 2 and semantic token added/removed counts of 3/3.

## 9.1 Read-only `cn()` Variable Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variable-reference` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 1.486ms |
| Agent result created | true |
| Agent result generation time | 3.756ms |
| Syntax errors after result | 0 |
| Source diff line count | 2 |
| Component source diff line count | 2 |
| Component source diff present | true |
| Related source snapshot available | true |
| Related source diff line count | 2 |
| Related source diff present | true |
| Related semantic className change count | 2 |
| Related semantic diff present | true |
| Related semantic token added count | 4 |
| Related semantic token removed count | 4 |

Interpretation:

- A declaration such as `const cardClass = cn("...", active && "...")` is still captured as a related source snapshot.
- Result recording captures the base literal and conditional literal as separate semantic changes, with token added/removed counts of 4/4.
- This fixture proves related source semantic diffing covers simple `cn()` variable declarations, not only single quoted variable declarations.

## 9.2 Read-only Composite Variable Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variable-reference` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 1.224ms |
| Agent result created | true |
| Agent result generation time | 4.136ms |
| Syntax errors after result | 0 |
| Source diff line count | 2 |
| Component source diff line count | 14 |
| Component source diff present | true |
| Related source snapshot available | true |
| Related source diff line count | 14 |
| Related source diff present | true |
| Related semantic className change count | 4 |
| Related semantic diff present | true |
| Related semantic token added count | 6 |
| Related semantic token removed count | 6 |

Interpretation:

- A `cardClass` variable mixing array join, object-map lookup, and runtime template literal segments is captured as related source.
- Result recording splits the base array literal, conditional literal, object-map literal, and template-literal conditional literal into separate semantic changes.
- This fixture proves read-only related semantic diffs now cover composite variable declarations beyond simple variables and simple `cn()`.

## 9.3 Variant Function Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variant-function` |
| ClassName value | `buttonVariants({ variant: "primary" })` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 1.463ms |
| Related snapshot available | true |
| Related snapshot kind | `variant-function` |
| Related snapshot identifier | `buttonVariants` |
| Related snapshot includes cva | true |
| Agent result created | true |
| Agent result generation time | 4.561ms |
| Syntax errors after result | 0 |
| Selected source diff line count | 0 |
| Component source diff line count | 0 |
| Related source diff line count | 8 |
| Related source diff present | true |
| Related semantic className change count | 2 |
| Related semantic diff present | true |
| Related semantic token added count | 5 |
| Related semantic token removed count | 5 |

Interpretation:

- `className={buttonVariants(...)}` remains read-only and degrades to agent handoff rather than direct patching.
- The same-file local `const buttonVariants = cva(...)` declaration is stored as the related source snapshot.
- Result recording preserves changes to the variant declaration as related source diff and literal-token semantic diff even when the selected JSX call does not change.

## 9.4 Imported Variant Function Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variant-function` |
| ClassName value | `buttonVariants({ variant: "primary" })` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 2.316ms |
| Related snapshot available | true |
| Related snapshot file | `.intent/tmp/ImportedVariantDefinition.ts` |
| Related snapshot kind | `variant-function` |
| Related snapshot identifier | `buttonVariants` |
| Related snapshot includes cva | true |
| Agent result created | true |
| Agent result generation time | 4.224ms |
| Syntax errors after result | 0 |
| Selected source diff line count | 0 |
| Component source diff line count | 0 |
| Related source diff line count | 8 |
| Related source diff present | true |
| Related semantic className change count | 2 |
| Related semantic diff present | true |
| Related semantic token added count | 5 |
| Related semantic token removed count | 5 |

Interpretation:

- When the selected JSX file calls `className={buttonVariants(...)}` and `buttonVariants` is defined in another file, one-hop relative named imports are followed into the related source snapshot.
- The agent task editable file list includes both the selected JSX file and the imported variant definition file.
- Result recording creates related source and semantic token diffs even when only the imported definition changes.
- Path aliases, barrel re-exports, package imports, and multi-hop import graphs are still out of scope.

## 9.5 CLI Init/Scan/Check/Apply/Diff/Handoff

| Metric | Value |
| --- | ---: |
| Init exit code | 0 |
| Scan exit code | 0 |
| Check exit code | 0 |
| Apply exit code | 0 |
| Diff exit code | 0 |
| Init command | `init` |
| Scan command | `scan` |
| Check command | `check` |
| Apply command | `apply` |
| Diff command | `diff` |
| Files scanned | 8 |
| Binding count | 40 |
| Direct-edit binding count | 35 |
| Read-only binding count | 5 |
| Supported direct coverage | 87.5% |
| Editable token coverage | 81.08% |
| Syntax error count | 0 |
| Max transform time | 0.531ms |
| Init stdout bytes | 498 |
| Scan stdout bytes | 3262 |
| Check stdout bytes | 3658 |

Init gate:

| Metric | Value |
| --- | ---: |
| Init ok | true |
| Created path count | 6 |
| Existing path count | 4 |
| Schema files present | true |

Check gates:

| Gate | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| files scanned | 8 | >= 1 | pass |
| syntax errors | 0 | 0 | pass |
| supported direct coverage | 87.5% | >= 50% | pass |
| max file transform | 0.531ms | <= 20ms | pass |

Apply/diff gate:

| Metric | Value |
| --- | ---: |
| Apply graph scan exit code | 0 |
| Apply exit code | 0 |
| Diff exit code | 0 |
| Apply target file | `.intent/tmp/CliApplyFixture.tsx` |
| Operation file | `.intent/operations/2026-06-30T10-16-33-272Z.intent-op.json` |
| Diff file | `.intent/diffs/2026-06-30T10-16-33-272Z.intent-diff.yml` |
| Operation log file | `.intent/operations/operation-log.json` |
| Apply time | 3.382ms |
| Syntax errors after apply | 0 |
| Diff bytes | 229 |
| Diff change count | 1 |

Agent-task gate:

| Metric | Value |
| --- | ---: |
| Graph scan exit code | 0 |
| Agent-task exit code | 0 |
| Graph entry count | 40 |
| Selected binding id | `il_aecb838907` |
| Task file | `.intent/agent/task_2026-06-30T10-16-33-240Z.md` |
| Task target file | `fixtures/corpus/DynamicRuntime.tsx` |
| Task markdown bytes | 3541 |
| Task generation time | 1.101ms |
| Required sections present | true |

Agent-result gate:

| Metric | Value |
| --- | ---: |
| Agent-result exit code | 0 |
| Result file | `.intent/agent/result_2026-06-30T10-16-33-250Z.md` |
| Diff file | `.intent/diffs/2026-06-30T10-16-33-250Z_agent.intent-diff.yml` |
| Result target file | `.intent/tmp/CliAgentResultFixture.tsx` |
| Result markdown bytes | 2388 |
| Result generation time | 5.801ms |
| Source diff line count | 2 |
| Semantic change count | 1 |
| Required sections present | true |
| Syntax errors after result | 0 |

Interpretation:

- `src/intent/cli.ts` calls the current instrumentation engine directly without starting a server.
- `init` creates the base `.intent` folders and lightweight schema files.
- `scan` prints per-file binding counts, read-only counts, editable token coverage, transform time, and unsupported reasons as JSON.
- `check` applies minimal gates to the same scan output and returns a non-zero exit code when they fail.
- `apply` runs a single Tailwind token replace from `.intent-op.json` through the existing safe patch engine and records operation/diff/log artifacts.
- `diff` summarizes `.intent-diff.yml` as JSON so CLI/CI can inspect the latest intent diff.
- `agent-task` takes a binding id from `.intent/graph.intent.json` plus a desired change and creates structured handoff markdown.
- `agent-result` takes a task file, result summary, changed files, and checks, then creates result markdown plus `.intent-diff.yml`.
- The current CLI MVP implements `init`/`scan`/`check`/`apply`/`diff`/`agent-task`/`agent-result`. `dev` wrapping and `agent-context` remain launch polish work.

## 10. Gate Results

| Gate | Threshold | Result |
| --- | --- | --- |
| static editable token coverage | >= 30% | pass |
| static + simple `cn()` / `clsx()` coverage | >= 50% | pass |
| supported direct coverage | >= 50% | pass |
| AI corpus sample count | files >= 50 | pass |
| AI corpus static + simple coverage | editable coverage >= 50% | pass |
| AI corpus supported direct coverage | editable coverage >= 50% | pass |
| AI corpus all observed coverage | editable coverage >= 50% | pass |
| warm transform target | max <= 5ms | pass |
| cold transform target | max <= 10ms | pass |
| large transform stress | 401 bindings max <= 20ms | pass |
| CLI init | `.intent` folders/schema created or present + exit code 0 | pass |
| CLI scan | command `scan` + files >= 8 + bindings > 0 + JSON output | pass |
| CLI check | files/syntax/coverage/transform gates all pass + exit code 0 | pass |
| CLI apply/diff | `.intent-op.json` apply success + operation/diff/log created + diff summary change > 0 + syntax error 0 | pass |
| CLI agent task | graph entries >= 40 + read-only binding selected + task markdown required sections present | pass |
| CLI agent result | task/result/diff created + source diff > 0 + semantic change > 0 + syntax error 0 | pass |
| browser sample count | total >= 6, desktop >= 3, mobile >= 3 | pass |
| browser click-to-panel | click-to-panel <= 100ms | pass |
| browser preview round trip | preview round trip <= 50ms | pass |
| browser apply round trip | apply round trip <= 50ms | pass |
| browser revert round trip | revert round trip <= 50ms | pass |
| supported static patch | apply success + syntax error 0 | pass |
| last patch revert | revert success + syntax error 0 | pass |
| operation log undo stack/history | 2 applies + history next token `p-8` + 2 reverts + pending stack 0 + syntax error 0 | pass |
| operation branch undo discard | non-top pending undo discarded + next undo token `p-8` preserved + pending stack 0 after revert + syntax error 0 | pass |
| operation conflict artifact | `revert-token-mismatch` rejection + conflict artifact created + expected/actual/restore tokens recorded + syntax error 0 | pass |
| operation conflict resolution | active conflict 1 + `discard-pending-undo` resolve + pending stack 0 + active conflict 0 + syntax error 0 | pass |
| agent task generation | task created + required sections present | pass |
| agent result generation | result/diff created + source diff + selected/component/related semantic diff section present | pass |
| component snapshot discovery | all 8 fixture cases pass | pass |
| read-only handoff | read-only binding created + agent task created | pass |
| read-only related source/semantic diff | related snapshot + related source diff + related semantic diff + syntax error 0 | pass |
| read-only `cn()` variable related semantic diff | related source diff + related semantic change >= 2 + token added/removed >= 4 + syntax error 0 | pass |
| read-only composite variable related semantic diff | array/object/template related semantic change >= 4 + token added/removed >= 6 + syntax error 0 | pass |
| variant/cva related source handoff | local variant declaration snapshot + related source diff + semantic token added/removed >= 5 + syntax error 0 | pass |
| imported variant/cva related source handoff | one-hop relative named import snapshot + related source diff + semantic token added/removed >= 5 + syntax error 0 | pass |
| simple `cn()` / `clsx()` patch | apply success + syntax error 0 | pass |
| stale rejection | reject source mismatch | pass |

## 11. Conclusion

This step expands the MVP direct-edit surface from static `className` to simple/partial `cn()` / `clsx()` literal segments, and makes unsupported `className` expressions selectable through read-only handoff. It also expands related semantic diffs for read-only variable declarations to array, object-map, and template-literal combinations, and captures local plus one-hop relative imported variant/cva declarations as related source handoff context. A minimal `init`/`scan`/`check`/`apply`/`diff`/`agent-task`/`agent-result` CLI now lets the repo state be inspected numerically, applies deterministic patches, summarizes intent diffs, creates agent handoff docs, and records result/diff artifacts without opening the browser.

What worked:

- static `className` token analysis
- simple/partial `cn()` / `clsx()` literal segment analysis
- Codex-generated 50-file React/Tailwind corpus coverage measurement
- compile-time source binding generation
- read-only source binding generation
- source token range patching
- patch preview before apply
- operation-log-backed undo stack
- pending undo history endpoint and overlay display
- LIFO stack behavior through the last-patch revert endpoint
- non-destructive pending undo discard for minimal branch undo handling
- undo conflict artifact generation with expected/actual/restore token records
- undo conflict listing and `discard-pending-undo` resolution
- source hash/className tokenization caches for repeated transforms
- agent handoff task markdown generation
- agent result markdown, selected source-window diff, component source diff, and selected/component/related `className` semantic diff generation
- component snapshot discovery fixture pass 8/8
- related source diff and semantic token diff generation for read-only variable references
- related source diff and semantic token diff generation for read-only `cn()` variable references
- related semantic token diff generation for read-only composite variables using array/object-map/template-literal declarations
- related source diff and semantic token diff generation for local variant/cva read-only bindings
- related source diff and semantic token diff generation for one-hop relative named-import variant/cva read-only bindings
- real browser click-to-panel, preview, apply, and revert round-trip measurement
- agent handoff degradation for unsupported className expressions
- simple `cn()` literal segment patching
- source hash stale rejection
- low-level scanner cold transform gate pass
- 401-binding large TSX transform stress gate pass
- CLI `scan`/`check` JSON report and gate pass
- CLI `init` workspace/schema creation and gate pass
- CLI `apply` safe patch execution from `.intent-op.json` plus operation/diff/log output
- CLI `diff` `.intent-diff.yml` JSON summary and gate pass
- CLI `agent-task` handoff markdown generation and required-section gate pass
- CLI `agent-result` result markdown/diff generation and source/semantic diff gate pass
- minimal intent operation/diff output
- numeric report generation

What remains weak:

- cache/write throttling still needs to be validated on product-sized TSX files
- real browser measurement now includes repeated desktop/mobile samples, but still only on one local machine and browser environment
- branch undo currently supports pending undo discard only; arbitrary non-top patches are not directly reverted from source
- CLI currently implements `init`/`scan`/`check`/`apply`/`diff`/`agent-task`/`agent-result`; `dev` wrapping and `agent-context` remain launch polish work
- independently collected external 50-100 sample AI-generated corpus audit is still missing
- component snapshot false positives/false negatives still need re-measurement on an external corpus and product-sized TSX files
- automatic semantic analysis across path aliases, barrel re-exports, package imports, and cross-variable data flow is still missing
- variant functions and runtime template literals remain unsupported for direct patching

Current decision:

```text
The MVP direct-edit surface is worth expanding.
The next priority is independent external corpus validation, deciding whether to expand branch undo into arbitrary non-top revert, path-alias/barrel/cross-variable handoff context, and component snapshot false-positive/false-negative measurement on product-sized TSX files.
```
