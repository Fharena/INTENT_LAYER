# Review Router

For code review, map changed files to areas, then check the listed contracts, tests, and failure modes before widening scope.

## Area Routing

### docs
- Doc: `.context-pack/AREAS/docs.md`
- If changed files match:
  - `README.md`
- Common failure modes:
  - Docs promise behavior the tool does not implement.
  - Local machine paths leak into public documentation.

### overview
- Doc: `.context-pack/AREAS/overview.md`
- If changed files match:
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `codex.md`
  - `.context-pack/**`
- Common failure modes:
  - Trusting old summaries after HEAD or dirty files changed.
  - Reading logs or generated packs before current source files.
  - Editing the wrong checkout or copied workspace.

## Escalate Review Scope When
- Public API, CLI, schema, storage format, subprocess launch, or cache/session identity changed.
- Tests or test helpers changed in a way that may hide behavior.
- A changed file does not map to any known area.
