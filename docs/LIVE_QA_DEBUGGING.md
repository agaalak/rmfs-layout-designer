# Live QA Debugging

Date: 2026-05-14

The app now includes a built-in Debug / QA mode so a user can test normally while a developer or Codex inspects recent errors, actions, simulation events, and state snapshots.

## Start The App

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5174/
```

Use the debug flag when testing a production-like build or when you want diagnostics enabled from the start:

```text
http://127.0.0.1:5174/?debug=true
```

The flag enables diagnostics but does not open the drawer automatically, so it will not block app controls.

## Open The Debug / QA Panel

Open from either:

- App header: Debug / QA icon button.
- Keyboard: `Ctrl+Shift+D` on Windows/Linux or `Cmd+Shift+D` on macOS.

The panel is intentionally a right-side drawer. Close it before exercising controls under the right side of the screen.

## What The Panel Captures

Sections:

- Console errors and warnings.
- Runtime exceptions and unhandled promise rejections.
- React render errors captured by the top-level error boundary.
- Simulation, traffic, controller, and invariant events.
- User actions such as workflow changes, tool changes, object selection, layout changes, simulation initialize/play/step/reset, imports, exports, zoom, pan, and fit.
- Performance samples, including simulation step timing.
- Issue report fields and export buttons.

Captured records include timestamps and, when available, current workflow, selected object, layout ID, simulation time, active robot, task, and order context.

## Browser Console Capture

The app wraps `console.warn` and `console.error` in debug mode. It also listens for:

- `window.error`
- `unhandledrejection`
- React error boundary captures

The original console methods are still called so normal developer console behavior remains intact.

## State Inspection API

When diagnostics are installed, the app exposes:

```ts
window.__RMFS_DEBUG__
```

Available methods:

- `getCurrentDiagnostics()`
- `getRecentErrors()`
- `getRecentActions()`
- `getSimulationSnapshot()`
- `getLayoutSnapshot()`
- `exportDiagnostics()`
- `clearDiagnostics()`
- `enableVerboseMode()`
- `disableVerboseMode()`

In dev/debug mode the app also exposes:

```ts
window.__RMFS_TEST__
```

This contains store handles for deterministic browser tests and emergency live inspection.

## Export Diagnostics

Click **Export diagnostics** to download a JSON bundle with:

- app version and URL
- browser user agent
- layout snapshot
- simulation snapshot
- recent debug events
- recent user actions
- recent errors/warnings
- performance samples

Use this when the issue is hard to reproduce from a short screen recording.

## Report Issue Export

Use the **Report Issue** section to enter:

- title
- category
- severity
- description
- expected behavior
- actual behavior

Click **Export issue JSON + Markdown**. The app downloads a structured JSON report and a Markdown summary. Nothing is sent to a server.

## Live QA Workflow

1. Start the app with `npm run dev`.
2. Open `http://127.0.0.1:5174/?debug=true`.
3. Reproduce the issue.
4. Open Debug / QA with `Ctrl+Shift+D`.
5. Check console/runtime errors first.
6. Check simulation/traffic/controller events if the issue involves robots, orders, stations, racks, or collisions.
7. Check user actions to confirm the exact reproduction sequence.
8. Export diagnostics or an issue report.
9. Add or update an item in `docs/ISSUE_BACKLOG.md`.

## Reading Simulation And Collision Events

Important event categories:

- `controller`: order, rack, station, robot, and storage decisions.
- `traffic`: reservation conflicts, collision prevention, waits, replans, blocked robots.
- `simulation`: initialization, task generation, station service, order completion.
- `invariant`: simulation state consistency warnings/errors.

For traffic problems, first inspect:

- conflict count
- repeated conflict pairs
- blocked robots
- invariant violations
- the robot's waiting reason and conflict target

## Playwright Trace Workflow

When an E2E test fails, Playwright writes traces under `test-results/`.

Open a trace:

```bash
npx playwright show-trace test-results/<failed-test>/trace.zip
```

The trace is often the fastest way to confirm whether a button was missing, covered by a panel, disabled, or throwing a console error.
# Semantic Debugging Addendum - 2026-05-14

When debugging queue/station/pod/rotation issues, inspect:

- `layout.queueLanes` for ordered queue cells and `directionToNext`
- `station.queueLaneIds` for linked queues
- `station.cell` for the actual service cell
- `storageLocation.podServiceCell` for pickup/drop target
- `layout.cells.filter(cell => cell.allowRotation)` for rotation-enabled cells
- simulation events around `reached rack pickup`, `arrived at station service cell`, `rotated`, and `entered destination pod service cell`

Diagnostics exports now include the migrated layout model, so issue reports can show whether a failure happened on a queue cell, station cell, pod service cell, or rotation-enabled cell.

