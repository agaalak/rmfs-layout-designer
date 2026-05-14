import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { RackStorageStrategy, StorageLocationRuntimeState } from "../../models/simulation";
import type { StorageLocation } from "../../models/storage";
import { buildRoadGraph } from "../../graph/graphBuilder";
import { shortestPathBetweenSets } from "../../graph/shortestPath";
import { cellKey } from "../../utils/gridMath";

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

export function selectStorageDestination(
  layout: WarehouseLayout,
  rack: Rack,
  states: Record<string, StorageLocationRuntimeState>,
  strategy: RackStorageStrategy,
  fromCell = rack.homeCell
): StorageLocation | undefined {
  if (strategy === "return_home") {
    const home = layout.storageLocations?.find((location) => location.storageLocationId === rack.homeStorageLocationId);
    if (home && compatible(home, rack)) return home;
  }

  const candidates = availableLocations(layout, rack, states);
  if (candidates.length === 0) {
    return layout.storageLocations?.find((location) => location.storageLocationId === rack.homeStorageLocationId);
  }

  const graph = buildRoadGraph(layout);
  const scored = candidates.map((location) => ({
    location,
    distance: shortestPathBetweenSets(graph, [cellKey(fromCell)], location.approachWaypointIds)?.distance ?? Number.MAX_SAFE_INTEGER
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

