# INTENT_LAYER Launch MVP Plan

## 0. Direction Shift

Instead of keeping the MVP extremely small, this plan assumes a faster AI-assisted implementation cycle and targets a larger shippable MVP.

Minimal MVP:

```text
Click React/Vite/Tailwind element
→ edit Tailwind token
→ patch code
→ show intent diff
```

Expanded launch MVP:

```text
AI-friendly intent layer for React/Vite/Tailwind
→ inspect and edit UI visually
→ generate intent documents
→ produce intent diffs
→ generate context for AI agents
→ hand unsupported edits to an agent pipeline
→ review and apply resulting patches
```

Core philosophy:

> Deterministic engine handles what it can. Unsupported or complex edits degrade gracefully into structured AI agent tasks.

## 1. One-line Launch MVP

> An AI-native frontend editing layer that lets users directly edit AI-generated React/Tailwind UI and hand off complex changes to Codex or another AI agent as intent-aware tasks.

## 2. Why a Larger MVP Makes Sense

The target user already uses AI-assisted development tools. Therefore the product can assume:

- users have access to Codex, Cursor, Claude, or similar coding agents
- users prefer intent summaries and semantic diffs before raw line diffs
- deterministic patches should be immediate
- complex or unsupported changes can be delegated to an AI agent
- agent handoff should use structured intent tasks, not vague natural-language prompts

The product should not choose between visual editing and AI agents.

Correct structure:

```text
deterministic intent core
+ AI agent handoff pipeline
```

## 3. v1.0 Launch Scope

### 3.1 Supported Stack

Official support:

```text
React
Vite
TypeScript / TSX
Tailwind CSS
literal className
simple cn()/clsx()
shadcn/ui common patterns
```

Beta support:

```text
Next.js App Router
CSS variables
simple CSS modules
component props mapped to style
```

Unsupported:

```text
styled-components
Emotion
complex CSS cascade editing
full design system inference
Figma import
arbitrary framework support
```

### 3.2 Deterministic Direct Edit

These should not require AI calls:

```text
padding
margin
gap
border radius
border width
background/text/border color
font size
font weight
line height
grid columns
flex direction
alignment
simple responsive variants
```

### 3.3 AI Handoff Edit

These should become structured agent tasks:

```text
layout restructuring
component extraction
repetitive structure cleanup
conditional rendering
empty/loading/error states
mobile-specific structure changes
complex cn()/clsx() cleanup
overly complex Tailwind class editing
design intent labeling
component purpose generation
```

### 3.4 Approval Model

AI handoff should not auto-apply.

```text
1. User selects or describes desired change
2. Intent Layer creates a structured agent task
3. Codex/AI proposes a patch
4. Intent Layer analyzes the patch
5. Intent diff is shown
6. User approves
7. Patch is applied
```

## 4. Product Modes

### 4.1 Inspect Mode

Click a UI element and inspect semantic/source binding.

Displays:

```text
component
source file
DOM path
JSX range
role
purpose
editable properties
confidence
stale/drift state
```

### 4.2 Direct Edit Mode

Edit confidently traced properties immediately.

Examples:

```text
gap-4 -> gap-6
grid-cols-3 -> grid-cols-2
rounded-lg -> rounded-xl
text-sm -> text-base
```

### 4.3 Intent Diff Mode

Review semantic changes instead of raw line diffs.

Example:

```yaml
changes:
  - target: ProductGrid.layout.columns
    from: 3
    to: 2
  - target: ProductCard.style.radius
    from: 8px
    to: 12px
```

### 4.4 Agent Handoff Mode

Delegate unsupported or complex edits to an AI agent.

Example:

```text
User wants to add an empty state to a product grid.
Intent Layer:
  - extracts current component intent
  - includes source bindings
  - expresses desired change as a structured operation
  - generates agent task markdown
Codex:
  - edits code
Intent Layer:
  - analyzes diff
  - generates intent diff
  - asks for approval
```

### 4.5 Agent Context Mode

Generate AI-ready context for the selected element/component.

Commands:

```bash
intent-layer agent-context ProductGrid
intent-layer agent-task --from-selection
```

Outputs:

