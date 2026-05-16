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

Runtime dispatch now uses queue lane capacity instead of a station-wide active-task lock. A station can have one robot in service while additional robots are assigned to reserved queue lane slots. The runtime state records queue lane occupied cells, reserved robots/tasks, and the active head robot for debugging.

If the head robot reaches the final queue cell while `station.cell` is occupied, it waits at the queue head. It does not continue to interpolate into the station service cell until that cell is available.

## Pod Service Cell

Each `StorageLocation` has a `podServiceCell`.

The robot must enter this cell to:

- lift a stored pod/rack
- drop a carried pod/rack

Approach cells may still be useful for diagnostics and future path planning, but they do not trigger pickup or dropoff.

For 1x1 racks, `podServiceCell` is the rack cell. For larger footprints, the anchor cell is used unless explicitly changed.

When a rack is dropped, simulation state updates `rackStates[rackId].currentStorageLocationId` and `rackStates[rackId].currentCell` to the destination storage `podServiceCell`. Simulation rendering uses that runtime state, not the design-time rack home cell.

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
- multi-robot dispatch through queue lane reservations
- runtime rack rendering after nearest-available storage reallocation
