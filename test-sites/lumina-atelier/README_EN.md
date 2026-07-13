# Lumina Atelier Intent Test

`lumina-atelier` is a standalone visual React/Vite/Tailwind test site for exercising INTENT_LAYER like an external project.

Goals:

- Build a polished landing page UI.
- Load the local `intent-layer/vite` plugin as a package dependency.
- Verify that static `className` and simple `cn()` literal segments appear in the intent graph.
- Measure coverage and transform time with `intent-layer doctor`, `scan`, and `check`.

`npx intent-layer init` idempotently keeps `intentLayer()` before the React plugin in a static Vite config. This fixture is already configured, so running it again must not change the file.

Run:

```bash
npm install
npx intent-layer init
npm run dev
```

Verify:

```bash
npm run typecheck
npm run build
npm run intent:doctor
npm run intent:scan
npm run intent:check
```

Test points:

- Scan or click hero/nav/card/button Tailwind tokens in `src/App.tsx`.
- Check whether tokens such as `gap-*`, `p-*`, `bg-*`, `text-*`, and `border-*` are direct-edit candidates.
- Confirm that source bindings remain stable inside map/render structures.
- Preview, apply, and undo the hero's `md:grid-cols-[1.2fr_0.8fr]` with Grid ratio sliders.
- Verify `ink`, `porcelain`, `moss`, and `copper` from `tailwind.config.cjs` appear before generic palette candidates.

Run `npm run test:e2e` from the repository root for Chromium coverage of setup, selection, asymmetric Grid, HMR, exact undo, and the 390px panel. Numeric truth lives only under the root `reports/performance/*.json`.
