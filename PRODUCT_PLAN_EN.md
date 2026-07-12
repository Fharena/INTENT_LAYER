# INTENT_LAYER Product Plan

## 0. Document Info

- Working product name: `INTENT_LAYER`
- Document version: `0.1`
- Date: `2026-06-29`
- Primary audience: developers, vibe coders, and beginner frontend developers who use AI to generate UI code
- Initial supported stack: `React + Vite + Tailwind CSS + TypeScript`

### 0.1 Current Implementation Baseline (2026-07-12)

The current state is an **AI-native working alpha**, not a universal product. The browser GUI and local MCP share one `IntentService` for selection, TypeScript AST source binding, semantic Tailwind candidates, minimal range patches, and source-hash-guarded undo. The Markdown Agent queue is advanced compatibility rather than the default path.

Current implementation rules:

- JSX analysis uses one TypeScript AST path instead of parallel scanner and AST implementations.
- Intrinsic JSX and `React.createElement()` are supported, while ambiguous `cloneElement` provenance is not guessed.
- A token is editable only when it has more than one real candidate.
- AI clients cannot submit source offsets or raw patches; they request `intentId + semantic property + candidate value`.
- Apply validates an expiring preview, source hash, atomic file lock, and idempotency key.
- With a connected browser, Vite HMR is followed by rendered-instance class-token verification.
- Undo is latest-first rather than arbitrary branch undo.
- Applies and undos from separate MCP processes are serialized by a project operation lock, and the shared journal is published with atomic rename.
- Source-changing Vite HTTP requests require both a loopback connection and a session token.
- When no browser is connected, source verification does not make the overall runtime verify result successful.
- Vitest regression tests, GitHub Actions CI, and evaluation gates that exit 1 on failure define release readiness.
- npm tarballs ship built JavaScript under `dist/` instead of raw TypeScript execution.
- Active documentation is limited to four KR/EN pairs: README, PRODUCT_PLAN, DEMO_WALKTHROUGH, and FAILURE_MODES.

Later package structures and v1 ideas in this document are hypotheses, not claims about the current implementation.

## 1. One-line Definition

`INTENT_LAYER` is a deterministic UI actuator that lets people and AI clients share the same React/Tailwind source bindings and guarded patch engine.

Short version:

> Do not prompt the AI again for small UI tweaks. Click the UI, edit the intent, and apply a safe code patch.

Positioning phrase:

> DevTools for AI-made React UI.

## 2. Why This Should Exist

AI coding tools are good at generating large chunks of UI and logic. But day-to-day frontend work contains many small adjustments that are much faster for a human to perform directly than to describe in natural language.

Examples:

- Make card spacing slightly smaller
- Make the right panel wider
- Move a button below the content on mobile
- Decrease the heading size by one step
- Collapse repetitive `div` structures into meaningful UI sections
- Review AI-generated changes at the semantic level instead of line-by-line diffs

The current workflow is inefficient.

```text
Human: Reduce the card spacing a bit.
AI: Rewrites part of the component.
Human: Not that card, the lower one.
AI: Changes another className.
Human: Opens the code and checks again.
```

This loop is slow, non-deterministic, and unnecessarily expensive.

`INTENT_LAYER` solves this with a deterministic interaction loop:

```text
Click a UI element
→ map it to source code
→ show semantic properties
→ edit values directly
→ generate deterministic patch
→ reflect through HMR
→ review intent diff
```

## 3. What This Product Is Not

`INTENT_LAYER` is not:

- A mobile app framework
- An AI app builder like v0, Bolt, or Lovable
- A Figma replacement
- A Webflow-style no-code builder
- A universal reverse-engineering tool for all web apps
- An AI agent that is called for every small edit
- A framework that forces existing projects into a new DSL

The center of the product is not an AI model. The center is the **Intent Core**.

```text
AI = assistant and interpreter
Intent Core = deterministic mapping and patch engine
Human = reviewer and operator
```

## 4. Product Position

### 4.1 Short Position

> An Intent Inspector & Visual Patch Tool for AI-native frontend development.

### 4.2 Longer Position

AI-generated React/Tailwind code is hard to review only through raw line diffs. `INTENT_LAYER` introduces a structured intent document between the rendered UI and the source code, so humans can read and edit layout, style, structure, and behavior at a semantic level.

