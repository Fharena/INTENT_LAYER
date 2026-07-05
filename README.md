# INTENT_LAYER

Working product folder for the Intent Layer concept.

Current state:

> React/Vite/Tailwind click-to-patch spike with structured agent handoff/result artifacts, a shared Agent queue, automated Codex skill/Claude hook setup, and Codex/Claude launch plan compatibility.

Documents:

- `README_KR.md` - Korean README
- `PRODUCT_PLAN_KR.md` - Korean detailed product plan
- `PRODUCT_PLAN_EN.md` - English detailed product plan
- `LAUNCH_MVP_KR.md` - Korean expanded launch MVP plan
- `LAUNCH_MVP_EN.md` - English expanded launch MVP plan
- `TECHNICAL_SPIKE_KR.md` - Korean technical spike notes
- `TECHNICAL_SPIKE_EN.md` - English technical spike notes
- `PERFORMANCE_EVALUATION_KR.md` - Korean numeric evaluation
- `PERFORMANCE_EVALUATION_EN.md` - English numeric evaluation
- `DEMO_WALKTHROUGH_KR.md` - Korean MVP demo walkthrough
- `DEMO_WALKTHROUGH_EN.md` - English MVP demo walkthrough
- `INSTALL_KR.md` - Korean install guide
- `INSTALL_EN.md` - English install guide
- `ONBOARDING_KR.md` - Korean GUI-first onboarding flow
- `ONBOARDING_EN.md` - English GUI-first onboarding flow
- `FAILURE_MODES_KR.md` - Korean failure mode guide
- `FAILURE_MODES_EN.md` - English failure mode guide
- `MVP_HANDOFF_KR.md` - Korean MVP candidate status and handoff
- `MVP_HANDOFF_EN.md` - English MVP candidate status and handoff
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

First browser setup:

```text
Open the Vite dev URL -> Intent Layer setup -> choose language/panel/Agent queue settings -> Finish setup
```

The setup/settings view creates `.intent/` schema files, `.intent/settings.json`, `.intent-agent-queue.json`, the Codex project skill, and the Claude FileChanged hook from the browser panel. Users can reopen it later to change language, panel position/density, startup collapse, setup auto-open, Agent queue automation, and Codex/Claude command settings. CLI commands remain available for diagnostics and repeatable checks, but the intended day-to-day flow is GUI-first.

Run checks:

```bash
npm run typecheck
npm run intent:doctor
npm run intent:check -- fixtures/corpus src/App.tsx
npm run eval
npm run build
```

Run the local CLI directly:

```bash
npm run intent:init
npm run intent:doctor
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
npx tsx src/intent/cli.ts agent-queue
npx tsx src/intent/cli.ts agent-claim --provider codex --task .intent/agent/task_x.md
npx tsx src/intent/cli.ts agent-launch --provider codex --id <intent-id> --change "Describe the desired change"
npx tsx src/intent/cli.ts agent-launch --provider claude --task .intent/agent/task_x.md
npx tsx src/intent/cli.ts agent-result --id <intent-id> --task .intent/agent/task_x.md --summary "Describe the result"
```

Default Agent UX:

```text
Agent handoff -> Create task -> queued in .intent-agent-queue.json
Codex: installed project skill claims and processes queued tasks
Claude: when Claude Code is open, a FileChanged hook notices the queue signal
Completion: agent-result marks the task frontmatter done and releases the lock
```

Codex and Claude share the same task markdown, signal file, lock files, and status rules. If both react at once, only the provider that first creates `.intent/agent/locks/*.lock.json` should proceed.

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

External corpus copies are written under `.intent/external-corpus*/`, and numeric reports are written under `reports/performance/`. The reports record `sample.sourceKind`, `gateFailures`, read-only ratio, top unsupported reasons, and `mvpEvidence.usableAsMvpEvidence` so local smoke fixtures are not mistaken for independent external validation. They intentionally omit per-record external `className` source strings.

Current independent external baselines all clear the 50% MVP evidence gate:

| Project | Files | `className` count | Supported direct editable coverage |
| --- | ---: | ---: | ---: |
| `shadcn-ui/ui@dbf9c5e` | 100 | 915 | 77.50% |
| `sadmann7/skateshop@e954d54` | 100 | 866 | 79.46% |
| `mckaywrigley/chatbot-ui@81328b6` | 100 | 601 | 66.91% |

The current MVP decision has moved past token taxonomy breadth: direct-edit coverage, package smoke, graph refresh, and real browser click-to-patch QA all have numeric evidence. Remaining watch items are broader browser-environment repeats, packaging/demo cleanup, and strict revert latency under 50ms.

`npm run eval` also performs a package smoke test: `npm pack --dry-run`, real tarball creation, temp-folder `npm install`, installed `intent-layer --help`, installed `intent-layer/vite` import, installed plugin transform/graph output against an external temp fixture, and a real Vite dev server HTTP smoke for `/src/App.tsx`, `/__intent/graph`, `/__intent/setup`, `/__intent/agent-queue`, settings update persistence, `/__intent/preview`, `/__intent/apply`, `/__intent/revert-last`, apply/revert refresh, and a 3-file graph refresh after one TSX file changes. It also verifies setup-created Agent queue signal, Codex skill, Claude hook files, a missing-plugin `doctor` failure guidance fixture, generated product-sized graph refresh measurements for a 401-binding single-file throttle fixture, a 24-file/624-binding multi-file fixture, an external corpus import/report smoke marked as `local-smoke-fixture`, and dry-run Codex/Claude agent launch plans.

