# RMFS Layout Designer

`rmfs-layout-designer` is a local visual web app for designing, generating, editing, validating, and analyzing Robotic Mobile Fulfillment Systems warehouse layouts.

RMFS means Robotic Mobile Fulfillment System: a shelf-to-person or pod-to-picker system where robots carry mobile racks or pods between storage areas and workstations. This app helps design the warehouse layout before building a robot movement simulator.

This is not the final 3D robot simulator, and it is not a full RAWSim-O replacement. It is a visual RMFS layout editor plus analytical validation, estimates, and an experimental 2D time-based robot simulation foundation.

## What The App Does

- Create Mode A manual layouts on a 2D grid canvas.
- Generate Mode B procedural layouts and then visually modify them.
- Create Hybrid layouts by drawing fixed constraints first, then filling the rest procedurally.
- Add, drag, drop, select, multi-select, delete, copy, paste, and rotate layout objects.
- Configure warehouse rows, columns, cell size, and physical dimensions.
- Model racks/pods, stations, queues, chargers, parking, rotation zones, blocked cells, human zones, docks, and traffic directions.
- Run validation and analytics without simulating robot movement.
- Export/import layout JSON.
- Export analytics JSON, CSV, Markdown report, PNG, and SVG.
- Lock manually defined cells/objects so Hybrid generation preserves them.
- Show graph-distance, congestion, or validation heatmaps on the canvas.
- Compare generated layout candidates before applying one to the editable canvas.
- Edit rack bins in a table and import/export rack-bin CSV files.
- Switch to Experimental Simulation Mode, initialize robots, generate inventory-backed sample orders, select racks/stations/robots through simple controllers, play/pause/step a 2D top-down simulation, and export simulation metrics/logs/orders/inventory.

## Workflow-Oriented UI

The main UI is organized by workflow instead of one overloaded toolbar:

- Design: manual editing, grouped drawing/placement tools, selection, rotation, deletion, and object properties.
- Generate: Mode B generation, Hybrid generation, candidate preview, score comparison, and explicit apply.
- Analyze: validation, analytics cards/tabs, heatmap controls, issue filters, and analytics/report exports.
- Simulate: Experimental 2D playback controls, task setup, metrics, event log, and simulation exports.
- Files: import/export layout JSON, PNG/SVG image export, Markdown report, and analytics exports.

The header shows the current layout, workflow, unsaved state, and a primary contextual action. The left workflow rail switches between workflows; the left toolbox appears for Design and is grouped into Navigation, Draw Cells, Place Resources, and Traffic.

On screens below the desktop editing breakpoint, the Design toolbox and workflow side panels open as responsive drawers from the bottom of the screen. The canvas remains visible, and the header warns that larger screens are recommended for serious layout editing.

## Modes

Mode A, manual, starts with an empty grid. Use the left toolbox to draw roads, rack storage, queues, blocked cells, human zones, and docks, or place racks, stations, chargers, parking, and rotation zones.

Mode B, procedural, opens a generation dialog where you choose the layout family, dimensions, rack fill ratio, aisle spacing, station count, charger count and size, parking count, traffic mode, rotation zone count, and candidate count. The app generates alternatives, opens a candidate comparison drawer, lets you sort by score/density/distance/congestion/errors, previews selected candidates on the canvas, and applies the selected candidate as a fully editable layout. The stable generator focus is traditional external, internal centralized, internal distributed, hybrid external/internal, and dense cross-aisle layouts. True Flying-V remains Experimental, and the old Flying-V placeholder is disabled.

Hybrid mode uses the current layout as fixed constraints. Draw walls, columns, human zones, docks, mandatory aisles, fixed stations, chargers, and parking first, then mark important cells or objects as locked in the property panel. The Hybrid generator fills racks, rack blocks, aisles, queues, rotation zones, and remaining support cells around protected constraints.

## Grid Size And Rack Footprint

