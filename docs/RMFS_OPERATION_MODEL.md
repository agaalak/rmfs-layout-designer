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
7. Move the robot empty to a rack approach waypoint.
8. Lift the rack and free the source storage location.
9. Move loaded, optionally through a pre-station rotation-enabled cell.
10. Queue at the station.
11. Run station service.
12. Decrement picked inventory and fulfill order lines.
13. Select return storage.
14. Optionally rotate back before storage.
15. Drop the rack, occupy the storage location, complete the task/order, and return the robot to idle.

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
- FIFO queue
- service end time
- completed service count

PICK/COMBI service decrements inventory and fulfills order lines. REPLENISH paths can increment inventory. PACK/QC/BUFFER remain dwell/service-only in this pass.

## Controller Strategies

Controllers are explicit modules so future strategy comparisons can evolve without burying decisions inside canvas code.

- Order assignment: FIFO, priority first, earliest due time.
- Rack selection: nearest rack with SKU, most inventory for SKU, HOT/WARM/COLD weighted, manual.
- Station assignment: nearest compatible station, shortest queue, station type match.
- Robot assignment: first available robot, nearest idle robot.
- Rack storage/reallocation: return home, nearest available storage, keep hot near station.
- Charging: none, low battery to nearest charger.

The controller registry in `src/simulation/controllers/controllerRegistry.ts` documents each strategy's stage, description, parameters, affected metrics, and limitations. Controller event-log entries include decision traces so a tester can inspect why a rack, station, robot, or storage location was selected.

## Rotation Zones

If a station requires an orientation different from the rack's current orientation, route planning requires a compatible rotation-zone path. The robot stops in `ROTATING_WITH_RACK`, waits for rotation time, updates rack orientation, and then continues.

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
- Rotation-zone capacity is simple capacity-1 resource reservation, not a global scheduler.
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
# 2026-05-14 Queue/Station/Pod Correction

Operational flow now uses these physical checkpoints:

1. Empty robot travels to the rack storage location `podServiceCell`.
2. Robot lifts only while physically on that pod service cell.
3. Loaded robot travels through the selected queue lane and into `station.cell`.
4. Station service starts only from `station.cell`.
5. Rotation occurs only on cells where `allowRotation=true`.
6. Robot returns to the destination storage location `podServiceCell` before dropping.

Queue cells are directional FIFO waiting cells. They are linked to stations by `QueueLane`, but they are not station cells.
