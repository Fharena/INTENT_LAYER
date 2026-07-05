## INTENT_LAYER Agent Queue

When processing INTENT_LAYER agent tasks, use the shared queue instead of ad hoc provider-specific state.

- Queue signal: `.intent-agent-queue.json`
- Task files: `.intent/agent/task_*.md`
- Locks: `.intent/agent/locks/*.lock.json`
- Claude pickup: `.claude/settings.json` `FileChanged` hook watches `.intent-agent-queue.json` while Claude Code is open.
- Claim before editing: `intent-layer agent-claim --provider claude --task <task-file>`
- Do not process tasks already claimed, running, done, failed, or locked by another provider.
- Record success: `intent-layer agent-result --id <intent-id> --task <task-file> --summary "<what changed>" --changed <file> --check "<command>"`
- Record failure: `intent-layer agent-fail --provider claude --task <task-file> --summary "<why it could not be completed>"`

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