### 4.3 Framework, Tool, or Agent Plugin?

The first product shape should be a **toolchain**.

```text
Core: Intent Engine
Runtime: browser overlay + local server
Integration: Vite plugin
Distribution: CLI + optional editor extension
AI Integration: optional Codex/Cursor/Claude command plan / plugin
```

It should not start as a framework. A framework would require users to migrate their app structure, which raises adoption friction. This should attach to existing React/Tailwind projects.

Agent plugins matter, but they are distribution and integration layers. They are not the core product. Agents can consume the intent graph later.

## 5. Core Differentiation

Most competitors focus on one of these:

- AI UI generation
- visual style editing
- sending selected UI context to an AI agent
- React page building

`INTENT_LAYER` differentiates through:

```text
1. Source bindings and a semantic operation contract between code and screen
2. Deterministic patches without AI calls for every edit
3. Intent diffs instead of raw line diffs
4. Source-hash drift rejection and guarded undo
5. One patch engine shared by the human GUI and AI MCP clients
6. Explicit read-only and handoff boundaries for unsupported edits
```

The goal is a **guarded UI source actuator** shared by people and AI, not a generic visual editor.

## 6. Target Users

### 6.1 Primary Users

- People who frequently generate React UI with Cursor, Codex, Claude, v0, Lovable, or similar tools
- Developers who use Tailwind but dislike manually editing long className strings
- Vibe coders who can understand product-level intent but struggle with line-by-line review
- Beginner frontend developers who want to stay code-based but need safer visual controls
- Developers who want to review AI-generated frontend changes more efficiently

For this audience, the browser GUI should be the primary operating surface. CLI commands are supporting tools for install, diagnostics, repeatable evaluation, and automation.

First-run setup should also be GUI-first. After the Vite plugin is registered, the browser overlay handles language, `.intent` workspace creation, source-binding status, and project-local Codex/Claude MCP connections. Only providers explicitly enabled by the user are configured, and global configuration is never modified. Settings remains available after onboarding, while the old Agent queue and CLI-spawn controls live under collapsed advanced compatibility.

### 6.2 Secondary Users

- Frontend developers
- Designer-developers
- AI code review tool builders
- UI component library maintainers
- Design system teams

### 6.3 Non-targets for v1.0

- Pure designers
- No-code users
- Complex CSS-in-JS projects
- Large enterprise design systems
- Teams requiring immediate support for every frontend framework

## 7. v1.0 Product Scope

v1.0 should be small but shippable.

### 7.1 Support Contract And Verification Matrix

Support is reported at four evidence levels.

| Status | Meaning |
| --- | --- |
| Verified | Both automated regression coverage and a real browser flow exist. |
| Partial | A source fixture or parser test exists, but there is no complete install-to-browser proof. |
| Unverified | It may work structurally, but it is not a release contract. |
| Intentionally excluded | The case becomes read-only or an agent handoff because guessing would be unsafe or too broad. |

The verified environment on 2026-07-12 is Node.js 20/22, npm, pnpm 10.34.5, React 18.3.1/19.2.7, Vite 6.4.3/8.1.4, TypeScript 5.9.3, Tailwind CSS 3.4.19/4.3.2, and Playwright Chromium 149. Full verification ran on Windows, and GitHub Actions defines Ubuntu paths for Node.js 20/22. yarn/bun, Firefox/WebKit, and macOS are not official support yet.

