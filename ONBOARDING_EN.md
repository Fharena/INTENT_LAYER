# INTENT_LAYER GUI Onboarding

This document describes the browser-first setup flow for a user who starts from a new Vite React project and wants minimal CLI steps.

## Goal

The target user is a vibe-coder. The first experience after install should be a small setup wizard, not a list of commands.

Principles:

- Once `intentLayer()` is registered in Vite, the browser panel guides setup.
- The panel can create the `.intent/` workspace.
- The panel stores language, panel position/density, startup collapse, setup auto-open, Agent queue automation, Agent run permission, and Agent commands in `.intent/settings.json`.
- Codex uses a project skill; Claude uses a FileChanged hook. Both watch the same Agent queue.
- The browser panel does not directly start external processes by default. Direct Agent execution is only available when enabled in settings or when `INTENT_LAYER_AGENT_RUN=1` is set.

## New Vite Project Flow

1. The user creates a Vite React project.
2. The user installs `intent-layer`.
3. The user registers the plugin in `vite.config.ts`.
4. The user starts the normal Vite dev server.
5. The Intent Layer panel appears in the browser.
6. On first run, the panel opens the setup view.
7. The user chooses Korean/English plus basic panel settings and clicks `Finish setup`.
8. The panel creates `.intent/`, schema files, `.intent/settings.json`, `.intent-agent-queue.json`, the Codex skill, and the Claude hook settings.
9. The user clicks `Pick` to start direct edit or Agent handoff.

## Changing Settings Later

After onboarding, the same screen is available from the header `Setup` button.

The GUI can currently change:

- Language: Korean / English
- Panel position: left / right
- Panel density: comfortable / compact
- Start minimized
- Open setup when needed
- Codex task skill
- Claude auto pickup
- Enable Agent run
- Codex command
- Claude command
- Show onboarding again

Panel position and density apply immediately after saving. `Start minimized` applies on the next page load.

## Setup View Checks

- Workspace: whether `.intent/` and schema files are ready
- Language: current overlay language
- Graph: whether source bindings exist after Vite transforms TSX/JSX
- Agent: whether the queue signal, Codex skill, Claude hook, Codex/Claude commands, and run mode are ready

## Agent Hook UX

Agent handoff does not start with provider-specific buttons. The user describes the desired change and clicks `Create task`.

```text
Agent handoff -> Create task -> Agent queue
```

Files involved:

```text
.intent/agent/task_*.md
.intent-agent-queue.json
.intent/agent/locks/*.lock.json  // created after claim
```

Codex reads queued tasks through `.agents/skills/intent-layer-task-runner/SKILL.md` and claims them with `agent-claim --provider codex`.

Claude notices `.intent-agent-queue.json` changes through the `.claude/settings.json` `FileChanged` hook when Claude Code is open.

On completion, `agent-result` marks the task frontmatter `done` and releases the lock. On failure, `agent-fail` records a `failed` status.

Codex/Claude command plans and direct execution remain as compatibility and diagnostic paths. Direct CLI spawning is still gated by `Enable Agent run` or `INTENT_LAYER_AGENT_RUN=1`.

## Files Written

```text
.intent/
  README.md
  settings.json
  graph.intent.json
  schema/
  operations/
  diffs/
  agent/
.intent-agent-queue.json
.agents/skills/intent-layer-task-runner/SKILL.md
.claude/settings.json
```

Example `settings.json`:

```json
{
  "version": 1,
  "language": "en",
  "onboardingCompletedAt": "2026-07-05T00:00:00.000Z",
  "updatedAt": "2026-07-05T00:00:00.000Z",
  "overlay": {
    "dock": "right",
    "density": "comfortable",
    "defaultCollapsed": false,
    "autoOpenSetup": true
  },
  "agent": {
    "runEnabled": false,
    "codexCommand": null,
    "claudeCommand": null,
    "codexSkillEnabled": true,
    "claudeHookEnabled": true
  }
}
```

## Remaining UX Work

- The tool does not edit Vite config automatically yet. The user still registers the plugin once.
- Direct Agent execution is controlled by the GUI setting, with `INTENT_LAYER_AGENT_RUN=1` still available as an automation/CI override. The default UX is shared queue pickup.
- Next.js support remains a separate adapter task.
- Custom component call-sites and forwarded `className` support belong to the next React compatibility roadmap.
