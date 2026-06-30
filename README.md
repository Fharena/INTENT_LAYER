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
npm run eval
npm run build
```

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
- undo for the last applied patch
- structured agent handoff task generation at `.intent/agent/task_*.md`
- structured agent result artifact generation at `.intent/agent/result_*.md`
- source hash validation before patching
- minimal `.intent/operations/*.intent-op.json` and `.intent/diffs/*.intent-diff.yml` output after patch apply
- source snapshot diff output for agent result review handoff
- browser click-to-panel, preview, apply, and revert round-trip metric capture with desktop/mobile sample summaries at `/__intent/client-metrics`
- large TSX transform stress reporting for a generated 401-binding fixture

The first evaluation result is stored in:

```text
reports/performance/corpus-audit.json
reports/performance/spike-evaluation.json
reports/performance/browser-click-metric.json
```
