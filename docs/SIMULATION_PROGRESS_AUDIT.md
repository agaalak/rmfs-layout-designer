# Experimental Simulation Progress Audit

Date: 2026-05-13

## 1. Build Status

- `npm install`: passed, 0 vulnerabilities.
- `npm run build`: passed.
- Build note: later manual chunking split React, canvas, simulation, analytics, and generation code. Current builds do not emit the previous large single-bundle warning.

## 2. Test Status

- `npm test -- --run`: passed.
- Result: 9 test files passed, 45 tests passed.
- Added simulation coverage for config defaults, robot spawning, task generation, weighted rack selection, path planning, reservations, simulation state transitions, station queues, reset, exports, app mode, and config import validation.

## 3. Browser Load Status

- Dev server: `http://127.0.0.1:5174/`.
- Page title: `RMFS Layout Designer`.
- Browser load: passed.
- Demo layout loaded: passed.
- Fresh console check after reload: no errors or warnings.

## 4. Existing Editor Features Verified

- Demo layout loads on the canvas.
- Design/Simulate toolbar toggle is visible and functional. Simulate is now visibly marked Experimental.
- Mode B candidate comparison was verified before simulator work: Generate Mode B opens the candidate drawer, and candidate preview/apply works.
- Simulation pass did not remove existing editor affordances; Design Mode remains the normal manual editor, while Experimental Simulation Mode locks editing tools.

## 5. Broken UI Discovered Before Simulator Work

- No baseline app-load runtime errors were found.
- During simulator browser QA, Konva reported layer-count warnings after adding playback overlays. The canvas was refactored so cell, heatmap, grid, arrows, objects, simulation overlays, and selection are grouped into a smaller number of Konva layers. A fresh reload after the fix produced no console errors or warnings.

## 6. Simulator Features Implemented In This Pass

- Added Design Mode and Experimental Simulation Mode to the app shell.
- Added simulation models for robots, tasks, route plans, station queues, reservation snapshots, event logs, metrics, and simulation config.
- Added robot spawning from parking spots first, charging spots second, then perimeter road cells.
- Added task generation for random nearest-station tasks, HOT/WARM/COLD weighted tasks, and manual rack-to-station tasks.
- Added shortest-path planning over the existing layout graph with support for one-way/two-way traffic, blocked cells, storage `podServiceCell` pickup/drop targets, ordered queue lanes into `station.cell`, rotation-enabled-cell detours, and rack return paths.
- Added a basic time-expanded reservation table that blocks same-cell and edge-swap conflicts and can insert wait steps.
- Added a deterministic step-based simulation engine with smooth robot movement, loaded/unloaded speed handling, lift/drop/service dwell timing, station FIFO queues, rack carry/drop behavior, task completion, metrics, and event logging.
- Added visual playback layers for robots, robot yaw arrows, carried racks, planned paths, reservations, and station queue occupancy.
- Added a Simulation panel with initialize, generate tasks, manual task creation, play, pause, step, reset, speed multiplier, display toggles, settings, event filters, and metrics.
- Added simulation exports for config JSON, event log CSV, and metrics CSV.
- Added simulation config JSON import with validation and friendly error messages.
- Extended the layout model to allow optional simulation config data.
- Updated README and implementation status documentation.
- Created `docs/SIMULATION_ARCHITECTURE.md`.
- Later semantic-alignment passes removed station-owned queue semantics, moved rotation to a traversable-cell property, made queue-lane runtime state the source of truth for station assignment/admission, and blocked station cells as generic pass-through shortcuts.

## 7. Known Simulator Limitations

- The traffic system is reservation-based and practical, but it is not full MAPF, CBS, or WHCA*.
- The reservation table prevents obvious same-cell and edge-swap conflicts but does not prove global deadlock freedom.
- Loaded robots reserve carried rack grid envelopes, but continuous swept-envelope geometry is still future work.
- Rotation-enabled-cell routing and dwell exists, but it is still a simple cell-resource reservation rather than a full scheduler.
- Battery drain, charger assignment policy, maintenance workflows, and detailed station labor/service logic are intentionally basic.
- This remains a 2D simulator foundation, not the final 3D/RTS-style simulator.
