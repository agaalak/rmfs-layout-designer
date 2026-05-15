# Traffic Control Model

Experimental Simulation Mode uses practical reservation-based traffic control. It is not MAPF yet. The goal is to prevent obvious collisions and explain blocking/failure modes while preserving the existing RMFS operational simulator.

## Assumptions

- The warehouse is a grid-based road network.
- Robot routing uses graph shortest paths over traversable cells.
- Reservations use a discrete timestep, defaulting to one second.
- Visual movement is continuous interpolation between grid cells.
- Unloaded robot footprint is one grid cell.
- Loaded robot footprint includes the robot center cell plus the carried rack footprint.
- Runtime collision enforcement runs after movement and rolls back unsafe moves before they become accepted visible simulation state.
- Racks are limited to the supported layout footprint sizes, currently up to `2x2` cells.
- No turn-radius or acceleration envelope is modeled yet.
- No CBS, WHCA*, or full MAPF solver is implemented in this pass.

## Entity Envelopes

- Unloaded robot envelope: one occupied center cell.
- Loaded robot envelope: center cell plus carried rack occupied cells based on rack footprint and orientation.
- Stationary rack envelope: rack occupied cells in storage.
- Station service envelope: station service cell and active service reservation.
- Rotation-cell envelope: rotation-enabled cells plus capacity reservation during dwell.
- Charger and parking envelopes: charger/parking cells plus capacity reservation.

## Conflict Types

- Vertex conflict: two robots reserve the same cell at the same timestep.
- Edge-swap conflict: two robots traverse the same edge in opposite directions at the same timestep.
- Footprint overlap: a loaded robot envelope overlaps another robot/rack/object envelope.
- Runtime robot overlap: interpolated or step-advanced robots attempt to occupy overlapping visible envelope cells.
- Swept-envelope conflict: a loaded envelope would overlap blocked/static cells during a move.
- Station queue capacity conflict: no queue slot is available.
- Rotation-cell capacity conflict: rotation-enabled cell is already reserved at that time.
- Storage-location conflict: two returning racks reserve the same destination.
- Deadlock/livelock: robots wait on each other or make no progress for too long.

## Resolution Policies

- Wait: insert wait cells at the current path start.
- Reserve later: retry path reservation with additional wait steps.
- Local replan: clear future robot reservations and replan from the current cell.
- Priority escalation: loaded robots and older tasks can receive priority.
- Task delay: pending tasks remain pending when station/resource capacity is unavailable.
- Task fail: if blocked longer than configured thresholds, fail the affected task with an explicit reason.
- Emergency unblock fallback: mark a low-priority or empty robot blocked and release future reservations.

## Current Implementation Scope

This pass adds:

- carried-rack collision envelopes in `src/simulation/collisionEnvelope.ts`
- loaded-envelope path reservations in `src/simulation/reservationTable.ts` and `src/simulation/trafficController.ts`
- resource reservations for rotation-enabled cells, station queues/service slots, storage, chargers, and parking
- wait/replan/block policy counters and traffic event-log entries
- repeated-conflict and blocked-time deadlock detection in `src/simulation/deadlockDetector.ts`
- deterministic scenario runner support in `src/simulation/scenarioRunner.ts`
- Traffic Control diagnostics in Simulation Mode
- runtime collision guard in `src/simulation/collisionRuntime.ts`
- deterministic collision scenarios in `src/simulation/scenarios/collisionScenarios.ts`
- simulation invariant checks in `src/simulation/invariants.ts`
- Debug / QA diagnostics for traffic, resource, deadlock, controller, and invariant events

## Verification Status

- `npm run build` passed.
- `npm test -- --run` passed with 74 tests.
- `npm run test:e2e -- --workers=1` passed with 15 browser tests and 0 skipped tests.
- Browser coverage now includes manual canvas editing, Mode B candidate apply, Hybrid locked-cell preservation, one simple simulation cycle, view controls across workflows, mouse wheel zoom, and mouse/spacebar pan.

## Known Limitations

- No global optimality guarantee.
- No full CBS/WHCA*/MAPF planning.
- Deadlock recovery is conservative and favors reporting/clearing reservations over complex cooperative replanning.
- Loaded swept envelopes are cell-based, not continuous geometry.
- Rotation-zone and station resources use simple capacity counts.
- This is still not full MAPF. Dense/high-robot scenarios can still block or fail lower-priority tasks conservatively.
- The Debug / QA panel helps explain blocking and prevented collisions but does not itself solve traffic.

## Next Steps

1. Add more browser-level collision E2E scenarios for carried 2x2 racks and narrow aisles.
2. Add WHCA*-style rolling-horizon prioritized planning on top of the reservation table.
3. Add CBS-style small-scenario comparison after WHCA* is stable.
4. Improve deadlock recovery from conservative blocking to safe local backoff/replan.
5. Add battery drain, charger queues, and station service variability.
# 2026-05-14 Semantic Routing Update

Traffic control now receives routes that reflect corrected RMFS semantics:

- station routes include ordered queue lane cells and end at the actual station service cell
- pickup/drop routes target `StorageLocation.podServiceCell`
- rotation reservations use cell resource IDs such as `rotation_cell_12:8`
- legacy rotation-zone resources are import-only migration metadata

This is still not WHCA*, CBS, or full MAPF. Reservation and runtime collision guards remain the current traffic-control layer.
