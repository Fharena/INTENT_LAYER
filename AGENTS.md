# AGENTS.md

This file is for AI coding agents working on the INTENT_LAYER product.

## Product Mission

INTENT_LAYER is an AI-native frontend intent layer for React/Tailwind projects.

The product helps users:

1. Click UI elements in the browser.
2. Map them back to source code.
3. Inspect semantic layout/style intent.
4. Apply deterministic code patches for simple edits.
5. Expose the same guarded edit operations to Codex and Claude through local MCP.
6. Review changes through intent diffs.

## Core Principle

Prefer deterministic code operations over LLM calls.

Use AI for:

- semantic naming
- ambiguous structure explanation
- complex refactor planning
- generated task markdown
- intent diff summaries

Do not use AI for:

- simple Tailwind token replacement
- direct patch application
- undo/revert
- validation
- formatting-only changes

## Architecture Boundaries

Keep core independent from framework integrations.

Core packages should know about:

- `IntentNode`
- `IntentProperty`
- `SourceBinding`
- `PatchOperation`
- `ValidationResult`
- confidence and drift state

Core packages should not directly depend on:

- React
- Vite
- Tailwind
- VS Code
- browser DOM

Framework-specific logic belongs in adapters. During alpha, keep the implementation in focused modules under `src/intent/`; do not create a monorepo or split packages until a real external consumer requires an independently versioned boundary.

Current module boundaries:

```text
instrument.ts   TypeScript AST source binding
tailwind.ts     token classification and candidates
themeCandidates.ts static project Tailwind/CSS candidate provider
gridLayout.ts   constrained CSS Grid inspection and grouped className planning
flexLayout.ts   constrained CSS Flex inspection and grouped className planning
patch.ts        preview, apply, operation log, and guarded undo
graphStore.ts   graph state, publish, and disk reload
intentService.ts shared GUI, HTTP, CLI, and MCP use cases
runtimeSession.ts browser selection and live verification
viteSetup.ts    safe one-time Vite config registration
vitePlugin.ts   Vite, HTTP, and HMR adapter
client.ts       browser overlay
mcp/            local stdio tools, resources, and provider setup
agent*.ts       legacy Agent handoff compatibility
```

Do not add another parser, semantic analyzer, queue command, or document format unless a failing user workflow or regression test requires it.

## Supported v1 Stack

Prioritize:

- React
- Vite
- TypeScript / TSX
- Tailwind CSS
- literal `className`
- simple `cn()` / `clsx()`
- common shadcn/ui patterns

Do not spend early implementation time on:

- styled-components
- Emotion
- arbitrary frameworks
- full CSS cascade editing
- Figma import
- full design system inference

## Required File Formats

The product uses these intent file formats:

```text
*.intent.yml
*.intent-diff.yml
*.intent-op.json
```

Main folder:

```text
.intent/
  graph.intent.json
  components/
  operations/
  diffs/
  agent/
  schema/
```

## Safe Patch Rules

Never rewrite a full source file when a small range patch is enough.

For direct edits:

1. Locate source binding.
2. Validate confidence.
3. Generate minimal patch.
4. Preview patch.
5. Apply patch.
6. Re-scan changed binding.
7. Produce intent diff.

If confidence is low, do not patch directly. Generate an agent handoff task instead.

For grouped Grid/Flex edits, require one source file, validate every original className plus the full source hash, write the file once, and store original and post-apply ranges for byte-for-byte grouped undo. Repeated runtime ids, cross-file children, dynamic className participants, or unsupported layout tokens are read-only boundaries.

## AI Tool Rules

Codex and Claude should use the local MCP tools for supported edits:

```text
property/text: find -> inspect_element -> preview_edit -> apply_edit -> verify_edit -> optional undo_edit
Grid/Flex: browser select -> inspect_layout -> preview_layout -> apply_edit -> verify_edit -> optional undo_edit
```

- Never accept source offsets, raw patches, or arbitrary file paths from an AI client.
- Never accept a Grid/Flex parent id or complete child scope from an AI client. Resolve the nearest layout scope from the fresh browser selection; only changed child ids returned by `inspect_layout` may appear in a preview request.
- Resolve ranges from the current graph and semantic property on the server.
- Require an expiring preview before apply.
- Revalidate source hash inside a per-file atomic lock.
- Serialize source mutation plus operation-journal recording with the project operation lock; publish the shared journal atomically.
- Require loopback plus the Vite session token for every source-changing HTTP request. Do not enable remote/LAN mutation implicitly.
- Treat browser runtime verification as unavailable, not successful, when Vite or the browser is disconnected.
- Keep MCP on local stdio. Do not add remote HTTP, OAuth, or another agent scheduler without a demonstrated workflow.
- Keep the legacy Markdown queue disabled by default. Its task UI and HTTP routes require explicit `legacyQueueEnabled` compatibility mode.

## Agent Handoff Rules

When a change is too complex for deterministic direct edit, create a markdown task under:

