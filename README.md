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

## Detailed Usage

### 1. Confirm The Runtime

Intent Layer injects its panel and source bindings into the Vite **development server only**. Production builds contain neither the panel nor `data-intent-id` attributes.

1. Run `npm run dev` in the target project.
2. Open the terminal's `localhost` or `127.0.0.1` URL in a browser on the same computer.
3. Confirm that the `Intent Layer` panel appears at the edge of the page.
4. Select `Expand` if the panel is minimized.
5. Complete setup when the status says `Setup required`. A `Ready` status means element selection is available.

If the panel is absent, run `npx intent-layer doctor` and check the following:

- `vite.config.*` contains `intentLayer()` before the React plugin.
- Fully stop and restart the dev server after installing or updating the package.
- A LAN URL opened from another computer or phone is view-only; source mutations are rejected.
- Intent Layer uses a separate overlay root to avoid known dev-tool surfaces, but Vite remains the supported runtime.

### 2. Complete First-Run Setup

Choose these options inside the panel:

1. Select `Korean` or `English` under `Language`.
2. Choose left or right under `Panel position`.
3. Choose comfortable or compact under `Density`.
4. Enable `Start minimized` to begin collapsed after the next reload.
5. Keep `Open setup when needed` enabled to reopen setup when workspace state is missing.
6. Enable a provider under `AI connections` only when Codex or Claude will use this project.
7. Select `Complete setup`.

Completion creates `.intent/settings.json` and the required workspace. Expected status results are:

- `Workspace ready`: the `.intent/` workspace is usable.
- `Source bindings ready`: JSX/TSX modules transformed by Vite are present in the graph.
- `AI connection ready`: the selected project-local MCP entry and built server entry are available.

`Waiting for source bindings` is not necessarily an installation failure. Render the route being edited and select again. An unvisited lazy route has no graph entries until Vite transforms it.

### 3. Select An Element And Inspect Evidence

1. Select `Pick` at the top of the panel.
2. Click the actual UI to edit. The Intent Layer panel and known dev-tool surfaces are excluded.
3. Under `Selected source`, inspect the component, project-relative file, source hash, and class mode.
4. When `Shared source` appears, inspect how many rendered instances use the same JSX binding.
5. If the evidence is read-only, inspect the reason instead of attempting a direct apply.

Clicking a custom React component does not cause Intent Layer to guess that a prop is a DOM node. It resolves the rendered intrinsic JSX implementation such as a `div`, `button`, or `section`. When `.map()` renders one source node repeatedly, one source edit may affect every instance, so check the shared render count first.

For conditional literals in `cn()` or `clsx()`, the panel shows only tokens active on the clicked DOM instance. To edit another branch, move the application into that state, wait for it to render, and select the element again.

### 4. Edit A Tailwind Property

1. Find the property under `Direct edit`. Colors use swatches, spacing uses previous/next controls, and other properties use candidate options.
2. Choose a candidate. At this point only the **DOM preview** changes; the source file is untouched.
3. Use `Reset preview` or choose another candidate when the result is not right.
4. Select `Preview` on that property to create a source diff.
5. Review the old/new token, file, and source range.
6. Select `Apply`. The server revalidates the source hash and original token, then writes only the minimal range.
7. Check the page and status after HMR.
8. If the result is wrong, use `Undo` before making another source edit.

Choosing a candidate and creating a source preview are different operations. The first is temporary browser-only feedback; the second creates an expiring server patch that can be applied. `Apply` remains disabled until server preview succeeds.

### 5. Edit Literal Copy

`Text edit` appears when the selected intrinsic element has exactly one directly bound plain JSX text child.

1. Change the copy in the textarea.
2. Select `Preview text` to create the source diff.
3. Review the range and select `Apply text`.
4. Inspect the HMR result or restore it with `Undo`.

Empty text, more than 500 characters, outer whitespace, line breaks, `<>{}&`, expressions, entities, and nested elements are not direct-editable. A change that restructures icon and text children belongs in a normal Codex or Claude code task.

### 6. Edit A Grid Layout

You do not need to click a narrow empty area on the Grid parent. Selecting the Grid itself or an element inside it resolves the nearest supported Grid ancestor.

1. Select inside the Grid and confirm that `Grid layout` appears.
2. Choose `base`, `sm`, `md`, or a project breakpoint tab.
3. Change the parent's column and row counts.
4. Change each direct child's column/row start and span.
5. For a simple positive `fr` template, adjust track weights with the ratio control.
6. Inspect the small layout canvas.
7. Select `Preview layout` and review the complete grouped parent/child diff.
8. Select `Apply layout` and inspect HMR.
9. Use `Undo` to restore the entire group byte for byte when needed.

A responsive tab can have different explicit and inherited effective values. Removing an override makes that breakpoint inherit again. Removing the required base Grid column definition is rejected.

Repeated source ids, unbound direct DOM children, cross-file children, dynamic classNames, and complex templates using `minmax()`, CSS variables, or named lines make the whole Grid read-only rather than partially applied. Dragging or changing DOM order is not supported.

### 7. Edit A Flex Layout

1. Select an element inside an existing `flex` or `inline-flex` container.
2. Choose a breakpoint under `Flex layout`.
3. Choose direction and wrapping modes.
4. Choose main-axis alignment, cross-axis alignment, and gap.
5. Change `align-self` for any direct child that needs an override.
6. Inspect direction, wrap, alignment, and spacing on the Flex canvas.
7. Review every className change with `Preview layout`, then select `Apply layout`.
8. Use grouped `Undo` if the result is wrong.