Intent Layer does not reimplement React APIs or override Hooks. Its support unit is not an API name; it is **the source shape of intrinsic JSX that renders to browser DOM**. Hooks, Context, `memo`, `lazy`, and transition APIs in the [React API reference](https://react.dev/reference/react) pass through ordinary AST traversal when intrinsic JSX remains in project source. Class strings assembled only at runtime are not inferred.

| React source shape | Status | Behavior |
| --- | --- | --- |
| Intrinsic JSX with a static `className` in function/arrow components | Verified | DOM selection, source binding, token patch, HMR, and undo |
| Intrinsic JSX inside a class component's `render()` | Partial | Binding and component-name unit coverage exists; there is no browser E2E yet. |
| Fragments, conditionals, `map`, `forwardRef`, `Suspense` fallback, and JSX passed to portals | Partial | AST traversal unit coverage exists; portal and every wrapper do not yet have click E2E. |
| Intrinsic `createElement` through default, namespace, named, or aliased imports from `react` | Partial | Binding checks the module import name plus a literal tag and object props. Same-name shadowing in a nested scope is not yet verified. |
| String arguments and all-string conditional branches inside `cn()`/`clsx()` | Verified | Only literal ranges are editable, and the panel hides inactive branches absent from the clicked DOM class list. A React 19 `cn()` conditional has browser E2E; `clsx()` uses the same parser path and regression fixture. |
| Intrinsic elements inside a reused component implementation | Verified | The edit applies to every rendered instance sharing the source id and is labeled shared. |
| A custom or member-component call such as `<Button className=...>` or `<motion.div>` | Intentionally excluded | The tool does not guess that the prop reaches DOM; it binds to the intrinsic element in the implementation. |
| `cloneElement`, an unimported global `React.createElement`, or compiled `jsx/jsxs` calls | Intentionally excluded | Provenance or original source ranges are ambiguous. |
| React Server Components, server-only DOM, and React Native | Unverified | They are outside the current Vite browser-DOM adapter. |

The plugin uses the `apply: "serve"` boundary from the [Vite plugin contract](https://vite.dev/guide/api-plugin). Instrumentation and the overlay run only in the dev server, and a separate gate asserts zero forbidden markers in production bundles. MagicString range insertion returns a map containing the original TSX `sourcesContent`; browser E2E verifies that Vite and React compose later transforms back to that source. `.intent/**` and the queue signal are excluded from Vite watching so graph and operation writes cannot trigger reload loops.

Static Tailwind CSS 3 configuration and standard utilities are verified. A React 19/Vite 8 browser fixture verifies Tailwind CSS 4.3.2 [`@theme` variables](https://tailwindcss.com/docs/theme), `@tailwindcss/vite` development and production builds, project color candidates, HMR patching, and undo. The product never executes config code or guesses arbitrary plugin-utility semantics.

### 7.2 Direct-Edit Contract

Current direct edits cover:

- spacing: padding, margin, gap, and valid negative margins
- sizing: width, height, min/max, and size
- layout: display, numeric grid columns/column start/span, flex direction/wrap/value, align/justify/content/self
- typography: font size, font weight, and line height
- color: known palettes and static project tokens for background, text, border, divide, ring/outline/decoration/accent/caret/fill/stroke/shadow colors
- shape/effects: border radius, shadow size, opacity, ring width, and transition kind
- variants: single-token replacement while preserving existing responsive, state, or arbitrary-variant prefixes

The Grid Layout Composer is narrower than the general token dropdown. It requires one TSX file, static single-line `className` values, an existing `grid` parent and bound direct children, base/sm/md/lg, 1-12 tracks, numeric `grid-cols`/`col-start`/`col-span`, or a simple positive `fr` template.

Current read-only or handoff cases:

- runtime variables, property access, template expressions, object-form `clsx`, and `cva`/variant meaning
- custom breakpoints and xl/2xl Grid editing, grid rows/row spans, ordering/reordering, and a Flex composer
- compound arbitrary Grid templates containing `minmax()`, named lines, or CSS variables
- cross-file Grid children, per-instance layout for repeated source ids, and direct patches to external packages
- styled-components, Emotion, complete CSS cascade editing, and direct CSS Modules declaration editing
- a Next.js/RSC adapter, Figma import, and AI refactors presented as deterministic patches

### 7.3 Next Features And Cleanup Decisions

P0 stabilization is complete for production-instrumentation removal, React factory provenance, semantic flex candidate grouping, invalid negative-utility rejection, workspace-drive temp isolation, and removal of the stale raw-TypeScript bin.

P1 has completed runtime-active conditional filtering, DOM-only preview before source apply, color swatches, numerically ordered spacing steppers, Vite source maps and self-artifact watch exclusion, and npm/pnpm compatibility gates for React 19/Tailwind CSS 4/Vite 8. Remaining work proceeds in this order:

1. Measure time-to-first-success and patch quality against prompt-only work on real tasks from at least five independent repositories.
2. Read project breakpoints and add xl/2xl/custom breakpoint plus row/row-span Grid editing.
3. Validate a Flex Layout Composer under the same grouped-patch safety contract.
4. Validate yarn or bun installation only after real user demand is observed.

Cleanup rules:

- Freeze the default-disabled legacy Markdown Agent queue. Add no analyzer, CLI, or UI beyond regression fixes; without usage evidence, extract it to a compatibility package or remove it before v1.
- Persistent `.intent/components/*.intent.yml`, a confidence model, and AI semantic labels are not v1 release gates because they do not currently improve direct-edit value. Resume only if independent A/B evidence shows a need.
- Corpus coverage measures parser surface, not product success. Update generated JSON reports and do not add benchmark prose documents.
- Do not begin Next.js, a VS Code extension, Figma, or another styling adapter before the React/Vite/Tailwind compatibility matrix and real-user A/B pass.

## 8. User Experience

### 8.1 Installation

```bash
npm install -D intent-layer
npx intent-layer init
npm run dev
```

`init` combines workspace creation with a static Vite-config AST patch. Existing setup remains unchanged, and dynamic plugin expressions are rejected without touching the file. The package surface is verified through built `dist/cli.js` and the `intent-layer/vite` export. `npm run eval` gates tarball creation and temporary installation, the installed CLI and Vite plugin, real Vite graph/preview/apply/revert HTTP flows, multi-file graph refresh, and missing-plugin doctor guidance. Detailed numbers live only in `reports/performance/spike-evaluation.json`, and any failed gate exits with code 1.

### 8.2 Basic Flow

```text
1. User runs a React/Vite/Tailwind app
2. Intent Layer button appears in the browser
3. User enters selection mode
4. User clicks an element
5. Panel shows:
   - component name
   - source file
   - source hash and className binding kind
   - editable layout/style properties
   - shared render count and unsupported reason
6. User edits padding/gap/color/etc.
7. Patch preview is shown
8. User clicks Apply
9. Code patch is written
10. Vite HMR updates the UI
11. Intent diff records the semantic change
```

### 8.3 Example

Original code:

```tsx
<div className="grid grid-cols-3 gap-4 p-6">
  {products.map(product => (
    <ProductCard product={product} />
  ))}
</div>
```

Panel:

```text
ProductGrid
src/components/ProductGrid.tsx

Layout
- columns: 3
- gap: 16px

Spacing
- padding: 24px
```

User edits:

```text
columns: 3 -> 2
gap: 16px -> 24px
```

Patch:

```tsx
<div className="grid grid-cols-2 gap-6 p-6">
```

Intent diff:

```yaml
changes:
  - target: ProductGrid.layout.columns
    label: Cards per row
    from: 3
    to: 2
  - target: ProductGrid.layout.gap
    label: Card gap
    from: 16px
    to: 24px
```

## 9. Current Intent Artifact Contract

The current product asset is not a large narrative document. It is a **verifiable source binding plus semantic operation contract**.

| Artifact | Current status | Role |
| --- | --- | --- |
| `.intent/graph.intent.json` | In use | Latest DOM-to-source binding graph published by Vite sessions |
| `.intent/operations/*.intent-op.json` | In use | Original text, post-apply hash, ranges, and state required for apply/undo |
| `.intent/diffs/*.intent-diff.yml` | In use | Human-readable semantic change summary |
| `.intent/components/*.intent.yml` | Reserved; not generated | Resume only if independent A/B proves durable component intent is useful |
| `.intent/schema/` | Setup asset | Workspace version and current artifact format checks |

Neither an AI client nor the browser may submit arbitrary source paths or offsets for a direct patch. The server resolves the binding again from the current graph using element id and semantic property, checks that the path stays inside the project root, and validates source hash plus original text at preview, apply, and undo.

Fields such as `purpose`, `origin`, and numeric `confidence` are not implemented facts. Reintroducing them requires a regression-tested user decision or safety boundary that they measurably improve. Current safety is expressed with `editable`, a concrete `unsupportedReason`, stale hashes, and runtime verification state instead of an ambiguous score.

## 10. Internal Architecture

### 10.1 Current Alpha Structure

```text
src/intent/
  types.ts           domain contracts
  instrument.ts      TypeScript AST source binding
  tailwind.ts        token and semantic-property adapter
  graphStore.ts      graph revision, publish, and reload
  intentService.ts   shared GUI/HTTP/MCP use cases
  patch.ts           preview, apply, operation log, guarded undo
  fileLock.ts        per-source atomic lock
  runtimeSession.ts  selection and live Vite session
  vitePlugin.ts      transform, HTTP, and HMR adapter
  client.ts          browser overlay
  mcp/               stdio tools, resources, and client setup
```

The alpha stays in one package until a real external consumer needs independent versioning. Neither `vitePlugin.ts` nor MCP writes files directly; both call `IntentService`. Six MCP tools are exposed over local stdio only. Remote HTTP and OAuth servers are out of scope.

### 10.2 Dependency Principles

The service and patch core must not be tied to an AI provider or browser DOM.

```text
IntentService should not directly know Codex, Claude, or MCP transport details.
Vite, browser, Tailwind, and MCP adapters pass normalized data to the service.
```

Good separation:

```text
Core:
  IntentGraphStore
  IntentService
  SourceBinding / semantic property
  PatchOperation / ValidationResult

Adapters:
  TypeScript React AST
  Tailwind token semantics
  Vite HTTP/HMR and Browser DOM
  MCP stdio
```

## 11. Tracking and Performance Strategy

If this product slows down large projects, it fails.

Core principle:

> Do not understand the entire project continuously. Understand the visible and selected parts incrementally.

### 11.1 Minimal Instrumentation

Only inject a short id into the DOM.

```html
<div data-intent-id="a1b2c3">
```

Heavy metadata lives in a sidecar map.

```json
{
  "a1b2c3": {
    "file": "src/components/ProductGrid.tsx",
    "range": [120, 156],
    "component": "ProductGrid"
  }
}
```

### 11.2 On-demand AST Analysis

Do not parse every file all the time.

```text
Element clicked
→ intent id read
→ file/range lookup
→ parse only that file
→ analyze the surrounding JSX node
```

### 11.3 Tailwind Analysis Around Selection

Analyze only:

```text
selected node
parent 3 levels
some direct children
```

### 11.4 Performance Targets

```text
Vite transform overhead: under 5ms per file
element select -> panel display: under 100ms
simple patch write: under 50ms
HMR update: preserve existing Vite speed
installed Vite smoke HMR refresh: apply 51.556ms, 3-file change 118.416ms, smoke target <= 500ms
DOM id overhead: roughly under 20 bytes per node
sidecar graph write: only when the semantic fingerprint changes
external corpus validation: measure external source only through local `.intent/external-corpus/` copies and manifests, with `sample.sourceKind` and `mvpEvidence` separating smoke fixtures from independent external evidence
product-sized graph refresh: generated 24-file/624-binding fixture passes, but real external-project HMR still needs re-measurement
```

## 12. AI Usage Principles

An AI agent should not be called for every small edit.

Direct manipulation must be deterministic.

AI is useful for:

- initial intent labels and purpose descriptions
- explaining ambiguous structures
- suggesting complex refactors
- summarizing intent diffs
- inferring meaning from larger code changes
- letting agents consume the intent graph before making changes

AI should not be used for:

- padding/gap/color/radius direct edits
- simple Tailwind token replacement
- patch application
- undo/revert
- validation

Principle:

```text
AI interprets.
Intent Core operates.
Human approves.
```

## 13. Technical Difficulties

### 13.1 DOM to Source Mapping

The system must accurately map a clicked DOM element back to the JSX node that produced it. This requires Vite plugin instrumentation and AST source mapping.

### 13.2 Dynamic className

Code like this is hard:

```tsx
className={cn("grid gap-4", isActive && "bg-blue-500")}
```

v1.0 should support simple cases only. Ambiguous values should be read-only.

### 13.3 CSS Cascade

`getComputedStyle()` tells the final result, but not always the source cause. v1.0 should be Tailwind-token-first.

### 13.4 Patch Safety

Full-file rewrites are risky. Use minimal range-based patches.

### 13.5 Intent Drift

If intent documents drift away from source code, the product loses trust. `sourceHash`, `binding`, and `validation` are mandatory.

## 14. Competitive Differentiation

### 14.1 July 2026 Qualitative Demand Scan

This is directional evidence from public user reports and current product documentation, not a representative market survey.

- [A Lovable user described spending AI credits on one border-color change](https://www.reddit.com/r/lovable/comments/1uisn68/visual_edits_ugh/) as a reason to leave. Small visual edits should be instant and free of model usage.
- [Claude users are actively looking for a click-an-element-then-request-a-change workflow](https://www.reddit.com/r/ClaudeAI/comments/1tok0a8/visual_ui_editing_with_claude_click_element_in/). Exact selection context is the demand; screenshot narration is only a fallback.
- [Bolt users report that one requested fix breaks working behavior or rewrites whole files](https://www.reddit.com/r/boltnewbuilders/comments/1i7l1yo/i_really_like_boltnew_but_one_challenge_ive/). Minimal patches, preview, and undo are trust requirements rather than secondary features.
- Tools such as [react-rewrite](https://www.reddit.com/r/tailwindcss/comments/1smk5vu/i_built_a_visual_editor_overlay_for_react_that/) now write deterministic AST edits into real repositories. Source write-back alone is no longer unique; wrong-node prevention and setup friction are the competitive boundary.

The observed demand is therefore not for another AI generator. It is for **model-free micro-edits, exact element targeting, preservation of existing code, and local repository ownership**.

### 14.2 Current Competitive Map

| Product | Current center | Where INTENT_LAYER should not compete head-on |
| --- | --- | --- |
| [Onlook](https://www.onlook.com/for/react) | Broad designer-facing React canvas, AI generation, multiple styling systems | A complete design tool and infinite canvas |
| [Piny](https://getpiny.com/) | Tailwind visual controls and direct edits inside an IDE, including custom themes | Becoming a VS Code extension product |
| [stagewise](https://docs.stagewise.io/) | Full agentic IDE with browser, model execution, and diff review | A general IDE or model runtime |
| [Domscribe](https://www.domscribe.com/) | Build-time stable IDs and bidirectional source/live-DOM MCP context | Competing only on context lookup |
| [Impeccable Live](https://impeccable.style/docs/live/) | AI-generated design variants for one selected element | Competing on generative design quality |
| [react-rewrite](https://github.com/donghaxkim/react-rewrite) | Deterministic AST write-back plus drag, reorder, and text editing | Broad canvas manipulation |

Positions to avoid:

```text
another Tailwind visual editor
another AI app builder
another React page builder
```

Differentiated position:

```text
A provider-neutral deterministic UI operation layer shared by people and multiple AI clients.
Semantic property -> guarded preview -> minimal patch -> source/runtime verify -> undo as one contract.
```

### 14.3 Product Decisions From The Scan

Priorities:

1. Keep small direct edits such as spacing, color, and text local and free of model calls.
2. Treat zero wrong-node edits, zero full-file rewrites, and no false runtime success as product trust metrics.
3. Build an adapter that derives candidates from the project's Tailwind theme and CSS variables instead of expanding hard-coded palettes.
4. Limit the next direct-edit experiment to a `Grid Layout Composer` for existing CSS Grid. DOM reordering and dynamic repeated structures remain agent handoffs.
5. Measure time to first successful edit, retries, wrong-node events, and undo usage against prompt-only workflows on held-out repositories before broadening scope.

Not now:

- infinite canvas, freeform canvas, and sibling reorder. A constrained column-placement control for an existing CSS Grid is the exception.
- simultaneous Next.js and multi-framework expansion
- multiple AI-generated design variants
- a general agent IDE or proprietary model runtime

The legacy Agent queue and launch layer remains for alpha compatibility but is closed in default settings, element UI, and HTTP routes. Its pickup integrations open only after the advanced compatibility toggle is enabled. Evaluation uses a dedicated `.intent/tmp/evaluation-agent` store and cannot contaminate the real queue.

### 14.4 Verified Structural Changes And Residual Risks

- Selection is stored per Vite session and current selection records a `sessionId` with a 30-minute freshness deadline. Dead-process sessions are removed. The AI resource returns the newest active selection, but a user keeping multiple live tabs must still confirm which tab they intended.
- Graph publishing merges per-file ownership under an atomic lock. Fixtures cover two stores publishing different files and deleting one owned file. If two sessions open the same file at different source states, the latest source hash wins and patch validation rejects drift again.
- The candidate provider reads static objects from `tailwind.config.*` plus known CSS and Tailwind v4 `@theme` locations. It never executes config code and does not generalize dynamic imports, computed functions, or compound arbitrary values. Candidates are fetched on selection instead of being duplicated into the graph.
- `client.ts` and `cli.ts` are large, but file size alone does not justify a rewrite. Extract only request/render boundaries shared by Grid Composer, literal-text, or theme-adapter work.

### 14.5 Grid Layout Composer Design

#### Job to Be Done

When arranging asymmetric cards, users should not have to describe requests such as "put the second card at column four for five tracks, then make the third card fill the next row." They select each child's column range in the GUI and commit a small Tailwind patch.

This is not a general page builder. It reads an existing CSS Grid and deterministically edits only:

```text
parent: grid-cols-N or grid-cols-[1.2fr_0.8fr]
children: col-start-N, col-span-N
variants: base, sm, md, lg
```

#### UX Flow

1. The user selects a rendered grid parent.
2. The panel reconciles its real direct children with source bindings.
3. It shows breakpoint tabs and a column-count stepper, or track-ratio sliders for a simple fractional template.
4. The user selects a start and span on a 1-12 column placement strip for each child.
5. `Preview` shows affected source bindings and before/after className values.
6. `Apply` writes one grouped operation.
7. The existing `Undo` restores the entire group at once.

When one source binding renders more than once, the panel shows the source-scope impact count first. An instance-only result requires a prop or variant refactor and is not applied directly.

#### First Implementation Contract

Direct edit:

- a grid parent and every direct child have React/Vite `data-intent-id` bindings
- parent and child bindings live in one source file
- every participating `className` is a static string
- the parent has base `grid` and an effective 1-12 column count; absent base columns use CSS Grid's implicit one column
- one base/sm/md/lg breakpoint is edited at a time
- add, replace, or remove `grid-cols`, `col-start`, and `col-span` tokens
- edit a simple arbitrary template containing only positive `fr` tracks

Read-only or agent handoff:

- repeated direct-child source ids such as `.map()` output
- child component implementations in other files
- conditional `cn()`/`clsx()`, `cva`, variable references, or template expressions
- DOM reordering, row or absolute placement, masonry, or subgrid
- `minmax()`, CSS variables, line names, or arbitrary templates over 12 columns

#### Hard Problems and Decisions

**Atomicity across multiple source ranges**

Applying the parent and children separately can leave a half-edited layout. The first implementation accepts only bindings in one file, validates the full source hash and every original className, builds the complete result in memory, and writes the file once. Cross-file transactions require crash recovery and are intentionally deferred.

**Token insertion/removal and offset drift**

Single-token replacement cannot position a child that has no `col-start`. Each className literal becomes one minimal edit range, and the operation stores both its original and post-apply ranges. Apply processes original ranges in descending order; undo processes post-apply ranges in descending order.

**Reusable components versus runtime instances**

Three DOM children with one repeated source id cannot be positioned independently. Duplicate direct-child ids reject direct edit. Source-level edits that affect multiple renders expose their impact count.

**Responsive inheritance**

Without an `md:` token, base or sm values remain effective. Inspection separates explicit from effective values. Requests carry only properties the user changed, and `null` removes a token at that breakpoint. Otherwise the tool would accumulate redundant responsive classes.

**DOM layout versus source layout**

The browser sends only the selected parent id and ordered direct-child ids. The server resolves ids, files, class kinds, and tokens from the current graph. The browser never submits source offsets or raw patches.

#### Internal Data Flow

```text
selected grid DOM
  -> parent id + ordered direct-child ids
  -> server-side support inspection
  -> semantic layout request (breakpoint/start/span)
  -> guarded grouped className preview
  -> expiring preview id
  -> operation lock + file lock + full validation
  -> one source write + intent-op + intent-diff
  -> graph refresh + HMR
  -> grouped undo
```

#### Validation Gates

- zero partial writes in supported fixtures
- zero source writes after injected stale hash or one className mismatch
- 100% byte-for-byte restoration after grouped undo
- zero incorrect direct edits for repeated-id and cross-file fixtures
- p95 preview under 20ms and apply under 50ms for 3-8 children
- at least 30% improvement in either time to first success or retry count against prompt-only held-out tasks

Do not add row placement, drag reordering, or cross-file transactions before these gates pass.

## 15. Productization Strategy

### 15.1 Release Shape

First release:

```text
npm package
Vite plugin
browser overlay
local server
CLI
```

Later:

```text
VS Code/Cursor extension
Codex/Claude agent plugin
Next.js adapter
```

### 15.2 Pricing / Distribution Hypothesis

An open-source core with paid Pro features is a reasonable direction.

Open-source:

- Vite plugin
- Tailwind knobs
- browser overlay
- local patching

Possible paid features:

- AI intent labeling
- team intent review
- complex intent diff
- repo-wide semantic scan
- design system adapter
- CI intent regression report

For v1.0, adoption matters more than monetization.

## 16. Shippable v1.0 Checklist

Required:

- [x] React/Vite/Tailwind demo support
- [x] `data-intent-id` injection
- [x] source sidecar map generation
- [x] browser overlay
- [x] element selection
- [x] source lookup
- [x] Tailwind spacing/layout/color/radius parser
- [x] knob panel
- [x] range patch
- [x] undo/revert + pending history
- [x] intent diff
- [x] `.intent` folder creation
- [x] safe failure on patch errors
- [x] documentation and tutorial

## 17. Two-week Technical Spike

The fastest way to validate the product.

Goal:

```text
In a React/Vite/Tailwind page,
click a card,
edit gap/padding/radius in a panel,
update the TSX className,
and see the result through HMR.
```

Spike scope:

1. Write Vite plugin
2. Inject `data-intent-id` into JSX nodes
3. Generate sidecar map
4. Select element in overlay
5. Find literal className
6. Parse Tailwind tokens
7. Patch `gap-4 -> gap-6`
8. Print intent diff

Success criteria:

```text
Does it feel faster than asking AI to do the tweak?
Is the patch small and safe?
Can the architecture scale to large projects?
```

## 18. Roadmap

### v0.1 (complete)

- [x] Vite plugin
- [x] React TSX source mapping
- [x] Tailwind spacing knob
- [x] patch preview

### v0.2 (partial)

- [x] color/radius/typography
- Hold: resume component intent document storage only if independent A/B shows a need
- [x] intent diff
- [x] undo/revert

### v0.3 (partial)

- [x] simple `cn()`/`clsx()` support
- [x] responsive variants
- Hold: the confidence model is not a v1 release gate
- [x] selected component summary

### v0.4 (next validation)

- [x] provider-neutral local MCP
- [x] loopback/session-token HTTP boundary
- [x] multi-process operation journal
- [x] same-file static Grid Layout Composer plus simple fractional track controls
- [x] project Tailwind theme/CSS variable candidate adapter
- [ ] guarded literal text edit spike
- [x] session-scoped selection and multi-Vite graph merge fixture
- [ ] 20 held-out tasks against prompt-only workflows (`product-ab-evaluation.json`: collecting, 0 paired tasks)
- [x] opt-in legacy Agent HTTP/UI boundary and evaluator artifact isolation
- [x] Lumina Chromium setup/Grid/HMR/undo/mobile CI
- [x] dev-only instrumentation and a zero-marker production-bundle gate
- [x] import-provenance React `createElement` binding
- [x] runtime-active conditional-token filtering and DOM-only candidate preview
- [x] Vite transform source maps with original-TSX browser composition gate
- [x] React 19/Tailwind 4/Vite 8 npm compatibility fixture
- [x] pnpm 10.34.5 fresh-install fixture and external pnpm browser round trip

### v1.0

- stable Vite/React/Tailwind support
- documentation
- tutorial
- example project
- npm release
- early user feedback loop

### v1.1+

Start these only after independent A/B and the v1 compatibility gates pass.

- Next.js adapter
- VS Code extension
- AI semantic labeling
- agent plugin
- design system token integration

## 19. Success Metrics

Quantitative:

- element selection to panel display under 100ms
- simple patch success rate over 95%
- zero syntax errors after supported patches
- over 90% recognition for supported Tailwind classes
- HMR reflect time around 300ms or less, with installed smoke gate at <= 500ms

Qualitative:

- users feel they no longer need to prompt AI for tiny UI changes
- AI-generated UI review time decreases
- intent diff is easier to understand than line diff
- beginners spend less time searching through CSS/Tailwind files

## 20. Final Assessment

This is not a marketless idea. But if it becomes just a visual editor, it is late.

Conditions for survival:

```text
1. Make source bindings and the semantic operation contract the core product asset.
2. Use deterministic patches as the default path.
3. Use AI only as an assistant layer.
4. Start narrowly with React/Vite/Tailwind.
5. Position it as an AI code review/editing middle layer, not a generic visual editor.
```

Recommendation:

```text
Worth starting.
But run a two-week spike first.
If the spike does not feel clearly better than prompting AI for the same UI tweaks, stop.
```
