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
1. A formal Intent Document format between code and meaning
2. Deterministic patches without AI calls for every edit
3. Intent diffs instead of raw line diffs
4. Confidence-based editability
5. Code/document drift detection
6. A foundation for agents to work with intent operations/tasks instead of raw code
7. External agent execution defaults to command planning; direct execution requires explicit opt-in
```

This is closer to a **Prisma-like middle layer for UI intent** than a simple visual editor.

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

### 7.1 Supported Stack

Official support:

```text
React
Vite
TypeScript / TSX
Tailwind CSS
literal className
simple cn()/clsx() cases
```

Limited support:

```text
shadcn/ui
CSS variables
simple CSS modules
same-file one-hop variable dependency handoff context
one-hop dependency handoff context inside imported variable declarations
named-import dependency handoff context inside related declarations
object-property className handoff context
workspace package import variable handoff context
external npm package import reference handoff context
local and one-hop relative-import variant/cva handoff context
tsconfig paths alias plus one-hop/multi-hop named barrel re-export variant/cva handoff context
tsconfig paths alias plus multi-hop barrel re-export imported variable handoff context
```

Not supported in v1.0:

```text
Full Next.js support
styled-components
Emotion
complete CSS cascade editing
full Tailwind arbitrary value support
complete dynamic className analysis
external npm package source analysis/direct patching, variant-function meaning, and arbitrary-depth cross-file/transitive variable data-flow variant graph analysis
Figma import
AI automatic refactoring
```

### 7.2 Supported Edits

v1.0 should do these very well:

```text
spacing:
  padding
  margin
  gap

layout:
  flex direction
  grid columns
  some width ratios
  some alignment values

typography:
  font size
  font weight
  line height

color:
  background color
  text color
  border color

shape:
  border radius
  border width

responsive:
  show sm/md/lg variants
  edit simple breakpoint-specific values
```

### 7.3 Core v1.0 Features

1. Browser overlay
2. Element selection
3. Source file/component mapping
4. Tailwind token to semantic knob conversion
5. Deterministic code patch from knob changes
6. Safe patch preview
7. Undo/revert
8. Intent diff
9. Confidence display
10. `.intent.yml` document generation and update

## 8. User Experience

### 8.1 Installation

```bash
npm install -D intent-layer
```

`vite.config.ts`:

```ts
import { intentLayer } from "intent-layer/vite"

export default {
  plugins: [intentLayer()]
}
```

Run:

```bash
npm run dev
npx intent-layer
```

The package surface is verified through built `dist/cli.js` and the `intent-layer/vite` export. `npm run eval` gates tarball creation and temporary installation, the installed CLI and Vite plugin, real Vite graph/preview/apply/revert HTTP flows, multi-file graph refresh, and missing-plugin doctor guidance. Detailed numbers live only in `reports/performance/spike-evaluation.json`, and any failed gate exits with code 1.

### 8.2 Basic Flow

```text
1. User runs a React/Vite/Tailwind app
2. Intent Layer button appears in the browser
3. User enters selection mode
4. User clicks an element
5. Panel shows:
   - component name
   - source file
   - role / inferred purpose
   - editable layout/style properties
   - confidence
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

## 9. Intent Document Format

The core asset of this product is a new document format.

Recommended extensions:

```text
*.intent.yml
*.intent-diff.yml
*.intent-op.json
```

Internal storage:

```text
.intent/
  graph.intent.json
  components/
    ProductGrid.intent.yml
    ProductCard.intent.yml
  operations/
    2026-06-29_001.intent-op.json
  diffs/
    last.intent-diff.yml
  schema/
    intent.schema.json
    intent-op.schema.json
    intent-diff.schema.json
```

### 9.1 Intent Document Example