Grid cells are defined in meters, for example `1.2 m x 1.2 m` or `1.0 m x 1.0 m`. The warehouse can be edited by rows and columns. The physical size is derived as:

- `width = columns * cell width`
- `depth = rows * cell depth`

Rack footprints are converted to occupied grid cells with `ceil(footprint / cell size)`. Supported rack footprints are `1x1`, `1x2`, `2x1`, and `2x2` cells. Rectangular rack footprints rotate with the rack when orientation changes by 90 degrees. Larger footprints are rejected with a validation error.

## Charging And Parking

Charging spots can occupy one or two grid cells. They cannot overlap racks, stations, parking, blocked cells, queue cells, or human zones, and validation checks reachability through the road graph.

Parking spots occupy exactly one grid cell. Invalid or unreachable parking spots are outlined and listed in the validation panel.

## Racks, Faces, And Bins

The app uses the term rack in code and UI, while also treating racks as RMFS pods conceptually. Each rack has:

- Rack ID and rack type
- Home cell row/column
- Footprint and height
- Current orientation and allowed orientations
- Face A and Face B
- Bin rows, columns, barcode/location patterns, SKU and quantity fields in the data model and right-side rack bin editor
- Optional HOT/WARM/COLD demand class
- Home/current storage location IDs and operational status for simulation

Face A and Face B are visually distinguished on each rack by the split rack coloring. A rack orientation arrow shows the current orientation. When a rack is selected, the right panel shows a full editable bin table with regeneration, SKU clearing, location auto-numbering, and rack-bin CSV import/export.

## Storage Locations

Storage locations are first-class layout records. Generated and imported layouts contain storage locations with occupied cells, allowed rack types, default orientation, approach waypoint IDs, current rack occupancy, reservation state, and status. Older layouts without storage locations are migrated from rack home cells and rack-storage cells on import.

## Candidate Comparison

Mode B candidate generation opens a drawer with each generated candidate's family, rack/station/charger/parking counts, storage density, average and p90 rack-to-station distance, congestion risk, orientation penalty score, overall score, and validation error count.

You can:

- Sort candidates by score, density, distance, congestion risk, or validation errors.
- Select any candidate to preview it on the canvas.
- Compare the top three candidates in a compact side panel.
- Apply the selected candidate and keep editing it manually.

## Orientation Zones

Stations have a required rack orientation and accepted rack faces. Rotation zones define where a carried rack may be analytically rotated.

The app estimates:

- Whether pre-station rotation is required
- Whether post-station rotation is required before returning home
- Whether a compatible rotation zone exists
- Estimated rotation detour distance
- Estimated rotation time penalty
- Invalid orientation and face-access cases

Design-mode analytics estimate orientation effects without animated rack rotation. Simulation Mode can route carried racks through compatible rotation zones, but full rack-rotation timing/control is still a future MAPF-level refinement.

## Analytics

The analytics panel updates after layout changes. The Run analytics toolbar button refreshes the visible status summary; export buttons create JSON, CSV, and Markdown artifacts. Metrics include:

- Storage: total cells, usable cells, rack count, rack storage cells, bin count, density, aisle ratio, hot/warm/cold distribution
- Distance: average, median, p90, and max rack-to-station distance, charger access, parking access, rotation-zone access
- Orientation: pre/post rotation percentages, detour distance, time penalty, invalid orientation count, face-access violations
- Station: workload balance, queue pressure, nearest-station rack assignments, bottleneck estimate
- Congestion proxy: likely busiest shortest-path edges, dead ends, narrow corridors, congestion risk
- Performance estimate: cycle distance/time, robot-limited throughput, station-limited throughput, system throughput, robot utilization, station utilization

## Heatmaps

The toolbar heatmap toggle shows an analytical canvas overlay. The mode selector supports:

- Distance: graph distance to the nearest station or station approach.
- Congestion: likely busy aisle cells from sampled shortest rack-to-station paths.
- Validation: cells involved in validation findings.

