# RAWSim-O / RMFS Behavior Gap Audit

This audit uses RAWSim-O and related RMFS papers as conceptual references only. No GPL code was copied.

Reference signals:

- RAWSim-O is described as a discrete-event RMFS framework for studying interacting decision problems in systems where robots carry pods/storage units to stations.
- The RAWSim-O paper emphasizes pod selection, pod reallocation after station visits, order fulfillment, station decisions, and extensible decision methods.
- The decision-rules paper studies pick and replenishment processes, order assignment, pod selection, pod storage assignment, realistic robot movement, and unit-level inventory tracking.
- The path-planning paper compares RMFS-adapted multi-agent path planning algorithms including WHCA*, CBS, FAR, BCP, and OD&ID for collision/deadlock-free movement.

## Summary Matrix

| Feature | Current app | RAWSim-O/RMFS expectation | Gap | Priority | Next action |
|---|---|---|---|---|---|
| Layout instance | Grid, cells, racks, stations, storage locations, chargers, parking, rotation zones | Instance with graph, pods, bots, stations, inventory, controllers, statistics | Mostly present, graph/waypoint model still simplified | P1 | Keep waypoint model explicit |
| Pod/rack lifecycle | Stored/reserved/carried/station/return states exist | Robust event-driven state machine with all pod resource locks | Present but simplified | P1 | Add state-machine tests per transition |
| Robot lifecycle | Spawn, move, lift, carry, queue, service, return, block | Discrete-event bot lifecycle with safe traffic control and battery policies | Battery/charging and full traffic missing | P1/P2 | Backlog battery; add WHCA later |
| Station lifecycle | Service timer, queues, pick/replenish/combi basics | Workstation resource with capacity, queueing, inventory updates, order processing | Queue prediction and station assignment simple | P1 | Improve queue-aware dispatch |
| Orders/inventory | Orders, lines, bin SKUs, reserved quantity, pick decrement | Unit-level inventory and decision-rule experiments | Good foundation, partial fulfillment/returns weak | P1 | Add partial/short handling |
| Decision controllers | Explicit controller modules and registry | Interchangeable decision rules per problem | Basic strategies only | P1 | Add traceable scoring/candidates |
| Path planning | Shortest path + reservations + collision guard | MAPF algorithms with kinematic constraints | No WHCA*/CBS | P1 | Add WHCA-style rolling horizon next |
| Traffic/deadlock | Reservation table, runtime collision guard, deadlock detection | Collision/deadlock-free multi-robot execution | Conservative, not globally complete | P0/P1 | Improve traffic controller before realism |
| Metrics | Throughput, utilization, conflicts, density | Detailed experiment metrics and controller comparisons | Some metrics synthetic/rough | P2 | Add experiment runner |

## Detailed Gaps

### 1. Layout / Instance Model

- Current behavior: `WarehouseLayout` contains grid/cells, racks, storage locations, stations, chargers, parking, rotation zones, traffic rules, assumptions, and optional simulation config.
- Expected behavior: RMFS instance model should separate physical cells, routing waypoints, resource capacities, inventory, orders, and controller settings.
- Files: `src/models/layout.ts`, `src/models/rmfsDomain.ts`, `src/graph/graphBuilder.ts`.
- Gap: Waypoints are derived at runtime and not persisted as first-class editable objects.
- Severity: P1. Effort: M. Fix now/backlog: backlog.
- Test required: import/export waypoint compatibility and reachability.

### 2. Pod/Rack Lifecycle

- Current behavior: rack states include stored/reserved/carried/at-station-like statuses; storage locations track occupancy.
- Expected behavior: pod lifecycle should be an explicit state machine with reservations and resource ownership enforced.
- Files: `src/simulation/simulationEngine.ts`, `src/models/rack.ts`, `src/models/storage.ts`.
- Gap: transitions are distributed across engine functions and not isolated in a rack lifecycle module.
- Severity: P1. Effort: M. Fix now/backlog: backlog/refactor.
- Test required: transition table tests.

### 3. Robot/Bot Lifecycle

- Current behavior: robot state includes idle, assigned, moving empty/loaded, lift/drop, service, rotation, blocked.
- Expected behavior: bot behavior should integrate traffic control, charging, battery drain, kinematics, and event scheduling.
- Files: `src/models/robot.ts`, `src/simulation/simulationEngine.ts`, `src/simulation/collisionRuntime.ts`.
- Gap: no real battery drain; no acceleration/deceleration integration; no global MAPF.
- Severity: P1/P2. Effort: L. Fix now/backlog: backlog.
- Test required: battery/charger lifecycle when added.

### 4. Station Lifecycle

- Current behavior: stations have queues, service timer, active robot/rack, pick/replenish updates.
- Expected behavior: pick/replenishment/combi stations should model queue capacity, service resource capacity, face/orientation requirements, line fulfillment, and replenishment quantities.
- Files: `src/models/station.ts`, `src/simulation/simulationEngine.ts`.
- Gap: station dispatch is intentionally conservative; queue reservation is not predictive enough.
- Severity: P1. Effort: M.
- Test required: queue-aware station assignment and overflow prevention.

### 5. Order and Inventory Logic

- Current behavior: sample orders generated from inventory; pick decrements inventory; replenishment increments; reserved quantity exists.
- Expected behavior: order assignment should support waves, due dates, partial fulfillment, shortages, returns, and unit-level inventory analytics.
- Files: `src/models/order.ts`, `src/simulation/inventory.ts`, `src/simulation/orderGeneration.ts`.
- Gap: due-time/returns/partial fulfillment are thin.
- Severity: P2. Effort: M.

### 6. Decision Rules / Controllers

- Current behavior: controllers exist with a registry and decision traces.
- Expected behavior: RAWSim-O-style experiments compare decision methods across order assignment, pod selection, station selection, pod storage, path planning, charging.
- Files: `src/simulation/controllers/*`.
- Gap: no experiment runner UI for multiple seeds/controller comparisons.
- Severity: P1/P2. Effort: L.

### 7. Movement / Path Planning / Traffic

- Current behavior: shortest paths, one-way graph, reservations, runtime guard, deadlock detection, terminal parking/charging pockets.
- Expected behavior: RMFS path planning should handle many robots through MAPF-like algorithms and kinematic constraints.
- Files: `src/simulation/pathPlanner.ts`, `src/simulation/reservationTable.ts`, `src/simulation/trafficController.ts`, `src/simulation/collisionRuntime.ts`.
- Gap: no rolling-horizon WHCA*, no CBS, no guaranteed conflict resolution.
- Severity: P1. Effort: XL.

### 8. Metrics / Statistics

- Current behavior: analytics and simulation metrics include throughput estimates, utilization, conflict counts, wait time.
- Expected behavior: experiment-ready statistics include throughput, path length, search time, queue time, order due time, robot utilization, pod touches, inventory availability.
- Files: `src/analytics/*`, `src/simulation/scenarioRunner.ts`.
- Gap: metrics are partly estimates and not seed-comparison ready.
- Severity: P2. Effort: M.
