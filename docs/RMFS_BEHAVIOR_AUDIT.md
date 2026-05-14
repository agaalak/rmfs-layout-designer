# RMFS Behavior Audit

Date: 2026-05-13

## Commands Run

- `npm install` - passed
- `npm run build` - passed
- `npm test -- --run` - passed, final rerun 62 tests
- `npm run test:e2e -- --workers=1` - passed, final rerun 11 tests
- `npm run dev` - running on `http://127.0.0.1:5174`
- In-app browser load check - passed, no console warnings/errors on initial load

## Source Files Inspected

- `src/models/layout.ts`
- `src/models/rack.ts`
- `src/models/rmfsDomain.ts`
- `src/models/robot.ts`
- `src/models/simulation.ts`
- `src/models/task.ts`
- `src/simulation/simulationEngine.ts`
- `src/simulation/pathPlanner.ts`
- `src/simulation/reservationTable.ts`
- `src/store/simulationStore.ts`
- `src/components/panels/SimulationPanel.tsx`
- `src/generators/proceduralGenerator.ts`
- `src/graph/graphBuilder.ts`
- `src/validation/validateObjects.ts`
- `src/importExport/importLayout.ts`
- `src/importExport/exportSimulation.ts`

## 1. Robot Lifecycle

Status: PARTIALLY WORKING

- Working: robots spawn from parking/charging/perimeter roads, are assigned simple rack-to-station movement tasks, move empty, lift, move loaded, queue, receive a service timer, return, drop, and become idle.
- Missing: robot assignment is not a controller strategy, parking/charging decisions are shallow, rack-carrying does not update rack/storage state, and simulation events are not structured enough to explain controller decisions.
- Priority: P0 for rack/storage state updates and controller-backed assignment; P1 for charging/parking policies.

## 2. Rack/Pod Lifecycle

Status: PARTIALLY WORKING

- Working: racks have faces, bins, demand classes, footprints, and orientation for layout/analytics.
- Missing: racks do not have first-class operational status, home/current storage locations, reservation state, or inventory reservation lifecycle. A rack can be selected by a movement task without marking it reserved in the operational model.
- Priority: P0.

## 3. Station Lifecycle

Status: PARTIALLY WORKING

- Working: stations have type, queue cells, accepted rack faces, required orientation, and max queue length in layout data. Simulator has simple FIFO station queues and service timers.
- Missing: station service does not update inventory, queue capacity is not enforced during task planning, station active rack/robot state is only implicit, and PICK/REPLENISH/COMBI behavior is not modeled.
- Priority: P0.

## 4. Order/Inventory Lifecycle

Status: MISSING

- Working: rack bins can store `sku` and `quantity`, mostly for editing/export.
- Missing: orders, order lines, SKU demand, rack selection by inventory, inventory reservation, pick decrement, replenish increment, line fulfillment, order completion, and clear SKU-unavailable failure.
- Priority: P0.

## 5. Decision Modules

Status: MISSING

- Working: helper functions use nearest compatible station and hot/warm/cold ordering for simple task generation.
- Missing: explicit order assignment, rack selection, station assignment, robot assignment, rack storage/reallocation, charging, path planning, and traffic-control controller boundaries.
- Priority: P1 after the P0 order/rack/station lifecycle is in place.

## 6. Layout Resources

Status: PARTIALLY WORKING

- Working: cells, roads, queues, stations, chargers, parking, rotation zones, traffic directions, and rack approach graph nodes exist.
- Missing: first-class persisted storage locations and storage-location occupancy/reservation. Storage is inferred from rack home cells and rack-storage cells, which is not enough for RMFS operational simulation.
- Priority: P0.

## 7. Current Simulation Failure Modes

Status: PARTIALLY WORKING / CONFUSING

- Rack can be selected again because no persistent rack reservation/status exists.
- Station queue capacity is not enforced before assignment.
- SKU demand and inventory availability are not checked.
- Inventory quantity does not change during service.
- Rack orientation can influence route planning, but rotation is not represented as an explicit operational event/state with orientation update.
- Rack current storage location is not updated on lift/drop.
- Event log records broad movement events but not order, rack-selection, station-selection, inventory, or storage-controller decisions.
- Priority: P0 for incorrect operational behavior; P1 for richer traceability.

## Expected RMFS Behavior for This Pass

The simulator should become a simplified discrete-event RMFS foundation:

1. Orders create SKU demand.
2. A controller selects a rack/pod with inventory.
3. A compatible station and idle robot are selected.
4. The rack, station queue slot, robot, and return storage location are reserved.
5. The robot travels to a rack approach, lifts the rack, and frees the storage location.
6. The robot optionally visits a rotation zone before station service.
7. Station service updates inventory and order-line fulfillment.
8. A storage/reallocation controller chooses a destination.
9. The robot returns and drops the rack, updating rack and storage-location status.
10. Events explain each operational decision.

## Implementation Result

Status after this pass:

- Storage locations: WORKING. Layouts now persist `storageLocations`, and older layouts migrate from rack home cells/rack-storage cells.
- Rack lifecycle: PARTIALLY WORKING / MUCH IMPROVED. Runtime rack state now transitions through reserved, carried, station, returning, and stored states. The layout rack model also carries home/current storage IDs and operational status defaults.
- Orders/inventory: WORKING for sample pick orders. Orders and order lines are created from rack-bin SKU inventory; pick station service decrements inventory and completes orders after rack return. Replenishment helpers and service paths exist, but UI generation is still pick-focused.
- Decision modules: WORKING as simple strategies. Controller modules exist for order, rack, station, robot, storage, and charging decisions.
- Station service: WORKING for FIFO queue, service timer, pick inventory update, order completion, and station runtime state. More detailed labor variability remains future work.
- Rotation: WORKING as explicit dwell events. Pre/post rotation states update rack orientation and event logs. Rotation-zone capacity is still simple.
- Storage reallocation: WORKING for return-home, nearest-available, and keep-hot-near-station destination selection. This is not yet a full pod repositioning optimizer.
- Event log: WORKING as structured operational events with entity type/ID and controller/inventory/rack/station messages.
- Traffic control: PARTIALLY WORKING. Basic time-expanded reservations remain in place; full MAPF, deadlock recovery, and carried-rack swept-envelope reservations are still future work.
