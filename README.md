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

Node.js 20 or newer is required. Until `npm view intent-layer@alpha version` succeeds, verify installation through a local tarball:

```bash
npm pack
cd <target-vite-project>
npm install <intent-layer-tarball>
npx intent-layer init
npm run dev
```

After the first registry alpha is visible, replace the tarball with:

```bash
npm install -D intent-layer@alpha
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

External corpus percentages measure how many observed tokens receive a candidate from the current allowlist. They are not evidence of real edit success or patch quality. `npm run eval:product-ab` aggregates paired Intent Layer and prompt-only observations from independent users. [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json) is currently `collecting` with zero observations; no product-advantage claim is made before five participants, five repositories, twenty paired tasks (forty runs), and every independence gate pass.

The [external compatibility pilot](./reports/performance/external-compatibility-pilot.json) records 193 files, 1,706 bindings, 84.58% weighted direct-edit binding coverage, and one pnpm browser apply/undo round trip across five pinned public repositories. It was operated by the author and has no prompt-only pair, so it is excluded from independent A/B evidence. The pilot exposed a Vite runtime-artifact reload loop and stale pnpm local-package caching; both now have release gates.

## Independent User A/B Test

This study asks whether **Intent Layer gives a user a faster and more accurate first success on the same UI edit than prompt-only work**. Author-operated runs, synthetic agent runs, corpus coverage, and local benchmarks are not independent-user evidence.

### Minimum Sample And Independence Contract

- At least five anonymized participants who did not implement the product or author the solutions
- At least five distinct real React/Vite/Tailwind repositories
- Twenty tasks run once per condition, for forty runs total
- Different participants run the two conditions for one `repository + repositoryCommit + taskId` pair
- A participant never sees the same task twice, but performs both conditions on different tasks
- Each task pair uses the same `agentProfile`, which identifies the Codex/Claude client, model, and consequential settings

Twenty pairs are a minimum decision gate, not an automatic claim of statistical significance. Compare success and failure modes first, compare duration only among successful runs, and disclose the small-sample limitation with the result.

### 1. Prepare Participants And Tasks

1. Explain recording, collected fields, and anonymized storage, then obtain participant consent. Use IDs such as `P01` instead of names or email addresses.
2. Use only repositories for which testing is authorized. Replace private repository names with aliases such as `repo-01`, and never commit the raw observation file.
3. Limit each task to one visible change that can finish in 10-20 minutes. Example: "Reduce the spacing between the three pricing cards by one step without changing the mobile column count."
4. Before any run, freeze the base commit, route and starting state, allowed and forbidden files, time limit, exact verification command, and visible acceptance result.
5. Do not select only direct-edit-friendly work. Predeclare a mix of supported tasks, boundaries, and tasks likely to require agent fallback. Do not exclude a task after seeing a failure.
6. Keep a private assignment sheet with `pairId`, repository alias, commit, taskId, participant, condition, `agentProfile`, `runOrder`, time limit, and evaluator.

### 2. Define Conditions And Counterbalance

For `intent-layer`, finish installation and first-run setup **before the timer**, then allow the panel or local MCP. For `prompt-only`, disable the Intent Layer Vite plugin and MCP while keeping the same AI client/model and ordinary editing tools. If installation time is the question, measure it in a separate onboarding study rather than mixing it into recurring-edit value.

Randomize assignments before running anything. Give the two conditions for each task to different participants and balance each participant across A and B on different tasks. Do not swap conditions or replace a participant with a more experienced one after a failure.

For example, if P01 runs Intent Layer on T01, P02 runs prompt-only on T01. P01 later runs prompt-only on a **different** task such as T02. This reduces both answer-memory carryover and participant-skill bias.

For an initial five-person, twenty-task study, shuffle the task rows once and freeze the result. On zero-based row `i`, use participant number `(i mod 5) + 1` for Intent Layer and `((i + 1) mod 5) + 1` for prompt-only, mapping those numbers to `P01` through `P05`. Every participant then performs four runs per condition and every pair has different people. Calendar order may vary, but record each participant's chronological sequence from one in `runOrder` and never reshuffle after observing a failure.

### 3. Hold The Environment Constant

1. Start every run from a new clone or worktree at the same original commit and a fresh AI conversation. On Windows, keep scratch work on D, for example `D:\intent-layer-ab\<pair>-<condition>`.
2. Finish dependency installation, dev-server startup, route navigation, and initial application state before the timer in both conditions. Apply the same cache warm-up policy to both.
3. Record the common original source commit in `repositoryCommit`, not a condition-specific setup commit. Exclude Intent Layer installation files from the task diff and evaluation.
4. Give both conditions the same task wording, time limit, and acceptance criteria. Do not reveal a source location or solution hint to only one side.
5. Participants must not see another participant's screen, diff, or solution prompt. Anyone who has seen a task cannot run its opposite condition.

### 4. Define Timing And Counts

- `durationMs`: starts when the task is revealed and the participant makes the first selection or sends the first prompt; stops when verification passes and the participant declares completion. A timeout is `success: false` with duration set to the time limit.
- `success`: a condition-blind evaluator checks the final diff against the frozen verification. A failed check, forbidden-file edit, or missing requirement is failure even when the screen looks similar.
- `retryCount`: additional corrective prompts or apply attempts after the first solution attempt produced a wrong result. Exploration and the initial attempt do not count.
- `wrongTargetCount`: number of actual edits to the wrong component, binding, or file that had to be reverted or corrected. Hover and a DOM-only preview before apply do not count.
- `undoCount`: number of already-applied changes reverted through Intent Layer Undo, `git restore`, or a manual inverse edit.
- `unsupported`: set this to `true` on the Intent Layer observation when direct edit reaches an explicit boundary and agent fallback is used. Use `false` for prompt-only observations.

A screen recording or AI session export is optional. At minimum preserve start/end timestamps, base commit, final diff, verification output, and evaluator decision. Hide the condition from the evaluator and provide only anonymized artifacts.

### 5. Record Observations

The raw input is `reports/performance/product-ab-observations.jsonl`, one JSON object per line. It may contain private repository or participant information and is ignored by Git by default. Only the aggregate `product-ab-evaluation.json` belongs in the public repository.

This PowerShell example appends one run. `agentProfile` must be a stable label that can prove the client, model, and important settings match inside a pair.

```powershell
$observation = [ordered]@{
  version          = 2
  participantId    = "P01"
  runOrder          = 1
  agentProfile      = "codex-app:gpt-5-default-2026-07-13"
  taskId            = "T01-card-gap"
  repository        = "repo-01"
  repositoryCommit  = "0123456789abcdef"
  condition         = "intent-layer"
  success           = $true
  durationMs        = 184000
  retryCount        = 0
  wrongTargetCount  = 0
  undoCount         = 0
  unsupported       = $false
  evaluator         = "E01"
  recordedAt        = (Get-Date).ToUniversalTime().ToString("o")
}
$observation | ConvertTo-Json -Compress |
  Add-Content -Encoding utf8 reports/performance/product-ab-observations.jsonl