These overlays are estimates. They are not robot animation, traffic control, or MAPF simulation.

## 2D Simulation Mode

Simulation Mode is Experimental. It adds a time-based top-down playback layer on the current layout. Use the Design/Simulate toggle in the toolbar. In Simulation Mode, layout editing tools are disabled so the road graph, racks, stations, chargers, parking, and blocked cells stay stable while robots are running.

The simulation panel can:

- Initialize robots from parking spots first, charging spots second, then perimeter road cells if needed.
- Configure robot count, loaded/unloaded speed, lift/drop time, station service time, reservation time step, task count, and task generation mode.
- Generate sample customer orders from current SKU inventory.
- Select racks by nearest rack with SKU, most inventory for SKU, or HOT/WARM/COLD preference.
- Select stations, robots, and return storage through explicit controller strategy dropdowns.
- Create a manual rack-to-station task from selected rack/station dropdowns.
- Play, pause, step, reset, and choose speed multipliers from `0.25x` through `10x`.
- Toggle robot labels, planned paths, reservation overlays, and collision checking.
- Show live simulation time, active/completed/failed task counts, blocked robots, throughput estimate, cycle time, robot utilization, station utilization, traffic conflicts, waits, replans, deadlocks, and active reservations.
- Toggle loaded-envelope overlays so carried rack footprints are visible during playback.
- Inspect Orders & Inventory, operational tasks, robots, stations, and structured event logs.
- Filter an event log by robot, task, entity, message, or severity.
- Export simulation config JSON, event log CSV, metrics CSV, orders CSV, and inventory CSV.

Robots follow shortest paths over the layout graph instead of driving straight through racks or walls. The planner respects one-way/two-way traffic rules, avoids blocked cells, uses adjacent rack approach cells for pickup/dropoff, and routes toward station queue/service cells. A practical time-expanded reservation table prevents obvious same-cell, edge-swap, loaded-envelope, and simple resource-capacity conflicts by inserting wait steps when possible.

Traffic control now includes carried-rack envelopes for `1x1`, `1x2`, `2x1`, and `2x2` racks, simple capacity reservations for rotation zones and queue/service resources, conservative deadlock detection, and a deterministic scenario runner for regression tests. It remains a practical early traffic-control layer, not a globally optimal MAPF planner.

The operational chain now follows a simplified RMFS flow: order lines/SKUs -> rack selection -> station assignment -> robot assignment -> rack reservation -> empty travel -> lift -> optional rotation -> station queue/service -> inventory update -> storage/reallocation decision -> return/drop -> task/order completion.

This is intentionally not full MAPF. There is no CBS, WHCA*, global deadlock proof, or continuous kinematic envelope solver yet. The current traffic layer is practical for early layout playback and debugging, while the roadmap remains full MAPF and 3D/RTS-style simulation.

## RAWSim-O / RMFS Alignment

RAWSim-O is a discrete-event simulation framework for RMFS decision strategies, not a drawing tool. This app now documents the canonical RMFS concepts in [docs/RAWSIMO_ALIGNMENT.md](docs/RAWSIMO_ALIGNMENT.md): layout instances, physical cells, routing waypoints, storage locations, racks/pods, rack faces and bins, stations, chargers, parking, robots, orders, movement tasks, and controller boundaries.

Current implementation is still layout-editor first, but Experimental Simulation Mode now includes simplified orders, inventory-backed rack selection, operational tasks, rack/storage state, station service inventory updates, and rack storage/reallocation strategies. See [docs/RMFS_OPERATION_MODEL.md](docs/RMFS_OPERATION_MODEL.md) for the operational model.

## Import And Export

Exported layout JSON includes `layoutSchemaVersion`, `appVersion`, timestamps, grid settings, cells, objects, rack faces/bins, assumptions, scoring weights, and metadata. The current schema is `0.2.0`.

