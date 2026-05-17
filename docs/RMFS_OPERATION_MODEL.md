# RMFS Operation Model

This document describes the simplified RAWSim-O-style operational model used by Experimental Simulation Mode. The implementation is original and uses RAWSim-O/RMFS literature only as conceptual guidance.

## Layout Design vs Operational Simulation

Design Mode edits the physical layout: grid cells, roads, storage areas, racks, stations, chargers, parking, rotation-enabled cells, blocks, and traffic directions.

Experimental Simulation Mode runs a time-based operational model on top of that layout. It does not change the physical design while running. The simulator converts layout resources into runtime state: robots, rack status, storage-location occupancy, station queues, orders, tasks, inventory snapshots, and event logs.

## Operational Flow

The implemented pick flow is:

1. Generate customer orders from available SKU inventory.
2. Select a pending order.
3. Select a rack/pod that contains the requested SKU and available quantity.
4. Select a compatible station.
5. Select an idle robot.
6. Reserve the rack, SKU quantity, source storage location, and return destination.
7. Move the robot empty to the rack storage `podServiceCell`.
8. Lift the rack and free the source storage location.
9. Move loaded, optionally through a pre-station rotation-enabled cell.
10. Reserve and enter an ordered queue lane if needed.
11. Enter the physical `station.cell` and run station service.
12. Decrement picked inventory and fulfill order lines.
13. Select return storage.
14. Optionally rotate back before storage.
15. Drop the rack on the destination storage `podServiceCell`, occupy the storage location, complete the task/order, and return the robot to idle.

## Orders vs Tasks

Orders are business demand.

- `RmfsOrder` tracks priority, status, order lines, assigned station, completion, and failure reason.
- `RmfsOrderLine` tracks SKU, requested quantity, fulfilled quantity, assigned rack/bin, and line status.

Operational tasks connect business demand to RMFS resources.

- `OperationalTask` tracks order/rack/station/robot/storage lifecycle states.
- `SimulationTask` remains the lower-level movement task used by robot path playback.

## Inventory

Rack bins are the source of inventory. During simulation startup, the app creates `SimulationInventoryBin` snapshots from rack faces/bins.

- A bin with `sku` and positive `quantity` is available inventory.
- `reservedQuantity` is increased when an order reserves the bin.
- PICK service decrements `quantity` and releases the reservation.
- REPLENISH service can increment bin quantity through helper/controller paths.

## Rack / Pod Lifecycle

Racks have home/current storage location fields and operational status.

Runtime lifecycle:

- `STORED`: rack is in a storage location.
- `RESERVED`: rack is assigned to an order/task and cannot be selected again.
- `BEING_CARRIED`: robot has lifted the rack; source storage is empty.
- `AT_STATION`: rack is at station service.
- `RETURNING`: rack is being carried back to storage.
- `STORED`: rack is dropped at the destination storage location.

## Storage Locations

Storage locations are persisted on the layout.

Each record stores:

- storage location ID
- occupied cells
- allowed rack types
- default rack orientation
- approach waypoint IDs
- current rack ID
- reserved rack ID
- status: `EMPTY`, `OCCUPIED`, `RESERVED`, or `BLOCKED`

Older layouts without storage locations are migrated by `ensureStorageLocations`, which creates locations from rack home cells and rack-storage cells.

## Station Lifecycle

Stations are service resources, not just orange cells.

Runtime station state tracks:

- active robot
- active rack
- ordered queue-lane occupancy and queue lane runtime reservations
- service end time
- completed service count

PICK/COMBI service decrements inventory and fulfills order lines. REPLENISH paths can increment inventory. PACK/QC/BUFFER remain dwell/service-only in this pass.

Dispatch now reserves the physical queue-lane entry cell. A station can have one active service robot while additional robots are assigned over time as queue entry cells become available. Queue capacity is still represented by ordered lane cells, but robots do not teleport or pass through occupied queue cells to claim deeper slots.

At runtime, a robot enters the tail/entry queue cell, advances one ordered cell at a time, waits at the head queue cell until the station service cell is free, and only then moves into `station.cell`. This prevents following robots from stacking on the head cell or repeatedly attempting to interpolate into an occupied station cell.

The runtime source of truth for waiting robots is `SimulationState.queueLaneStates`. `StationQueue.waitingRobotIds` is now treated as a derived compatibility view for service admission/export surfaces, not as a controller decision source. Station assignment `shortest_queue` uses live queue-lane occupied cells, lane reservations, and active station service occupancy.

Generic routing and analytics-style shortest paths should not use station cells as incidental pass-through shortcuts. Task-specific station routing can still target `station.cell`, and service starts only once the robot physically reaches that cell.

## Controller Strategies

Controllers are explicit modules so future strategy comparisons can evolve without burying decisions inside canvas code.

- Order assignment: FIFO, priority first, earliest due time.
- Rack selection: nearest rack with SKU, most inventory for SKU, HOT/WARM/COLD weighted, manual.
- Station assignment: nearest compatible station, shortest queue, station type match.
- Robot assignment: first available robot, nearest idle robot.
- Rack storage/reallocation: return home, nearest available storage, keep hot near station.
- Charging: none, low battery to nearest charger.

