# User-Reported Issues Audit

Date: 2026-05-14

Commands run:

- `npm install` - passed.
- `npm run build` - passed.
- `npm test -- --run` - passed, 67 unit/component tests.
- `npm run test:e2e -- --workers=1` - passed only because the interactive canvas suite was globally skipped.
- `npm run dev` - started successfully on `http://127.0.0.1:5174/`.

Browser startup:

- Status: WORKING.
- The app opened in the in-app browser without console errors on load.
- Demo layout, workflow rail, canvas, status bar, and panels rendered.

## 1. Robot Collision Behavior

Status: CONFIRMED / PARTIAL

Reproduction steps:

1. Open the app.
2. Switch to Simulate Experimental.
3. Initialize robots and generate tasks.
4. Step/play the simulation on the default demo.
5. Inspect simulation code and E2E coverage.

Expected behavior:

- Runtime robot envelopes should be checked on every simulation step.
- Robots should not visually occupy the same cell or edge-swap through one another.
- Loaded robots should reserve and enforce the carried rack footprint, including 1x1, 1x2, 2x1, and 2x2 racks.
- Collision prevention should be visible in diagnostics and event log.

Actual behavior:

- Reservation planning exists, but there was no dedicated per-step runtime collision guard.
- `src/simulation/collisionEnvelope.ts` provides envelope math, and `src/simulation/trafficController.ts` checks planned loaded paths, but `src/simulation/simulationEngine.ts` advanced robot poses without a final pre/post movement rollback guard.
- Interactive browser tests that should catch visual overlap were globally skipped in `e2e/layout-editor.spec.ts`.

Likely source files:

- `src/simulation/simulationEngine.ts`
- `src/simulation/collisionEnvelope.ts`
- `src/simulation/trafficController.ts`
- `src/simulation/reservationTable.ts`
- `src/components/canvas/RobotLayer.tsx`
- `e2e/layout-editor.spec.ts`

Priority: P0

## 2. Demo Layout Is Too Large

Status: CONFIRMED

Reproduction steps:

1. Open the app.
2. Observe the default canvas/status bar.

Expected behavior:

- First load should use a small, legible demo that fits comfortably on screen and can run a short simulation immediately.
- A larger 40x60 layout may remain available as an optional stress demo.

Actual behavior:

- First load uses the default procedural generation params: `40 x 60`, 8 stations, 8 chargers, 12 parking spots, 8 rotation zones, rack fill ratio `0.78`.
- Browser status showed `40 x 60 grid - 1.2 m cells - zoom 100%`.
- The demo is dense and hard to inspect on first load.

Likely source files:

- `src/generators/proceduralGenerator.ts`
- `src/store/layoutStore.ts`
- `src/components/layout/TopToolbar.tsx`
- `src/components/layout/RightPropertiesPanel.tsx`

Priority: P1

## 3. View Controls And Mouse Navigation

Status: CONFIRMED

Reproduction steps:

1. Open the app.
2. Switch between Design, Generate, Analyze, Simulate, and Files workflows.
3. Inspect canvas navigation behavior and code.

Expected behavior:

- Fit, zoom in/out, reset zoom, grid toggle, labels toggle, direction arrows toggle, and heatmap toggle should remain visible from every workflow.
- Mouse wheel should zoom around the pointer.
- Middle mouse, right mouse, spacebar-drag, and Pan tool should pan.
- Fit to Screen should compute scale from actual canvas and grid dimensions.

Actual behavior:

- Fit/zoom/toggle controls were toolbar-specific, mainly visible in Design workflow.
- `src/store/uiStore.ts` implemented `fitToScreen` as a hardcoded `zoom: 0.72`.
- `src/components/canvas/LayoutCanvas.tsx` had no wheel zoom handler.
- Stage panning depended on the Pan tool; mouse/touchpad navigation was weak.
- Stage centering recalculated when zoom/layout/container changed, which could fight panning and pointer-centered zoom.

Likely source files:

- `src/components/canvas/LayoutCanvas.tsx`
- `src/components/canvas/CanvasViewControls.tsx` (new)
- `src/store/uiStore.ts`
- `src/utils/viewMath.ts` (new)
- `src/components/layout/TopToolbar.tsx`

Priority: P0

## 4. New Layout Order & Inventory Readiness

Status: CONFIRMED / PARTIAL

Reproduction steps:

1. Create a new empty Mode A layout.
2. Add a minimal rack/station/road setup.
3. Switch to Simulate Experimental.
4. Try Initialize / Generate tasks.

Expected behavior:

- Empty layouts may remain truly empty, but the app should clearly explain missing inventory/orders/resources.
- A starter/small demo should be simulation-ready.
- Users should have one-click actions to populate rack inventory, generate sample orders from inventory, and auto-fix simple simulation readiness problems.

Actual behavior:

- Procedural racks have demo SKU inventory, but empty/manual layouts can easily have no usable SKU inventory.
- Simulation readiness correctly blocks missing inventory, but the UX did not provide enough obvious one-click recovery.
- The Orders & Inventory panel only stated that task generation creates sample orders from available inventory; if no inventory existed, the workflow was confusing.

Likely source files:

- `src/components/panels/SimulationPanel.tsx`
- `src/store/layoutStore.ts`
- `src/store/simulationStore.ts`
- `src/simulation/inventory.ts`
- `src/simulation/orderGeneration.ts`
- `src/validation/validateSimulationReadiness.ts`

Priority: P1

## E2E Coverage Gap

Status: CONFIRMED

Problem:

- `e2e/layout-editor.spec.ts` had a file-level `test.skip(true, ...)`, which skipped all interactive layout/canvas coverage.
- `e2e/smoke.spec.ts` also skipped workflow navigation and responsive drawer smoke tests.

Expected behavior:

- Core canvas workflow tests should run.
- It is acceptable to keep targeted future tests skipped, but not the whole interactive suite.

Priority: P0

## Implementation Plan

1. Re-enable interactive E2E tests and make them robust with store-assisted setup where canvas clicking is not the behavior being tested.
2. Add a runtime collision guard after robot movement to prevent visual overlaps, edge swaps, loaded-envelope/static obstacle overlaps, and to log collision-prevented events.
3. Add small and large demo presets; make Small Demo the default first-load layout and keep Large Demo available.
4. Add always-visible canvas view controls and real pointer-centered wheel zoom, fit-to-screen, reset view, and mouse/spacebar panning.
5. Add inventory/order readiness actions in Simulation Mode: populate inventory, generate orders from inventory, clear generated orders/inventory, and auto-fix basic readiness gaps.
6. Add deterministic unit and E2E coverage for the fixes.

## Fix Verification

Completed in this pass:

- Interactive Playwright canvas tests are no longer globally skipped.
- Small Demo is now the first-load layout; Large Demo remains available.
- Floating canvas view controls are visible across all workflows.
- Wheel zoom and spacebar drag pan are implemented and covered by E2E.
- Runtime collision guard prevents accepted same-cell, edge-swap, blocked-cell, and stored-rack overlap states.
- Orders & Inventory has Populate Inventory, Generate Orders, Clear Orders, Clear Inventory, Refresh Inventory, and Auto-fix Readiness actions.

Final verification:

- `npm run build` - passed.
- `npm test -- --run` - 74 tests passed.
- `npm run test:e2e -- --workers=1` - 15 browser tests passed, 0 skipped.
