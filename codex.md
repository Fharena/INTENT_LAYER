# Codex Working Notes

Project-specific operating rules for Codex on `INTENT_LAYER`.

## Product Priority

The proven product wedge is deterministic browser selection and source patching for React/Tailwind. Keep the direct-edit core thick and the Agent integration thin.

Priority order:

1. source binding correctness
2. minimal patch and guarded undo safety
3. high-frequency Tailwind edit coverage and clear GUI feedback
4. real regression tests, package smoke, and CI
5. optional Codex/Claude handoff

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

## Overlay UX

- First-run setup and later settings use the same browser panel.
- Keep language, dock, density, startup collapse, onboarding reset, Agent permission, and provider commands editable without extra CLI steps.
- The selected-element flow is `Pick -> Inspect -> Edit -> Review`.
- Beginners see the next action first.
- Experienced users see component, file, source hash, `className` mode, editable tokens, shared render count, and unsupported reason before patching.
- Direct edit and Agent handoff stay visually distinct.
- Reused component edits must show how many rendered instances share the source binding.
- Network and patch failures must produce visible feedback.
- Stale overlay roots must be replaced during HMR client version changes.

## Patch Safety

- Instrument only real intrinsic JSX nodes from the TypeScript AST.
- Never write `data-intent-id` into source files.
- Validate source hash and old token during preview and again before apply.
- Use minimal source ranges, never full-file code generation for a token change.
- Persist the post-apply source hash with the operation.
- Undo only the latest pending patch when that hash still matches.
- On drift, preserve the file and write a conflict artifact.

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

Every meaningful core change should run:

```bash
npm run typecheck
npm run test
npm run build
```

Before a release claim, also run:

```bash
npm run eval
```

`npm run eval` must exit non-zero for any failed gate. Keep fixture evidence separate from independent external evidence. Coverage is an observed allowlist metric, not proof of edit success.

The next product proof should use held-out repositories and measure:

- first relevant element/source binding success
- first edit success rate
- time to accepted result versus prompting
- incorrect-patch and safe-rejection rates

## Completion Standard

At handoff, report the user-visible result, tests and numeric gates, commit/push state, and any remaining product limitation. Keep the final answer concise even when the implementation is detailed.