The controller registry in `src/simulation/controllers/controllerRegistry.ts` documents each strategy's stage, description, parameters, affected metrics, and limitations. Controller event-log entries include decision traces so a tester can inspect why a rack, station, robot, or storage location was selected.

Nearest-rack scoring uses the same service-cell semantics as execution: the path cost is from the robot/current start to the rack storage location `podServiceCell`. Approach cells may still appear in diagnostics for humans, but they do not trigger pickup/drop or drive nearest-rack scoring.

## Rotation-Enabled Cells

If a station requires an orientation different from the rack's current orientation, route planning requires a compatible rotation-enabled cell. The robot stops in `ROTATING_WITH_RACK`, waits for rotation time, updates rack orientation, and then continues.

Post-station rotation can restore the storage/default orientation before return.

## Event Log

Simulation events are structured:

- event ID
- time
- severity
- entity type and ID
- related robot/task/order/rack/station IDs
- message
- optional details

Events cover order creation, rack/station/robot/storage controller decisions, rack reservation, lift/drop, station queue/service, inventory updates, rotation events, task completion, and failures.

## Operational Invariants

The simulator now checks core invariants in development/debug contexts:

- no overlapping robot runtime envelopes
- carried rack has exactly one carrying robot
- rack marked carried references a valid carrying robot
- robot carrying rack references a valid rack
- stored rack references a valid current storage location
- occupied storage location references a valid rack
- stored rack runtime cell matches its current storage location `podServiceCell`
- reserved inventory does not exceed available quantity
- order lines are not over-fulfilled
- station active robot/rack references valid entities
- station queue length does not exceed max queue length
- active tasks do not reserve the same rack twice
- robot pose, route cells, and reservation cells stay valid and in bounds

Invariant findings are written to the Debug / QA panel and diagnostics exports.

## Still Experimental

This is not full RAWSim-O and not MAPF.

Known limitations:

- Task generation creates sample orders from inventory rather than importing real waves.
- Replenishment UI is still limited compared with pick-order UI.
- Reservation traffic control prevents obvious same-cell, edge-swap, loaded-envelope, and simple resource-capacity conflicts but does not prove deadlock freedom.
- Runtime collision guards now reject accepted visual overlap states after movement and roll unsafe robots back with collision-prevented warning events.
- Carried-rack footprint reservations are grid-cell based; continuous swept envelopes and turn-radius envelopes are not complete.
- Rotation-enabled cell capacity is simple capacity-1 resource reservation by default, not a global scheduler.
- Browser E2E coverage for interactive canvas workflows is active again. It covers manual editing, generation, Hybrid, a small simulation cycle, view controls, zoom, and pan.
- Battery drain and charging queues are not realistic yet.
- Invariant failures currently log and surface diagnostics; a future setting should optionally pause simulation immediately.

## Roadmap

1. Stabilize RMFS operational model: storage locations, rack status, orders, inventory, station service, rack storage/reallocation.
2. Stabilize traffic control: loaded envelope reservations, resource reservations, deadlock detection, wait/replan policies, and scenario-runner regressions.
3. Add browser E2E scenarios for loaded 2x2 racks, narrow aisles, and explicit deadlock recovery.
4. Add MAPF planning: WHCA* first, then optional CBS/advanced solvers for comparison.
5. Improve realism: acceleration/deceleration, rotation dwell, battery drain, charging policy, and station service variability.
6. Add experiment runner for multiple seeds, controller strategy comparison, layout comparison, and metric exports.
7. Add 3D/RTS-style visualization only after the 2D simulator is stable.

# 2026-05-14 Logic/Algorithm Correction

Two runtime mismatches were fixed:

1. Station dispatch no longer serializes every task behind one active station task. Queue lane capacity now controls how many robots can be sent toward a station.
2. Simulation rack rendering no longer uses design-time `homeCell` after initialization. Stored racks render from `rackStates` and `storageLocationStates`, so nearest-available storage reallocation is visible at the selected destination.

The new focused regression tests are in `tests/logic-algorithm-fixes.test.ts`.

# 2026-05-16 Queue-Lane Runtime Alignment

The simulator now has a dedicated queue-lane lifecycle module:

- `createQueueLaneStates`
- `reserveQueueLaneSlot`
- `syncQueueLaneStates`
- `chooseQueueLaneForStation`
- `deriveStationQueuesFromRuntime`
- `holdRobotBeforeBlockedStationEntry`

This keeps queue occupancy, queue scoring, head-of-line detection, station-entry gating, and station service readiness aligned around one runtime state. Debug exports and the Debug / QA panel now include queue-lane inspectors, station admission traces, waiting reasons, controller decision traces, and reservation snippets.
# 2026-05-14 Queue/Station/Pod Correction

Operational flow now uses these physical checkpoints:

1. Empty robot travels to the rack storage location `podServiceCell`.
2. Robot lifts only while physically on that pod service cell.
3. Loaded robot travels through the selected queue lane and into `station.cell`.
4. Station service starts only from `station.cell`.
5. Rotation occurs only on cells where `allowRotation=true`.
6. Robot returns to the destination storage location `podServiceCell` before dropping.

Queue cells are directional FIFO waiting cells. They are linked to stations by `QueueLane`, but they are not station cells.
