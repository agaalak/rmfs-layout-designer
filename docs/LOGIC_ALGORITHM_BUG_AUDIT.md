# Logic and Algorithm Bug Audit

Date: 2026-05-14

## Verification Commands

- `npm install`: passed.
- `npm run build`: passed.
- `npm test -- --run`: passed after fixes, 15 files / 94 tests.
- `npm run test:e2e -- --workers=1`: passed, 18 browser tests.
- `npm run dev`: current dev server was already listening on `http://127.0.0.1:5174/`.
- Live Playwright smoke check against the running instance: no console errors, canvas visible, 4 active robots, 4 assigned tasks, queue lane reservations visible after initialize/generate/step.

## A. Only One Robot Runs

Status before fix: CONFIRMED.

Reproduction:

1. Load Small Demo.
2. Switch to Simulate Experimental.
3. Initialize robots.
4. Generate 6 tasks.
5. Step simulation.

Expected:

- More than one idle robot should dispatch when multiple tasks, distinct racks, queue capacity, and robots are available.
- Queue lane capacity should determine whether more work can be sent to a station.

Actual before fix:

- `assignTasks()` contained a station-level gate: any `ASSIGNED` or `IN_PROGRESS` task for a station prevented all later tasks for that station from dispatching.
- This serialized work behind one station task and made queue lanes mostly irrelevant.

Source files:

- `src/simulation/simulationEngine.ts`
- `src/models/simulation.ts`
- `src/models/task.ts`
- `src/utils/queueLanes.ts`

Severity: P0.

Fix:

- Removed the global active-station-task gate.
- Added `QueueLaneRuntimeState`.
- Dispatch now reserves queue lane capacity rather than treating the station as a single global lock.
- Tasks carry `queueLaneId`, and route planning prefers the reserved lane.

Tests:

- `tests/logic-algorithm-fixes.test.ts`
- `src/simulation/scenarios/logicBugScenarios.ts`

## B. Rack Appears At Previous Storage After Nearest-Available Drop

Status before fix: CONFIRMED.

Expected:

- In Simulation Mode, a stored rack should render from runtime state.
- After `nearest_available_storage`, the rack should appear at the selected destination storage `podServiceCell`, not its design-time home cell.

Actual before fix:

- `ObjectLayer` rendered racks from `layout.racks[].homeCell` even while simulation was active.
- Drop completion updated `currentStorageLocationId` but did not update `rackStates[rackId].currentCell`.
- Static collision checks also used design rack cells instead of runtime rack cells.

Source files:

- `src/components/canvas/ObjectLayer.tsx`
- `src/components/canvas/LayoutCanvas.tsx`
- `src/components/canvas/RuntimeRackLayer.tsx`
- `src/simulation/rackRuntimeView.ts`
- `src/simulation/simulationEngine.ts`
- `src/simulation/collisionEnvelope.ts`

Severity: P0.

Fix:

- Added runtime rack render-state selector.
- Added `RuntimeRackLayer`.
- Simulation Mode hides design-time racks once initialized and renders stored/reserved racks from `rackStates` / `storageLocationStates`.
- Drop completion now updates `currentCell` to the destination storage `podServiceCell`.
- Static rack collision checks now use runtime rack cell/orientation.

Tests:

- Runtime rack render selector test.
- Nearest-available relocation scenario test.

## C. Queue / Station Runtime Behavior

Status before fix: PARTIALLY WORKING.

Expected:

- Queue cells remain distinct from station cells.
- Station service starts only at `station.cell`.
- Queue lane capacity controls dispatch.
- Runtime state exposes lane occupancy/reservations for debugging.

Actual before fix:

- Path planning ended at `station.cell`, and service had a guard for `station.cell`.
- However, dispatch still used station-level active-task gating.
- Runtime did not expose queue lane reservations/occupancy, so it was hard to tell why robots were or were not dispatched.

Severity: P1.

Fix:

- `queueLaneStates` records occupied cells and reserved robot/task IDs.
- Simulation Panel now shows active/idle robots, pending tasks, queue lane load, and rack runtime storage summaries.
- Invariants now validate queue lane capacity and station service-cell semantics.

Remaining limitation:

- Queue lane motion is still path/reservation based, not a full station-lane traffic micro-simulator. It is sufficient for dispatch capacity/debugging but not final MAPF.

## D. Pod Pickup / Drop Runtime Behavior

Status before fix: MOSTLY WORKING, strengthened.

Expected:

- Pickup starts only at source `podServiceCell`.
- Drop starts only at destination `podServiceCell`.
- After drop, stored rack state points at destination storage.

Actual before fix:

- Transition guards already required `podServiceCell`.
- Drop did not update runtime rack `currentCell`, causing visual/runtime mismatch.

Fix:

- Drop completion now writes `rackState.currentCell = destinationStorage.podServiceCell`.
- Invariants now flag lift/drop away from pod service cells and stored-rack cell/storage mismatches.

## E. Controller / Path Scoring Consistency

Status before fix: PARTIALLY WORKING.

Expected:

- Storage destination scoring should use destination `podServiceCell`.
- Queue routing should prefer the selected/reserved lane.

Actual before fix:

- `rackStorageController` scored destinations through old `approachWaypointIds`.
- `findPathToStationQueue` always chose the nearest lane and did not accept a reserved lane preference.

Fix:

- Storage destination scoring now uses `findPathToStorageServiceCell()` and `podServiceCell`.
- Station routing accepts an optional preferred `queueLaneId`.

## Summary Matrix

| Issue | Status | Priority | Fixed In |
|---|---|---:|---|
| One robot due station active-task gate | Fixed | P0 | `simulationEngine.ts` |
| Queue lane capacity not reserved at dispatch | Fixed | P0 | `simulationEngine.ts`, `simulation.ts`, `task.ts` |
| Runtime rack rendered from design home cell | Fixed | P0 | `RuntimeRackLayer.tsx`, `rackRuntimeView.ts` |
| Drop did not update rack runtime cell | Fixed | P0 | `simulationEngine.ts` |
| Storage destination scoring used approach waypoints | Fixed | P1 | `rackStorageController.ts` |
| Debug panel could not explain queue/rack runtime state | Improved | P1 | `SimulationPanel.tsx`, `invariants.ts` |

## Follow-Up From 2026-05-16 Diagnostics

Files inspected:

- `issue-report-20260516-165350.json`
- `issue-report-20260516-165350.md`
- `rmfs-diagnostics-20260516-165323.json`
- `layout_g3oeuj_0w3t_analytics.json`

Confirmed issue:

- Debug invariants repeatedly reported `robot_001` and `robot_002` overlapping from simulation time `126.4s` onward.
- Snapshot at `141.2s` showed `robot_001` servicing at station `pick_003` cell `21,26`.
- `robot_002` was loaded at the queue-head cell `20,26`, targeting the occupied station cell.
- The event log showed repeated `Collision prevented` entries, but the robot pose remained visually interpolated near the station cell.

Root cause:

- Queue-head robots were allowed to keep attempting the final segment into `station.cell` while another robot was already servicing there.
- Collision rollback restored the previous robot object, but that previous object could already contain a partially interpolated pose near/over the occupied station cell.

Fix:

- Added a station-entry hold before movement: a loaded robot at queue head waits while the station service cell has an active robot.
- Collision guard rollback now snaps the unsafe robot pose back to the center of its previous safe `currentCell`.

Tests:

- `holds a loaded robot at queue head while the station service cell is occupied`
- `collision guard rolls unsafe movement back to the safe cell center`