The demo currently supports:

- React + Vite + Tailwind demo UI
- compile-time `data-intent-id` injection for intrinsic JSX elements with supported or read-only `className`
- low-level JSX/className scanner for the current MVP direct-edit path, with AST fallback for complex syntax
- source sidecar graph generation at `.intent/graph.intent.json`
- floating browser overlay
- browser setup/settings view with Korean/English language selection, panel preferences, onboarding reset, and Agent queue/hook/command settings
- selected-element workflow rail for `Pick -> Inspect -> Edit -> Review`
- Intent map showing component, source hash, `className` mode, editable token count, and shared render count
- manual overlay minimize/expand control
- shared source scope display that outlines every rendered DOM instance with the same intent id
- patch preview before apply
- direct Tailwind token replacement for supported static tokens
- direct Tailwind token replacement for literal segments inside simple `cn()` / `clsx()` calls
- read-only bindings for unsupported `className` expressions so agent handoff still works
- minimal `intent-layer init` / `doctor` / `dev` / `scan` / `check` / `apply` / `diff` / `agent-context` / `agent-task` / `agent-result` CLI surface through `src/intent/cli.ts`
- installable `intent-layer` bin wrapper through `bin/intent-layer.cjs`, plus package `/vite` wrapper export, installed plugin transform smoke, installed Vite dev server preview/apply/revert smoke, apply/revert refresh timing, and installed multi-file graph refresh metrics in `reports/performance/spike-evaluation.json`
- packaged Korean/English onboarding, MVP walkthrough, install guides, and failure mode guides for local tarball setup, `intent-layer/vite` registration, `doctor`, safe patch rejection, read-only handoff, and external corpus evidence boundaries
- Codex-generated 50-file React/Tailwind corpus audit for reproducible editable coverage measurement
- operation-log-backed undo stack and pending undo history display for applied patches
- pending undo discard and safe non-top revert controls for branch undo handling
- revert conflict artifact output at `.intent/conflicts/*.intent-conflict.json` when undo cannot safely restore the stored token
- undo conflict list and discard-pending-undo resolution flow in the overlay
- structured agent handoff task generation at `.intent/agent/task_*.md`
- task frontmatter status plus shared queue signal at `.intent-agent-queue.json`
- auto-created Codex project skill at `.agents/skills/intent-layer-task-runner/SKILL.md`
- auto-configured Claude FileChanged hook in `.claude/settings.json`
- opt-in Codex/Claude launch planning from `.intent/agent/task_*.md`; direct spawn requires Agent run enabled in settings or `INTENT_LAYER_AGENT_RUN=1`
- structured agent result artifact generation at `.intent/agent/result_*.md`
- source hash validation before patching
- minimal `.intent/operations/*.intent-op.json` and `.intent/diffs/*.intent-diff.yml` output after patch apply
- source snapshot diff, component snapshot diff, selected `className` semantic token diff, and component-level `className` semantic token diff output for agent result review handoff
- related source snapshot/diff and semantic token diff output for variable-reference and object-property read-only handoff, including same-file declarations, imported variable declarations behind path aliases/barrels, simple `cn()` / `clsx()`, array, object-map, and template-literal declarations
- related dependency snapshot/diff and semantic token diff output for one-hop same-file, imported-source, and related-declaration named-import variables referenced by a variable-backed `className`
- workspace package import snapshot/diff output for variable-reference read-only handoff through local `package.json` workspaces and package `exports`
- external npm package import reference output for read-only handoff without patching `node_modules`
- local and one-hop relative imported variant/cva function declaration snapshot/diff output for variant-function read-only handoff
- tsconfig path alias plus one-hop and multi-hop named barrel re-export snapshot/diff output for variant-function read-only handoff
- component snapshot discovery fixture reporting for function, nested/map/conditional/fragment, arrow, memo, forwardRef, HOC, and namespace-object component patterns
- browser click-to-panel, preview, apply, and revert round-trip metric capture with desktop/mobile sample summaries at `/__intent/client-metrics`
- large TSX transform stress reporting for a generated 401-binding fixture
- product-sized Vite graph write throttling measurement for repeated 401-binding transforms
- product-sized multi-file Vite graph refresh measurement for 24 TSX files / 624 bindings with one changed file
- copied-file external corpus graph refresh measurement for 3 independent corpora / 24 files each
- external corpus import/analyze harness with local `.intent/external-corpus*/` copies, manifest output, and coverage gates
- independent external corpus baseline reports showing 77.50%, 79.46%, and 66.91% supported direct editable coverage against the current token taxonomy

The first evaluation result is stored in:

```text
reports/performance/corpus-audit.json
reports/performance/ai-corpus-audit.json
reports/performance/spike-evaluation.json
reports/performance/browser-click-metric.json
reports/performance/browser-runtime-availability.json
reports/performance/external-corpus-audit.json
reports/performance/external-corpus-skateshop-audit.json
reports/performance/external-corpus-chatbot-ui-audit.json
```

`reports/performance/external-corpus-audit.json` is regenerated when `npm run import:external-corpus -- <path>` or `npm run analyze:external-corpus` is run against local external samples.
