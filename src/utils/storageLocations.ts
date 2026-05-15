import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
import type { StorageLocation } from "../models/storage";
import { buildRoadGraph, objectApproachNodes, rackApproachNodes, type RoadGraph } from "../graph/graphBuilder";
import { cellKey } from "./gridMath";
import { rackOccupiedCells } from "./rackFootprint";

function cellsKey(cells: GridCell[]) {
  return cells.map(cellKey).sort().join("|");
}

function storageIdForRack(rack: Rack) {
  return rack.homeStorageLocationId ?? `storage_${rack.rackId}`;
}

function storageForRack(layout: WarehouseLayout, rack: Rack, graph: RoadGraph, existing?: StorageLocation): StorageLocation {
  const cells = rackOccupiedCells(rack, layout.grid);
  const approachWaypointIds = rackApproachNodes(layout, rack, graph);
  const stored = rack.operationalStatus === undefined || rack.operationalStatus === "STORED" || rack.operationalStatus === "RESERVED";
  return {
    storageLocationId: existing?.storageLocationId ?? storageIdForRack(rack),
    cells,
    podServiceCell: existing?.podServiceCell ?? cells[0],
    allowedRackTypes: existing?.allowedRackTypes?.length ? existing.allowedRackTypes : [rack.rackTypeId],
    defaultRackOrientationDeg: existing?.defaultRackOrientationDeg ?? rack.currentOrientationDeg,
    approachWaypointIds,
    currentlyStoredRackId: stored ? rack.id : existing?.currentlyStoredRackId,
    reservedForRackId: existing?.reservedForRackId,
    status: stored ? "OCCUPIED" : existing?.status ?? "EMPTY",
    zoneId: existing?.zoneId ?? rack.storageZoneId,
    locked: existing?.locked
  };
}

function storageForCell(layout: WarehouseLayout, cell: GridCell, index: number, graph: RoadGraph, existing?: StorageLocation): StorageLocation {
  return {
    storageLocationId: existing?.storageLocationId ?? `storage_empty_${cell.row}_${cell.col}_${index}`,
    cells: [cell],
    podServiceCell: existing?.podServiceCell ?? cell,
    allowedRackTypes: existing?.allowedRackTypes?.length ? existing.allowedRackTypes : ["two_face_mobile_rack"],
    defaultRackOrientationDeg: existing?.defaultRackOrientationDeg ?? 0,
    approachWaypointIds: objectApproachNodes(layout, cell, graph),
    currentlyStoredRackId: existing?.currentlyStoredRackId,
    reservedForRackId: existing?.reservedForRackId,
    status: existing?.status ?? "EMPTY",
    zoneId: existing?.zoneId,
    locked: existing?.locked
  };
}

export function ensureStorageLocations(layout: WarehouseLayout): WarehouseLayout {
  const existingById = new Map((layout.storageLocations ?? []).map((location) => [location.storageLocationId, location]));
  const existingByCells = new Map((layout.storageLocations ?? []).map((location) => [cellsKey(location.cells), location]));
  const locations: StorageLocation[] = [];
  const occupiedStorageCells = new Set<string>();
  const graph = buildRoadGraph(layout);

  const racks = layout.racks.map((rack) => {
    const cells = rackOccupiedCells(rack, layout.grid);
    const match = existingById.get(storageIdForRack(rack)) ?? existingByCells.get(cellsKey(cells));
    const storage = storageForRack(layout, rack, graph, match);
    locations.push(storage);
    cells.forEach((cell) => occupiedStorageCells.add(cellKey(cell)));
    return {
      ...rack,
      homeStorageLocationId: rack.homeStorageLocationId ?? storage.storageLocationId,
      currentStorageLocationId: rack.currentStorageLocationId ?? storage.storageLocationId,
      operationalStatus: rack.operationalStatus ?? "STORED"
    };
  });

  const rackStorageCells = layout.cells
    .filter((cell) => cell.cellType === "RACK_STORAGE" && !occupiedStorageCells.has(cellKey(cell)))
    .map((cell) => ({ row: cell.row, col: cell.col }));

  rackStorageCells.forEach((cell, index) => {
    const match = existingByCells.get(cellsKey([cell]));
    locations.push(storageForCell(layout, cell, index, graph, match));
  });

  const deduped = [...new Map(locations.map((location) => [location.storageLocationId, location])).values()];
  return { ...layout, racks, storageLocations: deduped };
}

export function storageLocationForRack(layout: WarehouseLayout, rack: Rack): StorageLocation | undefined {
  const normalized = ensureStorageLocations(layout);
  return normalized.storageLocations.find(
    (location) => location.storageLocationId === rack.currentStorageLocationId || location.storageLocationId === rack.homeStorageLocationId
  );
}
