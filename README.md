# INTENT_LAYER

[한국어](./README_KR.md)

INTENT_LAYER is a developer tool for clicking a React/Tailwind element in the browser, inspecting its JSX source and Tailwind intent, and applying small deterministic edits.

The current product status is a **working alpha**. Humans use the browser panel while Codex and Claude use the same local MCP tools. Both paths share source binding, minimal patching, hash validation, and undo. This is not a universal editor for every React expression or Tailwind configuration.

## Core Flow

```text
Pick a rendered element
  -> inspect component, source file, and source hash
  -> choose an editable Tailwind token
  -> try the candidate in the DOM only
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
4. Choose a token candidate to try it in the DOM. Reset it, or validate the source diff and apply it.
5. Use Undo if the result is not right.

A single-line plain JSX text child can be edited in the same panel. Text containing expressions, entities, or nested elements remains read-only because changing it can alter source semantics.

When the selected element is inside CSS Grid, the nearest source-bound ancestor opens `Grid layout` automatically. Choose a breakpoint and adjust columns, rows, and each child's placement before applying or undoing one grouped diff. When the nearest layout is Flex, `Flex layout` exposes direction, wrapping, main/cross-axis alignment, gap, and per-child `align-self`.

Settings remain available from the panel. Enabling an AI connection merges only the Intent Layer entry into project-local `.codex/config.toml` or `.mcp.json`. Global settings are not modified.

## Install In Another Vite Project

Node.js 20 or newer is required. The package is not published to npm yet, so use a local tarball:

```bash
npm pack
cd <target-vite-project>
npm install <intent-layer-tarball>
npx intent-layer init
npm run dev
```

`intent-layer init` creates the `.intent` workspace, parses the Vite config with the TypeScript AST, and minimally inserts `intentLayer()` before the React plugin. It leaves an existing setup unchanged. If `defineConfig` or the plugins array is dynamic, it returns an explicit failure without rewriting the file.

When no Vite config exists but `@vitejs/plugin-react` is installed, it creates a conventional `vite.config.ts`. Later configuration stays in the browser panel.

## Verified Compatibility

"Supported" below means there is an automated fixture or a real browser round trip as of 2026-07-12. It does not imply every release or API in a similarly named ecosystem works.

| Area | Currently verified | Not yet officially supported |
| --- | --- | --- |
| Runtime | Node.js 20/22 CI, local Windows Node.js 22.16, npm, a pinned pnpm 10.34.5 install/build gate, and one real pnpm browser round trip | Node.js 18 or older, yarn/bun install flows |
| React | React 18.3.1 and 19.2.7, intrinsic JSX, fragment/conditional/map traversal, `forwardRef`, JSX inside `Suspense`/portals, provenance-checked imported `createElement` | React Server Components, React Native, `cloneElement` source provenance |
| Vite | Vite 6.4.3 and 8.1.4 dev servers, HMR, source maps composed to original TSX, `.intent` runtime-artifact watch exclusion, static config setup, and a zero-production-instrumentation gate | SSR/library mode, automatic edits to dynamic configs |
| TypeScript | TypeScript 5.9.3 parser, TSX end-to-end flow, JSX/TSX instrumentation | Recovering source from compiled JSX runtime calls or arbitrary Babel/SWC output |
| Tailwind | Tailwind CSS 3.4.19 and 4.3.2 browser flows, static `tailwind.config.*`, v4 `@theme`, variant preservation, numerically ordered project breakpoints | Dynamic config execution, `raw`/max-only screen inheritance, and arbitrary plugin-utility semantics |
| Tailwind v4 | `@tailwindcss/vite` install, `@theme` color candidates, DOM preview, HMR patch, and exact undo | Inferring arbitrary utilities created by external plugins |
| Browser/OS | Playwright Chromium 149, local Windows, GitHub Actions Ubuntu path | Firefox, WebKit/Safari, macOS |

Intent Layer does not override React Hooks, Context, `memo`, or `lazy`. Code using those APIs follows the same AST path when intrinsic JSX and a supported `className` remain in project source; strings assembled only at runtime are not inferred. A custom component's `className` prop is not guessed to be a DOM node. The binding targets the intrinsic element in that component's rendered implementation instead.

## Direct-Edit Surface

Direct edits currently target static JSX `className` values, string literals inside `cn()` or `clsx()`, intrinsic `React.createElement()` calls, and one single-line literal text child on an intrinsic JSX element with a static binding.

- spacing: padding, margin, and gap across the standard Tailwind scale
- sizing: width, height, min/max, and size
- layout: display, grid columns/rows, flex, alignment, justification, and numeric `col-start`/`col-span`/`row-start`/`row-span`
- radius and typography size, weight, and line height
- standard Tailwind colors plus project `tailwind.config.*`, Tailwind v4 `@theme`, and conservatively identified CSS-variable candidates
- shadow, opacity, ring width, and transition

A token is not presented as editable when its only candidate is itself. Project themes are parsed statically rather than executed, and project candidates appear before the generic palette. Dynamic configs that cannot be resolved, `cva`, runtime variables, property access, and template expressions remain inspectable but are not patched directly.

For literal bindings inside `cn()` or `clsx()`, the panel compares candidates with the clicked DOM instance and hides tokens from inactive conditional branches. Choosing a candidate temporarily replaces matching rendered instances of the same source binding without touching source; reset restores the exact original `class` string when runtime has not drifted. Colors expose swatches, spacing exposes numerically ordered `-`/`+` controls, and source Apply remains locked until server-side diff preview succeeds.

The Grid Layout Composer directly edits only an existing grid and direct children with static `className` bindings in one TSX file. At default Tailwind breakpoints and statically parsed min-width project breakpoints, it can add, replace, or remove 1-12 `grid-cols`/`grid-rows`, `col-start`/`col-span`, and `row-start`/`row-span` tokens. Simple positive `fr` templates such as `grid-cols-[1.2fr_0.8fr]` expose track-ratio sliders.

The Flex Layout Composer uses the same one-file, static-className, unique-direct-child contract. It edits direction, wrapping, justification, alignment, project gap candidates, and child `align-self` on an existing base `flex`/`inline-flex` container. Repeated source ids, cross-file children, axis-specific `gap-x`/`gap-y`, unknown plugin tokens, and DOM reordering reject the whole direct edit rather than applying a partial result.

## Safety Model

- JSX is analyzed through one TypeScript AST path. JSX-looking strings and comments are ignored.
- `data-intent-id` and the overlay client exist only in Vite dev-server transforms and are written to neither source nor production bundles.
- Apply validates both the binding source hash and original token.
- A file change between preview and apply is rejected again.
- Undo accepts only the **latest pending patch** with the expected post-apply source hash.
- Apply and undo from multiple Codex or Claude processes are serialized by a project operation lock, and the journal is written atomically.
- Browser selections are stored per Vite session and expose a `sessionId` plus freshness deadline. Graph publishing replaces only files owned by that server and merges entries from other active Vite sessions.
- Drift creates a conflict artifact under `.intent/conflicts/` instead of modifying the file.
- Patches replace the original source range rather than regenerating a whole file.
- Grouped Grid and Flex edits validate every original className and the complete source hash, then write the same file once. Undo validates every post-apply range and restores the group byte for byte.
- Source-changing Vite HTTP requests require both a loopback connection and the overlay session token. A preview opened through a LAN address is readable but cannot edit source.

## Use From Codex Or Claude

After enabling a provider in Settings and starting a new Codex or Claude session, the client can use these local MCP tools:

- `intent_find_elements`, `intent_inspect_element`
- `intent_preview_edit`, `intent_apply_edit`
- `intent_verify_edit`, `intent_undo_edit`

The browser selection is exposed as `intent://selection/current`. AI clients submit semantic properties and candidate values, never source offsets or raw patches. `content.text` uses the same six MCP tools for the guarded literal-text subset above. Apply revalidates an expiring preview, source hash, file lock, and idempotency key. With a connected browser, verify also checks that every rendered source instance contains the new class token after HMR.