Import handles older layouts without a schema version by applying migration defaults. Invalid JSON returns a clear import error instead of crashing the app.

## Validation

The validation panel shows error/warning severity, messages, and involved row/column when available. Clicking a validation item selects the related object or cell on the canvas. Validation covers grid dimensions, physical dimensions, rack footprint, charger size, parking size, overlaps, reachability, orientation compatibility, and face access.

## Run Locally

```bash
npm install
npm run dev
```

The Vite dev server runs on port `5174` and is reachable at `http://127.0.0.1:5174/`.

## Run Tests

```bash
npm test
npm run build
npm run test:e2e:smoke
npm run test:e2e
```

The current verified pass used:

- `npm run build`
- `npm test -- --run`
- `npm run test:e2e -- --workers=1`

Current status: build passes, unit tests pass, and Playwright E2E smoke passes. The full legacy interactive canvas E2E suite is temporarily skipped in code because Playwright/Konva click stability regressed during this traffic-control pass. Treat that as a test coverage limitation to fix next, not as a completed browser-regression claim.

## Controls

- Select tool: click an object to select it.
- Shift-click: multi-select.
- Drag rectangle: rectangle-select objects.
- Drag object: move and snap to grid.
- `R`: rotate selected rack or station.
- `Delete`: delete selected objects.
- `Ctrl+C` / `Ctrl+V`: copy and paste selected racks.
- Toolbar buttons: undo, redo, zoom, fit, toggle grid, labels, arrows, and heatmap.
- Workflow rail: switch between Design, Generate, Analyze, Simulate Experimental, and Files.
- Traffic tool: select a cell and edit allowed directions in the property panel.
- Locking: select a cell or object and use the Locked checkbox in the property panel before Hybrid generation.
- Keyboard shortcuts button: opens an in-app shortcut reference.
- Status bar: shows selected tool, selected object/cell, hovered row/column, zoom, unsaved changes, and validation error count.

## Limitations

- 2D simulation is a foundation, not the final 3D simulator.
- No full CBS/WHCA*/MAPF planner yet.
- Reservation-based collision avoidance handles vertex, edge-swap, loaded-envelope, and simple resource-capacity conflicts, but it is not a complete deadlock-free traffic controller.
- Analytics remain estimates; simulation metrics are early operational approximations.
- Order generation uses synthetic sample demand from current inventory, not imported real order waves yet.
- Replenishment support exists in the operation helpers/service path but the UI is still pick-order focused.
- Controller strategies are intentionally simple and not yet an experiment-runner framework.
- Multi-cell rack support is limited to up to `2x2` occupied cells.
- True Flying-V is an Experimental first-pass stair-step diagonal aisle generator, not a CAD-grade continuous diagonal geometry model.
- Legacy interactive browser E2E tests are currently skipped until Playwright/Konva click stability is repaired.

## Roadmap

- 3D view
- RTS-style robot simulation
- MAPF planner, starting with WHCA*-style rolling-horizon reservations
- Advanced collision avoidance and deadlock recovery
- Battery/charging policies and richer station service models
- Experiment runner for comparing layouts and controller strategies over multiple seeds
- DXF/CAD import
- Cloud save/load

## Conceptual References

The implementation is original code. These links are conceptual references only:

- RAWSim-O GitHub: https://github.com/merschformann/RAWSim-O
- RAWSim-O paper: https://arxiv.org/abs/1710.04726
- RMFS semi-open queueing layout optimization: https://journals.sagepub.com/doi/10.1177/1729881420978543
- Workstation layout strategies in RMFS: https://www.sciencedirect.com/science/article/pii/S2772390922000233
- Flying-V RMFS layouts: https://www.mdpi.com/1999-4893/14/7/203
- Pod arrangement optimization: https://research-information.bris.ac.uk/en/publications/optimization-of-pod-arrangements-for-robotic-mobile-fulfillment-s/
