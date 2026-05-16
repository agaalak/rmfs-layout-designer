# RMFS Layout Designer Implementation Status

## Already Implemented

- React, TypeScript, Vite, Tailwind, Zustand, and React Konva application scaffold.
- Workflow-oriented editor shell with app header, contextual toolbar, workflow rail, grouped Design toolbox, 2D grid canvas, workflow-specific right panels, and status bar.
- Primary workflows: Design, Generate, Analyze, Simulate Experimental, and Files.
- Responsive drawer access for Design tools and workflow panels below the desktop side-panel breakpoint.
- Manual Mode A layout creation from an empty grid.
- Procedural Mode B generation for external, internal, distributed, hybrid, dense cross-aisle, and true stair-step Flying-V families.
- Stable Mode B families are traditional external, internal centralized, internal distributed, hybrid external/internal, and dense cross-aisle. True Flying-V is Experimental. The old Flying-V placeholder option is disabled in the UI.
- Generated layout candidate comparison drawer with sortable metrics, top-three comparison, preview, and apply workflow.
- Candidate preview/apply UX now separates temporary preview from final apply; closing an unapplied preview restores the previous active layout.
- Hybrid generation that starts from the current layout and fills around protected constraints.
- Visual object placement for racks, stations, queues, chargers, parking spots, rotation-enabled cells, blocked cells, human zones, and docks.
- Object selection, drag/drop movement, deletion, rotation, copy/paste for racks, undo, and redo.
- Continuous paint/erase behavior for cell drawing tools.
- Traffic direction editing for selected cells with north/south/east/west controls and one-way graph support.
- Rack model with faces and bin records, station model, charger model, parking model, and rotation-zone model.
- Full selected-rack bin table with editable barcode, location, SKU, quantity, dimensions, regeneration, SKU clearing, location auto-numbering, and rack-bin CSV import/export.
- Controlled multi-cell rack footprints up to `2x2` cells with multi-cell rendering, validation, movement, rotation, graph approach nodes, and import/export roundtrip support.
- Validation for bounds, footprint, overlap, charger size, parking size, connectivity, and orientation/face access.
- Analytics modules for storage, distance, orientation, station balance, congestion proxy, performance estimates, and scoring.
- Analyze workflow with summary cards, topic tabs, validation filters, heatmap controls, and analytics/report exports.
- Toggleable heatmap overlay with distance, congestion, and validation modes.
- Import/export for versioned layout JSON, analytics JSON, analytics CSV, Markdown report, PNG, and SVG.
- Import migration for older layouts without a schema version and user-friendly invalid JSON errors.
- Status bar with selected tool/object/cell, hover row/column, zoom, validation error count, and unsaved changes indicator.
- Keyboard shortcut help dialog, clear-layout confirmation, and load-demo dirty-layout confirmation.
- Quick-start empty state with Start empty Mode A layout, Generate layout, and Load demo actions.
- Default Small Demo layout on first load, plus optional Large Demo / stress layout actions.
- Always-visible floating canvas view controls for fit, reset, zoom, grid, labels, direction arrows, and heatmap across every workflow.
- Pointer-centered mouse wheel zoom plus spacebar/middle/right-drag canvas panning.
- Design/Simulation mode toggle that locks normal editing during simulator playback.
- 2D simulation data models for robots, tasks, route plans, station queues, reservation snapshots, event logs, and metrics.
- Robot initialization from parking spots first, chargers second, then perimeter road fallback cells.
- Random nearest-station, HOT/WARM/COLD weighted, and manual rack-to-station task creation.
- Shortest-path simulation planning over the existing layout graph with one-way traffic, blocked-cell avoidance, rack approach-cell logic, station queue/service routing, rotation-zone detours, and return paths.
- Time-expanded reservation table that prevents same-cell and edge-swap conflicts, reserves loaded rack envelopes, reserves finite resources, and can insert wait steps.
- Step-based simulation engine with smooth robot pose interpolation, loaded/unloaded speeds, lift/drop/service timing, station FIFO queues, rack carry/drop behavior, task completion, metrics, and event logging.
- Canvas simulation layers for robots, yaw arrows, carried racks, planned paths, reservation overlays, and station queue occupancy.
- Simulation control panel with initialize, generate tasks, create manual task, play/pause/step/reset, speed multiplier, display toggles, settings, event filters, and simulation config/log/metrics exports.
- Traffic Control diagnostics section in Experimental Simulation Mode showing conflicts, waits, replans, deadlocks, active reservations, blocked/waiting robots, and traffic policy settings.
- Carried-rack collision envelope module with unloaded/loaded robot envelopes, rectangular rack rotation support, blocked-cell/static-rack overlap detection, and reservation footprint conversion.
- Runtime collision guard that checks simulation state after movement, prevents accepted same-cell, edge-swap, loaded-envelope, stored-rack, and blocked-cell overlaps, rolls unsafe moves back, and logs collision-prevented warning events.
- Built-in Debug / QA panel opened from the app header or `Ctrl+Shift+D`, with console/runtime capture, user action recording, simulation/traffic/controller event mirrors, performance samples, diagnostics export, and issue report export.
- Top-level React ErrorBoundary that captures render failures into the debug store and displays a user-friendly fallback instead of leaving a blank app.
- `window.__RMFS_DEBUG__` live diagnostics API and `window.__RMFS_TEST__` dev/test state inspection hook.
- Simulation invariant checker for robot envelope overlaps, invalid rack/storage ownership, duplicate active rack assignment, order over-fulfillment, queue overflow, invalid task references, invalid route cells, and invalid reservations.
- Controller strategy registry with descriptions and decision traces for order, rack, station, robot, storage, charging, path planning, and traffic-control strategy decisions.
- Resource reservation support for rotation-enabled cells, station queue slots, station service, storage locations, chargers, and parking.
- Conservative deadlock detector and recovery hook for repeated conflict pairs and robots blocked beyond configured thresholds.
- Deterministic simulation scenario runner for non-browser regression tests.
- Versioned layout model support for optional simulation config.
- First-class persisted `StorageLocation` records with allowed rack types, default orientation, approach waypoint IDs, current rack occupancy, reservation status, and import migration from older rack-home-cell layouts.
- Rack operational fields for home/current storage location and statuses such as `STORED`, `RESERVED`, `BEING_CARRIED`, `AT_STATION`, `RETURNING`, and `UNAVAILABLE`.
- Order and order-line models with priority, status, SKU demand, assigned rack/bin, fulfillment quantity, completion, and failure reason.
- Inventory snapshots derived from rack bins, including SKU, quantity, reserved quantity, and simulation update timestamps.
- Explicit controller modules for order assignment, rack selection, station assignment, robot assignment, rack storage/reallocation, and charging policy boundaries.
- Operational task pipeline layered over movement tasks, with `PICK_ORDER`, `REPLENISH_RACK`, `MOVE_RACK_TO_STATION`, return/storage states, timestamps, and route segments.
- Simulation Mode now creates sample orders from actual rack inventory, selects racks by SKU availability, reserves inventory/racks/storage, updates inventory at service, completes orders after rack return, and records structured operational events.
- Rack storage/reallocation strategies include return home, nearest available storage, and keep hot racks near stations.
- Multi-robot dispatch now uses queue lane capacity instead of a single active-task station lock.
- Simulation Mode renders stored racks from runtime rack/storage state, so relocated racks appear at their current storage location.
- Simulation UI now includes Orders & Inventory, Controllers, operational task trace, robot/station state summaries, and orders/inventory CSV exports.
- Simulation Readiness card now explains missing layout/inventory/station/storage/simulation prerequisites and exposes one-click inventory/order fixes.
- Orders & Inventory actions now populate sample rack-bin inventory, refresh the inventory snapshot, generate sample orders from available SKU inventory, clear orders, clear inventory, and auto-fix readiness where safe.
- Canonical RMFS domain type definitions for waypoints, storage locations, rack/pod operational state, station resources, orders, and controller boundaries.
- Graph construction now derives routing waypoints before building road edges.
- Playwright E2E suite for startup, manual editing, validation, import/export, Mode B, Hybrid, and Experimental Simulation Mode.
- Fast Playwright smoke suite for startup, workflow navigation, and responsive drawer checks.
- README explaining RMFS concepts, modes, analytics, validation, import/export, limitations, and roadmap.
- UI/UX guidelines, UX audit, and performance notes documenting workflow structure and future contributor rules.
- Current-state audit, RAWSim-O behavior gap audit, issue backlog, architecture review, performance/robustness audit, live QA debugging guide, and live testing protocol.

