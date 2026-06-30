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
- agent handoff task fixture
- agent result artifact fixture
- agent result source diff fixture
- agent result selected `className` semantic diff fixture
- agent result component snapshot/source diff/semantic diff fixture
- component snapshot discovery fixture set
- read-only related source diff fixture
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
| `src/App.tsx` | 13 | avg 1.131ms / p95 2.865ms / max 2.865ms |
| `src/main.tsx` | 0 | avg 0.012ms / p95 0.039ms / max 0.039ms |

Summary:

| Metric | Value |
| --- | ---: |
| Files measured | 2 |
| Iterations per file | 5 |
| Overall average transform time | 0.572ms |
| Overall p95 transform time | 2.865ms |
| Overall max transform time | 2.865ms |
| Warm average transform time | 0.356ms |
| Warm p95 transform time | 0.781ms |
| Warm max transform time | 0.781ms |
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
- Larger files are measured separately with the stress fixture below.

## 3.1 Large TSX Transform Stress

| Metric | Value |
| --- | ---: |
| Fixture file | `.intent/tmp/LargeTransformFixture.tsx` |
| Repeated cards | 100 |
| Bindings | 401 |
| File size | 45,352 bytes |
| Iterations | 5 |
| Average transform time | 8.579ms |
| p95 transform time | 14.128ms |
| Max transform time | 14.128ms |
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
| Preview time | 1.026ms |
| Preview round trip | 1.438ms |
| Apply success | true |
| Static apply time | 30.465ms |
| Simple `cn()` apply time | 18.576ms |
| Revert success | true |
| Revert time | 24.389ms |
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
| First revert success | true |
| Pending undo count after first revert | 1 |
| Second revert success | true |
| Pending undo count after second revert | 0 |
| Syntax errors after stack revert | 0 |

Interpretation:

- The fixture applies two direct patches, restores the pending undo stack from the operation log, then reverts both patches in order.
- This verifies the same LIFO flow used by `/__intent/revert-last`.
- The operation log is an append-only JSON file for apply/revert entries and does not require a database or external service.

## 5. Graph Lookup Proxy

| Metric | Value |
| --- | ---: |
| Iterations | 1000 |
| Total time | 0.101ms |
| Average lookup | 0.000101ms |

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
| Task generation time | 9.794ms |
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
| Result generation time | 20.399ms |
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
- Read-only variable references store the related variable declaration as a `Related Source Snapshot`, and result recording compares it as `Related Source Diff`.
- `className` values inside the selected source window are also analyzed into before/after tokens; this fixture records 2 added tokens (`rounded-xl`, `p-8`) and 2 removed tokens (`rounded-lg`, `p-6`).
- Task creation also stores a component snapshot; result recording now writes component-level source diff and `className` semantic token diff.
- The component-level semantic diff records the same fixture change: 2 added tokens (`rounded-xl`, `p-8`) and 2 removed tokens (`rounded-lg`, `p-6`).
- It does not yet infer whole-file semantic changes, props/data-flow changes, or variant-function meaning automatically.

## 8.1 Component Snapshot Discovery Fixture

| Metric | Value |
| --- | ---: |
| Fixture cases | 4 |
| Passing cases | 4 |
| Pass rate | 100% |
| Gate | pass |

Cases checked:

| Case | Component | Bindings | Task time | Result |
| --- | --- | ---: | ---: | --- |
| function + nested/map/conditional/fragment | `ComponentSnapshotFunction` | 3 | 2.971ms | pass |
| arrow block | `ComponentSnapshotArrowBlock` | 2 | 2.803ms | pass |
| arrow parenthesized expression | `ComponentSnapshotArrowParen` | 2 | 2.147ms | pass |
| arrow JSX no-parens | `ComponentSnapshotArrowJsx` | 1 | 3.218ms | pass |

Interpretation:

- The fixture caught a real bug where function component parameter destructuring/type annotation made body `{` detection stop too early.
- Body range discovery now balances the function parameter list before looking for the component body.
- Arrow components are covered for block body, parenthesized expression body, and no-parens JSX expression body.
- HOC-wrapped components, memo/forwardRef, and namespace component exports still need separate fixtures.

## 9. Read-only Binding Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variable-reference` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 2.878ms |
| Agent result created | true |
| Agent result generation time | 13.861ms |
| Syntax errors after result | 0 |
| Source diff line count | 2 |
| Component source diff line count | 0 |
| Related source snapshot available | true |
| Related source diff line count | 2 |
| Related source diff present | true |

Interpretation:

- Elements such as `className={cardClass}` now receive `data-intent-id` and can be selected.
- Direct token patch buttons are not shown; the flow degrades to an unsupported reason and agent handoff.
- Simple variable-reference read-only bindings store the variable declaration range as related source.
- In the fixture, the component body does not change, so component diff stays at 0, while the `const cardClass = ...` change is recorded as related source diff line count 2.

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
| browser sample count | total >= 6, desktop >= 3, mobile >= 3 | pass |
| browser click-to-panel | click-to-panel <= 100ms | pass |
| browser preview round trip | preview round trip <= 50ms | pass |
| browser apply round trip | apply round trip <= 50ms | pass |
| browser revert round trip | revert round trip <= 50ms | pass |
| supported static patch | apply success + syntax error 0 | pass |
| last patch revert | revert success + syntax error 0 | pass |
| operation log undo stack | 2 applies + 2 reverts + pending stack 0 + syntax error 0 | pass |
| agent task generation | task created + required sections present | pass |
| agent result generation | result/diff created + source diff + selected/component semantic diff present | pass |
| component snapshot discovery | all 4 fixture cases pass | pass |
| read-only handoff | read-only binding created + agent task created | pass |
| read-only related source diff | related snapshot + related diff + syntax error 0 | pass |
| simple `cn()` / `clsx()` patch | apply success + syntax error 0 | pass |
| stale rejection | reject source mismatch | pass |

## 11. Conclusion

This step expands the MVP direct-edit surface from static `className` to simple/partial `cn()` / `clsx()` literal segments, and makes unsupported `className` expressions selectable through read-only handoff.

What worked:

- static `className` token analysis
- simple/partial `cn()` / `clsx()` literal segment analysis
- Codex-generated 50-file React/Tailwind corpus coverage measurement
- compile-time source binding generation
- read-only source binding generation
- source token range patching
- patch preview before apply
- operation-log-backed undo stack
- LIFO stack behavior through the last-patch revert endpoint
- agent handoff task markdown generation
- agent result markdown, selected source-window diff, component source diff, and selected/component `className` semantic diff generation
- component snapshot discovery fixture pass 4/4
- related source diff generation for read-only variable references
- real browser click-to-panel, preview, apply, and revert round-trip measurement
- agent handoff degradation for unsupported className expressions
- simple `cn()` literal segment patching
- source hash stale rejection
- low-level scanner cold transform gate pass
- 401-binding large TSX transform stress gate pass
- minimal intent operation/diff output
- numeric report generation

What remains weak:

- cache/write throttling still needs to be validated on product-sized TSX files
- real browser measurement now includes repeated desktop/mobile samples, but still only on one local machine and browser environment
- undo history UI and conflict-resolution UX are still missing
- independently collected external 50-100 sample AI-generated corpus audit is still missing
- component snapshot fixtures for HOC-wrapped components, memo/forwardRef, and namespace exports are still missing
- related source semantic token diffs do not yet re-analyze variable declaration strings as semantic tokens
- variant functions and runtime template literals remain unsupported

Current decision:

```text
The MVP direct-edit surface is worth expanding.
The next priority is independent external corpus validation, undo history UI design, and related source semantic diff expansion.
```
