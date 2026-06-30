# INTENT_LAYER Product Plan

## 0. Document Info

- Working product name: `INTENT_LAYER`
- Document version: `0.1`
- Date: `2026-06-29`
- Primary audience: developers, vibe coders, and beginner frontend developers who use AI to generate UI code
- Initial supported stack: `React + Vite + Tailwind CSS + TypeScript`

## 1. One-line Definition

`INTENT_LAYER` is a deterministic intent layer and visual patch tool that helps people inspect, understand, and safely edit AI-generated React/Tailwind UI through semantic controls.

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
AI Integration: optional Codex/Cursor/Claude plugin
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
6. A foundation for agents to work with intent operations instead of raw code
```

This is closer to a **Prisma-like middle layer for UI intent** than a simple visual editor.

## 6. Target Users

### 6.1 Primary Users

- People who frequently generate React UI with Cursor, Codex, Claude, v0, Lovable, or similar tools
- Developers who use Tailwind but dislike manually editing long className strings
- Vibe coders who can understand product-level intent but struggle with line-by-line review
- Beginner frontend developers who want to stay code-based but need safer visual controls
- Developers who want to review AI-generated frontend changes more efficiently

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
local and one-hop relative-import variant/cva handoff context
```

Not supported in v1.0:

```text
Full Next.js support
styled-components
Emotion
complete CSS cascade editing
full Tailwind arbitrary value support
complete dynamic className analysis
path-alias/barrel/package-import variant graph analysis
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

### 10.1 Package Structure

```text
packages/
  core/
    intent schema
    operation model
    diff model
    confidence model

  tailwind/
    token parser
    scale resolver
    token replacement

  react/
    JSX AST adapter
    component/source mapping

  vite/
    Vite plugin
    data-intent-id injection
    HMR integration

  server/
    local intent server
    source lookup
    patch apply
    cache

  overlay/
    browser overlay UI
    element picker
    knobs panel
    patch preview
    pending undo history

  cli/
    init
    dev
    scan
    diff
    check
```

The MVP implementation ships `init`/`scan`/`check`/`apply`/`diff`/`agent-context`/`agent-task`/`agent-result` first; `dev` can expand during launch polish.

### 10.2 Dependency Principles

`core` must not be tied to a specific framework.

```text
Core should not directly know React, Vite, Tailwind, or VS Code.
Adapters should normalize framework-specific data and pass it to core.
```

Good separation:

```text
Core:
  IntentNode
  IntentProperty
  SourceBinding
  PatchOperation
  ValidationResult

Adapters:
  React AST
  Tailwind tokens
  Vite HMR
  Browser DOM
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
DOM id overhead: roughly under 20 bytes per node
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

Adjacent products include:

- Onlook: visual editor for React apps
- Piny: visual React/Tailwind editing inside VS Code/Cursor
- Frontman: browser-based AI frontend agent
- stagewise: selected UI context for coding agents
- Plasmic/Puck: React visual builders
- v0/Bolt/Lovable/Replit: AI app/UI builders

Positions to avoid:

```text
another Tailwind visual editor
another AI app builder
another React page builder
```

Differentiated position:

```text
An intent layer for AI-generated frontend code.
It creates a human-reviewable semantic layer between raw className and line diffs.
```

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

- [ ] React/Vite/Tailwind demo support
- [ ] `data-intent-id` injection
- [ ] source sidecar map generation
- [ ] browser overlay
- [ ] element selection
- [ ] source lookup
- [ ] Tailwind spacing/layout/color/radius parser
- [ ] knob panel
- [ ] range patch
- [ ] undo/revert + pending history
- [ ] intent diff
- [ ] `.intent` folder creation
- [ ] confidence display
- [ ] safe failure on patch errors
- [ ] documentation and tutorial

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

### v0.1

- Vite plugin
- React TSX source mapping
- Tailwind spacing knob
- patch preview

### v0.2

- color/radius/typography
- intent document storage
- intent diff
- undo/revert

### v0.3

- simple `cn()`/`clsx()` support
- responsive variants
- confidence model
- selected component summary

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
- HMR reflect time around 300ms or less

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
