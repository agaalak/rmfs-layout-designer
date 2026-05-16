# Current State Audit

Date: 2026-05-16

## Commands Run

- `npm install`: passed, dependencies already current, 0 vulnerabilities.
- `npm run build`: passed after queue/controller alignment. Latest chunk shape splits `simulation`, `analytics`, `generation`, `canvas`, `react`, and app `index` chunks; no large-chunk warning was emitted.
- `npm run typecheck`: passed.
- `npm test -- --run`: passed, 20 test files and 101 tests.
- `npm run test:e2e -- --workers=1`: passed, 19 browser tests.
- `npm run dev`: started on `http://127.0.0.1:5174`.

## Browser QA

Browser plugin status: available and used through the in-app browser runtime.

Verified in browser:

- App opens at `http://127.0.0.1:5174/`.
- Title is `RMFS Layout Designer`.
- Small Demo is the default first-load layout.
- Floating canvas controls are visible.
- Debug / QA button is available in the app header and the panel also opens with `Ctrl+Shift+D`.
- Console health after final verification: no app error/warn logs in the browser.
- Screenshot evidence was captured in the in-app browser during audit.

## Features Verified

- Workflow rail and Design view render.
- Small Demo layout appears centered enough for first use.
- Canvas controls are present in first viewport.
- Simulation workflow is visible and labeled Experimental.
- Runtime collision and traffic diagnostics are present from previous pass.
- `window.__RMFS_TEST__` is present in dev/debug mode.
- `window.__RMFS_DEBUG__` is present in dev/debug mode and exposes diagnostics/state/export helpers.
- Debug globals expose queue-lane inspectors, station admission traces, why-waiting explanations, controller traces, and reservation snippets.
- Debug / QA panel captures console warnings, user actions, simulation/controller events, and exports issue reports in E2E.

## Features Still Shaky

- Simulation remains conservative and does not implement full WHCA*/CBS/MAPF.
- Station service remains one-at-a-time by default, but dispatch can fill queue lanes with multiple robots when queue capacity exists.
- Unit/E2E runtime can be long under parallel load because simulation and Konva tests are compute-heavy; sequential acceptance commands pass.
- Controller strategies are simple rule implementations, not full RAWSim-O experiment controllers.

## Suspected Regressions / Risks

- Large Demo may stress canvas/event-log performance.
- Debug and invariant checks add overhead in development/debug mode; production keeps the panel behind `?debug=true`.

## Artifacts

- Browser screenshot was displayed in chat during verification.
- Playwright artifacts are generated only for failed or traced E2E runs under `test-results/`; they are not product docs.
