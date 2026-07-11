# INTENT_LAYER MVP Demo Walkthrough

This walkthrough is the current user-facing MVP path. It avoids unsupported cases and proves the deterministic edit loop end to end.

## 1. Local Repository Demo

Run from the INTENT_LAYER repository.

```bash
npm install
npm run typecheck
npm run test
npm run dev
```

Open the Vite URL printed by the dev server.

Expected behavior:

- the React/Tailwind demo page loads
- the floating Intent Layer overlay is visible
- the overlay can enter pick mode

## 2. Click-To-Patch Flow

Use this narrow scenario for the MVP demo:

1. Click `Pick element`.
2. Click the visible `Patch Preview` card title.
3. In the overlay, change the first typography token from `text-lg` to `text-xl`.
4. Click `Preview`.
5. Confirm the preview shows a range patch, not a full-file rewrite.
6. Click `Apply`.
7. Confirm the source updates and the page hot-refreshes.
8. Click `Undo last`.
9. Confirm the title returns to `text-lg` and pending undo history is empty.

Expected artifact output:

```text
.intent/graph.intent.json
.intent/operations/*.intent-op.json
.intent/operations/operation-log.json
.intent/diffs/*.intent-diff.yml
```

## 3. Grid Layout Composer Flow

1. Click `Pick`, then click any text inside one of the three cards.
2. Confirm `Grid layout` opens for the nearest source-bound grid ancestor.
3. Select the `sm` breakpoint. The demo's 12-column 5/3/4 layout appears in the mini grid and placement strips.
4. Drag the first item across columns 1-6 and the second across columns 7-9.
5. Click `Preview layout` and confirm that only two className literals change.
6. Apply and confirm TSX plus HMR contain `sm:col-span-6 sm:col-start-1` and `sm:col-span-3 sm:col-start-7`.
7. Click `Undo` once and confirm both classNames restore together and pending undo is empty.

Direct editing activates only when the parent and direct children have static classNames in one file. Repeated source ids from `.map()` or child implementations in another file report a reason without touching source.

## 4. Target Project Tarball Demo

Create a local package tarball.

```bash
npm run typecheck
npm run test
npm pack
```

Install it in a target React/Vite/Tailwind project.

```bash
npm install /absolute/path/to/intent-layer-0.0.1.tgz
```

Register the Vite plugin.

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { intentLayer } from "intent-layer/vite";

export default defineConfig({
  plugins: [intentLayer(), react()]
});
```

Run the target-project checks.

```bash
npx intent-layer init
npx intent-layer doctor
npx intent-layer check src --min-supported-direct 0.5 --max-file-transform-ms 20
npx intent-layer dev
```

## 5. Codex/Claude MCP Demo

1. Enable a provider under `Settings > AI connections`.
2. Start a new Codex or Claude session.
3. Select a card in the browser.
4. Ask the AI to inspect the current card's gap candidates and preview value 6.
5. Confirm that `inspect → preview` returns an exact one-line diff.
6. After approval, run `apply → verify` and confirm both source and rendered instances are verified.
7. Restore the source with `intent_undo_edit`.

For a quick packaged-stdio check, run `npm run build:package && npm run test:mcp-package`.

## 6. What To Say During The Demo

Use this positioning:

- Direct edits are deterministic range patches.
- Simple Tailwind token changes do not call an LLM.
- Unsupported dynamic `className` expressions degrade to read-only handoff instead of unsafe patching.
- AI clients never submit raw source offsets and use the same `IntentService` as the GUI.
- With a connected browser, verification checks rendered class tokens after HMR.
- Every applied patch writes operation and intent diff artifacts for review.
- Grid placement previews, applies, and undoes multiple classNames as one guarded operation.

## 7. Do Not Demo Yet

Do not position these as ready MVP flows:

- Next.js adapter
- styled-components or Emotion editing
- arbitrary CSS cascade editing
- Figma import
- direct edits inside `node_modules`
- broad natural-language layout refactors as deterministic patches
- grid row/absolute placement, DOM reordering, and cross-file layout transactions

Show unsupported cases as `handoff-required` with an exact source pointer. Use the Markdown queue only in an advanced compatibility demo.
