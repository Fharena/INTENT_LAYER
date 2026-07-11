# INTENT_LAYER Failure Mode Guide

This document lists the situations where the MVP should fail safely and what to do next.

## 1. `doctor` returns `vite-plugin` fail

Symptom:

```text
intentLayer() was not found in the Vite config.
```

Cause:

- `intentLayer()` is missing from `vite.config.*`.
- `intent-layer/vite` is not imported.
- the plugin is not inside the `plugins` array.

Fix:

```ts
import { intentLayer } from "intent-layer/vite";

export default defineConfig({
  plugins: [react(), intentLayer()]
});
```

Verify:

```bash
npx intent-layer doctor
```

The evaluation harness now includes this failure case as a dedicated fixture.

## 2. `.intent/graph.intent.json` warn

Symptom:

```text
Intent graph file does not exist yet.
```

Cause:

- Vite transform has not run yet.
- `scan --write-graph` has not run yet.

Fix:

```bash
npx intent-layer scan src --write-graph
```

Or start the dev server and load the target TSX module.

```bash
npx intent-layer dev
```

## 3. `source-files` fail

Symptom:

```text
No JSX/TSX source files found
```

Cause:

- the default input `src` does not contain `.tsx` / `.jsx` files
- the app source lives under `app`, `components`, `packages/ui/src`, or another folder

Fix:

```bash
npx intent-layer doctor app components packages/ui/src
npx intent-layer scan app components packages/ui/src --write-graph
```

## 4. `check` coverage fail

Symptom:

```text
supportedDirectCoverage below threshold
```

Cause:

- high dynamic `className` ratio
- many variant functions, variable references, or template expressions

Fix:

- inspect the unsupported reason distribution before lowering the threshold
- keep unsafe bindings on the agent handoff path
- only simplify the literal segments that naturally fit simple `cn()` / `clsx()`

```bash
npx intent-layer check src --min-supported-direct 0.5
```

## 5. Patch rejected with `source-hash-mismatch`

Symptom:

```text
source-hash-mismatch
```

Cause:

- source changed after preview
- the graph drifted from current source

Fix:

```bash
npx intent-layer scan src --write-graph
```

Then preview/apply again.

## 6. Patch rejected with old token mismatch

Symptom:

```text
old token was not found at the expected range
```

Cause:

- the source range still exists but the token already changed
- a formatter or another agent changed the same area

Fix:

- scan the current source again
- do not force the old operation
- create an agent handoff task if the edit is now ambiguous

## 7. `className` appears as read-only

Symptom:

```text
className: read-only
unsupported: variable-reference | variant-function | template-expression
```

Cause:

- the expression is not safe for deterministic direct range patching

Fix:

- use agent handoff instead of direct patching
- review related source snapshots and semantic diffs in the task/result artifacts

## 8. External npm package source is not patched directly

Symptom:

```text
External Import Reference
```

Cause:

- `className` came from a variant/helper in an external npm package

Fix:

- do not edit `node_modules`
- use a local wrapper, local override, or app-level className addition

## 9. Run is not independent external corpus evidence

Symptom:

```text
mvpEvidence.usableAsMvpEvidence = false
sourceKind = local-smoke-fixture
```

Meaning:

- the importer/report/gate loop works, but the result should not be treated as market or MVP coverage evidence

Fix:

```bash
npm run import:external-corpus -- <independent-react-tailwind-project-or-samples>
```

Re-measure with 50-100 independently collected samples.

## 10. Undo is rejected with `undo-not-latest` or `revert-source-hash-mismatch`

`undo-not-latest` means a newer pending patch exists. Revert patches in latest-first order.

`revert-source-hash-mismatch` means the file changed after the patch was applied. Intent Layer refuses to trust the stored offset, preserves the file, and writes a record under `.intent/conflicts/`. Review the current source, reselect the element, or intentionally discard the pending undo.

## 11. Preview, apply, or undo fails with a request error

The panel reports a stopped dev server, invalid HTTP response, or JSON parse failure in its status area. Confirm that Vite is running and refresh the page. Buttons are temporarily disabled during requests, and a failed request does not modify source by itself.

## 12. An Agent task remains `claimed`

Return an abandoned provider task to the queue:

```bash
npm run intent:agent-queue -- --release --task .intent/agent/task_x.md
```

Prune old completed or failed artifacts explicitly:

```bash
npm run intent:agent-queue -- --prune-days 30
```

Prune removes only terminal tasks and preserves queued or running work.
