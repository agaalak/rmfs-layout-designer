# Performance And Robustness Audit

Date: 2026-05-14

## Commands And Current Results

- `npm run build`: passed after debug/invariant additions.
- `npm test -- --run`: passed with 13 test files and 82 tests.
- `npm run test:e2e -- e2e/debug-qa.spec.ts --workers=1`: passed with 3 debug/QA browser tests.
- `npm run test:e2e -- --workers=1`: passed with 18 browser tests.

## Initial Load And Bundle

Latest observed production build shape:

- `react-*.js`: about 12 kB.
- `icons-*.js`: about 12 kB.
- `canvas-*.js`: about 316 kB.
- `index-*.js`: about 470-475 kB after debug/QA additions.

The previous single-bundle warning remains resolved through Vite manual chunks. The main app chunk grew because debug, diagnostics, and simulation panels are currently included in the main route.

## Render / Canvas Performance

Current status:

- Small Demo is responsive.
- Large Demo remains usable but should be considered a stress layout.
- Konva canvas is still the heaviest UI surface.
- View controls are always visible and do not require rerendering the workflow toolbar.

Risks:

- Simulation overlays, reservation overlays, and debug panel can increase render cost together.
- Rack bin editor can become heavy for larger bin counts because it is scrollable but not virtualized.

## Simulation Step Cost

Improvements in this pass:

- `simulation.step` duration is captured through `recordDebugPerformance`.
- Debug panel shows recent performance samples.
- Invariants run in development/debug contexts to expose state corruption quickly.

Remaining risks:

- The simulation engine still does a lot of orchestration in one action.
- Dense scenarios can generate many events and reservations.
- WHCA/MAPF work should not be added until the engine is split and measured.

## Log And Memory Growth

Improvements:

- Debug events are capped by `DEBUG_LOG_LIMIT`.
- Performance samples are capped.
- Diagnostics export intentionally captures recent events instead of unlimited history.
- Reservation cleanup already exists in the traffic layer and should be called during long runs.

Remaining risks:

- Simulation event log growth needs continued monitoring in very long Large Demo runs.
- Issue exports currently include state snapshots but not an embedded screenshot.

## Validation / Analytics Cost

Current status:

- Validation and analytics are memoized by layout object identity in React.
- Graph construction is still repeated by consumers that do not share a cached graph.

Recommended:

- Introduce a `layout.revision` or content hash.
- Cache graph construction by revision.
- Move validation/analytics to a worker when layouts exceed current demo scale.

## Robustness Hardening Added

- Top-level React ErrorBoundary.
- Console warning/error capture.
- `window.error` and `unhandledrejection` capture.
- User action recorder.
- Debug diagnostics bundle.
- Issue report export.
- Simulation invariant checks.
- Controller decision traces.
- Performance counters visible in Debug / QA panel.

## Robustness Risks

- Invariant violations currently log rather than always pausing playback.
- Debug panel is powerful but still manually opened; future production builds may need a visible "Diagnostics available" indicator after an error.
- E2E coverage proves the debug panel and major workflows, but not every high-density traffic case.

## Recommended Next Steps

1. Split `simulationEngine.ts` and `SimulationPanel.tsx` before adding WHCA.
2. Cache graph/validation/analytics by layout revision.
3. Add optional performance mode to hide expensive overlays during simulation.
4. Add issue-report screenshot capture.
5. Add a separate stress-test command that can run longer Large Demo scenarios without slowing normal E2E.
