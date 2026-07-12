# Codex Working Notes

Project-specific operating rules for Codex on `INTENT_LAYER`.

## Product Priority

The proven product wedge is deterministic browser selection and source patching for React/Tailwind. Keep the direct-edit core thick and the Agent integration thin.

Priority order:

1. source binding correctness
2. minimal patch and guarded undo safety
3. high-frequency Tailwind edit coverage and clear GUI feedback
4. constrained GUI layout editing that is measurably faster than describing placement to AI
5. real regression tests, package smoke, and CI
6. optional Codex/Claude handoff

Do not add speculative analyzers, document formats, queue commands, package boundaries, or framework adapters without a failing user workflow or test that requires them.

## User Preferences

- Use a normal developer Git workflow with clear commits and push completed work to `https://github.com/Fharena/INTENT_LAYER.git`.
- Preserve unrelated user changes. Check `git status --short` before editing.
- Keep Korean and English product documentation aligned.
- Write practical details and limitations, but do not create duplicate status documents.
- Use Context Pack for meaningful repository work and checkpoint at handoff.
- Leave numeric evidence in generated JSON reports, not only in chat.
- Work in large outcome-oriented batches when requested, while avoiding architecture that is not needed for the outcome.
- The target user is a vibe-coder. The normal path is GUI-first; npm and CLI remain setup, CI, diagnosis, and recovery tools.
- Korean is a complete product language. English remains available for external contributors.
- Prefer established structured parsers and APIs. JSX source binding uses the TypeScript AST as its single source of truth.
- Simple Tailwind edits, apply, validation, and undo are deterministic and must not call an LLM.
- On Windows, never place test fixtures, temporary repositories, browser artifacts, package smoke output, or benchmark scratch data on `C:`. Use `D:\SJWORK\INTENT_LAYER\.intent\tmp` by default and set `TEMP`/`TMP` to that D-drive directory before commands that use the OS temp folder.
- Treat the verified compatibility table in `README_KR.md` / `README.md` as the support contract. Do not claim a React, Vite, Tailwind, package-manager, browser, or OS version without a fixture or browser round trip.

## Overlay UX

- First-run setup and later settings use the same browser panel.
- Installed Vite projects use `npx intent-layer init` once. The command may minimally patch a static Vite config, but must leave dynamic config shapes unchanged with an explicit reason.
- Keep language, dock, density, startup collapse, onboarding reset, Agent permission, and provider commands editable without extra CLI steps.
- The selected-element flow is `Pick -> Inspect -> Edit -> Review`.
- Beginners see the next action first.
- Experienced users see component, file, source hash, `className` mode, editable tokens, shared render count, and unsupported reason before patching.
- Direct edit and Agent handoff stay visually distinct.
- Reused component edits must show how many rendered instances share the source binding.
- Literal `cn()`/`clsx()` bindings show only tokens active on the clicked DOM instance; persisted runtime selection includes the observed class tokens.
- Candidate selection is a reversible DOM-only preview. Preserve the exact original `class` attribute, and keep source Apply disabled until guarded server preview succeeds.
- Prefer color swatches and numerically ordered spacing steppers over forcing every high-frequency edit through a dropdown.
- Selecting an element inside a source-bound CSS Grid should expose the nearest supported grid ancestor; users should not have to click a narrow gap to select the parent.
- Grid layout UI stays constrained to existing CSS Grid and semantic placement controls. Do not expand it into an infinite canvas or DOM reorder tool without comparative user evidence.
- Simple positive-`fr` arbitrary templates are supported through track ratio controls. `minmax()`, variables, named lines, rows, and reorder remain explicit boundaries.
- Network and patch failures must produce visible feedback.
- Stale overlay roots must be replaced during HMR client version changes.

## Patch Safety

