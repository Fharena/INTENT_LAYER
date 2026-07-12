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

```bash
npx intent-layer init
```

If `init` returns `unsupported-config`, the plugins value uses a computed function, variable reference, or another shape that cannot be patched statically. The file remains unchanged. Register `intentLayer()` manually before the React plugin, then run the check again.

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

- `unsafe-intent-request`: the source-changing request is not from loopback or lacks the overlay session token. Open the dev server through `127.0.0.1` or `localhost` on the same machine. Do not bypass the guard to enable LAN editing.

## 12. An MCP edit or verification is rejected

- `preview-expired`: the five-minute preview expired; start again with `intent_preview_edit` for properties or `intent_preview_layout` for layout.
- `missing-runtime-selection`: there is no browser selection; select the element again in the Vite page.
- `stale-runtime-selection`: the 30-minute selection lifetime expired; reselect the element even if the page still looks unchanged.
- `missing-layout-selection`: the current element is outside a supported Grid/Flex scope, or the browser still runs an older client; refresh and select inside the layout.
- `repeated-layout-runtime`: the layout parent source id renders more than once, making a source-scoped grouped result ambiguous; use a component prop or refactor for per-instance differences.
- `layout-kind-mismatch`: the preview kind differs from `intent_inspect_layout`; reuse the returned kind.
- `source-hash-mismatch`: the file changed after preview; inspect the current element again.
- `file-locked`: the GUI or another AI operation is editing the same file; wait and create a new preview.
- The operation journal briefly serializes providers even when they edit different files. If it remains locked for more than five seconds, inspect abandoned Intent Layer processes and `.intent/runtime/locks/`.
- `idempotency-key-conflict`: the key already belongs to another preview; use a new operation key.
- `runtime: unavailable`: source is verified, but Vite/browser rendering cannot be checked. Literal text and grouped Grid/Flex currently verify source only, so do not report visual success.
- `runtime: drifted`: source changed but at least one rendered instance lacks the new token; inspect HMR and dynamic class conditions.

## 13. A DOM preview resets or a conditional token is missing

A color or spacing change shown immediately after candidate selection is a temporary DOM preview, not a source patch. Picking another element, rerendering the panel, starting a Grid/Flex operation, applying, or undoing restores it automatically. Source Apply also stays locked until server-side Preview succeeds.

For literal conditional branches inside `cn()` or `clsx()`, the panel hides tokens absent from the clicked DOM instance. Move the app into the other state and pick the element again to edit that branch. If React renders a new `class` value on the same element during preview, reset preserves React's newer result instead of overwriting it with a stale snapshot. Pick the element again to continue from current source and runtime state.

If Codex or Claude does not list the tools, check AI connection status and the project-local `.codex/config.toml` or `.mcp.json`, then start a new session. If config exists but `serverReady` is false, the package install or built `dist/mcp.js` entry is missing. Intent Layer never edits global provider configuration.

## 14. The literal-text editor is missing or rejects the edit

- `text-not-literal`: the element does not contain exactly one JSX text child, or it contains an expression/nested element. That is a structural edit and remains read-only.
- `invalid-literal-text`: the new value is empty, over 500 characters, has outer whitespace or a line break, or contains `<>{}&`. Only one-line plain text that cannot alter JSX/entity semantics is accepted.
- `old-text-mismatch` or `source-hash-mismatch`: source changed after selection. Nothing is written; select the element again and create a new preview.

## 15. Grid layout appears as read-only

