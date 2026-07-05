# INTENT_LAYER GUI Onboarding

This document describes the browser-first setup flow for a user who starts from a new Vite React project and wants minimal CLI steps.

## Goal

The target user is a vibe-coder. The first experience after install should be a small setup wizard, not a list of commands.

Principles:

- Once `intentLayer()` is registered in Vite, the browser panel guides setup.
- The panel can create the `.intent/` workspace.
- The panel stores language, panel position/density, startup collapse, setup auto-open, and Agent commands in `.intent/settings.json`.
- Codex/Claude hooks default to command planning.
- Direct Agent execution is only available when `INTENT_LAYER_AGENT_RUN=1` is set.

## New Vite Project Flow

1. The user creates a Vite React project.
2. The user installs `intent-layer`.
3. The user registers the plugin in `vite.config.ts`.
4. The user starts the normal Vite dev server.
5. The Intent Layer panel appears in the browser.
6. On first run, the panel opens the setup view.
7. The user chooses Korean/English plus basic panel settings and clicks `Finish setup`.
8. The panel creates `.intent/`, schema files, and `.intent/settings.json`.
9. The user clicks `Pick` to start direct edit or Agent handoff.

## Changing Settings Later

After onboarding, the same screen is available from the header `Setup` button.

The GUI can currently change:

- Language: Korean / English
- Panel position: left / right
- Panel density: comfortable / compact
- Start minimized
- Open setup when needed
- Codex command
- Claude command
- Show onboarding again

Panel position and density apply immediately after saving. `Start minimized` applies on the next page load.

## Setup View Checks

- Workspace: whether `.intent/` and schema files are ready
- Language: current overlay language
- Graph: whether source bindings exist after Vite transforms TSX/JSX
- Agent: whether Codex/Claude commands are discoverable and whether run mode is locked

## Agent Hook UX

Agent buttons have two levels.

```text
Plan Codex / Plan Claude
```

These produce a command plan only. No external process is started.

```text
Run Codex / Run Claude
```

These use the same plan, but only spawn a local CLI when `INTENT_LAYER_AGENT_RUN=1` is set. Otherwise, the panel explains that execution is locked and shows the command plan.

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
    "codexCommand": null,
    "claudeCommand": null
  }
}
```

## Remaining UX Work

- The tool does not edit Vite config automatically yet. The user still registers the plugin once.
- Direct Agent execution remains protected by the `INTENT_LAYER_AGENT_RUN=1` env lock, not by a GUI toggle.
- Next.js support remains a separate adapter task.
- Custom component call-sites and forwarded `className` support belong to the next React compatibility roadmap.
