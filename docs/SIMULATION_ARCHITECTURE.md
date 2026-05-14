# Experimental 2D Simulation Architecture

## Scope

The 2D simulator is an Experimental top-down, time-based playback layer over the existing RMFS layout model. It is intended for early operational debugging and layout comparison. It is not a full MAPF solver, not a 3D simulator, and not a physics engine.

## State Model

Simulation state lives in `src/store/simulationStore.ts` and uses the models in:

- `src/models/robot.ts`
- `src/models/task.ts`
- `src/models/simulation.ts`

The main state object tracks:

- `simTimeSec`
- running/paused state
- speed multiplier
- robots
- pending, active, completed, and failed tasks
- orders, completed orders, and failed orders
- inventory snapshots derived from rack bins
- rack runtime states
- storage-location runtime states
- station runtime states
- operational tasks layered over movement tasks
- station queues
- reservation table snapshot
- event log
- live metrics

The simulation config stores robot count, speeds, acceleration/deceleration values, lift/drop time, station service time, task generation mode/count, reservation time step, visual toggles, and controller strategy choices.

## Operational RMFS Model

The simulator now distinguishes business demand from movement:

- `RmfsOrder` and `RmfsOrderLine` model SKU demand and fulfillment.
- `SimulationInventoryBin` snapshots rack-bin inventory and reserved quantity.
- `OperationalTask` tracks the RMFS lifecycle for order pick, replenishment, rack movement, return to storage, charging, and parking tasks.
- `SimulationTask` remains the lower-level movement task used by the path planner and robot state machine.

The current pick flow is:

1. Generate sample orders from available SKU inventory.
2. Select a rack with available SKU quantity.
3. Select a compatible station.
4. Reserve inventory, rack, and storage state.
5. Assign an idle robot.
6. Move empty to rack approach.
7. Lift rack and free the source storage location.
8. Optionally rotate before station service.
9. Queue and service at the station.
10. Decrement picked inventory and fulfill order lines.
11. Select a return storage location.
12. Optionally rotate back toward storage orientation.
13. Drop rack, occupy storage, complete task/order, and return robot to idle.

## Robot State Machine

Robot states are intentionally explicit so canvas colors, event logs, and future debugging tools can stay understandable:

- `IDLE`
- `ASSIGNED`
- `MOVING_EMPTY`
- `LIFTING_RACK`
- `MOVING_LOADED`
- `QUEUING_AT_STATION`
- `SERVICING_AT_STATION`
- `ROTATING_WITH_RACK`
- `DROPPING_RACK`
- `RETURNING_RACK`
- `PARKING`
- `CHARGING`
- `BLOCKED`
- `ERROR`

Current implemented flow:

1. A robot starts `IDLE`.
2. A task is assigned and route segments are planned.
3. The robot moves empty to a rack approach cell.
4. The robot waits for lift time and attaches the rack.
5. The loaded robot drives to the station queue/service area, optionally via explicit rotation-zone dwell states.
6. The robot enters station FIFO service.
7. After service, a rack-storage controller chooses return home or another available storage location.
8. The robot waits for drop time, detaches the rack, completes the task, and returns to `IDLE`.

## Task Lifecycle

Operational work uses `OperationalTask` records and movement uses `SimulationTask` records with:

- task id/type
- rack id
- optional station id
- optional robot id
- priority
- status
- timestamps
- route plan
- required rack face/orientation data

Supported generation modes:

- Sample order generation from current SKU inventory.
- Rack selection by nearest rack with SKU, most inventory, or HOT/WARM/COLD preference.
- Station assignment by nearest compatible station, shortest queue, or station type.
- Manual rack/station selection from the simulation panel.

Movement task statuses are:

