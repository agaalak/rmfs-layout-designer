import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { Station } from "../../models/station";
import type { StationAssignmentStrategy, StationQueue } from "../../models/simulation";
import { nearestCompatibleStation } from "../pathPlanner";

function compatible(layout: WarehouseLayout, rack: Rack) {
  return layout.stations.filter((station) => station.acceptedRackFaces.some((face) => rack.faces.some((rackFace) => rackFace.faceId === face)));
}

export function selectStationForRack(
  layout: WarehouseLayout,
  rack: Rack,
  strategy: StationAssignmentStrategy,
  stationQueues: StationQueue[] = []
): Station | undefined {
  const stations = compatible(layout, rack);
  if (strategy === "shortest_queue") {
    return [...stations].sort((a, b) => {
      const queueA = stationQueues.find((queue) => queue.stationId === a.id);
      const queueB = stationQueues.find((queue) => queue.stationId === b.id);
      return (queueA?.waitingRobotIds.length ?? 0) + (queueA?.activeRobotId ? 1 : 0) - ((queueB?.waitingRobotIds.length ?? 0) + (queueB?.activeRobotId ? 1 : 0));
    })[0];
  }
  if (strategy === "station_type_match") {
    return stations.find((station) => ["PICK", "COMBI"].includes(station.stationType)) ?? stations[0];
  }
  return nearestCompatibleStation(layout, rack) ?? stations[0];
}

