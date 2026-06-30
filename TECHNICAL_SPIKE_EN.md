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
- undo for the last patch
- structured agent handoff task generation
- structured agent result artifact generation
- agent handoff source snapshots and result source diffs
- minimal intent operation/diff output
- corpus analysis script
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

1. The dev server keeps the last apply result in memory.
2. `/__intent/revert-last` checks whether `nextToken` still exists at the last patch range.
3. If it matches, the range is replaced with `oldToken`.
4. Revert operation/diff artifacts are written.

This is last-patch undo for the MVP.
Long undo stacks and cross-session undo are not implemented yet.

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
fixtures/corpus/*.tsx
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

`npm run eval` writes:

```text
reports/performance/corpus-audit.json
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
- Undo supports only the last patch.
- Restarting the dev server clears the in-memory undo state.
- Agent handoff records a selected source-window snapshot plus task/result markdown and intent diffs.
- Agent results record a before/after line diff for the selected source window, but they do not yet infer a full-file semantic diff automatically.
- The current click-to-binding metric is only a graph lookup proxy, not a full browser click measurement.
- Warm transform meets the 5ms target, but cold first transform can exceed 5ms.
- Larger TSX files are not tested yet.

## 8. Next Work

Priority order:

1. Measure whether transform time stays under 5ms on larger TSX files.
2. Measure real browser click -> binding -> patch round trip time.
3. Expand agent result source-window diffs into semantic intent diffs.
4. Design an undo stack and operation-log-backed revert.
5. Measure real browser click-to-panel time.
6. Connect read-only source diffs to a wider source window.
7. Expand fixtures to nested components, map rendering, conditional rendering, and fragments.

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
Intent Diff
```

At this stage, result recording is a deterministic audit log.
Task creation stores a selected source-window snapshot, and result recording compares it with the current source window to write a line diff.
It also rereads the source file to record `sourceHashChanged`.
It does not yet infer full-file semantic or component-level intent changes automatically.

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
