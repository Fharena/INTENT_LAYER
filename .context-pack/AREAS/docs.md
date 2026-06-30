---
id: docs
last_reviewed_head: unknown
status: active
paths:
  - README.md
tests:
  - none
stale_if:
  - README.md changes
---

# Docs

## Read When
- User-facing docs, onboarding notes, and repository guidance.

## Start With
- `README.md`

## Contracts
- Docs should describe the current install and usage flow.
- Agent guidance should be concise and actionable.

## Common Failure Modes
- Docs promise behavior the tool does not implement.
- Local machine paths leak into public documentation.

## Expand Scope If
- Public API, CLI, schema, storage, tests, or generated outputs changed.
- A changed file does not match any known area.

## Do Not Start With
- `.context-pack/packs/`
- generated artifacts unless the task is about generation