## Partially Implemented

- Mode B candidate generation now shows a candidate comparison drawer. Ranking is still based on analytical estimates rather than simulation.
- Hybrid locking is supported through optional `locked` flags on cells and objects. The generator respects locked/protected cells and objects, but there is no separate lock-management layer beyond the property panel checkboxes.
- Congestion analytics are a shortest-path proxy over a rack sample, not a traffic simulation or MAPF model.
- Heatmaps are analytical overlays but not yet a full multi-layer GIS-style explorer.
- SVG export captures layout cells and core layout coloring; PNG captures the current rendered canvas.
- Simulation Mode is explicitly Experimental. Reservation handling is useful for early playback and now includes loaded envelopes and simple resource capacity, but it is not a complete MAPF solver and does not prove deadlock freedom.
- Rack rotation-zone routing now has explicit pre/post rotation states, dwell timing, orientation updates, and event-log entries. It is still a simple single-robot-at-zone treatment, not a full rotation-zone capacity scheduler.
- Loaded-robot reservations include carried-rack footprint cells. Continuous swept-envelope geometry and kinematic turn-radius constraints are still future work.
- Order generation uses sample SKU demand from current inventory. It is not yet a full customer-order wave/batch optimizer.
- Replenishment support exists in inventory helpers and station service paths, but the UI still focuses mainly on pick-order generation.
- Responsive behavior is improved with drawers, but phone-sized editing is still not a primary target and drawers still need focus-trap/Escape-close hardening.

