import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { Station } from "../../models/station";
import type { QueueLaneRuntimeState, QueuePointRuntimeState, StationAssignmentStrategy, StationQueue, StationRuntimeState } from "../../models/simulation";
import { queuePointsForStation, queuePointRuntimeLoad } from "../../utils/queuePoints";
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
    queuePointStates?: Record<string, QueuePointRuntimeState>;
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
    : { queueLaneStates: runtime.queueLaneStates ?? {}, queuePointStates: runtime.queuePointStates ?? {}, stationStates: runtime.stationStates ?? {}, stationQueues: runtime.stationQueues ?? [] };
  if (strategy === "shortest_queue") {
    return [...stations].sort((a, b) => {
      const pointScore = (station: Station) => {
        const points = queuePointsForStation(layout, station);
        if (points.length === 0) return stationQueueRuntimeScore(layout, context, station.id).score;
        const totalLoad = points.reduce((sum, point) => sum + queuePointRuntimeLoad({ queuePointStates: context.queuePointStates ?? {}, robots: [], tasks: [] }, point), 0);
        const capacity = points.reduce((sum, point) => sum + Math.max(1, point.capacity), 0);
        const stationStates = context.stationStates as Record<string, StationRuntimeState>;
        const active = stationStates[station.id]?.activeRobotId ? 1 : 0;
        return totalLoad / Math.max(1, capacity) + active;
      };
      return pointScore(a) - pointScore(b) || a.id.localeCompare(b.id);
    })[0];
  }
  if (strategy === "station_type_match") {
    return stations.find((station) => ["PICK", "COMBI"].includes(station.stationType)) ?? stations[0];
  }
  return nearestCompatibleStation(layout, rack) ?? stations[0];
}
