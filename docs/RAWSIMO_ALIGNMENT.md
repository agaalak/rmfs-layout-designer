# RAWSim-O / RMFS Alignment

This project does not copy RAWSim-O code. The references are conceptual only:

- RAWSim-O repository: https://github.com/merschformann/RAWSim-O
- RAWSim-O paper: https://arxiv.org/abs/1710.04726
- RMFS path planning with kinematic constraints: https://arxiv.org/abs/1706.09347

The RAWSim-O paper describes RMFS as a system where robots carry storage units, or pods, from inventory to human-operated stations. It also highlights decision problems such as pod selection for orders and pod reallocation after workstation visits. The path-planning reference discusses RMFS robot routing and multi-agent path planning algorithms such as WHCA*, FAR, BCP, OD&ID, and CBS.

## Alignment Goal

`rmfs-layout-designer` should not be a generic warehouse paint tool. It should be a visual RMFS layout editor and analytical evaluator that can later grow into a discrete-event simulator.

The current code now separates, or documents the separation of:

- physical grid geometry
- routing waypoints
- storage locations
- racks/pods and inventory
- service stations
- chargers and parking locations
- robots
- orders/tasks
- decision/controller modules

## Canonical Domain Model

### Layout / Instance

An RMFS layout instance contains:

- grid
- cells
- derived routing waypoints
- graph edges
- storage locations
- racks/pods
- stations
- robots or simulation config
- chargers
- parking locations
- rotation-enabled cells
- traffic rules
- item inventory through rack bins
- orders/tasks in the simulator layer
- assumptions/config

Current code:

- `src/models/layout.ts`
- `src/models/grid.ts`
- `src/models/rack.ts`
- `src/models/station.ts`
- `src/models/charging.ts`
- `src/models/parking.ts`
- `src/models/rotation.ts`
- `src/models/robot.ts`
- `src/models/task.ts`
- `src/models/simulation.ts`
- `src/models/rmfsDomain.ts`

### Cell

A cell is physical grid geometry. It can be empty, road, blocked, human zone, dock, station area, storage area, queue, charger, or parking.

Cells are not racks, robots, stations, or tasks. A cell may visually host or mark an area used by one of those objects, but those resources are separate records.

Rotation is not a cell type. Rotation is a property on a traversable cell (`allowRotation`, supported orientations, dwell time, and capacity) managed through traffic/direction semantics.

Current code:

- `LayoutCell` in `src/models/grid.ts`
- canvas drawing layers in `src/components/canvas/*`

### Waypoint

A waypoint is a routing node derived from traversable layout cells.

Waypoint types:

- road
- rack approach
- station approach
- queue
- charger approach
- parking
- rotation

Current code:

- `RmfsWaypoint` and `WaypointType` in `src/models/rmfsDomain.ts`
- `buildRoutingWaypoints` in `src/graph/graphBuilder.ts`
- `buildRoadGraph` now builds graph nodes from derived routing waypoints instead of treating every visual object as a route node.

### StorageLocation

A storage location is a valid place where a rack/pod can be stored.

Current code:

- `StorageLocation` in `src/models/storage.ts`
- `storageLocations` persisted on `WarehouseLayout`
- `ensureStorageLocations` in `src/utils/storageLocations.ts` migrates older layouts from rack home cells/rack-storage cells.

Storage locations now track cells, allowed rack types, default orientation, approach waypoint IDs, current rack occupancy, reservation, status, zone, and lock state.

### Rack / Pod

The UI uses "Rack" because the user needs faces, bins, dimensions, and SKU handling. Conceptually, this is compatible with the RMFS pod/mobile storage unit.

Current code supports:

- rack ID and rack type
- home cell
- footprint dimensions and occupied cells
- current orientation
- allowed orientations
- Face A/B
- bin records
- demand class
- locked constraint flag

Current code now supports:

- home storage location ID
- current storage location ID
- operational status
- runtime carried/returning status inside `SimulationState.rackStates`

### RackFace And Bin

Rack faces and bins are implemented as first-class rack data.

Current code:

- `RackFace` and `Bin` in `src/models/rack.ts`
- editable bin table in `src/components/layout/RightPropertiesPanel.tsx`
- rack-bin CSV helpers in `src/utils/rackBins.ts`

### Station

A station is a service resource, not just an orange rectangle.

Current station data supports:

- station ID
- station type
- service side
- accepted rack faces
- required rack orientation
- linked queue lane IDs
- service time
- service capacity

Queue cells are independent ordered `QueueLane` resources. They are not embedded in `Station`, and they are not station service cells. Current simulator runtime tracks active station robot/rack, queue-lane occupancy, service timer, and completed service count. Service updates inventory for pick/replenish paths only after the robot enters `station.cell`.

### Charger And ParkingLocation

Chargers and parking are resource records plus traversable cells.

Current code:

- `ChargingSpot` in `src/models/charging.ts`
- `ParkingSpot` in `src/models/parking.ts`
- charger and parking graph nodes are validated through derived waypoints.

Alignment gap:

- Charger and parking occupancy/status are minimal.

### Robot / Bot

Robots are part of the experimental 2D simulator.

Current code supports:

- robot ID
- continuous pose
- current cell
- state
- carried rack ID
- assigned task ID
- current path
- speed and timing assumptions
- battery percent
- color

