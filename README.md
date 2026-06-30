# INTENT_LAYER

Working product folder for the Intent Layer concept.

Current state:

> React/Vite/Tailwind click-to-patch spike with structured agent handoff/result artifacts.

Documents:

- `PRODUCT_PLAN_KR.md` - Korean detailed product plan
- `PRODUCT_PLAN_EN.md` - English detailed product plan
- `LAUNCH_MVP_KR.md` - Korean expanded launch MVP plan
- `LAUNCH_MVP_EN.md` - English expanded launch MVP plan
- `TECHNICAL_SPIKE_KR.md` - Korean technical spike notes
- `TECHNICAL_SPIKE_EN.md` - English technical spike notes
- `PERFORMANCE_EVALUATION_KR.md` - Korean numeric evaluation
- `PERFORMANCE_EVALUATION_EN.md` - English numeric evaluation
- `AGENTS.md` - instructions for AI coding agents working on this product
- `codex.md` - Codex-specific working notes and user preferences

Working definition:

> A deterministic intent layer and visual patch tool for AI-generated React/Tailwind frontends.

Expanded launch definition:

> Deterministic direct edits for simple UI changes, structured AI handoff tasks for complex changes, and intent diffs for human review.

## Spike Usage

Install dependencies:

```bash
npm install
```

Run the demo:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm run intent:check -- fixtures/corpus src/App.tsx
npm run eval
npm run build
```

Run the local CLI directly:

```bash
npm run intent:init
npm run intent:dev -- --dry-run
npx tsx src/intent/cli.ts --help
node bin/intent-layer.cjs --help
npm run intent:scan -- fixtures/corpus src/App.tsx
npx tsx src/intent/cli.ts check fixtures/corpus src/App.tsx --min-supported-direct 0.5
npx tsx src/intent/cli.ts scan fixtures/corpus src/App.tsx --write-graph
npx tsx src/intent/cli.ts apply --op .intent/operations/example.intent-op.json
npx tsx src/intent/cli.ts diff --diff .intent/diffs/example.intent-diff.yml
npx tsx src/intent/cli.ts agent-context ProductGrid
npx tsx src/intent/cli.ts agent-task --id <intent-id> --change "Describe the desired change"
npx tsx src/intent/cli.ts agent-result --id <intent-id> --task .intent/agent/task_x.md --summary "Describe the result"
```

Regenerate or inspect the committed AI corpus audit fixtures:

```bash
npm run generate:ai-corpus
npm run analyze:ai-corpus
```

Import and measure a local external corpus without committing third-party source:

```bash
npm run import:external-corpus -- <external-react-project-or-samples>
npm run analyze:external-corpus
```

External corpus copies are written under `.intent/external-corpus/`, and the numeric report is written to `reports/performance/external-corpus-audit.json`.

`npm run eval` also performs a package smoke test: `npm pack --dry-run`, real tarball creation, temp-folder `npm install`, installed `intent-layer --help`, installed `intent-layer-spike/vite` import, installed plugin transform/graph output against an external temp fixture, and a real Vite dev server HTTP smoke for `/src/App.tsx`, `/__intent/graph`, `/__intent/preview`, `/__intent/apply`, and a 3-file graph refresh after one TSX file changes.

The demo currently supports:

- React + Vite + Tailwind demo UI
- compile-time `data-intent-id` injection for intrinsic JSX elements with supported or read-only `className`
- low-level JSX/className scanner for the current MVP direct-edit path, with AST fallback for complex syntax
- source sidecar graph generation at `.intent/graph.intent.json`
- floating browser overlay
- patch preview before apply
- direct Tailwind token replacement for supported static tokens
- direct Tailwind token replacement for literal segments inside simple `cn()` / `clsx()` calls
- read-only bindings for unsupported `className` expressions so agent handoff still works
- minimal `intent-layer init` / `dev` / `scan` / `check` / `apply` / `diff` / `agent-context` / `agent-task` / `agent-result` CLI surface through `src/intent/cli.ts`
- installable `intent-layer` bin wrapper through `bin/intent-layer.cjs`, plus package `/vite` wrapper export, installed plugin transform smoke, installed Vite dev server preview/apply smoke, and installed multi-file graph refresh metrics in `reports/performance/spike-evaluation.json`
- Codex-generated 50-file React/Tailwind corpus audit for reproducible editable coverage measurement
- operation-log-backed undo stack and pending undo history display for applied patches
- pending undo discard and safe non-top revert controls for branch undo handling
- revert conflict artifact output at `.intent/conflicts/*.intent-conflict.json` when undo cannot safely restore the stored token
- undo conflict list and discard-pending-undo resolution flow in the overlay
- structured agent handoff task generation at `.intent/agent/task_*.md`
- structured agent result artifact generation at `.intent/agent/result_*.md`
- source hash validation before patching
- minimal `.intent/operations/*.intent-op.json` and `.intent/diffs/*.intent-diff.yml` output after patch apply
- source snapshot diff, component snapshot diff, selected `className` semantic token diff, and component-level `className` semantic token diff output for agent result review handoff
- related source snapshot/diff and semantic token diff output for variable-reference and object-property read-only handoff, including same-file declarations, imported variable declarations behind path aliases/barrels, simple `cn()` / `clsx()`, array, object-map, and template-literal declarations
- related dependency snapshot/diff and semantic token diff output for one-hop same-file and imported-source variables referenced by a variable-backed `className`
- workspace package import snapshot/diff output for variable-reference read-only handoff through local `package.json` workspaces and package `exports`
- local and one-hop relative imported variant/cva function declaration snapshot/diff output for variant-function read-only handoff
- tsconfig path alias plus one-hop and multi-hop named barrel re-export snapshot/diff output for variant-function read-only handoff
- component snapshot discovery fixture reporting for function, nested/map/conditional/fragment, arrow, memo, forwardRef, HOC, and namespace-object component patterns
- browser click-to-panel, preview, apply, and revert round-trip metric capture with desktop/mobile sample summaries at `/__intent/client-metrics`
- large TSX transform stress reporting for a generated 401-binding fixture
- product-sized Vite graph write throttling measurement for repeated 401-binding transforms
- external corpus import/analyze harness with local `.intent/external-corpus/` copies, manifest output, and coverage gates

The first evaluation result is stored in:

```text
reports/performance/corpus-audit.json
reports/performance/ai-corpus-audit.json
reports/performance/spike-evaluation.json
reports/performance/browser-click-metric.json
```

`reports/performance/external-corpus-audit.json` is generated when `npm run import:external-corpus -- <path>` or `npm run analyze:external-corpus` is run against local external samples.