```text
.intent/agent/ProductGrid.context.md
.intent/agent/task_2026-06-29_001.md
```

## 5. Markdown Docs for AI Agents

The product should generate documentation that agents can read.

### 5.1 Project-level Doc

```text
INTENT_LAYER.md
```

Purpose:

- explain the intent format
- list files agents may edit and should not edit
- explain deterministic-patch-first principle
- explain how intent documents should be updated
- list required validation commands

### 5.2 Task-level Doc

```text
.intent/agent/task_*.md
```

Example:

```md
# Intent Agent Task

## Goal

Add an empty state to `ProductGrid` while preserving the current grid layout intent.

## Selected Component

- Component: `ProductGrid`
- Source: `src/components/ProductGrid.tsx`
- Intent doc: `.intent/components/ProductGrid.intent.yml`

## Constraints

- Do not rewrite the whole component.
- Preserve existing Tailwind spacing tokens unless needed.
- Add an empty state when `products.length === 0`.
- Update the intent document if behavior changes.

## Required Checks

```bash
npm run typecheck
npm run lint
npx intent-layer check ProductGrid
```
```

### 5.3 Agent Result Doc

```text
.intent/agent/result_*.md
```

Includes:

```text
files changed
intent properties changed
confidence changes
checks run
known risks
```

## 6. Document Format

### 6.1 File Structure

```text
.intent/
  graph.intent.json
  components/
    ProductGrid.intent.yml
  operations/
    2026-06-29_001.intent-op.json
  diffs/
    2026-06-29_001.intent-diff.yml
  agent/
    ProductGrid.context.md
    task_2026-06-29_001.md
    result_2026-06-29_001.md
  schema/
    intent.schema.json
    intent-op.schema.json
    intent-diff.schema.json
```

### 6.2 Intent Document

Describes the current UI intent and source bindings.

### 6.3 Intent Operation

Records changes made by users or agents. Enables undo, replay, and audit.

### 6.4 Intent Diff

Shows semantic differences before and after a change.

### 6.5 Agent Task

A structured task document for edits that deterministic engine cannot perform.

## 7. Launch MVP Feature List

### 7.1 Core

- source id instrumentation
- source sidecar map
- intent graph
- source binding
- confidence model
- drift detection
- operation log
- intent diff

### 7.2 Tailwind Direct Edit

- spacing parser
- color parser
- layout parser
- typography parser
- responsive variant parser
- token replacement
- className order preservation
- patch preview
- undo/revert

### 7.3 Browser Overlay

- element picker
- selection outline
- component/source panel
- intent inspector
- direct edit controls
- pending undo history and branch undo controls
- confidence badge
- stale badge
- agent handoff button
- intent diff viewer

### 7.4 CLI

```bash
intent-layer init
intent-layer dev
intent-layer scan
intent-layer check
intent-layer diff
intent-layer agent-context
intent-layer agent-task
intent-layer agent-result
intent-layer apply
```

Currently implemented MVP CLI smoke surface:

```bash
intent-layer init
intent-layer dev
intent-layer scan
intent-layer check
intent-layer apply
intent-layer diff
intent-layer agent-context
intent-layer agent-task
intent-layer agent-result
```

`init` creates the base `.intent` folders and lightweight schema files.
`dev` starts the local Vite dev server at `127.0.0.1:5173` by default, with `--dry-run` support for command-plan verification.
`scan` emits JSON for JSX/TSX bindings, read-only reasons, editable token coverage, and transform time.
`check` applies minimal gates to the same result and returns a non-zero exit code when they fail.
`apply` runs a single Tailwind token replace from `.intent-op.json` through the existing safe patch engine.
`diff` summarizes `.intent-diff.yml` files as JSON for CLI/CI inspection.
`agent-context` summarizes repo/selected binding/supported and unsupported surfaces from `.intent/graph.intent.json` into AI-ready markdown.
`agent-task` takes a binding id from `.intent/graph.intent.json` plus a desired change and creates `.intent/agent/task_*.md`.
`agent-result` takes a task file, summary, changed files, and checks, then creates `.intent/agent/result_*.md` plus `.intent-diff.yml`.