```text
.intent/agent/task_*.md
```

The task must include:

- goal
- selected component
- source file/range
- current intent document
- desired change
- constraints
- files that may be edited
- files that should not be edited
- required checks

After the agent modifies code, generate or update:

```text
.intent/agent/result_*.md
.intent/diffs/*.intent-diff.yml
```

Agent tasks also use a shared queue signal:

```text
.intent-agent-queue.json
.intent/agent/locks/*.lock.json
```

The Markdown queue is advanced compatibility, not the default AI integration. Preserve it for existing projects, but do not add queue commands, analyzers, or UI unless a regression requires them.

Evaluation fixtures must use `.intent/tmp/evaluation-agent`; never write benchmark tasks into the real project queue.

Legacy pickup model:

- Codex uses `.agents/skills/intent-layer-task-runner/SKILL.md`.
- Claude uses `.claude/settings.json` `FileChanged` hook when Claude Code is open.
- Both providers read the same queue signal and the same task markdown.
- Claim before editing with `intent-layer agent-claim --provider codex|claude --task <task-file>`.
- Do not edit a task that is already claimed, running, done, failed, or locked by another provider.
- Record completion with `intent-layer agent-result ...`; this marks task frontmatter `done` and releases the lock.
- If blocked, use `intent-layer agent-fail --provider codex|claude --task <task-file> --summary "<reason>"`.

## Performance Rules

On Windows, all test fixtures and temporary artifacts must stay on `D:`. Use `D:\SJWORK\INTENT_LAYER\.intent\tmp` for temporary repositories, browser output, package smoke files, and benchmark scratch data. Set `TEMP` and `TMP` to that directory before running tools that otherwise use `C:\Users\...\Temp`.

Avoid whole-project analysis by default.

Use this model:

```text
Always:
  short data-intent-id injection
  sidecar source map

On selection:
  parse selected file only
  analyze selected node and nearby parents/children
  resolve project theme candidates for selected tokens only

On demand:
  repo-wide scan
  AI semantic summary
  agent task generation
```

Target performance:

- element select to panel: under 100ms
- simple patch: under 50ms
- small intent diff: under 1s
- Vite transform overhead: under 5ms per file target

Do not serialize project candidate arrays into every graph token. Keep the graph compact and query candidates on selection.

## UX Rules

The user should feel:

- small UI tweaks are faster than prompting AI
- patches are predictable
- unsupported edits degrade into structured AI tasks
- AI-made changes can be reviewed semantically

Avoid:

- hiding uncertainty
- applying low-confidence patches
- surprising full component rewrites
- making AI calls during simple knob edits

## Documentation Rules

Keep only these active Korean/English document pairs:

- `README_KR.md` / `README.md`
- `PRODUCT_PLAN_KR.md`
- `PRODUCT_PLAN_EN.md`
- `DEMO_WALKTHROUGH_KR.md` / `DEMO_WALKTHROUGH_EN.md`
- `FAILURE_MODES_KR.md` / `FAILURE_MODES_EN.md`

Do not create a new status, launch, handoff, or benchmark prose document when an active document or generated JSON report can hold the information. Numeric evaluation truth belongs in `reports/performance/*.json`.

Korean docs should be practical and product-oriented.
English docs should be suitable for external contributors and future open-source README expansion.


<!-- context-pack:rules:start -->
## Context Pack

Use Context Pack as quiet orientation for natural-language coding, review, debugging, and handoff requests. The user does not need to name it or ask for a pack.

Treat requests like "fix this bug", "why are tests failing?", "review this branch", "look over my changes", "continue where we left off", "I'm done for now", or "leave this easy to resume" as normal triggers. Run Context Pack as part of the work, then keep going with the user's actual task.

Run it only when repo orientation would save broad reading or preserve useful handoff state:
- Session start or continuation with no clear task yet: `context-pack start`, then read `CURRENT.md` and `INDEX.md`.
- Non-trivial bug, feature, or debugging task: `context-pack start --task "<short task>"`
- Review, PR, or branch work: `context-pack start --review`; add `--base <base-ref>` when known. Without a base, Context Pack tries upstream/common default branches.
- Changed files are the only signal: `context-pack start --changed`
- Missing `.context-pack/` during a normal task: still use `context-pack start`; it auto-initializes lightweight context docs.
- Explicit install/configuration request: `context-pack setup --dry-run`, then `context-pack setup` if setup was requested; use `context-pack doctor --fix` for broken setup.
- End of meaningful work or handoff: `context-pack checkpoint --pack`

Skip Context Pack for pure Q&A, tiny obvious single-file edits, or tasks where the relevant files and tests are already clear.

When a pack is generated, read `.context-pack/packs/CONTEXT_PACK.md` before broad source reads. Treat context docs as routing hints, not ground truth; verify against source when state, stale warnings, or code behavior disagree.

Use `context-pack checkpoint --publish --pack` only when the handoff should be committed and shared through git.

<!-- context-pack:rules:end -->
