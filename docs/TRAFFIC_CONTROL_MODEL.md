# Traffic Control Model

Experimental Simulation Mode uses practical reservation-based traffic control. It is not MAPF yet. The goal is to prevent obvious collisions and explain blocking/failure modes while preserving the existing RMFS operational simulator.

## Assumptions

- The warehouse is a grid-based road network.
- Robot routing uses graph shortest paths over traversable cells.
- Reservations use a discrete timestep, defaulting to one second.
- Visual movement is continuous interpolation between grid cells.
- Unloaded robot footprint is one grid cell.
- Loaded robot footprint includes the robot center cell plus the carried rack footprint.
- Racks are limited to the supported layout footprint sizes, currently up to `2x2` cells.
- No turn-radius or acceleration envelope is modeled yet.
- No CBS, WHCA*, or full MAPF solver is implemented in this pass.

## Entity Envelopes

- Unloaded robot envelope: one occupied center cell.
- Loaded robot envelope: center cell plus carried rack occupied cells based on rack footprint and orientation.
- Stationary rack envelope: rack occupied cells in storage.
- Station service envelope: station service cell and active service reservation.
- Rotation-zone envelope: rotation zone cells plus capacity reservation during dwell.
- Charger and parking envelopes: charger/parking cells plus capacity reservation.

## Conflict Types

- Vertex conflict: two robots reserve the same cell at the same timestep.
- Edge-swap conflict: two robots traverse the same edge in opposite directions at the same timestep.
- Footprint overlap: a loaded robot envelope overlaps another robot/rack/object envelope.
- Swept-envelope conflict: a loaded envelope would overlap blocked/static cells during a move.
- Station queue capacity conflict: no queue slot is available.
- Rotation-zone capacity conflict: rotation zone is already reserved at that time.
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
- resource reservations for rotation zones, station queues/service slots, storage, chargers, and parking
- wait/replan/block policy counters and traffic event-log entries
- repeated-conflict and blocked-time deadlock detection in `src/simulation/deadlockDetector.ts`
- deterministic scenario runner support in `src/simulation/scenarioRunner.ts`
- Traffic Control diagnostics in Simulation Mode

## Verification Status

- `npm run build` passed.
- `npm test -- --run` passed with 67 tests.
- `npm run test:e2e -- --workers=1` passed with 2 smoke tests and 10 skipped legacy interactive canvas tests.
- The skipped E2E tests should be repaired before using browser automation as the main regression gate for Design/Generate/Analyze/Simulation workflows.

## Known Limitations

- No global optimality guarantee.
- No full CBS/WHCA*/MAPF planning.
- Deadlock recovery is conservative and favors reporting/clearing reservations over complex cooperative replanning.
- Loaded swept envelopes are cell-based, not continuous geometry.
- Rotation-zone and station resources use simple capacity counts.
- Browser E2E coverage is currently smoke-level for this pass because deep interactive canvas tests are skipped pending Playwright/Konva click-stability repair.

## Next Steps

1. Re-enable and stabilize the skipped interactive Playwright tests.
2. Add WHCA*-style rolling-horizon prioritized planning on top of the reservation table.
3. Add CBS-style small-scenario comparison after WHCA* is stable.
4. Improve deadlock recovery from conservative blocking to safe local backoff/replan.
5. Add battery drain, charger queues, and station service variability.
