# Changelog

## 2026-05-16 - RAWSim-O Queue/Controller Alignment

- Extracted queue-lane runtime behavior into `src/simulation/lifecycle/queueLaneLifecycle.ts`.
- Added small lifecycle helpers for rack service-cell gates, station service-cell readiness, and robot path completion.
- Changed `shortest_queue` station assignment to score live queue-lane occupancy/reservations and active station service occupancy instead of stale `StationQueue.waitingRobotIds`.
- Changed nearest rack selection to score path cost to `StorageLocation.podServiceCell`, matching runtime pickup semantics.
- Added station graph context so generic shortest paths do not use station cells as pass-through shortcuts.
- Extended Debug / QA diagnostics with queue-lane inspector, station admission trace, controller decision trace, reservation snippets, and why-waiting explanations.
- Added `typecheck` and `ci:test` npm scripts.
- Added focused Vitest coverage for queue-lane lifecycle, station assignment scoring, rack service-cell scoring, rack lifecycle gates, and station pass-through policy.

Deferred:

- Full WHCA*/CBS/MAPF planning remains out of scope.
- Continuous swept-envelope and turn-radius modeling remain future traffic-control work.
- E2E screenshot/GIF artifacts should be captured during a dedicated visual QA run.
