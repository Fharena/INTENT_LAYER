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

## 3. Target Project Tarball Demo

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
  plugins: [react(), intentLayer()]
});
```

Run the target-project checks.

```bash
npx intent-layer init
npx intent-layer doctor
npx intent-layer check src --min-supported-direct 0.5 --max-file-transform-ms 20
npx intent-layer dev
```

## 4. What To Say During The Demo

Use this positioning:

- Direct edits are deterministic range patches.
- Simple Tailwind token changes do not call an LLM.
- Unsupported dynamic `className` expressions degrade to read-only handoff instead of unsafe patching.
- Every applied patch writes operation and intent diff artifacts for review.

## 5. Do Not Demo Yet

Do not position these as ready MVP flows:

- Next.js adapter
- styled-components or Emotion editing
- arbitrary CSS cascade editing
- Figma import
- direct edits inside `node_modules`
- broad natural-language layout refactors as deterministic patches

For unsupported cases, show `.intent/agent/task_*.md` handoff instead.
