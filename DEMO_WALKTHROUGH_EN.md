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

### React 19/Tailwind 4 DOM Preview

Use the separate fixture for the modern stack and visual controls:

```bash
npm run build:package
npm run refresh:modern-fixture
npm run dev --prefix test-sites/modern-tailwind-v4
```

1. Finish setup, click `Pick`, and select the purple `Modern stack compatibility` card.
2. Confirm the `bg-brand` row exposes a `bg-accent` swatch while the currently inactive `bg-accent` source token is not shown as a separate editable row.
3. Click the swatch. The card should change immediately while `src/App.tsx` remains byte-for-byte unchanged.
4. Use `Reset preview` and confirm the original DOM class returns.
5. Click `+` for `gap-6`; numeric ordering should select `gap-7` while source remains unchanged.
6. Confirm Apply is locked until server-side Preview succeeds.
7. Apply, verify HMR plus `gap-7` in source, then use one Undo to restore the original bytes.
8. Switch the page from `Primary branch` to `Accent branch`, pick the card again, and confirm only `bg-accent` is exposed as the active branch row.

### Guarded Literal Text

1. Select the `Edit the rendered branch, not a dormant token.` heading in the Modern fixture.
2. Enter one line of plain text and click text Preview. Source must still be unchanged.
3. Apply and verify that both HMR text and the TSX literal change.
4. Use one Undo to restore the original bytes.
5. No editor should appear for text containing an expression, nested `<span>`, or entity.

## 3. Grid Layout Composer Flow

1. Click `Pick`, then click any text inside one of the three cards.
2. Confirm `Grid layout` opens for the nearest source-bound grid ancestor.
3. Select the `sm` breakpoint. The demo's 12-column 5/3/4 layout appears in the mini grid and placement strips.
4. Drag the first item across columns 1-6 and the second across columns 7-9.
5. Click `Preview layout` and confirm that only two className literals change.
6. Apply and confirm TSX plus HMR contain `sm:col-span-6 sm:col-start-1` and `sm:col-span-3 sm:col-start-7`.
7. Click `Undo` once and confirm both classNames restore together and pending undo is empty.
8. In the Lumina hero, select the project `dashboard` breakpoint, increase rows to three, and place the first child on row two. Preview should add only `dashboard:grid-rows-3`, `dashboard:row-start-2`, and `dashboard:row-span-1`.

Direct editing activates only when the parent and direct children have static classNames in one file. Repeated source ids from `.map()` or child implementations in another file report a reason without touching source.

Use the hero grid in `test-sites/lumina-atelier` for an asymmetric template. On the `md` tab, changing the `1.2 / 0.8` track-ratio sliders must preview only the `md:grid-cols-[1.2fr_0.8fr]` token. Apply must HMR, and one Undo must restore the source byte for byte. Templates containing `minmax()`, CSS variables, or named lines are outside this demo.

## 4. Flex Layout Composer Flow

1. In the Modern fixture, click `Pick` and select the top header.
2. Confirm the nearest layout is recognized and `Flex layout` appears.
3. At `base`, choose direction `col`, wrap `wrap`, justify `center`, align `start`, and gap `gap-6`.
4. Set the first child's item alignment to `center` and confirm the mini canvas updates immediately.
5. Source must remain unchanged and Apply must stay locked before Preview.
6. Preview and apply. Only one parent range and one child range should change, and HMR should expose `flex-col`.
7. Use one Undo and confirm both ranges restore byte for byte.

The Flex composer requires static single-line classNames, one source file, and unique direct-child ids. Do not directly demo axis-specific gaps, repeated ids, cross-file children, or DOM reordering.

## 5. Target Project Tarball Demo

Create a local package tarball.

```bash
npm run typecheck
npm run test
npm pack
```

Install it in a target React/Vite/Tailwind project.

```bash
npm install /absolute/path/to/intent-layer-0.0.1.tgz
npx intent-layer init
```

Confirm that `vite.status` is `configured`, `created`, or `already-configured`. A dynamic plugins expression must return `unsupported-config` without changing the Vite file.

Run the target-project checks.

```bash
npx intent-layer doctor
npx intent-layer check src --min-supported-direct 0.5 --max-file-transform-ms 20
npx intent-layer dev
```

## 6. Codex/Claude MCP Demo

1. Enable a provider under `Settings > AI connections`.
2. Start a new Codex or Claude session.
3. Select a card in the browser.
4. Ask the AI to inspect the current card's gap candidates and preview value 6.
5. Confirm that `inspect → preview` returns an exact one-line diff.
6. After approval, run `apply → verify` and confirm both source and rendered instances are verified.
7. Restore the source with `intent_undo_edit`.

Literal text uses the same shared apply, verify, and undo path. With a plain JSX text node selected, preview and apply `property: "content.text"`, verify source, then undo.

Verify AI-driven Grid/Flex editing with this sequence:

1. Select the layout parent or any direct/descendant element inside it in the browser.
2. Call `intent_inspect_layout` and inspect the kind, parent, direct children, and breakpoint values derived from the live selection.
3. Call `intent_preview_layout` with returned values and only the child ids being changed. Do not submit a parent id or full child scope.
4. Review every className change in the grouped diff, then apply it with the existing `intent_apply_edit`.
5. Confirm `source: verified` with `intent_verify_edit`. For grouped layout edits, `runtime: unavailable` means visual verification has not run.
6. Use `intent_undo_edit` and confirm byte-for-byte restoration.

For a quick packaged-stdio and eight-tool inventory check, run `npm run build:package && npm run test:mcp-package`.

Run all browser regressions with `npm run test:e2e`. Lumina covers setup, asymmetric Grid editing, a custom breakpoint with row placement, HMR, exact undo, and mobile collapse/expand behavior. The Modern fixture covers literal text, Flex, conditional branches, swatches, the spacing stepper, source-free DOM preview, and the complete React 19/Tailwind 4 round trip.

## 7. What To Say During The Demo

Use this positioning:

- Direct edits are deterministic range patches.
- Simple Tailwind token changes do not call an LLM.
- Unsupported dynamic `className` expressions degrade to read-only handoff instead of unsafe patching.
- AI clients never submit raw source offsets and use the same `IntentService` as the GUI.
- AI layout scope is decided by the server from the recent browser selection, not constructed by the caller.
- With a connected browser, verification checks rendered class tokens after HMR.
- Every applied patch writes operation and intent diff artifacts for review.
- Grid and Flex placement preview, apply, and undo multiple classNames as one guarded operation.

## 8. Do Not Demo Yet

Do not position these as ready MVP flows:

- Next.js adapter
- styled-components or Emotion editing
- arbitrary CSS cascade editing
- Figma import
- direct edits inside `node_modules`
- broad natural-language layout refactors as deterministic patches
- absolute placement, DOM reordering, and cross-file layout transactions
- `raw`, max-only, or dynamic project breakpoints
- compound arbitrary Grid templates containing `minmax()`, CSS variables, or named lines

Show unsupported cases as `handoff-required` with an exact source pointer. Use the Markdown queue only in an advanced compatibility demo.