- `PENDING`
- `ASSIGNED`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`

## Path Planning

Path planning lives in `src/simulation/pathPlanner.ts`.

The planner uses the existing layout graph, so it inherits:

- traversable cell types
- one-way/two-way traffic direction rules
- blocked-cell exclusion
- graph reachability behavior

Important helpers:

- `findShortestPath(layout, startCell, goalCell)`
- `findPathToNearestRackApproach(layout, startCell, rack)`
- `findPathToStationQueue(layout, startCell, station)`
- `findNearestRotationZonePath(layout, startCell, requiredOrientation)`
- `findReturnRackPath(layout, stationCell, rackHomeCell)`
- `calculatePathDistanceMeters(path, grid)`

Multi-cell rack pickup/dropoff uses adjacent approach cells. Rack occupied cells are not treated as ordinary road cells.

## Reservation Table Logic

Reservation handling lives in `src/simulation/reservationTable.ts`.

The reservation table stores:

- reserved vertex cells by time step
- reserved directed edges by time step
- reservation time-step size

Implemented rules:

- Two robots cannot reserve the same cell at the same time.
- Two robots cannot swap edges at the same time.
- Existing reservations for a robot can be cleared before replanning.
- Wait steps can be inserted at the start of a path to resolve simple conflicts.

This is a practical first layer, not a complete deadlock-free MAPF algorithm.

## Simulation Engine

The engine lives in `src/simulation/simulationEngine.ts`.

Core functions:

- `validateSimulationStart(layout)`
- `initializeSimulation(layout, config)`
- `resetSimulation(config)`
- `generateSimulationTasks(layout, config, timeSec)`
- `createTaskForRackStation(layout, rackId, stationId, timeSec, priority)`
- `stepSimulation(layout, state, config, deltaTimeSec)`
- `reservationCellsForDisplay(state)`
- `robotCarriedRackOffsets(robot, layout)`

The engine is deterministic and step-based. The app shell calls `stepSimulation` on an interval while Experimental Simulation Mode is running. A manual Step button advances by one simulated second multiplied by the speed setting.

## Visual Layers

The canvas remains React Konva based.

Simulation components:

- `src/components/canvas/RobotLayer.tsx`
- `src/components/canvas/PathLayer.tsx`
- `src/components/canvas/ReservationLayer.tsx`
- `src/components/canvas/SimulationOverlayLayer.tsx`

Visual behavior:

- Robots render as colored circles with yaw arrows.
- State color indicates idle, empty movement, loaded movement, queue/service, charging, blocked, or error.
- Carried racks follow robot pose and hide the static rack object while attached.
- Planned paths render as dashed polylines when enabled.
- Reservation cells render as a translucent overlay when enabled.
- Station queues show small occupancy indicators near station cells.

## Station Queue Logic

Each station gets a `StationQueue` record. Robots entering a station are appended to the waiting list. If the station has no active robot, the first waiting robot begins service and receives a service end time. When service time expires, that robot leaves service and continues on its return route.

This is FIFO service, not a detailed workstation labor model. PICK and COMBI service paths decrement inventory and fulfill order lines. REPLENISH service paths can increment bin inventory through helper/controller code, but the UI is still pick-order focused.

## Orientation And Rotation Zones

Station required orientation and accepted rack faces are copied into tasks. If a station orientation differs from the rack's current orientation, route planning can include paths to compatible rotation zones before the station and before the return leg.

Current behavior: compatible rotation-zone paths create explicit `ROTATING_WITH_RACK` dwell states. Rack orientation updates at the end of pre-station and post-station rotation events. The model does not yet reserve rotation-zone capacity across multiple loaded robots.

## Validation Before Simulation

`validateSimulationStart` prevents simulation start when core prerequisites are missing:

- robot spawn location
- rack
- station
- traversable road graph
- rack approach reachability
- station approach reachability

Existing layout validation continues to cover overlaps, bounds, charger/parking size, footprint issues, connectivity, orientation, and face access.

## Exports

Simulation export helpers live in `src/importExport/exportSimulation.ts`.

Supported exports:

- simulation config JSON
- simulation event log CSV
- simulation metrics CSV
- orders CSV
- inventory CSV

Simulation config JSON can also be imported with validation.

## Next Steps Toward MAPF And 3D

Recommended sequence:

1. Add explicit rack-rotation dwell states and rotation-zone capacity reservations.
2. Reserve carried-rack footprints and swept envelopes for loaded robots.
3. Add replan-after-blocked thresholds and deadlock recovery.
4. Add WHCA* as a bounded rolling-horizon planner.
5. Add CBS for small benchmark scenarios and comparison tests.
6. Add battery drain, charger assignment, and charger queue policies.
7. Add richer station processing models and order/task batching.
8. Add 3D visualization once the 2D event/state model is stable.
