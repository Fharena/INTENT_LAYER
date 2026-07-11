# INTENT_LAYER

[한국어](./README_KR.md)

INTENT_LAYER is a developer tool for clicking a React/Tailwind element in the browser, inspecting its JSX source and Tailwind intent, and applying small deterministic edits.

The current product status is a **working alpha**. Humans use the browser panel while Codex and Claude use the same local MCP tools. Both paths share source binding, minimal patching, hash validation, and undo. This is not a universal editor for every React expression or Tailwind configuration.

## Core Flow

```text
Pick a rendered element
  -> inspect component, source file, and source hash
  -> choose an editable Tailwind token
  -> preview the diff
  -> apply a minimal range patch
  -> verify source and rendered output
  -> undo the latest patch
```

Simple token changes do not call an LLM. If the source hash or token range has drifted, the tool rejects the edit without touching the file.

## Five-Minute Start

Run the repository demo:

```bash
npm install
npm run dev
```

Open the Vite URL and use the Intent Layer panel:

1. Choose the language and panel position, then optionally connect Codex or Claude.
2. Finish setup.
3. Click `Pick`, then choose an element on the page.
4. Choose a token candidate, preview it, and apply it.
5. Use Undo if the result is not right.

When the selected element is inside CSS Grid, the nearest source-bound ancestor opens `Grid layout` automatically. Choose a breakpoint, drag each child's column range, preview the grouped diff, then apply or undo it as one operation.

Settings remain available from the panel. Enabling an AI connection merges only the Intent Layer entry into project-local `.codex/config.toml` or `.mcp.json`. Global settings are not modified.

## Install In Another Vite Project

Node.js 20 or newer is required. The package is not published to npm yet, so use a local tarball:

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

Direct edits currently target static JSX `className` values, string literals inside `cn()` or `clsx()`, and intrinsic `React.createElement()` calls.

- spacing: padding, margin, and gap across the standard Tailwind scale
- sizing: width, height, min/max, and size
- layout: display, grid columns, flex, alignment, justification, and numeric `col-start`/`col-span`
- radius and typography size, weight, and line height
- standard Tailwind color families and shades while preserving variants and opacity
- shadow, opacity, ring width, and transition

A token is not presented as editable when its only candidate is itself. Arbitrary values, CSS variables, `cva`, runtime variables, property access, and template expressions remain inspectable but are not patched directly.

The Grid Layout Composer directly edits only an existing grid and direct children with static `className` bindings in one TSX file. It can add, replace, or remove 1-12 track `grid-cols`, `col-start`, and `col-span` tokens at base/sm/md/lg. Repeated source ids, cross-file children, dynamic classNames, and DOM reordering safely remain read-only.

## Safety Model

- JSX is analyzed through one TypeScript AST path. JSX-looking strings and comments are ignored.
- `data-intent-id` exists only in Vite transform output and is never written to source.
- Apply validates both the binding source hash and original token.
- A file change between preview and apply is rejected again.
- Undo accepts only the **latest pending patch** with the expected post-apply source hash.
- Apply and undo from multiple Codex or Claude processes are serialized by a project operation lock, and the journal is written atomically.
- Drift creates a conflict artifact under `.intent/conflicts/` instead of modifying the file.
- Patches replace the original source range rather than regenerating a whole file.
- A grouped grid edit validates every original className and the complete source hash, then writes the same file once. Undo validates every post-apply range and restores the group byte for byte.
- Source-changing Vite HTTP requests require both a loopback connection and the overlay session token. A preview opened through a LAN address is readable but cannot edit source.

## Use From Codex Or Claude

After enabling a provider in Settings and starting a new Codex or Claude session, the client can use these local MCP tools:

- `intent_find_elements`, `intent_inspect_element`
- `intent_preview_edit`, `intent_apply_edit`
- `intent_verify_edit`, `intent_undo_edit`

The browser selection is exposed as `intent://selection/current`. AI clients submit semantic properties and candidate values, never source offsets or raw patches. Apply revalidates an expiring preview, source hash, file lock, and idempotency key. With a connected browser, verify also checks that every rendered source instance contains the new class token after HMR.

For `intent_verify_edit`, `runtime: unavailable` returns `ok: false` even when the source patch is intact. A disconnected browser is never reported as visual verification success.

Unsupported structural changes return `handoff-required` with an exact source pointer for normal agent editing. The Markdown queue remains available only as advanced compatibility.

Use the CLI only when checking the MCP server directly:

```bash
npm run build:package
node dist/cli.js mcp --root .
```

## Verification

Everyday checks:

```bash
npm run typecheck
npm run test
npm run build
npm run test:mcp-package
```

Full release check:

```bash
npm run eval
```

`npm run eval` covers tarball installation, installed CLI and Vite exports, real Vite HTTP preview/apply/revert, multi-file graph refresh, an eight-child grouped Grid apply/undo, external corpora, and performance gates. `test:mcp-package` starts the built stdio server with a real MCP client and checks all six tools. Any failed gate exits with code 1. Full evaluation results are written to [spike-evaluation.json](./reports/performance/spike-evaluation.json).

`npm run benchmark:mcp` records local mechanical latency for inspect, preview, apply, undo, and in-memory MCP calls in [mcp-alpha-evaluation.json](./reports/performance/mcp-alpha-evaluation.json). These numbers do not prove agent task success or product value.

The real browser-selection-to-stdio-MCP flow, including verification across three reused instances and undo, is recorded in [mcp-browser-roundtrip.json](./reports/performance/mcp-browser-roundtrip.json).

External corpus percentages measure how many observed tokens receive a candidate from the current allowlist. They are not evidence of real edit success or patch quality. The next product proof must measure first-edit success and time-to-result against prompting on held-out repositories.

## CLI

The GUI is the default. The CLI exists for diagnostics, CI, and recovery:

```bash
npm run intent:doctor
npm run intent:check -- fixtures/corpus src/App.tsx
npm run intent:scan -- fixtures/corpus src/App.tsx --write-graph
node dist/cli.js --help
```

The package ships built `dist/cli.js`, `dist/vite.js`, `dist/mcp.js`, and browser virtual-module bundles. Installed users do not execute raw TypeScript or depend on `tsx`.

## Documentation

- [PRODUCT_PLAN_EN.md](./PRODUCT_PLAN_EN.md): product scope and decisions
- [DEMO_WALKTHROUGH_EN.md](./DEMO_WALKTHROUGH_EN.md): reproducible demo
- [FAILURE_MODES_EN.md](./FAILURE_MODES_EN.md): failures and recovery
- Korean versions use `_KR.md`, with [README_KR.md](./README_KR.md) as the main entry point.

Historical spike, launch, and handoff notes remain available in Git history instead of being maintained as duplicate active documents.

## Out Of Scope

- a formal Next.js adapter
- automatic prop or variant refactors for one rendered instance
- direct edits through ambiguous `cloneElement` provenance
- styled-components, Emotion, or full CSS cascade editing
- automatic inference for arbitrary Tailwind themes
- direct edits to external packages or `node_modules`
- Figma import
- treating broad natural-language refactors as deterministic patches

Unsupported expressions degrade to read-only inspection or `handoff-required` instead of being edited with false confidence.

## License

[MIT](./LICENSE)
