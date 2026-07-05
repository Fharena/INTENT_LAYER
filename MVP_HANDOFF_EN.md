# INTENT_LAYER MVP Handoff

Updated: 2026-07-05 KST

## Status

INTENT_LAYER is at MVP candidate stage for the React/Vite/Tailwind click-to-patch workflow.

The current evidence supports:

- clicking a visible React/Tailwind element in the browser
- mapping it to a compile-time `data-intent-id` source binding
- previewing a deterministic Tailwind token patch
- applying a minimal source-range patch
- reverting the last patch through undo history
- generating intent operation/diff artifacts
- degrading unsupported bindings into structured agent handoff tasks
- creating Codex/Claude headless CLI agent launch plans
- showing shared-source scope and outlining multiple rendered instances for reused components
- installing the package tarball into a temp project and using `intent-layer/vite`

## Primary Evidence

Run:

```bash
npm run typecheck
npm run eval
npm run build
```

Latest local verification:

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run eval` | pass, false gates `0` |
| `npm run build` | pass |
| `git diff --check` | pass |
| Context Pack checkpoint | written |

Key reports:

```text
reports/performance/spike-evaluation.json
reports/performance/browser-click-metric.json
reports/performance/external-corpus-audit.json
reports/performance/external-corpus-skateshop-audit.json
reports/performance/external-corpus-chatbot-ui-audit.json
```

## MVP Metrics

Browser interaction, measured with the in-app browser:

| Metric | Latest max |
| --- | ---: |
| click-to-panel | 1.3ms |
| preview round trip | 4.9ms |
| apply round trip | 48.4ms |
| revert round trip | 53.6ms |

Browser gates:

| Gate | Result |
| --- | --- |
| desktop samples >= 3 | pass |
| mobile 390x844 samples >= 3 | pass |
| click-to-panel <= 100ms | pass |
| preview round trip <= 50ms | pass |
| apply round trip <= 50ms | pass |
| revert round trip <= 100ms | pass |
| source restored after revert | pass |

Watch item:

| Observation | Current |
| --- | --- |
| strict revert round trip <= 50ms | false |
| strict revert server <= 50ms | true |

The MVP gate is `revert <= 100ms` because revert restores source and writes undo artifacts. The stricter 50ms browser round-trip target should remain visible during follow-up optimization.

## External Coverage

Independent external direct-edit coverage:

| Project | Files | Supported direct editable coverage |
| --- | ---: | ---: |
| `shadcn-ui/ui@dbf9c5e` | 100 | 77.50% |
| `sadmann7/skateshop@e954d54` | 100 | 79.46% |
| `mckaywrigley/chatbot-ui@81328b6` | 100 | 66.91% |

All three pass the current 50% MVP evidence gate.

## Package Smoke

The install smoke verifies:

- `npm pack --dry-run`
- real tarball creation
- temp-folder `npm install`
- installed `intent-layer --help`
- installed `intent-layer/vite` import
- installed plugin transform/graph output
- real installed Vite dev server HTTP graph/setup/preview/apply/revert
- first-run setup status plus `.intent/settings.json` and schema creation
- mid-session settings update for language, panel preferences, and Agent commands
- 3-file graph refresh after one changed TSX file

Latest package smoke highlights:

| Metric | Value |
| --- | ---: |
| installed transform hook | 7.798ms |
| setup status / apply status | 200 / 200 |
| setup language | `ko` |
| setup workspace/settings/schema ready | true |
| settings update | `en` / `left` / `compact` / `settings` command source |
| installed apply refresh | 262.18ms |
| installed revert refresh | 1747.146ms |
| installed 3-file refresh | 13.724ms |
| installed refresh target | 2500ms |

## Agent Launch

Agent tasks can now be turned into Codex/Claude launch plans from the overlay or CLI.

| Metric | Value |
| --- | ---: |
| CLI agent launch gate | pass |
| Total eval gates | 53 |
| False gates | 0 |
| Codex plan time | 2.108ms |
| Claude plan time | 0.403ms |
| Default execution state | `executed=false` |

Direct process spawning is allowed only when Agent run is enabled in `.intent/settings.json` or when `INTENT_LAYER_AGENT_RUN=1` is set. The default UX is safe command planning.

## Known Limits

- Direct patching intentionally targets static `className` and simple/partial `cn()` / `clsx()` literal segments.
- Variant functions, runtime template literals, and arbitrary-depth cross-file data flow are read-only or handoff paths.
- Custom component call-site props are not direct source bindings yet. The current reusable-component support shows impact scope when one internal DOM binding renders multiple times.
- Browser QA is currently one local machine plus in-app browser desktop/mobile samples.
- Chrome was attempted as a second browser runtime, but the Codex Chrome Extension/native host was unavailable in this environment. See `reports/performance/browser-runtime-availability.json`.
- npm registry publish and registry-oriented install copy are not done.
- Git writes and push are expected to run from this workspace against `origin/main`.

## Next Work

1. Repeat browser QA in one more browser/runtime environment after Chrome extension/native host access is available.
2. Keep strict revert under 50ms as a performance optimization target.
3. Clean up the demo/package copy for a user-facing MVP walkthrough.
4. Re-measure component snapshot false positives/false negatives on external/product-sized TSX.
5. Keep committing focused follow-up work directly to `origin/main` unless a PR branch is explicitly requested.
