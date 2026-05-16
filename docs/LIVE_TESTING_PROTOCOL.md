# Live Testing Protocol

Date: 2026-05-14

This protocol is for user-led testing while a developer or Codex inspects diagnostics and turns findings into reproducible issues.

## 1. Start Dev Server

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5174/?debug=true
```

## 2. Enable Debug Mode

Open the Debug / QA panel with:

- `Ctrl+Shift+D`
- the Debug / QA header button

Keep it closed while interacting with the canvas if it blocks controls; diagnostics continue recording.

## 3. User Test Script

Run these flows in order:

1. Load Small Demo.
2. Switch through Design, Generate, Analyze, Simulate, and Files.
3. Use fit, reset, zoom in/out, grid, labels, arrows, and heatmap canvas controls.
4. Wheel zoom over the canvas.
5. Spacebar-drag, middle-drag, or right-drag pan.
6. Create a new empty layout.
7. Draw roads and queue cells.
8. Place at least one rack, station, charger, parking spot, and rotation-enabled cell through the Direction tool.
9. Populate inventory.
10. Generate sample orders.
11. Initialize simulation.
12. Generate tasks.
13. Step and play until at least one task completes or a clear failure appears.
14. Load Large Demo and repeat a short simulation smoke test.
15. Try a collision-heavy scenario, such as multiple robots using one station or one narrow aisle.

## 4. Developer / Codex Inspection

During or after the user's test:

1. Open Debug / QA.
2. Review Console Errors.
3. Review Simulation / Traffic / Controller Events.
4. Review User Actions to reconstruct steps.
5. Check Performance Metrics for slow simulation steps.
6. Use `window.__RMFS_DEBUG__.getCurrentDiagnostics()` if direct browser inspection is needed.
7. Export diagnostics JSON.
8. Export an issue report if the behavior should be fixed later.

## 5. Triage Template

For every issue:

- Severity: P0, P1, P2, or P3.
- Category: simulation, traffic, inventory, layout, UI, performance, import/export, testing, docs.
- Steps to reproduce.
- Expected behavior.
- Actual behavior.
- Screenshot or Playwright trace path.
- Diagnostics JSON path.
- Likely files.
- Proposed fix.
- Test to add.

## 6. What To Include When Reporting

Always include:

- the layout used: Small Demo, Large Demo, generated candidate, or imported file
- workflow and tool
- whether simulation was running
- robot/order/task IDs if visible
- last 20 event log lines when simulation is involved
- diagnostics export
- issue report JSON or Markdown

## 7. Severity Guide

- P0: app will not load, crashes, corrupts layout data, or simulation accepts impossible overlap as valid state.
- P1: core workflow blocked or misleading, such as hidden controls, broken import/export, stuck task without clear reason.
- P2: confusing UX, incomplete realism, performance issue on large scenarios, missing diagnostic context.
- P3: polish, copy, spacing, or low-risk documentation cleanup.

## 8. Regression Commands

```bash
npm run build
npm test -- --run
npm run test:e2e -- --workers=1
```

For faster smoke while debugging UI structure:

```bash
npm run test:e2e:smoke
```
# Semantic QA Checklist - 2026-05-14

Use this checklist when testing corrected RMFS semantics:

1. Load Small Demo and confirm validation errors are zero.
2. In Design, select a station and confirm queue lanes are listed separately.
3. Use the Direction tool on a road cell and enable rack rotation.
4. Start Experimental Simulation and run one order.
5. In the event log, confirm pickup happens after reaching the pod service cell.
6. Confirm station service starts only after the robot enters the station service cell.
7. Confirm rotation events reference rotation-enabled cells, not rotation-zone objects.
8. Export JSON and confirm no `ROTATION` cell type appears.
# Focused Logic Regression Checks

When testing reports like "only one robot runs":

1. Load Small Demo.
2. Open Simulate Experimental.
3. Initialize.
4. Generate 6 tasks.
5. Step once.
6. Confirm more than one robot is active and queue lane reservations are non-zero.
7. If not, export diagnostics and inspect `queueLaneStates`, `pendingTasks`, and recent "delayed" events.

When testing reports like "the pod goes back to the old spot":

1. Set rack storage strategy to `nearest_available_storage`.
2. Run a task to completion.
3. Compare `rackStates[rackId].currentStorageLocationId`, `rackStates[rackId].currentCell`, and the visible rack position.
4. The visible rack should match the destination storage `podServiceCell`.
