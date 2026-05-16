import type { WarehouseLayout } from "../../models/layout";
import type { GridCell } from "../../models/grid";
import type { Rack } from "../../models/rack";
import type { RackStorageStrategy, StorageLocationRuntimeState } from "../../models/simulation";
import type { StorageLocation } from "../../models/storage";
import { calculatePathDistanceMeters, findPathToStorageServiceCell } from "../pathPlanner";

function compatible(location: StorageLocation, rack: Rack) {
  return location.allowedRackTypes.length === 0 || location.allowedRackTypes.includes(rack.rackTypeId);
}

function availableLocations(layout: WarehouseLayout, rack: Rack, states: Record<string, StorageLocationRuntimeState>) {
  return (layout.storageLocations ?? []).filter((location) => {
    const runtime = states[location.storageLocationId];
    const status = runtime?.status ?? location.status;
    return compatible(location, rack) && status === "EMPTY" && !runtime?.reservedForRackId;
  });
}

function storageAvailableForRack(location: StorageLocation, rack: Rack, states: Record<string, StorageLocationRuntimeState>) {
  const runtime = states[location.storageLocationId];
  const status = runtime?.status ?? location.status;
  if (!compatible(location, rack)) return false;
  if (runtime?.reservedForRackId && runtime.reservedForRackId !== rack.id) return false;
  if (runtime?.currentlyStoredRackId && runtime.currentlyStoredRackId !== rack.id) return false;
  return status === "EMPTY" || status === "RESERVED" || runtime?.reservedForRackId === rack.id || (status === "OCCUPIED" && runtime?.currentlyStoredRackId === rack.id);
}

function scoreByServiceCellPath(layout: WarehouseLayout, location: StorageLocation, fromCell: GridCell) {
  const path = findPathToStorageServiceCell(layout, fromCell, location.podServiceCell);
  return path.length > 0 ? calculatePathDistanceMeters(path, layout.grid) : Number.MAX_SAFE_INTEGER;
}

export function selectStorageDestination(
  layout: WarehouseLayout,
  rack: Rack,
  states: Record<string, StorageLocationRuntimeState>,
  strategy: RackStorageStrategy,
  fromCell = rack.homeCell
): StorageLocation | undefined {
  if (strategy === "return_home") {
    const home = layout.storageLocations?.find((location) => location.storageLocationId === rack.homeStorageLocationId);
    if (home && storageAvailableForRack(home, rack, states)) return home;
  }

  const sourceStorageId = rack.currentStorageLocationId ?? rack.homeStorageLocationId;
  const candidates = availableLocations(layout, rack, states).filter((location) => strategy === "return_home" || location.storageLocationId !== sourceStorageId);
  if (candidates.length === 0) {
    const home = layout.storageLocations?.find((location) => location.storageLocationId === rack.homeStorageLocationId);
    return home && storageAvailableForRack(home, rack, states) ? home : undefined;
  }

  const scored = candidates.map((location) => ({
    location,
    distance: scoreByServiceCellPath(layout, location, fromCell)
  }));

  if (strategy === "keep_hot_near_station") {
    const stationCells = layout.stations.map((station) => station.cell);
    return scored
      .map((item) => ({
        ...item,
        stationDistance:
          stationCells.length === 0
            ? 0
            : Math.min(...stationCells.map((stationCell) => Math.abs(stationCell.row - item.location.cells[0].row) + Math.abs(stationCell.col - item.location.cells[0].col)))
      }))
      .sort((a, b) => {
        if (rack.demandClass === "COLD") return b.stationDistance - a.stationDistance;
        if (rack.demandClass === "HOT") return a.stationDistance - b.stationDistance;
        return a.distance - b.distance;
      })[0]?.location;
  }

  return scored.sort((a, b) => a.distance - b.distance)[0]?.location;
}