The canvas first reads generated CSS utilities or project spacing variables. A custom utility not yet generated in the browser may have an approximate preview, so the grouped source diff remains authoritative. Axis-specific `gap-x`/`gap-y`, unknown plugin utilities, and DOM reordering are not direct-editable.

### 8. Understand Scope And Undo

A direct edit targets a **source binding**, not one DOM instance. If one component source renders three times, changing its class token affects all three instances. Check the panel's single/shared-source indicator before applying.

`Undo` targets the latest safe pending operation in the operation journal. If a person or another tool changes the file after apply, Intent Layer does not trust the stored offset. It preserves the file and writes an `Undo conflict` plus an artifact under `.intent/conflicts/`. Review current source, then either select again and make a new edit or explicitly discard only an operation that should no longer be undone.

### 9. Change Settings, Disconnect AI, Or Repeat Onboarding

Open `Settings` at the top of the panel; first-run setup does not need to be repeated for ordinary changes.

- Language, dock, density, and startup collapse apply immediately or on the next reload as indicated.
- Turning off a Codex/Claude toggle removes only the project-local MCP entry managed by Intent Layer. Other MCP settings remain intact.
- Start a new Codex/Claude session after enabling or disabling a connection.
- `Show onboarding again` reopens setup on the next run without deleting source or operations.
- `Legacy agent queue (advanced compatibility)` and `Enable Agent run` are unnecessary for normal MCP use. Leave them off without a specific compatibility need.

### 10. Update Or Reinstall A Local Tarball

Stop the target dev server before updating this alpha in another project.

```bash
cd <intent-layer-source>
npm pack

cd <target-vite-project>
npm install --force <absolute-path-to-intent-layer-tarball>
npx intent-layer init
npm run dev
```

Repeated `intent-layer init` calls do not insert a duplicate plugin. Reinstalling preserves `.intent/settings.json`, operation history, and provider choices. A pnpm local `file:` dependency may keep an older package copy, so run `pnpm install --force` before restarting the dev server.

For full removal, first disable Codex and Claude in Settings and save. Stop the dev server, remove the `intentLayer` import and `intentLayer()` entry from `vite.config.*`, then uninstall the package. Inspect `.intent/` before deleting it because it may contain undo, conflict, or evaluation records.

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
- `intent_inspect_layout`, `intent_preview_layout`
- `intent_preview_edit`, `intent_apply_edit`
- `intent_verify_edit`, `intent_undo_edit`

Connect and use a provider in this order:

1. Start the Vite dev server and open the route being edited.
2. Enable Codex or Claude under `Settings > AI connections` and save.
3. Confirm that an `intent-layer` entry was merged into `.codex/config.toml` for Codex or `.mcp.json` for Claude without replacing existing settings.
4. Close an already running AI session and start a **new session**. This alpha does not assume MCP hot reload inside an active session.
5. Select the element in the browser, then request the edit in normal language. The agent calls MCP tools when needed; users do not need to type tool names.
6. Review the preview diff. When the request says preview only, source must remain unchanged until approval.
7. Inspect verify output after apply, and request undo in the same conversation when necessary.

Example requests:

```text
Inspect the gap candidates for the card selected in the browser and preview value 6. Do not apply it yet.
Apply that preview and verify both source and runtime.
At md, change the selected Flex layout to a column with gap-6 and center only its first child. Show the grouped diff first.
Undo the last Intent Layer operation.
```

When the MCP client asks for approval before a source-changing tool, inspect the preview before approving it. The project operation lock serializes applies when Codex and Claude are both open, but avoid assigning the same element to both providers at once.

Property and literal-text edits use `find → inspect_element → preview_edit → apply → verify → optional undo`. For Grid or Flex, first select an element inside the target layout in the browser, then use `inspect_layout → preview_layout`; apply, verify, and undo reuse the same tools.

The browser selection is exposed as `intent://selection/current`, including the nearest Grid/Flex parent and source-bound direct-child scope. AI clients cannot submit source offsets, raw patches, or the layout parent and full child scope. The server resolves them from a selection made within the last 30 minutes, then rejects repeated parent instances, unbound or duplicate children, dynamic classNames, and cross-file participants. Apply revalidates the expiring preview, source hash, file lock, and idempotency key.

With a connected browser, a single class-token edit verifies every rendered source instance after HMR. On this path, `runtime: unavailable` returns `ok: false` even when source is intact, but is not an MCP execution error. Literal text and grouped Grid/Flex currently perform source verification only, so they may return `ok: true` with `runtime: unavailable`; that is not visual evidence. Source drift and missing operations remain tool errors.

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

`npm run verify` runs type checking, Vitest, package/demo builds, the production-bundle contamination gate, the installed-package MCP smoke test, Chromium E2E, a pinned pnpm install/build, evaluation gates, and product A/B aggregation. `npm run eval` covers tarball installation, installed CLI plus Vite exports/type declarations, real Vite HTTP preview/apply/revert, multi-file graph refresh, external corpora, and 62 performance and safety gates. Literal text, Grid, and Flex each currently complete 20/20 grouped round trips with zero partial writes and byte restoration 20/20. Current p95 and gate results are regenerated in [spike-evaluation.json](./reports/performance/spike-evaluation.json); local mechanical timing is not product-value A/B evidence.

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

- This README: the current user manual for installation, GUI editing, AI connections, settings, and updates
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
