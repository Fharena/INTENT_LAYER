# INTENT_LAYER Install Guide

This document describes the current MVP package surface.

Current status:

- The package has not been published to the npm registry yet.
- The verified install path is a local tarball generated from this repository and installed into a target React/Vite/Tailwind project.
- `npm run eval` verifies tarball creation, temp-project install, `intent-layer --help`, `intent-layer/vite` import, Vite dev server preview/apply, and refresh timing.

## 1. Target Project Requirements

Prioritized support:

- Node.js 18 or newer
- React
- Vite
- TypeScript / TSX
- Tailwind CSS
- literal `className`
- simple/partial `cn()` / `clsx()`

Still outside the early MVP scope:

- first-class Next.js adapter
- styled-components / Emotion
- full CSS cascade editing
- Figma import
- direct patching of external npm package source

## 2. Local Tarball Install

Create the package tarball from the INTENT_LAYER repository.

```bash
npm install
npm run typecheck
npm pack
```

Install the generated tarball in the target project.

```bash
npm install /absolute/path/to/intent-layer-0.0.1.tgz
```

After registry publication, the intended command is:

```bash
npm install -D intent-layer
```

## 3. Vite Setup

Register the plugin in the target project's `vite.config.ts`.

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { intentLayer } from "intent-layer/vite";

export default defineConfig({
  plugins: [intentLayer(), react()]
});
```

`intent-layer/vite` is the currently verified package export.

## 4. Initialize Intent Workspace

Run these from the target project root.

```bash
npx intent-layer init
npx intent-layer doctor
```

`init` creates the `.intent/` folders and lightweight schema files.

`doctor` checks these items as JSON:

- `package.json`
- `intent-layer` package
- Vite dependency
- React dependency
- Tailwind config
- Vite config
- `intentLayer()` plugin registration
- JSX/TSX source files
- `.intent` workspace
- `.intent/graph.intent.json`

On the first run, the graph may be a warning until the dev server or scan command generates it.

```bash
npx intent-layer scan src --write-graph
npx intent-layer doctor
```

## 5. Run The Dev Server

Use the wrapper instead of the raw Vite command when you want the default MVP setup.

```bash
npx intent-layer dev
```

To inspect the launch plan without starting Vite:

```bash
npx intent-layer dev --dry-run
```

Defaults:

```text
host: 127.0.0.1
port: 5173
```

## 6. Pre-Launch Smoke Check

Minimum checks in a target project:

```bash
npx intent-layer doctor
npx intent-layer check src --min-supported-direct 0.5 --max-file-transform-ms 20
```

Optionally write the graph to disk:

```bash
npx intent-layer scan src --write-graph
```

## 7. Current Measurements

Latest `npm run eval` values:

```text
doctor: 10 checks, 10 pass, 0 warn, 0 fail, 2.081ms
missing-plugin doctor fixture: exit 1, fail 1, guidance 3, pass
installed Vite apply refresh: 42.976ms
installed Vite revert refresh: 45.163ms
installed 3-file graph refresh: 125.897ms
package smoke: pass
```

Current independent external baseline coverage:

```text
shadcn-ui/ui: 100 files, 915 className occurrences, 77.50% supported direct editable coverage
sadmann7/skateshop: 100 files, 866 className occurrences, 79.46% supported direct editable coverage
mckaywrigley/chatbot-ui: 100 files, 601 className occurrences, 66.91% supported direct editable coverage
```

These package numbers are local smoke fixture measurements. The external coverage reports are copied-file corpus measurements stored under `reports/performance/`; they do not commit third-party source.

## 8. Safety Boundaries

Direct patching runs only when:

- a source binding is available
- confidence is sufficient
- the old token is still present in the current source
- a range patch is enough
- the changed binding can be re-scanned and diffed

If those conditions are not met, the tool should create a `.intent/agent/task_*.md` handoff instead of patching directly.

If something fails, start with [FAILURE_MODES_EN.md](./FAILURE_MODES_EN.md).

For a user-facing demo path, follow [DEMO_WALKTHROUGH_EN.md](./DEMO_WALKTHROUGH_EN.md).
