# Robot Behavior / RAWSim-O Delta Audit

Date: 2026-05-23

## Commands Run

- `npm install`: passed
- `npm run build`: passed
- `npm test -- --run`: passed, 21 files / 115 tests
- `npm run test:e2e -- --workers=1`: passed, 21 browser tests
- `npm run dev`: already running on `http://localhost:5174/`

Browser check:
- App opened at `http://localhost:5174/?debug=true`.
- Canvas rendered.
- The in-app browser did not expose `window.__RMFS_DEBUG__` or `window.__RMFS_TEST__` even with `?debug=true`; E2E still has test hooks. This is a debug visibility gap.

References reviewed conceptually:
- RAWSim-O framework and paper describe robots transporting pods between storage and stations in a discrete-event RMFS simulator, with separate decision layers for order/pod/station/robot/storage/path planning.
- RMFS path-planning literature treats travel as graph movement with conflicts on vertices/edges and real robot dynamics/kinematic constraints as a separate planning concern.

No RAWSim-O GPL code was copied.

## Summary Matrix

| Area | Current behavior | Expected RMFS / RAWSim-O-like behavior | Priority | Action |
| --- | --- | --- | --- | --- |
| Multi-robot dispatch | E2E confirms one task cycle; code still gates station access through queue-lane capacity and station queues. | Multiple robots may be active for same station if resources/checkpoints permit, without sharing cells. | P0 | Fix now |
| Pod reallocation | Runtime rack rendering uses `rackStates`/storage state, and previous tests cover nearest-available storage. | Runtime pod location is source of truth for rendering and future tasks. | P0 | Keep guarded |
| Direction model | `LayoutCell.allowedDirections` is still the primary source; arrows are rendered inside cells. | Direction is an edge/link from one cell center to a neighboring cell center. | P0 | Fix now |
| Direction UI | Direction tool selects a cell and edits local outgoing directions. | Direction tool edits one-way/two-way center-to-center links. | P1 | Fix now, scoped |
| Queue model | `QueueLane`, `QUEUE` cells, `queueLaneStates`, and queue-lane debug panels are still active. | Queue is a pre-point/checkpoint resource, assignable to one station or all stations. | P0 | Fix now |
| Station service | Invariants and E2E check service starts at `station.cell`; runtime still derives readiness through station queue objects. | Service starts only after robot reaches station service cell and required pre-point was visited. | P0 | Fix now |
| Pod pickup/drop | Code uses `podServiceCell` for pickup/drop checks. | Lift/drop only at source/destination pod service cell. | P0 | Keep guarded |
| Pod rotation | Footprint functions rotate by orientation; runtime visual rotates rectangle size/arrow. | Whole pod pose, footprint, collision envelope, and station face compatibility rotate together. | P1 | Strengthen now |
| Debug visibility | E2E debug tests pass, but current browser check did not expose debug globals. | Live testers can inspect queue/pre-point, station, pod pose, edge graph, waiting reasons. | P1 | Fix now |

## A. Multi-Robot Behavior

Current behavior:
- Unit and E2E tests pass for one completed simulation cycle and traffic ownership.
- `simulationEngine.ts` still uses `chooseQueueLaneForStation`, `reserveQueueLaneSlotWithCell`, `queueLaneStates`, and `deriveStationQueuesFromRuntime`.
- This means dispatch is still partially coupled to queue-lane capacity and lane reservation state.

Expected behavior:
- Task dispatch should be independent of station service occupancy when queue pre-point resources or upstream waiting are feasible.
- Station service occupancy must block entry into `station.cell`, not block all robot movement toward valid pre-points.

Severity: P0

Likely files:
- `src/simulation/simulationEngine.ts`
- `src/simulation/lifecycle/queueLaneLifecycle.ts`
- `src/simulation/controllers/stationAssignmentController.ts`
- `src/models/simulation.ts`

Tests required:
- Multi-task Small Demo dispatch with more than one active robot.
- Station busy with another loaded robot waiting at queue pre-point/upstream.

## B. Pod Storage Reallocation

Current behavior:
- `RuntimeRackLayer.tsx` renders racks from `getRackRuntimeRenderState`.
- `rackRuntimeView.ts` uses `rackStates[currentStorageLocationId/currentCell]` and storage `podServiceCell`.
- `rackStorageController.ts` scores destinations by path to `podServiceCell`.

Expected behavior:
- This is directionally correct and must not regress.
- Future tasks must also select the pod from its current runtime storage, not design home.

Severity: P0 if regressed, currently guarded.

Likely files:
- `src/simulation/rackRuntimeView.ts`
- `src/components/canvas/RuntimeRackLayer.tsx`
- `src/simulation/controllers/rackStorageController.ts`
- `src/simulation/simulationEngine.ts`

Tests required:
- nearest-available storage relocation remains visible and future task uses new storage.

## C. Direction Behavior

Current behavior:
- `LayoutCell.allowedDirections` stores outgoing directions on the cell.
- `DirectionArrowLayer.tsx` draws small arrows inside each cell.
- `graphBuilder.ts` reads `waypoint.allowedDirections` to build edges.

