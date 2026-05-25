# Changelog

## 2026-05-23 - Directed Graph And Queue Pre-Point Alignment

- Added persisted `DirectedNeighborLink` records so one-way and two-way traffic are modeled as center-to-center cell edges.
- Updated graph construction and direction-arrow rendering to use directed links, with legacy cell-local directions kept as migration/editing input.
- Added first-class `QueuePoint` pre-station resources and migrated legacy queue lanes/cells into queue pre-points during normalization.
- Updated station assignment and station routing to score queue pre-point load/reservations plus active service occupancy.
- Kept `podServiceCell` pickup/drop routing, runtime rack rendering after storage reallocation, and station-service-only-at-`station.cell` semantics.
- Extended Debug / QA inspectors and test hooks with queue pre-point visibility while retaining queue-lane aliases for older diagnostics.
- Added docs for the directed graph, queue pre-point model, and pod runtime footprint/position semantics.

Deferred:

- Full WHCA*/CBS/MAPF planning remains out of scope.
- The Direction UI still uses the existing cell-control panel while synchronizing directed links under the hood.
- Legacy queue-lane types remain as deprecated import/test compatibility until a later cleanup removes the old API surface.

## 2026-05-24 - Queue Pre-Point Traffic Fix

- Fixed the live-instance "only one robot runs" regression by preserving explicit simulation setting edits across initialization instead of letting demo layout defaults overwrite them.
- Restored Small Demo task generation to six tasks so the default demo exercises more than one robot.
- Changed generated queue pre-points to `HOLD_UPSTREAM`, so they act as physical checkpoints rather than task-long station locks.
- Released queue pre-point reservations once a robot reaches or passes the checkpoint, allowing following robots to approach safely without sharing the pre-point or station cell.
- Changed traffic log wording from "collision prevented" to "move held before entry" for normal pre-move ownership denials.
- Refined direction arrows with higher-contrast center-to-center strokes, rounded caps, and subtle white lift for better readability on dense layouts.

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
