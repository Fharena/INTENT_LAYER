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
- temporary patch fixture

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
| static `className` | 30 / 40 = 75.0% |
| simple `cn()` / `clsx()` | 3 / 40 = 7.5% |
| read-only | 7 / 40 = 17.5% |
| static token count | 154 |
| static editable token count | 126 |
| static editable coverage | 81.82% |
| static + simple token count | 172 |
| static + simple editable token count | 143 |
| static + simple editable coverage | 83.14% |
| all observed token count | 182 |
| all editable token count | 149 |
| all editable coverage | 81.87% |

Unsupported reasons:

| Reason | Count |
| --- | ---: |
| variable-reference | 2 |
| template-expression | 1 |
| complex-cn-variable-reference | 1 |
| complex-cn-runtime-expression | 1 |
| variant-function | 1 |
| unsupported-expression | 1 |

Interpretation:

- In the fixture corpus, static `className` gives enough direct-edit surface area to keep moving.
- Adding simple `cn()` / `clsx()` increases coverage only slightly because the current fixture corpus is static-heavy.
- Read-only cases cluster around variables, template literals, variant functions, and props forwarding.

## 3. Transform Performance

Raw report:

```text
reports/performance/spike-evaluation.json
```

Measurements:

| File | Bindings | Transform time |
| --- | ---: | ---: |
| `src/App.tsx` | 13 | avg 2.571ms / p95 4.309ms / max 4.309ms |
| `src/main.tsx` | 0 | avg 0.714ms / p95 1.665ms / max 1.665ms |

Summary:

| Metric | Value |
| --- | ---: |
| Files measured | 2 |
| Iterations per file | 5 |
| Average transform time | 1.642ms |
| p95 transform time | 4.309ms |
| Max transform time | 4.309ms |
| Target | <= 5ms per file |
| Result | passed |

Interpretation:

- In the 5-iteration run, average, p95, and max transform time are all under 5ms.
- The current implementation performs AST parse and instrumentation in one pass.
- Larger TSX files will still need file filtering, caching, and graph write throttling.

## 4. Patch Performance and Safety

| Metric | Value |
| --- | ---: |
| Preview success | true |
| Preview time | 0.824ms |
| Preview round trip | 1.193ms |
| Apply success | true |
| Apply time | 11.435ms |
| Syntax errors after patch | 0 |
| Stale source rejection | true |
| Stale rejection reason | `source-hash-mismatch` |

Interpretation:

- Patch preview and apply are far below the 50ms target.
- Patches are rejected when the source hash does not match.
- No syntax error was produced after the supported static token patch.

## 5. Graph Lookup Proxy

| Metric | Value |
| --- | ---: |
| Iterations | 1000 |
| Total time | 0.26ms |
| Average lookup | 0.00026ms |

Caveat:

This is not a full browser click measurement.
It only measures the `intent id -> binding` Map lookup.
A real click-to-panel measurement still needs to be captured in the dev server and browser.

## 6. Gate Results

| Gate | Threshold | Result |
| --- | --- | --- |
| static editable token coverage | >= 30% | pass |
| static + simple `cn()` / `clsx()` coverage | >= 50% | pass |
| transform target | max <= 5ms | pass |
| supported patch | apply success + syntax error 0 | pass |
| stale rejection | reject source mismatch | pass |

## 7. Conclusion

The spike passes the core patch-safety assumption.

What worked:

- static `className` token analysis
- compile-time source binding generation
- range patching
- source hash stale rejection
- minimal intent operation/diff output
- numeric report generation

What remains weak:

- transform time still needs to be tested on larger TSX files
- real browser click-to-binding time is not measured yet
- real AI-generated 50-100 sample corpus audit is still missing
- simple `cn()` / `clsx()` patching is not implemented yet

Current decision:

```text
The M1 vertical slice is worth continuing.
The next priority is larger-file transform testing and a real corpus audit.
```
