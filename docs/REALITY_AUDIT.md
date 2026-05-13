# Reality Audit

Date: 2026-05-13

This audit was written after running the app, exercising the UI in a browser, and adding Playwright E2E coverage. It intentionally separates verified behavior from claims.

## Commands Run

- `git pull --ff-only`: already up to date.
- `npm install`: passed, 0 vulnerabilities.
- `npm run build`: passed. Vite still reports a large bundle warning.
- `npm test -- --run`: passed, 9 files / 45 tests.
- `npm run dev`: passed, served at `http://127.0.0.1:5174/`.
- Browser QA with the in-app browser: app opened, demo loaded, Mode A tool clicks worked, Mode B candidate drawer opened/applied, Simulation panel opened.
- `npm run test:e2e -- --workers=1`: passed, 8 browser tests.

## 1. App Startup

Status: WORKING

- App opens at `http://127.0.0.1:5174/`.
- Demo layout loads.
- Canvas is visible.
- Grid renders.
- Toolbar and side panels render.
- Fresh console check after reload showed no relevant errors or warnings.

Notes:

- The in-app browser screenshot API timed out on this heavy Konva canvas, but DOM/browser interaction remained usable. Playwright screenshots are configured for failures and produced artifacts during failed test iterations.

## 2. Manual Mode A

Status: WORKING for core editing; PARTIALLY WORKING for advanced manual QA breadth.

Verified:

- New empty Mode A layout opens from the toolbar.
- Draw road cells.
- Draw rack storage.
- Add rack, station, queue, charger, parking, rotation zone, and blocked cells.
- Select rack and edit Rack ID.
- Move rack through property panel.
- Rotate rack through toolbar.
- Delete, undo, and redo rack operations.
- Property panel edits update state.

Not fully verified manually in browser:

- Dragging every object type by mouse. Existing unit coverage verifies store-level moves, and E2E verifies rack move by property panel. Full mouse-drag coverage remains a next QA task.

Problems found:

- P1 CONFUSING UX: Simulation mode was shown like a peer stable mode. It is now visibly marked Experimental.
- P2 CONFUSING UX: The previous Flying-V placeholder option was selectable. It is now disabled in the generator dialog, while true Flying-V remains marked Experimental.

## 3. Mode B

Status: WORKING

Verified:

- Generate Mode B opens a real dialog.
- Generate layout opens the candidate drawer.
- Candidate list contains multiple alternatives.
- Candidate apply closes the drawer and writes `appliedCandidateId`.
- Applied layout remains editable; E2E updates the first rack ID after applying.
- Validation and analytics remain available after generation.

Known limitation:

- Candidate scores are analytical estimates, not simulation outcomes.

## 4. Hybrid Mode

Status: WORKING for locked-cell preservation

Verified:

- A locked blocked cell can be created.
- Running Hybrid fill preserves that locked blocked cell.
- Hybrid generation creates racks while respecting the locked constraint.

Known limitation:

- Hybrid skipped-area explanations are not yet surfaced as a detailed report. The generator preserves protected cells, but it does not yet list every skipped cell.

## 5. Import / Export

Status: WORKING

Verified:

- Layout JSON export downloads.
- Re-imported layout preserves racks, stations, chargers, parking, and rotation zones.
- Invalid JSON reports a user-visible import error and does not crash.

Known limitation:

- Visual identity is verified through object counts and state, not pixel-perfect screenshot comparison.

## 6. Validation

Status: WORKING

Verified:

- Intentional rack overlap is detected.
- Validation status updates after running validation.
- Validation panel contains overlap findings.
- Existing tests cover invalid footprint, invalid charger size, invalid parking size, unreachable racks, unreachable chargers, unreachable parking, duplicate bin data, negative quantities, and orientation issues.

Known limitation:

- Some validation messages are correct but still terse. Reachability messages should eventually include the missing approach waypoint or disconnected graph component.

## 7. Analytics

Status: WORKING

Verified:

- Analytics panel renders on startup.
- Run analytics updates the status message with score and throughput.
- Unit tests verify analytics values are non-negative for generated layouts.
- Metrics change when layouts are regenerated or edited.

Known limitation:

- Analytics remain estimates. They are not discrete-event simulation outputs.

## 8. Simulation Mode

Status: EXPERIMENTAL but not hidden

Verified:

- Simulation Mode opens.
- Editing tools are disabled while in Simulation Mode.
- Robots initialize.
- Tasks generate.
- One simple rack-to-station-to-return task cycle completes in E2E.
- Event log and metrics update.
- Reset clears simulation state.

Why Experimental:

- It is not full MAPF, CBS, WHCA*, or final traffic control.
- Reservation logic catches obvious vertex and edge-swap conflicts but does not prove deadlock freedom.
- Rack rotation-zone routing exists, but detailed animated rotation dwell and capacity control remain limited.
- Loaded-rack swept-envelope reservations are not complete.

## Fixes Made From This Audit

- Marked Simulation Mode as Experimental in toolbar, simulation panel, and left toolbox copy.
- Disabled the old Flying-V placeholder option in the generator dialog.
- Marked true Flying-V as Experimental.
- Added development-only test hooks to verify layout state from E2E tests.
- Added Playwright E2E tests for startup, manual editing, validation, import/export, Mode B, Hybrid, and experimental simulation.
- Excluded Playwright specs from Vitest so `npm test` remains a unit/integration test command.
- Added canonical RMFS domain types and waypoint-building logic to align graph code with RMFS concepts.

## Priority Issues Remaining

- P1: Add richer reachability diagnostics explaining which waypoint/approach is missing.
- P1: Add mouse-drag E2E coverage for every object type, not only rack/property-panel moves.
- P1: Add explicit simulation deadlock/replan reporting when reservations fail repeatedly.
- P2: Add candidate thumbnail previews after the core workflows remain stable.
- P2: Split the large Vite bundle with dynamic imports.
