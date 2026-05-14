# RMFS Operation Model

This document describes the simplified RAWSim-O-style operational model used by Experimental Simulation Mode. The implementation is original and uses RAWSim-O/RMFS literature only as conceptual guidance.

## Layout Design vs Operational Simulation

Design Mode edits the physical layout: grid cells, roads, storage areas, racks, stations, chargers, parking, rotation zones, blocks, and traffic directions.

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
9. Move loaded, optionally through a pre-station rotation zone.
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

## Still Experimental

This is not full RAWSim-O and not MAPF.

Known limitations:

- Task generation creates sample orders from inventory rather than importing real waves.
- Replenishment UI is still limited compared with pick-order UI.
- Reservation traffic control prevents obvious same-cell and edge-swap conflicts but does not prove deadlock freedom.
- Carried-rack footprint reservations are not complete.
- Rotation-zone capacity is simple.
- Battery drain and charging queues are not realistic yet.

## Roadmap

1. Stabilize RMFS operational model: storage locations, rack status, orders, inventory, station service, rack storage/reallocation.
2. Improve traffic control: better reservations, deadlock detection, recovery, wait/replan policies, and carried-rack footprint reservations.
3. Add MAPF planning: WHCA* first, then optional CBS/advanced solvers for comparison.
4. Improve realism: acceleration/deceleration, rotation dwell, battery drain, charging policy, and station service variability.
5. Add experiment runner for multiple seeds, controller strategy comparison, layout comparison, and metric exports.
6. Add 3D/RTS-style visualization only after the 2D simulator is stable.

