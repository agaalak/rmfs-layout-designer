# Pod Orientation And Footprint

Date: 2026-05-23

Racks are treated as RMFS pods during simulation. Runtime pose is separate from design-time home placement.

## Runtime Position

During simulation, stored pods render from `rackStates` and `storageLocationStates`, not from the design rack home cell. When `nearest_available_storage` selects a different destination, the pod's runtime storage location and current cell are updated after drop. The design home is not mutated unless a future explicit configuration chooses to do that.

## Service Cells

Pickup and drop are only valid on `storageLocation.podServiceCell`. Approach cells can help diagnostics and routing, but they do not trigger lift or drop.

## Rotation

Rotation remains a property of a traversable cell. The current simulation updates pod orientation and loaded envelope reservations for 90-degree rectangular footprints. The next realism step is to make all visual rotation, swept-envelope checks, and station face checks share a single cached pod pose object for every multi-cell pod.
