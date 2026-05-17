import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { Station } from "../../models/station";
import type { QueueLaneRuntimeState, StationAssignmentStrategy, StationQueue, StationRuntimeState } from "../../models/simulation";
import { stationQueueRuntimeScore } from "../lifecycle/queueLaneLifecycle";
import { findPathToStationQueue, nearestCompatibleStation, storageLocationForRackTask } from "../pathPlanner";

function compatible(layout: WarehouseLayout, rack: Rack) {
  return layout.stations.filter((station) => station.acceptedRackFaces.some((face) => rack.faces.some((rackFace) => rackFace.faceId === face)));
}

export function selectStationForRack(
  layout: WarehouseLayout,
  rack: Rack,
  strategy: StationAssignmentStrategy,
  runtime: StationQueue[] | {
    queueLaneStates?: Record<string, QueueLaneRuntimeState>;
    stationStates?: Record<string, StationRuntimeState>;
    stationQueues?: StationQueue[];
  } = []
): Station | undefined {
  const serviceCell = storageLocationForRackTask(layout, rack)?.podServiceCell ?? rack.homeCell;
  const compatibleStations = compatible(layout, rack);
  const reachableStations = compatibleStations.filter((station) => findPathToStationQueue(layout, serviceCell, station).length > 0);
  const stations = reachableStations.length > 0 ? reachableStations : compatibleStations;
  const context = Array.isArray(runtime)
    ? { queueLaneStates: {}, stationStates: {}, stationQueues: runtime }
    : { queueLaneStates: runtime.queueLaneStates ?? {}, stationStates: runtime.stationStates ?? {}, stationQueues: runtime.stationQueues ?? [] };
  if (strategy === "shortest_queue") {
    return [...stations].sort((a, b) => {
      const scoreA = stationQueueRuntimeScore(layout, context, a.id);
      const scoreB = stationQueueRuntimeScore(layout, context, b.id);
      return scoreA.score - scoreB.score || scoreA.queuedOrReserved - scoreB.queuedOrReserved || a.id.localeCompare(b.id);
    })[0];
  }
  if (strategy === "station_type_match") {
    return stations.find((station) => ["PICK", "COMBI"].includes(station.stationType)) ?? stations[0];
  }
  return nearestCompatibleStation(layout, rack) ?? stations[0];
}