## Missing Features

- CAD/DXF import.
- Full MAPF path planning, CBS/WHCA*, and advanced fleet traffic control with guaranteed deadlock recovery.
- 3D/RTS-style robot simulator.
- Cloud persistence.

## Broken Features Fixed In This Pass

- Run analytics was previously only an export action; it is now a real toolbar action with live status, while exports are separate.
- The old heatmap only used Manhattan distance to stations; it now supports graph distance, congestion proxy, and validation issue overlays.
- Direction arrows previously overloaded the canvas for two-way layouts; arrows now focus on restricted/one-way cells to keep startup responsive.
- The canvas now supports continuous drawing while dragging.
- Validation findings can now select/highlight their related object or cell.
- Hybrid constraints now include explicit lock flags and protected object/cell handling.
- Mode B no longer hides all generated alternatives; the comparison drawer stays open until the user applies or closes it.
- The old Flying-V placeholder is no longer exposed as a selectable workflow; the real first-pass diagonal/stair-step generator is under Experimental `true_flying_v`.
- Rack footprint validation no longer rejects all oversized racks; it supports up to 2x2 occupied cells and rejects larger footprints.
- Rack bin duplicate barcode/location, negative quantity, and over-max quantity validation now exists.
- Import/export now includes schema version `0.2.0`, app version, timestamps, and migration warnings.
- The simulator pass added a real Simulation Mode instead of leaving robot movement as roadmap-only text.
- Konva simulator overlays are grouped into a small number of canvas layers, removing fresh layer-count warnings during browser QA.
- Simulation config import/export now validates JSON and reports friendly errors.
- Stabilization pass marked Simulation Mode Experimental, disabled the old Flying-V placeholder option, and marked true Flying-V Experimental.
- Stabilization pass added `docs/REALITY_AUDIT.md` and `docs/RAWSIMO_ALIGNMENT.md`.
- Stabilization pass added Playwright E2E tests and fixed Vitest configuration so browser specs are not run by the unit-test runner.
- UX pass replaced the overloaded toolbar with workflow navigation and contextual toolbars.
- UX pass reorganized the toolbox, property panels, Analyze workflow, candidate drawer, and Experimental Simulation presentation.
- UX pass split Vite chunks so the previous large single-bundle warning is gone.
- Responsive follow-up added drawer panels and `npm run test:e2e:smoke` for faster UI regressions.
- RMFS behavior pass promoted storage locations, orders, inventory, controller strategies, operational tasks, rack lifecycle state, station inventory service, rotation events, and storage reallocation into real simulator code.
- Traffic-control pass added loaded rack envelopes, envelope/resource reservations, wait/replan counters, conservative deadlock detection/recovery, traffic metrics, scenario runner, and a targeted Traffic Control UI section.
- User-reported stabilization pass confirmed and fixed the oversized default demo, missing workflow-independent view controls, weak mouse zoom/pan, missing order/inventory recovery actions, and globally skipped interactive canvas E2E coverage.
- User-reported stabilization pass added runtime collision enforcement so the simulator does not accept visually overlapping robot/rack states after movement.
- Logic/algorithm bug-fix pass removed the station-level dispatch serializer that made only one robot appear to run.
- Logic/algorithm bug-fix pass added queue lane runtime reservations, runtime rack rendering, nearest-available storage scoring by `podServiceCell`, and rack `currentCell` updates after drop.
- Diagnostics follow-up fixed queue-head robots repeatedly attempting to enter an occupied station service cell and made collision rollback snap to the previous safe cell center.

