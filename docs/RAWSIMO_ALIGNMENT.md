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
- rotation zones
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

A cell is physical grid geometry. It can be empty, road, blocked, human zone, dock, station area, storage area, queue, charger, parking, or rotation area.

Cells are not racks, robots, stations, or tasks. A cell may visually host or mark an area used by one of those objects, but those resources are separate records.

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

Current state:

- Storage locations are still mostly represented by rack home cells and rack-storage cells.
- `StorageLocation` exists as a canonical type in `src/models/rmfsDomain.ts`.

Next step:

- Promote generated rack storage cells into explicit storage-location records with allowed rack types, approach waypoint IDs, current rack ID, and default orientation.

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

Alignment gap:

- Current rack status is implicit. `RackOperationalStatus` is defined in `src/models/rmfsDomain.ts` but not yet stored on every rack.
- Home/current storage location IDs are not yet first-class fields on every rack.

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
- queue cells
- service time
- queue length

Alignment gap:

- Station service point and queue waypoints are still derived from cells. `StationResourceState` documents the desired resource shape.

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

Current state:

- `SimulationTask` exists for movement tasks.
- `RmfsOrder` and `RmfsOrderLine` are defined in `src/models/rmfsDomain.ts`.

Alignment gap:

- Customer orders, order lines, pod/rack selection for SKUs, and order assignment are not yet wired into the UI.

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

- shortest-path path planning
- nearest compatible station selection
- weighted HOT/WARM/COLD task selection
- return-home rack storage behavior
- basic reservation traffic control

Future implementation:

- explicit controller modules with interchangeable strategies and comparable metrics.

## What Changed In This Pass

- Added `src/models/rmfsDomain.ts` for canonical RMFS types.
- Added `buildRoutingWaypoints` so graph construction is explicitly waypoint-based.
- Marked Simulation Mode Experimental rather than over-claiming RAWSim-O-level simulation.
- Disabled the old Flying-V placeholder option.
- Updated README and implementation status to distinguish stable layout editing from experimental simulation.

## Remaining Alignment Work

1. Convert rack-storage cells into explicit `StorageLocation` records.
2. Add rack operational status to the main rack model.
3. Add customer orders and order lines separate from movement tasks.
4. Add simple interchangeable decision controllers.
5. Add pod/rack selection rules based on SKU/bin inventory.
6. Add rack storage/repositioning rules after station visits.
7. Keep full MAPF and 3D simulator work out of the stabilization path until the layout editor stays reliable.