- `repeated-grid-binding`: multiple direct children, commonly from `.map()`, share one source id. Per-instance placement needs a prop or variant refactor, so use agent handoff.
- `cross-file-grid`: the parent and direct-child implementations live in different files. The first version limits grouped edits to one file to prevent partial apply.
- `dynamic-grid-classname`: a parent or child uses conditional `cn()`, a variable, `cva`, or a template expression. Use agent handoff unless it can safely become a static literal.
- `multiline-grid-classname` or `noncanonical-grid-classname`: the first version remains read-only so it does not normalize line breaks or unusual whitespace.
- `unbound-grid-child`: at least one direct DOM child has no source binding. Give that element a static className and select again.
- `repeated-grid-binding`, `cross-file-grid`, and `dynamic-grid-classname` are explicit support boundaries, not partial-success conditions. The tool never applies only a subset of children.
- `grid-placement-overflow`: start plus span exceeds the active column count. Select a range inside the placement strip.
- `grid-row-placement-overflow`: row start plus span exceeds the active row count. Change the row count or child row range.
- `unsupported-breakpoint`: the project screen cannot be ordered as a numeric min-width. `raw`, max-only, CSS-variable, and dynamic-config screens are omitted from direct-edit tabs.
- `unsupported-grid-token`: an arbitrary template contains `minmax()`, a CSS variable, a named line, or a non-positive track. Ratio sliders currently edit only positive `fr` templates such as `grid-cols-[1.2fr_0.8fr]`.
- `planned-range-mismatch` or `source-hash-mismatch`: source changed after preview. The source-write count is zero; create a new preview.

## 16. Flex layout appears as read-only

- `repeated-flex-binding` or `unbound-flex-child`: direct children share a source id or have no binding. Per-instance placement requires a prop/variant refactor.
- `cross-file-flex`, `dynamic-flex-classname`, `multiline-flex-classname`, or `noncanonical-flex-classname`: the complete group cannot be validated as static single-line classNames in one file. The tool never applies only a subset.
- `not-static-flex`: the parent has no base `flex` or `inline-flex` token. A container that becomes Flex only at a responsive breakpoint is not directly composed yet.
- `unsupported-flex-token`: an axis-specific `gap-x`/`gap-y` or unknown justify/items/self utility prevents a safe effective-layout model.
- `invalid-flex-gap`: the requested gap is not a standard or statically parsed project candidate.
- The Flex composer does not expose `order` or DOM drag reordering. Changes that can diverge visual order from keyboard/screen-reader order require an agent-reviewed refactor.

## 17. An Agent task remains `claimed`

The legacy Markdown queue is disabled by default. If its HTTP route returns `legacy-agent-disabled` or 404, explicitly enable `Legacy agent queue (advanced compatibility)` in Settings. Prefer local MCP for normal Codex or Claude edits.

Return an abandoned provider task to the queue:

```bash
npm run intent:agent-queue -- --release --task .intent/agent/task_x.md
```

Prune old completed or failed artifacts explicitly:

```bash
npm run intent:agent-queue -- --prune-days 30
```

Prune removes only terminal tasks and preserves queued or running work.

## 18. Project color, spacing, or breakpoint candidates are missing

The candidate provider reads static objects from `tailwind.config.{js,ts,cjs,mjs,cts,mts}` and known CSS entry points such as `src/index.css`, `src/styles.css`, `src/globals.css`, and `app/globals.css`. It never executes config code. Function-computed themes, scales available only through imports, or CSS in another location may not become automatic candidates. Breakpoints are ordered only from numeric string/object `min` values and v4 `--breakpoint-*` lengths; `raw`, max-only, and `var()` values are omitted. Generic candidates remain available, and patch safety is unaffected.

## 19. Codex reads a selection from another browser tab

Each Vite session keeps its own selection, while `intent://selection/current` returns the most recent selection among live sessions. Check `sessionId`, `selectedAt`, `freshUntil`, and `route` in the resource. Re-selecting the element in the intended tab updates current. An expired selection must not be treated as confirmed context.

## 20. Vite repeatedly reloads when an `.intent` file changes

The current plugin excludes only `.intent/**` and `.intent-agent-queue.json*` under the resolved Vite project root. If reloads continue, first verify that the installed `intent-layer` package contains the latest build and fully restart the dev server. Existing user `server.watch.ignored` patterns should merge with these entries; if another plugin later replaces `ignored`, add the same root-anchored patterns there. Do not use a global `**/.intent/**`: it also ignores an entire test project located under `.intent/tmp`. Neither this watcher setting nor overlay instrumentation enters production builds.
