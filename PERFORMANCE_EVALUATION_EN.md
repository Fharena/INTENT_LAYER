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
| `src/App.tsx` | 13 | avg 4.029ms / p95 8.491ms / max 8.491ms |
| `src/main.tsx` | 0 | avg 1.246ms / p95 2.791ms / max 2.791ms |

Summary:

| Metric | Value |
| --- | ---: |
| Files measured | 2 |
| Iterations per file | 5 |
| Overall average transform time | 2.638ms |
| Overall p95 transform time | 8.491ms |
| Overall max transform time | 8.491ms |
| Warm average transform time | 1.887ms |
| Warm p95 transform time | 3.857ms |
| Warm max transform time | 3.857ms |
| Target | <= 5ms per warm transform |
| Result | warm pass / cold fail |

Interpretation:

- In the 5-iteration run, the first cold transform exceeded 5ms.
- Excluding the first sample, warm average, p95, and max transform time are under 5ms.
- The current implementation performs TypeScript AST parse and instrumentation in one pass.
- Larger TSX files will still need file filtering, caching, and graph write throttling.

## 4. Patch Performance and Safety

| Metric | Value |
| --- | ---: |
| Preview success | true |
| Preview time | 0.735ms |
| Preview round trip | 1.069ms |
| Apply success | true |
| Static apply time | 3.742ms |
| Simple `cn()` apply time | 3.812ms |
| Revert success | true |
| Revert time | 11.577ms |
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
| Total time | 0.313ms |
| Average lookup | 0.000313ms |

Caveat:

This is not a full browser click measurement.
It only measures the `intent id -> binding` Map lookup.
A real click-to-panel measurement still needs to be captured in the dev server and browser.

## 6. Gate Results

| Gate | Threshold | Result |
| --- | --- | --- |
| static editable token coverage | >= 30% | pass |
| static + simple `cn()` / `clsx()` coverage | >= 50% | pass |
| supported direct coverage | >= 50% | pass |
| warm transform target | max <= 5ms | pass |
| cold transform target | max <= 5ms | fail |
| supported static patch | apply success + syntax error 0 | pass |
| last patch revert | revert success + syntax error 0 | pass |
| simple `cn()` / `clsx()` patch | apply success + syntax error 0 | pass |
| stale rejection | reject source mismatch | pass |

## 7. Conclusion

This step expands the MVP direct-edit surface from static `className` to simple/partial `cn()` / `clsx()` literal segments.

What worked:

- static `className` token analysis
- simple/partial `cn()` / `clsx()` literal segment analysis
- compile-time source binding generation
- source token range patching
- patch preview before apply
- last-patch revert
- simple `cn()` literal segment patching
- source hash stale rejection
- minimal intent operation/diff output
- numeric report generation

What remains weak:

- cold first transform exceeds the 5ms target
- transform time still needs to be tested on larger TSX files
- real browser click-to-panel time is not measured yet
- real AI-generated 50-100 sample corpus audit is still missing
- variant functions and runtime template literals remain unsupported

Current decision:

```text
The MVP direct-edit surface is worth expanding.
The next priority is cold transform optimization, a real corpus audit, and real browser click-to-panel measurement.
```
