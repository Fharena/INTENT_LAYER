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
- `src/App.tsx`
- `src/**/*.tsx` instrumentation transform
- static patch fixture
- simple `cn()` patch fixture
- last-patch revert fixture
- agent handoff task fixture
- agent result artifact fixture
- read-only binding handoff fixture

Important caveat:

This corpus is an initial in-repo fixture corpus, not a real external set of 50-100 AI-generated examples.
Treat these numbers as an early signal only.
The next step should measure a real AI-generated React/Tailwind corpus.

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

## 3. Transform Performance

Raw report:

```text
reports/performance/spike-evaluation.json
```

Measurements:

| File | Bindings | Transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 3.264ms / p95 5.812ms / max 5.812ms |
| `src/main.tsx` | 0 | avg 0.003ms / p95 0.009ms / max 0.009ms |

Summary:

| Metric | Value |
| --- | ---: |
| Files measured | 2 |
| Iterations per file | 5 |
| Overall average transform time | 1.633ms |
| Overall p95 transform time | 5.812ms |
| Overall max transform time | 5.812ms |
| Warm average transform time | 1.314ms |
| Warm p95 transform time | 3.851ms |
| Warm max transform time | 3.851ms |
| Target | <= 5ms per warm transform |
| Result | warm pass / cold fail |

Interpretation:

- In the 5-iteration run, the first cold transform exceeded 5ms.
- Excluding the first sample, warm average, p95, and max transform time are under 5ms.
- Files without the literal `className` string now use a fast path and skip AST parsing.
- Files with `className` still perform TypeScript AST parse and instrumentation in one pass.
- Larger TSX files will still need file filtering, caching, and graph write throttling.

## 4. Patch Performance and Safety

| Metric | Value |
| --- | ---: |
| Preview success | true |
| Preview time | 1.281ms |
| Preview round trip | 1.741ms |
| Apply success | true |
| Static apply time | 5.771ms |
| Simple `cn()` apply time | 4.89ms |
| Revert success | true |
| Revert time | 12.313ms |
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

## 5. Graph Lookup Proxy

| Metric | Value |
| --- | ---: |
| Iterations | 1000 |
| Total time | 0.36ms |
| Average lookup | 0.00036ms |

Caveat:

This is not a full browser click measurement.
It only measures the `intent id -> binding` Map lookup.
A real click-to-panel measurement still needs to be captured in the dev server and browser.

## 6. Agent Task Generation

| Metric | Value |
| --- | ---: |
| Task generation success | true |
| Task generation time | 1.264ms |
| Required sections present | true |

Required sections checked:

```text
Goal
Selected Component
Current Intent Document
Desired Change
Constraints
Files That May Be Edited
Files That Should Not Be Edited
Required Checks
```

## 7. Agent Result Generation

| Metric | Value |
| --- | ---: |
| Result generation success | true |
| Result generation time | 3.222ms |
| Required sections present | true |
| Result/diff files exist | true |
| Source hash changed | false |

Required sections checked:

```text
Summary
Source Binding
Task
Changed Files
Checks
Intent Diff
```

Dev server endpoint smoke test:

| Metric | Value |
| --- | ---: |
| Test URL | `http://127.0.0.1:5177/__intent/agent-result` |
| Result generation success | true |
| Endpoint result time | 3.528ms |
| Result file returned | true |
| Diff file returned | true |

Interpretation:

- Agent result recording is still well below the 50ms target.
- This step structures the user's result summary into `.intent/agent/result_*.md` and `.intent/diffs/*_agent.intent-diff.yml`.
- It does not yet infer the semantic meaning of the actual agent patch automatically.

## 8. Read-only Binding Handoff

| Metric | Value |
| --- | ---: |
| Read-only entry created | true |
| Binding kind | `read-only` |
| Unsupported reason | `variable-reference` |
| Editable token count | 0 |
| Agent task created | true |
| Agent task generation time | 1.071ms |

Interpretation:

- Elements such as `className={cardClass}` now receive `data-intent-id` and can be selected.
- Direct token patch buttons are not shown; the flow degrades to an unsupported reason and agent handoff.

## 9. Gate Results

| Gate | Threshold | Result |
| --- | --- | --- |
| static editable token coverage | >= 30% | pass |
| static + simple `cn()` / `clsx()` coverage | >= 50% | pass |
| supported direct coverage | >= 50% | pass |
| warm transform target | max <= 5ms | pass |
| cold transform target | max <= 5ms | fail |
| supported static patch | apply success + syntax error 0 | pass |
| last patch revert | revert success + syntax error 0 | pass |
| agent task generation | task created + required sections present | pass |
| agent result generation | result/diff created + required sections present | pass |
| read-only handoff | read-only binding created + agent task created | pass |
| simple `cn()` / `clsx()` patch | apply success + syntax error 0 | pass |
| stale rejection | reject source mismatch | pass |

## 10. Conclusion

This step expands the MVP direct-edit surface from static `className` to simple/partial `cn()` / `clsx()` literal segments, and makes unsupported `className` expressions selectable through read-only handoff.

What worked:

- static `className` token analysis
- simple/partial `cn()` / `clsx()` literal segment analysis
- compile-time source binding generation
- read-only source binding generation
- source token range patching
- patch preview before apply
- last-patch revert
- agent handoff task markdown generation
- agent result markdown and agent intent diff generation
- agent handoff degradation for unsupported className expressions
- simple `cn()` literal segment patching
- source hash stale rejection
- minimal intent operation/diff output
- numeric report generation

What remains weak:

- cold first transform exceeds the 5ms target
- transform time still needs to be tested on larger TSX files
- real browser click-to-panel time is not measured yet
- real AI-generated 50-100 sample corpus audit is still missing
- agent results are not yet connected to actual before/after source diffs
- variant functions and runtime template literals remain unsupported

Current decision:

```text
The MVP direct-edit surface is worth expanding.
The next priority is real browser click-to-panel measurement, cold transform optimization, and a real corpus audit.
```