```

Append the opposite condition as a new line with its actual participant, `runOrder`, condition, and measurements. Never replace two runs with an average. If a row is wrong, correct it from the original evidence and log the reason in the private assignment sheet.

### 6. Aggregate And Decide

```bash
npm run eval:product-ab
```

The command validates JSONL and updates [product-ab-evaluation.json](./reports/performance/product-ab-evaluation.json). An invalid schema, duplicate task/condition, or duplicate `runOrder` for one participant fails with a line number or relevant key. An undersized or non-independent sample still aggregates successfully but remains `status: collecting` with `gates.complete: false`.

`complete` requires all of the following:

- At least five participants, five repositories, and twenty paired tasks
- Both conditions for every task
- Different participants inside each task pair
- Both conditions represented for every participant on different tasks
- At most one run of imbalance between conditions for each participant
- The same `agentProfile` inside each task pair

Interpret success rate and `intentOnlySuccessCount`/`promptOnlySuccessCount` first, then wrong-target and undo counts, retries, and median duration among successful runs. "At least 30% better time to first success or retry count" is a product hypothesis, not an automatic victory declaration. Review failure types, unsupported rate, and participant feedback before keeping, narrowing, or expanding scope.

## Release And Operator Checklist

The repository is currently a pre-registry alpha. Closed pilots may use a local tarball or GitHub source. A public npm release should begin under the `alpha` dist-tag. Do not advertise `latest` or a stable release until independent A/B and initial-user feedback pass.

### Owner-Only Actions

The repository agent cannot complete these decisions on the owner's behalf:

- Recruit independent participants, obtain consent, authorize private-repository use, and operate the A/B schedule
- Create and secure the npm account, verify email, enable 2FA, and choose final package ownership and name
- Approve and merge GitHub PRs and choose repository visibility, default branch, and protection rules
- Approve the first authenticated `npm publish` and make the GitHub Release public
- Decide privacy boundaries, support contact, whether alpha continues, and whether a version becomes `latest`

Codex can prepare a release branch, version diff, verification, tarball inspection, release-note draft, and fixes. The owner still confirms account security, participant consent, and every public release action.

### 1. One-Time Account And Repository Setup

1. Create an [npm](https://www.npmjs.com/) account, verify the email address, then run `npm login` and `npm profile enable-2fa auth-and-writes` to protect login and package writes. Never put recovery codes in the repository or a chat.
2. Confirm that `npm whoami` reports the intended owner. For an organization scope, also confirm publish permission in that organization.
3. Choose the final name. `npm view intent-layer name version` returning `E404` only means the name is unregistered at that instant; it does not reserve the name. Check again immediately before publishing.
4. Under GitHub repository `Settings > Rules > Rulesets`, create a branch ruleset targeting `main`. Require pull requests plus `Core / Node 20`, `Core / Node 22`, `Evaluation gates`, and `Browser / React compatibility`, and block force pushes. Review a separate `v*` tag ruleset so only the owner can create release tags. Follow GitHub's [ruleset rule reference](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), and enable Issues or another explicit feedback channel.
5. Manually review the MIT [LICENSE](./LICENSE), repository/bugs/homepage metadata, both READMEs, and the claimed support boundary.
6. Confirm that `.env` files, tokens, private keys, raw A/B JSONL, customer source, and `.intent/` runtime data enter neither the commit nor the package.

Use the official [npm public-package guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) and [GitHub Releases documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases/) as the current source of truth.

### 2. Build A Release Candidate

Never publish directly from a feature branch. Merge its PR into `main`, then create a release branch from current `main`.

```bash
git status --short
git switch main
git pull --ff-only
git switch -c release/v0.1.0-alpha.1
npm ci
npm run verify
npm audit --omit=dev
npm pack --dry-run --json
```

Do not stage personal IDE files or raw observation data shown by `git status`. Every verification command must exit zero. Read the dry-run file list and confirm that credentials, `.intent/`, fixtures, test output, and unexpected source maps are absent; the expected surface is built `dist/`, LICENSE, and user documentation.

The recommended first public version is `0.1.0-alpha.1`.

```bash
npm version 0.1.0-alpha.1 --no-git-tag-version
git diff -- package.json package-lock.json
git add package.json package-lock.json
git commit -m "chore: prepare v0.1.0-alpha.1"
git push -u origin release/v0.1.0-alpha.1
```

Merge only after the version PR's CI passes. A version published to npm cannot be reused, so fix a post-publish problem in `alpha.2` rather than attempting to overwrite `alpha.1`.

### 3. Publish The First npm Alpha

Re-run the complete check from current `main`:

```bash
git switch main
git pull --ff-only
git status --short
npm ci
npm run verify
npm pack --dry-run --json
npm login
npm whoami
npm publish --access public --tag alpha
```

Do not omit `--tag alpha`; npm otherwise applies its default `latest` tag. After success, verify the registry:

```bash
npm view intent-layer@0.1.0-alpha.1 name version dist.tarball
npm dist-tag ls intent-layer
```

The output should include `alpha: 0.1.0-alpha.1`. For an authentication failure, check account 2FA and package ownership, then use `npm view` to determine whether publish already succeeded before retrying. Never republish a successful version.

### 4. Run A Fresh Registry-Install Smoke Test

A source-workspace `file:` dependency or existing `node_modules` can hide a bad registry package. Install the **registry version** in a new React/Vite/Tailwind project on D:

```powershell
Set-Location D:\
npm create vite@latest intent-layer-registry-smoke -- --template react-ts
Set-Location D:\intent-layer-registry-smoke
npm install
npm install -D tailwindcss @tailwindcss/vite intent-layer@alpha
```

Add the Tailwind plugin to the new template's `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()]
});
```

Put `@import "tailwindcss";` at the top of `src/index.css`, then initialize and verify Intent Layer. Follow the [official Tailwind Vite guide](https://tailwindcss.com/docs/installation/using-vite) for the Tailwind portion.

```powershell
npx intent-layer init
npx intent-layer doctor
npm run build
npm run dev
```

Then verify all of these in the browser:

1. First-run setup appears and can switch to Korean.
2. One element completes selection, DOM-only candidate preview, source diff, apply, HMR, and undo.
3. Enabling Codex or Claude changes only project-local configuration, and a fresh AI session lists the MCP tools.
4. After stopping dev, `npm run build` succeeds and the production bundle contains neither the panel nor `data-intent-id`.
5. Removing and reinstalling the package followed by a dev-server restart preserves consistent setup and doctor guidance.

Do not create the GitHub Release after a failed smoke test. Fix the issue and publish a new prerelease version. For a broken alpha already in the registry, prefer `npm deprecate intent-layer@<version> "reason"` over deletion so existing installs receive a warning.

### 5. Tag And Create The GitHub Release

Tag the commit that produced the registry-smoked package:

```bash
git tag -a v0.1.0-alpha.1 -m "INTENT_LAYER v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
gh release create v0.1.0-alpha.1 --prerelease --generate-notes --title "INTENT_LAYER v0.1.0-alpha.1"
```

Without GitHub CLI, choose the same tag in the GitHub Releases UI and mark it as a pre-release. Release notes must include:

- The `npm install -D intent-layer@alpha` command
- React/Vite/Tailwind support matrix and minimum Node version
- The verified select -> preview -> apply -> verify -> undo flow
- Current read-only or unsupported boundaries such as dynamic className, cross-file layouts, and Next.js
- `npm run verify` result and known issues
- Issue/feedback link and alpha-data handling

### 6. Operate After The First Release

1. Confirm that the README registry command matches the real `alpha` dist-tag/version, updating Korean and English in one commit.
2. Ask the first five users whether installation completed, time to first selection, first patch success/failure, and the reason they stopped. Fix installation failures and wrong patches before adding feature requests.
3. Repeat `npm run verify`, dry-run package inspection, a fresh registry-install smoke, and prerelease notes for every release.
4. Do not run `npm dist-tag add intent-layer@<version> latest` before A/B `gates.complete` and initial-user feedback pass.
5. Even after they pass, promotion to `latest` remains an explicit owner decision after reviewing the report, known limitations, and rollback plan.

After the first manual publish is stable, prefer [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) over a long-lived npm token. Register the exact GitHub repository, publish workflow filename, and allowed action in npm package settings, then grant `id-token: write` to a GitHub-hosted runner. Under the current requirements, that publish job needs Node 22.14 or newer and npm 11.5.1 or newer; this is separate from the package's Node 20 runtime floor. This repository intentionally has no automatic publish workflow yet; add one only after package ownership and the first alpha are confirmed.

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