- Instrument only real intrinsic JSX nodes from the TypeScript AST.
- Instrument only during Vite `serve`. Never write `data-intent-id` into source files or production bundles; `npm run test:production-build` is a release gate.
- Preserve original TSX source maps through instrumentation and appended overlay code. The browser E2E must prove final `sourcesContent` equals the source file and contains neither injected ids nor the overlay bootstrap.
- Keep the resolved project root's `.intent/**` and `.intent-agent-queue.json*` outside Vite file watching. Anchor patterns to that root; a global `**/.intent/**` also ignores test projects located under the repository's `.intent/tmp`. Runtime graph, operation, and queue writes must not trigger page reloads.
- Validate source hash and old token during preview and again before apply.
- Use minimal source ranges, never full-file code generation for a token change.
- Persist the post-apply source hash with the operation.
- Undo only the latest pending patch when that hash still matches.
- On drift, preserve the file and write a conflict artifact.
- Grouped layout patches are direct only when the parent and all direct children have static className bindings in one source file. Validate every original className plus the whole-file hash, write once, and store post-apply ranges for grouped undo.
- Repeated source ids, cross-file grid children, dynamic className participants, and unsupported templates are explicit read-only boundaries, never partial-success cases.
- Project theme candidates come from static Tailwind config and known CSS entry points. Never execute user config to discover candidates, and never duplicate candidate arrays into the intent graph; fetch them only for selected tokens.
- Runtime selection is session-scoped. Preserve `sessionId` and freshness, merge graph entries by file ownership, and retain source-hash rejection as the final drift guard.
- The npm compatibility fixture under `test-sites/modern-tailwind-v4` gates React 19, Vite 8, Tailwind CSS 4, package type declarations, production overlay stripping, and the browser edit round trip. Do not weaken it to make an unsupported package surface appear green.
- The pinned pnpm gate must force-refresh the local `file:` dependency after `build:package`; a cached fixture copy is not evidence for the current source tree. Keep the pin on a non-vulnerable release and require a clean `npm audit`.

## Agent Boundary

Agent handoff is optional and experimental. Its durable minimum is:

```text
.intent/agent/task_*.md
.intent-agent-queue.json
.intent/agent/locks/*.lock.json
```

- Codex pickup uses `.agents/skills/intent-layer-task-runner/SKILL.md`.
- Claude pickup uses the `.claude/settings.json` `FileChanged` hook.
- Both providers claim before editing and record `done` or `failed` on completion.
- Direct CLI spawning remains opt-in through settings or `INTENT_LAYER_AGENT_RUN=1`.
- The entire legacy queue surface is off by default. Do not expose task forms or agent HTTP routes unless `legacyQueueEnabled` is explicit.
- Evaluation agent artifacts must use `.intent/tmp/evaluation-agent`; never write fixtures into the real queue.
- Queue writes must be atomic, abandoned claims must be releasable, and old terminal artifacts must be prunable.
- Do not deepen semantic pre-analysis or result-diff machinery until comparative user evidence shows it beats passing the selected source pointer directly to an agent.

## Active Documents

Maintain only these Korean/English pairs:

```text
README_KR.md / README.md
PRODUCT_PLAN_KR.md / PRODUCT_PLAN_EN.md
DEMO_WALKTHROUGH_KR.md / DEMO_WALKTHROUGH_EN.md
FAILURE_MODES_KR.md / FAILURE_MODES_EN.md
```

Historical spike, launch, handoff, and prose benchmark documents belong in Git history. Numeric truth belongs in `reports/performance/*.json`.

## Verification

Repository test scripts use `scripts/run-with-project-temp.mjs`, which keeps OS temp and Playwright browsers under `.intent/tmp/` and rejects a cross-drive Windows temp path. When running an external tool outside those scripts, prepare the D-drive temp directory first:

```powershell
New-Item -ItemType Directory -Force D:\SJWORK\INTENT_LAYER\.intent\tmp | Out-Null
$env:TEMP = "D:\SJWORK\INTENT_LAYER\.intent\tmp"
$env:TMP = $env:TEMP
```

Every meaningful core change should run:

```bash
npm run typecheck
npm run test
npm run test:e2e:install
npm run test:e2e
npm run build
npm run test:production-build
```

Before a release claim, also run:

```bash
npm run verify
```

`npm run verify` includes `npm run eval`; both must exit non-zero for any failed gate. Keep fixture evidence separate from independent external evidence. Coverage is an observed allowlist metric, not proof of edit success.

The next product proof should use held-out repositories and measure:

- first relevant element/source binding success
- first edit success rate
- time to accepted result versus prompting
- incorrect-patch and safe-rejection rates

Record paired observations with `npm run eval:product-ab`. Do not call the product proof complete until `reports/performance/product-ab-evaluation.json` has at least five repositories and twenty paired tasks.

## Completion Standard

At handoff, report the user-visible result, tests and numeric gates, commit/push state, and any remaining product limitation. Keep the final answer concise even when the implementation is detailed.