```yaml
version: 0.1
kind: component-intent

component:
  id: cmp_product_grid
  name: ProductGrid
  source:
    file: src/components/ProductGrid.tsx
    export: ProductGrid
    range:
      start: 120
      end: 420

purpose:
  label: Product grid
  description: Displays a product array as repeated cards.
  confidence: 0.82
  origin: ai-assisted

structure:
  root:
    id: node_grid_root
    role: collection
    label: Product card list
    source:
      file: src/components/ProductGrid.tsx
      xid: x_8f31a
      range:
        start: 180
        end: 390
    repeat:
      sourceExpression: products
      itemName: product
    layout:
      type:
        value: grid
        confidence: 1.0
        binding:
          kind: tailwind-token
          token: grid
      columns:
        value: 3
        unit: count
        editable: true
        confidence: 1.0
        binding:
          kind: tailwind-token
          token: grid-cols-3
          range:
            start: 214
            end: 225
      gap:
        value: 16
        unit: px
        editable: true
        confidence: 1.0
        binding:
          kind: tailwind-token
          token: gap-4
          range:
            start: 226
            end: 231

validation:
  sourceHash: "fingerprint:..."
  generatedAt: "2026-06-29T00:00:00Z"
```

### 9.2 Key Fields

`binding`:

```text
The critical field that connects intent to source code.
Without binding, an intent item is just documentation and cannot be patched safely.
```

`confidence`:

```text
How confident the system is about the extraction.
Low-confidence properties should be read-only or AI-assisted.
```

`origin`:

```text
deterministic: extracted confidently from code
ai-assisted: inferred by AI
user-authored: confirmed or edited by a human
```

`sourceHash`:

```text
Used to detect drift between code and intent documents.
The MVP implementation uses a local deterministic source fingerprint,
which can be replaced with a cryptographic hash before distribution if needed.
```

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
4. Limit the next direct-edit experiment to guarded literal text. Structural or dynamic string changes remain agent handoffs.
5. Measure time to first successful edit, retries, wrong-node events, and undo usage against prompt-only workflows on held-out repositories before broadening scope.

Not now:

- infinite canvas, drag/drop, and sibling reorder
- simultaneous Next.js and multi-framework expansion
- multiple AI-generated design variants
- a general agent IDE or proprietary model runtime

Structurally, the roughly 3,700-line legacy Agent queue and launch layer should not remain exposed by the default product. Preserve alpha compatibility, then move its HTTP routes and bundle boundary into an opt-in adapter.

### 14.4 Remaining Structural Risks

- Selection is currently one project-wide file, so the latest selection from multiple browsers or routes overwrites the others. Formal multi-session support needs `sessionId`, freshness, and active-selection rules.
- Each Vite process publishes its complete in-memory graph. Two dev servers visiting different lazy routes can let the last writer remove bindings seen only by the other session; session graphs need a file-level merge fixture.
- Candidate lists in `tailwind.ts` are mostly static. Without reading the project theme, the product can steer users around their brand tokens, so a candidate-provider boundary should come first.
- `client.ts` and `cli.ts` are large, but file size alone does not justify a rewrite. Extract only the request/render boundaries touched by the literal-text or theme-adapter work.

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
- [ ] confidence display
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
- [ ] component intent document storage
- [x] intent diff
- [x] undo/revert

### v0.3 (partial)

- [x] simple `cn()`/`clsx()` support
- [x] responsive variants
- [ ] confidence model
- [x] selected component summary

### v0.4 (next validation)

- [x] provider-neutral local MCP
- [x] loopback/session-token HTTP boundary
- [x] multi-process operation journal
- [ ] project Tailwind theme/CSS variable candidate adapter
- [ ] guarded literal text edit spike
- [ ] session-scoped selection and multi-Vite graph merge fixture
- [ ] 20 held-out repository tasks against prompt-only workflows
- [ ] opt-in boundary for legacy Agent HTTP/CLI adapter

### v1.0

- stable Vite/React/Tailwind support
- documentation
- tutorial
- example project
- npm release
- early user feedback loop

### v1.1+

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
1. Make the Intent Document format the core product asset.
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