## Test Status

- `npm install`: passed, 0 vulnerabilities.
- `npm run build`: passed. Manual chunks avoid the previous large single-bundle warning.
- `npm test -- --run`: 15 files passed, 94 tests passed.
- `npm run test:e2e -- e2e/debug-qa.spec.ts --workers=1`: 3 debug/QA browser tests passed.
- `npm run test:e2e -- --workers=1`: 18 browser tests passed, 0 skipped.
- Browser QA through Playwright at `http://127.0.0.1:5174/`: covered app load, Small Demo first load, manual canvas editing, object manipulation, validation/analytics, import/export, Mode B candidate apply, Hybrid lock preservation, one simple simulation cycle, always-visible canvas controls, wheel zoom, space-drag pan, workflow navigation, responsive drawers, Simulation workflow availability, and a live Small Demo simulation step with 4 active robots / 4 assigned tasks.

## Completion Plan

1. Keep the current React/Konva/Zustand architecture.
2. Add focus trap and Escape-close behavior to responsive drawers and dialogs.
3. Improve candidate previews with thumbnail mini-maps.
4. Add virtualized bin tables for very large rack configurations.
5. Add richer collision scenarios for loaded multi-cell racks in browser E2E, beyond the current unit-level deterministic checks.
6. Refactor `simulationEngine.ts` and `SimulationPanel.tsx` before adding WHCA-style MAPF-lite.
7. Add MAPF planning only after the operational RMFS model remains stable across larger scenarios.
8. Continue toward CAD/DXF import, 3D view, and cloud persistence in later passes.
# Semantic Correction Update - 2026-05-14

The active layout schema is now `0.3.0`.

Completed in this pass:

- Removed `ROTATION` as an active cell type.
- Added rotation permissions as `LayoutCell` properties controlled from the Direction/Traffic properties UI.
- Added first-class `QueueLane` records.
- Detached queue cells from station records.
- Updated generated Small/Large demos to create ordered directional queue lanes.
- Updated station routing so service paths end at `station.cell`.
- Updated rack/pod routing so pickup and drop paths end at `StorageLocation.podServiceCell`.
- Added import migration from old rotation zones and station-owned queue cells.
- Added validation for queue lanes, pod service cells, and rotation-enabled cells.
- Updated E2E tests to configure rotation through the Direction tool.

Verification:

- `npm run build` passed.
- `npm test -- --run` passed: 14 files, 88 tests.
- `npm run test:e2e -- --workers=1` passed: 18 tests.

Known limitation:

- Experimental Simulation Mode is semantically corrected for queue, station, pod service cell, and rotation-cell workflows, but it is still not full MAPF.
