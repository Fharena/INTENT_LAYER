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
- supported Tailwind token candidate selection
- source hash validation
- old token validation
- range patch apply
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

### 3.2 Range patch only

The spike does not regenerate source files from an AST.

Patch flow:

1. Look up the source binding by `intent id`.
2. Read the file from disk.
3. Compare the stored `sourceHash` with the current file hash.
4. Validate the old token at the stored token source range.
5. Replace only the exact token range.
6. Write minimal operation/diff artifacts.

If the source hash changed, the patch is rejected.
If the old token is missing, the patch is rejected.

## 4. Main Files

```text
vite.config.ts
src/App.tsx
src/intent/vitePlugin.ts
src/intent/instrument.ts
src/intent/patch.ts
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

- Patch support is limited to static `className`.
- `cn()` / `clsx()` patching is limited to string literal segments.
- `className={someVariable}` is read-only.
- Template literals are read-only.
- Variant functions and props forwarding are read-only.
- The current click-to-binding metric is only a graph lookup proxy, not a full browser click measurement.
- Warm transform meets the 5ms target, but cold first transform can exceed 5ms.
- Larger TSX files are not tested yet.

## 8. Next Work

Priority order:

1. Measure whether transform time stays under 5ms on larger TSX files.
2. Measure real browser click -> binding -> patch round trip time.
3. Measure real browser click-to-panel time.
4. Show read-only reasons clearly in the UI.
5. Expand fixtures to nested components, map rendering, conditional rendering, and fragments.
