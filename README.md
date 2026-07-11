# INTENT_LAYER

[한국어](./README_KR.md)

INTENT_LAYER is a developer tool for clicking a React/Tailwind element in the browser, inspecting its JSX source and Tailwind intent, and applying small deterministic edits.

The current product status is a **working alpha**. The core path from selection to minimal patch and guarded undo works, but this is not a universal editor for every React expression or Tailwind configuration. Agent handoff is optional and has not yet proven the same product value as direct editing.

## Core Flow

```text
Pick a rendered element
  -> inspect component, source file, and source hash
  -> choose an editable Tailwind token
  -> preview the diff
  -> apply a minimal range patch
  -> undo the latest patch or create an Agent task
```

Simple token changes do not call an LLM. If the source hash or token range has drifted, the tool rejects the edit without touching the file.

## Five-Minute Start

Run the repository demo:

```bash
npm install
npm run dev
```

Open the Vite URL and use the Intent Layer panel:

1. Choose the language and panel position in first-run setup.
2. Finish setup.
3. Click `Pick`, then choose an element on the page.
4. Choose a token candidate, preview it, and apply it.
5. Use Undo if the result is not right.

Settings remain available from the panel. They cover Korean/English, left or right dock, density, startup collapse, Agent run permission, provider commands, and Codex/Claude integration.

## Install In Another Vite Project

The package is not published to npm yet, so use a local tarball:

```bash
npm pack
cd <target-vite-project>
npm install <intent-layer-tarball>
```

Register Intent Layer before the React plugin in `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { intentLayer } from "intent-layer/vite";

export default defineConfig({
  plugins: [intentLayer(), react()]
});
```

Then start the normal Vite dev server. A separate initialization command is not required.

## Direct-Edit Surface

Direct edits currently target static `className` values and string literals inside `cn()` or `clsx()`.

- spacing: padding, margin, and gap across the standard Tailwind scale
- sizing: width, height, min/max, and size
- layout: display, grid columns, flex, alignment, and justification
- radius and typography size, weight, and line height
- standard Tailwind color families and shades while preserving variants and opacity
- shadow, opacity, ring width, and transition

A token is not presented as editable when its only candidate is itself. Arbitrary values, CSS variables, `cva`, runtime variables, property access, and template expressions remain inspectable but are not patched directly.

## Safety Model

- JSX is analyzed through one TypeScript AST path. JSX-looking strings and comments are ignored.
- `data-intent-id` exists only in Vite transform output and is never written to source.
- Apply validates both the binding source hash and original token.
- A file change between preview and apply is rejected again.
- Undo accepts only the **latest pending patch** with the expected post-apply source hash.
- Drift creates a conflict artifact under `.intent/conflicts/` instead of modifying the file.
- Patches replace the original source range rather than regenerating a whole file.

## Agent Handoff

Unsupported edits can be written to `.intent/agent/task_*.md` with the selected element's source pointer and constraints. Codex and Claude share one queue and lock protocol, so only one provider can claim a task.

Task creation and automatic pickup are the default path. Spawning a local provider CLI is allowed only when Agent run is enabled in settings.

Use the CLI only for recovery and retention maintenance:

```bash
npm run intent:agent-queue -- --release --task .intent/agent/task_x.md
npm run intent:agent-queue -- --prune-days 30
```

Prune removes only old `done`, `failed`, or `cancelled` tasks. Queued and running work is preserved. The queue signal is written through a temp file and rename, and counts cover the full queue while the UI snapshot remains capped at 50 items.

## Verification

Everyday checks:

```bash
npm run typecheck
npm run test
npm run build
```

Full release check:

```bash
npm run eval
```

`npm run eval` covers tarball installation, installed CLI and Vite exports, real Vite HTTP preview/apply/revert, multi-file graph refresh, Agent queue behavior, external corpora, and performance gates. Any failed gate exits with code 1. Full results are written to [spike-evaluation.json](./reports/performance/spike-evaluation.json), while the terminal prints only the gate summary.

External corpus percentages measure how many observed tokens receive a candidate from the current allowlist. They are not evidence of real edit success or patch quality. The next product proof must measure first-edit success and time-to-result against prompting on held-out repositories.

## CLI

The GUI is the default. The CLI exists for diagnostics, CI, and recovery:

```bash
npm run intent:doctor
npm run intent:check -- fixtures/corpus src/App.tsx
npm run intent:scan -- fixtures/corpus src/App.tsx --write-graph
node dist/cli.js --help
```

The package ships built `dist/cli.js`, `dist/vite.js`, and browser virtual-module bundles. Installed users do not execute raw TypeScript or depend on `tsx`.

## Documentation

- [PRODUCT_PLAN_EN.md](./PRODUCT_PLAN_EN.md): product scope and decisions
- [DEMO_WALKTHROUGH_EN.md](./DEMO_WALKTHROUGH_EN.md): reproducible demo
- [FAILURE_MODES_EN.md](./FAILURE_MODES_EN.md): failures and recovery
- Korean versions use `_KR.md`, with [README_KR.md](./README_KR.md) as the main entry point.

Historical spike, launch, and handoff notes remain available in Git history instead of being maintained as duplicate active documents.

## Out Of Scope

- a formal Next.js adapter
- styled-components, Emotion, or full CSS cascade editing
- automatic inference for arbitrary Tailwind themes
- direct edits to external packages or `node_modules`
- Figma import
- treating broad natural-language refactors as deterministic patches

Unsupported expressions degrade to read-only inspection or Agent handoff instead of being edited with false confidence.

## License

[MIT](./LICENSE)