For `intent_verify_edit`, `runtime: unavailable` returns `ok: false` even when the source patch is intact, but it is not marked as an MCP tool execution error. This lets an agent handle successful source verification separately from missing visual evidence. Source drift and missing operations remain tool errors.

Unsupported structural changes return `handoff-required` with an exact source pointer for normal agent editing. The Markdown queue and its HTTP routes are off by default and open only after enabling the advanced compatibility toggle.

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
npm run test:e2e:install
npm run test:e2e
npm run build
npm run test:production-build
npm run test:mcp-package
```

Full release check:

```bash
npm run verify
```

`npm run verify` runs type checking, Vitest, package/demo builds, the production-bundle contamination gate, the installed-package MCP smoke test, Chromium E2E, a pinned pnpm install/build, evaluation gates, and product A/B aggregation. `npm run eval` covers tarball installation, installed CLI plus Vite exports/type declarations, real Vite HTTP preview/apply/revert, multi-file graph refresh, external corpora, and 62 performance and safety gates. Literal text, Grid, and Flex each currently complete 20/20 grouped round trips with zero partial writes; their local preview/apply p95 values are 2.474/3.663ms, 5.051/3.559ms, and 2.706/4.035ms respectively. These are mechanical local timings, not product-value A/B evidence.

`test:e2e` covers the React 18/Tailwind 3 Lumina site and the React 19/Tailwind 4 Modern fixture, including setup, selection, literal text, Grid rows/custom breakpoints, Flex, runtime branches, DOM preview, HMR, original-TSX source-map composition, byte-for-byte undo, and the mobile panel. The Modern fixture force-refreshes pnpm's local `file:` package copy before running, so stale `dist` cannot pass. Any failed gate exits with code 1. Full evaluation results are written to [spike-evaluation.json](./reports/performance/spike-evaluation.json).

OS temp files and Playwright browsers used by tests live under the repository's `.intent/tmp/`. On Windows the wrapper rejects a temp path on a different drive, so testing a D-drive workspace cannot silently fill the C drive again.

`npm run benchmark:mcp` records local mechanical latency for inspect, preview, apply, undo, and in-memory MCP calls in [mcp-alpha-evaluation.json](./reports/performance/mcp-alpha-evaluation.json). These numbers do not prove agent task success or product value.

The real browser-selection-to-stdio-MCP flow, including verification across three reused instances and undo, is recorded in [mcp-browser-roundtrip.json](./reports/performance/mcp-browser-roundtrip.json).

External corpus percentages measure how many observed tokens receive a candidate from the current allowlist. They are not evidence of real edit success or patch quality. `npm run eval:product-ab` aggregates paired Intent Layer and prompt-only observations from independent users. [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json) is currently `collecting` with zero observations; no product-advantage claim is made before five repositories and twenty paired tasks.

The [external compatibility pilot](./reports/performance/external-compatibility-pilot.json) records 193 files, 1,706 bindings, 84.58% weighted direct-edit binding coverage, and one pnpm browser apply/undo round trip across five pinned public repositories. It was operated by the author and has no prompt-only pair, so it is excluded from independent A/B evidence. The pilot exposed a Vite runtime-artifact reload loop and stale pnpm local-package caching; both now have release gates.

## CLI

The GUI is the default. The CLI exists for diagnostics, CI, and recovery:

```bash
npm run intent:doctor
npx intent-layer init
npm run intent:check -- fixtures/corpus src/App.tsx
npm run intent:scan -- fixtures/corpus src/App.tsx --write-graph
node dist/cli.js --help
```

The package ships built `dist/cli.js`, `dist/vite.js`, `dist/mcp.js`, an `intent-layer/vite` type declaration, and browser virtual-module bundles. Installed users do not execute raw TypeScript or depend on `tsx`.

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
- executing dynamic Tailwind configs or generally editing compound arbitrary values
- direct edits to external packages or `node_modules`
- Figma import
- treating broad natural-language refactors as deterministic patches

Unsupported expressions degrade to read-only inspection or `handoff-required` instead of being edited with false confidence.

## License

[MIT](./LICENSE)