Expected behavior:
- Direction should be a `DirectedNeighborLink` from `fromCell` center to `toCell` center.
- One-way is one enabled link; two-way is two opposite links.
- UI arrows, graph, validation, and runtime planning should all consume the same link set.

Severity: P0

Likely files:
- `src/models/grid.ts`
- `src/models/layout.ts`
- `src/graph/graphBuilder.ts`
- `src/components/canvas/DirectionArrowLayer.tsx`
- `src/store/layoutStore.ts`

Tests required:
- One-way and two-way edge graph construction.
- Direction overlay matches actual links.

## D. Queue Behavior

Current behavior:
- `QueueLane` model is active in `src/models/queue.ts`.
- `WarehouseLayout.queueLanes` is persisted.
- `Station.queueLaneIds` is active.
- Runtime queue occupancy is managed in `queueLaneLifecycle.ts`.
- Debug panel exposes queue lanes.

Expected behavior:
- Replace runtime queue lanes with `QueuePoint` pre-point resources.
- A queue pre-point can apply to one station or all stations and can be placed on any traversable cell.
- Loaded robot must pass the selected queue pre-point before entering station cell.
- If station is occupied, robot waits at the pre-point or upstream.

Severity: P0

Likely files:
- `src/models/queue.ts`
- `src/models/station.ts`
- `src/models/layout.ts`
- `src/simulation/lifecycle/queueLaneLifecycle.ts`
- `src/simulation/pathPlanner.ts`
- `src/simulation/simulationEngine.ts`
- `src/debug/diagnosticsExport.ts`

Tests required:
- Queue point applies to station.
- Queue point applies to all stations.
- Service cannot start without required queue point visit.

## E. Pod Pickup / Drop

Current behavior:
- `findPathToRackServiceCell` and `findPathToStorageServiceCell` target `podServiceCell`.
- Runtime lift/drop guards in `rackLifecycle.ts` and `simulationEngine.ts` reject adjacent-cell pickup/drop.

Expected behavior:
- Keep this as mandatory invariant.
- Drop must be followed by egress so robot does not remain trapped under stored pod.

Severity: P0

Likely files:
- `src/simulation/lifecycle/rackLifecycle.ts`
- `src/simulation/simulationEngine.ts`
- `src/simulation/invariants.ts`

Tests required:
- Lift/drop only at `podServiceCell`.
- Post-drop runtime rack remains at destination and robot exits.

## F. Rotation / Orientation

Current behavior:
- Rack footprint calculations depend on `currentOrientationDeg`.
- Runtime rack rendering uses orientation and swaps footprint dimensions.
- Loaded envelope uses rack orientation from runtime state.
- Rotation is a cell property, not a cell type.

Expected behavior:
- Treat orientation as full pod pose: visual, footprint, loaded envelope, reservations, and station compatibility must change together.
- Rotation events must happen only at nodes with `allowRotation`.

Severity: P1

Likely files:
- `src/utils/rackFootprint.ts`
- `src/simulation/collisionEnvelope.ts`
- `src/simulation/simulationEngine.ts`
- `src/components/canvas/RuntimeRackLayer.tsx`

Tests required:
- Whole pod rotates and collision envelope changes.

## G. RAWSim-O Alignment Gaps

Fix now:
- Directed edge graph instead of cell-local directions.
- Queue pre-points instead of queue lanes.
- Station service entry through actual station cell.
- Runtime pod rendering from runtime state.
- Multi-robot dispatch not serialized by station service.

Backlog:
- Full MAPF / CBS / WHCA-style planner.
- Real turn-radius and acceleration/deceleration dynamics.
- Advanced decision-rule experiments with multiple seeds.
- More detailed station labor/service variability.

## Immediate Implementation Notes

- Keep `QueueLane` and `QUEUE` only as deprecated import/migration compatibility while runtime uses `QueuePoint`.
- Keep legacy `allowedDirections` only as a compatibility mirror. New graph construction should use `directedLinks`.
- Bump layout schema to `0.3.1` because persisted layout shape gains `directedLinks`, `queuePoints`, and station `queuePolicy`.

## 2026-05-24 Live Instance Follow-Up

Observed issue:
- The running Small Demo generated one task by default, so only one robot appeared to run.
- When task count was forced higher after initialization, four robots were assigned, but single queue pre-points behaved too much like long-lived station locks.

Root cause:
- `simulationStore.initialize()` reapplied layout `simulationConfig` after user edits, including `taskCount: 1`.
- Queue pre-point capacity was used as dispatch capacity for the entire task instead of as physical checkpoint occupancy.

Fix:
- User simulation config edits are tracked as overrides and survive initialization.
- Small Demo task count is restored to six tasks.
- Generated pre-points now use `HOLD_UPSTREAM`.
- Queue pre-point reservations are released once the assigned robot reaches or passes the checkpoint.
- Normal traffic denials now log as held moves before entry, not accepted collisions.

Live smoke result:
- Six tasks generated.
- Four robots became assigned/active.
- No duplicate sampled current, target, or pose cells were observed in the 160-step smoke run.
