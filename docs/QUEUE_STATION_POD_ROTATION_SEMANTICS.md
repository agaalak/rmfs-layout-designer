# Queue, Station, Pod, and Rotation Semantics

This document records the corrected RMFS semantics used by the app as of schema `0.3.0`.

## Queue Cells vs Station Cells

Queue cells are not station cells. A queue cell is a directional waiting cell in a `QueueLane`.

A queue lane has:

- `queueLaneId`
- `stationId`
- ordered cells with `queueIndex`
- `entryCell` at the tail
- `headCell` adjacent to the station
- `directionToStation`
- `maxLength`

The station references queue lanes by `queueLaneIds`, but it does not own the queue cell geometry.

## Station Service Cell

A station has one physical `station.cell`. A robot must physically enter that cell before station service can start.

Simulation guards enforce:

- service cannot start from a queue cell
- `robot.currentCell` must equal `station.cell`
- station queues advance FIFO toward the service cell

## Pod Service Cell

Each `StorageLocation` has a `podServiceCell`.

The robot must enter this cell to:

- lift a stored pod/rack
- drop a carried pod/rack

Approach cells may still be useful for diagnostics and future path planning, but they do not trigger pickup or dropoff.

For 1x1 racks, `podServiceCell` is the rack cell. For larger footprints, the anchor cell is used unless explicitly changed.

## Rotation as a Cell Property

Rotation is no longer a `CellType` and is no longer modeled as an active `RotationZone` object.

Rotation is configured on any traversable `LayoutCell` with:

- `allowRotation`
- `supportedRotationOrientationsDeg`
- `rotationTimeSec`
- `rotationCapacity`
- `allowedRotationRackTypes`

The Direction/Traffic tool owns these settings. Rotation-enabled cells render with a rotation overlay.

## Migration

Import schema `0.3.0` migrates old layouts:

- legacy `ROTATION` cells become `ROAD` cells with `allowRotation=true`
- old `rotationZones` copy their orientation/time/capacity data onto cells
- old `station.queueCells` become first-class `QueueLane` records
- old station `maxQueueLength` becomes queue lane length/capacity semantics
- storage locations receive `podServiceCell`

Exported layouts use queue lanes and cell rotation properties. Active `rotationZones` are exported empty.

## Tests

Coverage includes:

- no active `ROTATION` cell type
- old rotation zone migration
- old station queue migration
- station routing ends at `station.cell`
- pickup routing ends at `podServiceCell`
- rotation routing targets `allowRotation` cells
- export/import roundtrip preserves corrected semantics
- E2E manual rotation configuration through the Direction tool