The MVP validation scripts can import an external React/Tailwind corpus as local `.intent/external-corpus/` copies and write a manifest plus editable coverage gates to `reports/performance/external-corpus-audit.json`.

### 7.5 Agent Integration

Full built-in agent automation is not required for v1.0. The product should support:

```text
AI-ready markdown generation
task docs easy to paste into Codex/Cursor/Claude
agent result diff analysis
intent check
intent document update suggestions
```

## 8. AI Pipeline for Unsupported Features

The product should not hide unsupported edits.

Example:

```text
This edit is not supported by Direct Edit yet.
Create an AI handoff task?

[Create Agent Task]
```

The task includes:

```text
selected element
source file/range
related source snapshot for variable/variant handoff
related dependency snapshots for one-hop same-file, imported-source, and related-declaration named-import variable handoff
external import reference for external package handoff
current intent
desired change
constraints
required checks
patch style
```

For the MVP, related source snapshots cover same-file variable declarations, object-property className declarations, one-hop same-file and imported-source variable dependency snapshots, related-declaration named-import dependency snapshots, variable declarations behind workspace package imports, imported variable declarations behind tsconfig paths aliases plus multi-hop barrel re-exports, one-hop relative named imports, and `variant/cva` declarations behind tsconfig paths aliases plus one-hop/multi-hop named barrel re-exports.
External npm package imports use `External Import Reference` context instead of a source snapshot; tasks record package/import/usage/guidance details and forbid direct `node_modules` edits.
External npm package source analysis/direct patching, variant-function meaning analysis, and arbitrary-depth cross-file/transitive variable data flow remain explicit non-goals for handoff context.

This turns unsupported features into graceful agent-assisted workflows.

## 9. Performance and Overhead

Even with a larger MVP, performance rules remain strict.

```text
Always:
  - inject short data-intent-id
  - keep sidecar map

On selection:
  - parse selected file
  - analyze surrounding node

On demand:
  - generate intent summary
  - generate AI handoff task
  - repo-wide scan
```

Targets:

```text
element select -> panel: <100ms
direct patch apply: <50ms
intent diff small change: <1s
Vite transform overhead: <5ms/file target
sidecar graph write: only when the semantic fingerprint changes
```

## 10. Build Order

### Phase 1: Core Loop

1. Vite plugin
2. `data-intent-id`
3. sidecar source map
4. browser overlay
5. click -> source lookup
6. Tailwind spacing patch

### Phase 2: Product Loop

1. direct edit panel
2. patch preview
3. undo/revert
4. `.intent` folder
5. intent op
6. intent diff

### Phase 3: AI-native Loop

1. `INTENT_LAYER.md`
2. agent context generation
3. agent task markdown generation
4. result diff analyzer
5. intent check command

### Phase 4: Launch Polish

1. demo project
2. docs
3. landing README
4. install guide: local tarball install, `/vite` wrapper export smoke, installed plugin transform/graph smoke, and real Vite dev server HTTP preview/apply plus 3-file graph refresh smoke are implemented; public package name/copy remains
5. failure mode guide
6. examples for Codex/Cursor

## 11. Launch Criteria

The product is launchable when:

```text
1. direct edits work reliably on the supported stack
2. patch failure never corrupts code
3. intent diff is clearer than line diff
4. AI handoff task is genuinely useful in Codex
5. users no longer need to prompt AI for tiny UI edits
```

## 12. Key Demos

### Demo 1: Direct edit

```text
AI-generated product grid
→ click card
→ edit columns/gap/radius
→ code patch
→ HMR update
→ intent diff
```

### Demo 2: Agent handoff

```text
select product grid
→ request empty state
→ generate agent task
→ Codex implements
→ Intent Layer analyzes diff
→ user approves
```

### Demo 3: AI-friendly docs

```text
Codex reads INTENT_LAYER.md and ProductGrid.intent.yml
and edits with awareness of intent, not only raw code.
```

## 13. Final Product Impression

The launch MVP should feel like this:

```text
This is not just a visual editor.
It is a control layer for AI-made frontend code.
Small edits are direct.
Large edits are structured for AI.
Results are reviewed semantically.
```
