# Lumina Atelier Intent Test

`lumina-atelier` is a standalone visual React/Vite/Tailwind test site for exercising INTENT_LAYER like an external project.

Goals:

- Build a polished landing page UI.
- Load the local `intent-layer/vite` plugin as a package dependency.
- Verify that static `className` and simple `cn()` literal segments appear in the intent graph.
- Measure coverage and transform time with `intent-layer doctor`, `scan`, and `check`.

Important setup:

```ts
plugins: [intentLayer(), react()]
```

Keep `intentLayer()` before the React plugin. If bindings are generated after the React Refresh transform, source hashes and source ranges can drift from the real TSX file and direct patches will be safely rejected.

Run:

```bash
npm install
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

This run is recorded in `TEST_RESULT_KR.md` and `TEST_RESULT_EN.md`.

