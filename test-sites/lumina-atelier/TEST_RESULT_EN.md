# Lumina Atelier Test Result

Run time: 2026-07-05 16:13 KST

## Purpose

`test-sites/lumina-atelier` was created as a standalone React/Vite/Tailwind project to verify that the local `intent-layer` package works against a realistic visual site.

## Stack

- React 18
- Vite 6
- Tailwind CSS 3
- `intent-layer`: `file:../..`
- Vite plugin order: `plugins: [intentLayer(), react()]`

## Commands

| Command | Result |
| --- | --- |
| `npm install` | pass, 0 vulnerabilities |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run intent:doctor` | pass, 10 pass / 0 warn / 0 fail |
| `npm run intent:scan` | pass, writes `.intent/graph.intent.json` |
| `npm run intent:check` | pass |

## Intent Metrics

Latest `npm run intent:check` values:

| Metric | Value |
| --- | ---: |
| files scanned | 2 |
| files with bindings | 1 |
| binding count | 58 |
| direct edit bindings | 57 |
| read-only bindings | 0 |
| token count | 290 |
| editable token count | 231 |
| supported direct coverage | 98.28% |
| editable token coverage | 79.66% |
| syntax errors | 0 |
| average transform | 5.556ms |
| max transform | 11.100ms |

## Dev Server Patch Smoke

Local dev server: `http://127.0.0.1:5174/`

The smoke selected a `gap-10` binding in `src/App.tsx` from `/__intent/graph`, then previewed, applied, and reverted a `gap-10 -> gap-12` patch.

| Step | Result |
| --- | ---: |
| preview | pass, 0.494ms |
| apply | pass, 12.547ms |
| undo pending after apply | 1 |
| graph token after apply | `gap-12` |
| revert | pass, 10.604ms |
| graph token after revert | `gap-10` |

## Browser QA

Checked with the in-app browser.

| Check | Result |
| --- | --- |
| desktop page load | pass |
| auto overlay panel | pass, bottom-right |
| H1 | `Lumina Atelier` |
| section count | 4 |
| image load | 5/5 complete |
| `data-intent-id` count | 84 |
| mobile 390px horizontal overflow | none |

## Finding

The first configuration used `plugins: [react(), intentLayer()]`, and direct patching was safely rejected with `source-hash-mismatch`.

The cause was that intent bindings were generated after the React Refresh transform, so source hashes and source ranges no longer matched the real `src/App.tsx` file. The fix is to place `intentLayer()` before `react()`.

`INSTALL_KR.md` and `INSTALL_EN.md` were updated to show `plugins: [intentLayer(), react()]`.

A follow-up UX check added automatic overlay client injection. Users can now open the dev server and start from the bottom-right `Intent Layer` panel without adding a manual client import.

An additional UX pass changed the panel into a dark glass Codex-style subtool. The initial panel height is now 177px, and after selection it shows the selected-element outline, token rows, and undo/conflict sections. Placement avoidance also moves the panel upward when it would overlap bottom fixed developer tools.
