# Queue Pre-Point Model

Date: 2026-05-23

Queue lanes are deprecated for runtime behavior. Queue is now represented by `QueuePoint` resources: physical pre-station checkpoints that a loaded robot must visit before entering a station service cell.

## Semantics

- A queue pre-point is a traversable cell marker, not a station cell.
- A pre-point can apply to one station or to all stations.
- A station policy can require a pre-point visit before service.
- If the station is busy, the robot waits at the pre-point or upstream instead of entering the occupied station cell.
- Station service still starts only when `robot.currentCell === station.cell`.

## Migration

Legacy station queue cells and queue lanes are converted into queue pre-points during layout normalization. Legacy `QUEUE` cells become traversable road cells with queue pre-point markers where possible.

## Debugging

The Debug / QA panel and `window.__RMFS_TEST__` expose queue pre-point inspectors, occupancy, reservations, selected station targets, and why-waiting information. The old queue-lane inspector name remains as a compatibility alias when tests or older diagnostics request it.
