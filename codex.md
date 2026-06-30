# Codex Working Notes

This file records project-specific working rules for Codex on `INTENT_LAYER`.
Keep this file updated when the user's operating preferences change.

## Current User Preferences

- Use normal developer-style Git workflow.
- Leave commits in sensible units:
  - setup / scaffold
  - implementation
  - tests / measurement
  - documentation
  - fixes
- Do not make one giant commit unless the user explicitly asks for it.
- Keep Korean and English documentation together whenever feasible.
- Write documentation in detail, including:
  - what was built
  - why the approach was chosen
  - what was measured
  - numeric results
  - limitations
  - next steps
- Use the `Fharena/context-pack` project while developing:
  - repository: https://github.com/Fharena/context-pack
  - before using it, inspect the project instructions and available skill/workflow
  - document how it was used in this project
- The user wants numeric performance evaluation because the project is in progress and needs measurable evidence.
- Record performance evaluation in project docs, not only in chat.

## Documentation Rules

When creating or updating product/development docs, prefer paired Korean and English files.

Recommended document pairs:

```text
TECHNICAL_SPIKE_KR.md
TECHNICAL_SPIKE_EN.md
PERFORMANCE_EVALUATION_KR.md
PERFORMANCE_EVALUATION_EN.md
DEVELOPMENT_LOG_KR.md
DEVELOPMENT_LOG_EN.md
```

Existing paired planning docs:

```text
PRODUCT_PLAN_KR.md
PRODUCT_PLAN_EN.md
LAUNCH_MVP_KR.md
LAUNCH_MVP_EN.md
```

Korean docs should be practical and product-oriented.
English docs should be suitable for external contributors and future open-source README expansion.

## Development Strategy

Do not grow the architecture before the technical risk is validated.

Preferred order:

1. Measure whether deterministic direct editing has enough surface area.
2. Build the smallest working click-to-patch vertical slice.
3. Measure DOM-to-source mapping reliability with fixtures.
4. Only then split into a larger package architecture.

Avoid starting with a large monorepo package design before the spike works.

## First Technical Target

The first meaningful deliverable should be a working spike, not a polished product.

Target:

```text
React + Vite + Tailwind demo
static className only
click DOM element
map to source file/range
patch a Tailwind token such as gap-4 -> gap-6
verify old token before apply
trigger HMR
write minimal intent operation/diff output
```

Non-goals for the first spike:

```text
complete overlay UI
full cn()/clsx() support
shadcn/ui full support
Next.js support
portal mapping
props className forwarding
large intent schema
npm release
VS Code extension
```

## Required Measurements

Collect numeric evidence whenever possible.

For the corpus audit:

```text
className occurrence count
static className count and ratio
simple cn()/clsx() count and ratio
read-only pattern count and ratio
editable Tailwind token count and ratio
unsupported reason distribution
```

For the click-to-patch spike:

```text
Vite transform time per target file
DOM click -> source binding time
patch preview generation time
patch apply time
HMR reflection time when measurable
supported fixture success rate
intentional stale-token rejection rate
syntax error count after supported patches
```

Suggested gate:

```text
static className editable token coverage >= 30%
static + simple cn()/clsx() editable token coverage >= 50%
supported static className patch success rate = 100%
old token mismatch rejection rate = 100%
syntax errors after supported patches = 0
```

The exact thresholds may change, but any change should be documented with a reason.

## Git Workflow

Before editing:

```bash
git status --short
```

During work:

- Keep unrelated user changes intact.
- Do not revert files unless the user explicitly asks.
- Prefer focused commits with clear messages.
- Commit messages should describe the user-visible or engineering outcome.

Example commit sequence:

```text
docs: record spike plan and evaluation criteria
chore: scaffold vite tailwind spike
feat: add jsx intent id instrumentation
feat: patch static tailwind class tokens
test: add mapping and patch safety fixtures
docs: publish performance evaluation results
```

If the directory is not yet a Git repository, initialize Git only when the user asks or when starting the actual development task and it is clearly needed for the requested workflow.

## Context-Pack Usage

When the next development task starts:

1. Inspect `Fharena/context-pack`.
2. Identify whether it provides a Codex skill, workflow, docs format, or context packaging convention.
3. Use the relevant parts during implementation.
4. Document usage in Korean and English development docs.
5. Include any measurable effect if it influences performance, context quality, or workflow speed.

Do not claim `context-pack` was used unless the repository or installed skill was actually inspected and applied.

## Completion Standard

For each task, final reporting should include:

- files changed
- commits created, if any
- checks run
- numeric results, if measurement was part of the task
- docs updated in Korean and English, or a clear reason if only one language was updated
- known limitations and next recommended step