This is not yet a full RAWSim-O-level discrete-event robot/fleet controller.

### Order / Request / Task

RMFS business demand should be separate from robot movement.

Current code:

- `RmfsOrder` and `RmfsOrderLine` in `src/models/order.ts`
- `OperationalTask` in `src/models/operationalTask.ts`
- simulation panel Orders & Inventory section
- generated orders select racks by SKU inventory and complete after station service and rack return

### Controllers / Decision Modules

RAWSim-O is valuable because it lets decision rules interact. This app now documents controller boundaries so future work does not collapse everything into canvas actions.

Canonical controllers:

- OrderAssignmentController
- Pod/RackSelectionController
- StationAssignmentController
- RackStorage/RepositioningController
- PathPlanningController
- TrafficControlController
- ChargingController

Current implementation:

- `src/simulation/controllers/orderAssignmentController.ts`
- `src/simulation/controllers/rackSelectionController.ts`
- `src/simulation/controllers/stationAssignmentController.ts`
- `src/simulation/controllers/robotAssignmentController.ts`
- `src/simulation/controllers/rackStorageController.ts`

2026-05-16 alignment update:

- `stationAssignmentController.ts` no longer relies on stale `StationQueue.waitingRobotIds` when the layout has queue lanes. The `shortest_queue` strategy scores live `queueLaneStates`, queue-lane reservations, and active station service occupancy.
- `rackSelectionController.ts` scores nearest compatible racks by route cost to `StorageLocation.podServiceCell`, matching the runtime pickup rule.
- `graphBuilder.ts` supports station routing context so generic routing can block station cells as pass-through shortcuts while assigned station-service routes can still target `station.cell`.
- `src/simulation/lifecycle/queueLaneLifecycle.ts` now owns queue-lane reservations, occupancy syncing, head-of-line detection, station-entry gating, and compatibility derivation of `StationQueue` views.
- `src/simulation/controllers/chargingController.ts`
- `src/simulation/controllers/controllerRegistry.ts`

The controller registry records strategy name, description, stage, limitations, and metrics affected. Simulation controller events now include decision traces with candidate counts, selected candidates, and reason strings where available. This is not a full experiment runner yet, but it is the first step toward RAWSim-O-style decision-rule comparison.

## Current Gap Audit

See `docs/RAWSIMO_BEHAVIOR_GAP_AUDIT.md` for the full matrix. The important gaps are:

- Path planning is still shortest-path plus reservations/runtime guards, not WHCA*/CBS/MAPF.
- Waypoints are derived from layout resources rather than persisted and directly editable.
- Rack, station, and robot lifecycle logic works but should be split into explicit state-machine modules.
- Pick/replenishment logic has inventory updates but not full wave, due-time, returns, and multi-rack partial fulfillment behavior.
- Battery drain, charger queues, and long-horizon fleet policies are intentionally deferred.
- Metrics are useful for layout and debug feedback, but not yet a complete RAWSim-O experiment statistics layer.

## Debug And Invariants

The app now includes a live Debug / QA mode:

- `src/debug/*`
- `src/components/debug/DebugPanel.tsx`
- `src/components/debug/ErrorBoundary.tsx`
- `src/simulation/invariants.ts`

This matters for RMFS alignment because state errors in robot/rack/station/order interactions are often invisible until a later step. Invariants check resource ownership and illegal overlaps after initialization, task generation, and simulation steps in development/debug contexts.
- `src/simulation/controllers/chargingController.ts`

Strategies are intentionally simple, but explicit: FIFO/priority/due-date order selection, nearest/most-inventory/hot-weighted rack selection, nearest/shortest-queue station selection, first/nearest robot assignment, return-home/nearest/hot-near-station storage selection, and no-op/low-battery charging policy.

## What Changed In This Pass

- Promoted storage locations to first-class layout records.
- Added order, order-line, inventory snapshot, operational task, and structured event-log models.
- Added controller modules for the main RMFS decision boundaries.
- Replaced pure direct rack movement generation with sample order-to-rack-to-station task generation.
- Added rack/storage status changes during reserve, lift, carry, station service, return, and drop.
- Added station service inventory updates and order completion.
- Added explicit pre/post rotation events and orientation updates.
- Updated Simulation Mode UI so users can trace orders, inventory, controllers, tasks, robots, stations, and event decisions.

## Remaining Alignment Work

1. Improve traffic control with better wait/replan policies and deadlock recovery.
2. Add carried-rack footprint reservations.
3. Add larger order waves, batching, and experiment runs across controller strategies.
4. Add WHCA* before CBS or more advanced MAPF solvers.
5. Add battery drain, charger queues, and service-time variability.
6. Keep full 3D simulator work out until the 2D event/state model remains stable.
# 2026-05-14 Semantic Alignment Note

The app now aligns more closely with RMFS/RAWSim-O physical semantics:

- station queues are independent ordered waiting resources, not embedded station geometry
- stations are service resources with a real service cell
- racks/pods are picked and dropped at storage service cells
- rotation is a permission on traversable cells, not a distinct cell type
- old layouts migrate into this corrected model at import time

Remaining gap: the traffic planner is still a practical reservation-based controller, not RAWSim-O's full discrete-event / multi-agent path planning stack.
