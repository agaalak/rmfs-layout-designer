import type { WarehouseLayout } from "../models/layout";
import { buildRoadGraph, rackApproachNodes, stationNodes } from "../graph/graphBuilder";
import { dijkstraFromSources, reverseGraph } from "../graph/shortestPath";
import { clamp, mean, safeDivide } from "../utils/units";

export interface StationMetrics {
  stationWorkloadBalanceScore: number;
  estimatedQueuePressure: Record<string, number>;
  assignedRackCountByStation: Record<string, number>;
  bottleneckStationEstimate?: string;
}

export function calculateStationMetrics(layout: WarehouseLayout): StationMetrics {
  const graph = buildRoadGraph(layout);
  const distanceMaps = new Map<string, Map<string, number>>();
  for (const station of layout.stations) {
    distanceMaps.set(station.id, dijkstraFromSources(reverseGraph(graph), stationNodes(station, graph)));
  }
  const assignedRackCountByStation: Record<string, number> = Object.fromEntries(
    layout.stations.map((station) => [station.stationId, 0])
  );
  for (const rack of layout.racks) {
    const approaches = rackApproachNodes(layout, rack, graph);
    let bestStation = layout.stations[0];
    let bestDistance = Infinity;
    for (const station of layout.stations) {
      const distances = approaches.map((node) => distanceMaps.get(station.id)?.get(node) ?? Infinity);
      const distance = Math.min(...distances);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStation = station;
      }
    }
    if (bestStation) assignedRackCountByStation[bestStation.stationId] += 1;
  }
  const assignmentValues = Object.values(assignedRackCountByStation);
  const avg = mean(assignmentValues);
  const std = Math.sqrt(mean(assignmentValues.map((value) => (value - avg) ** 2)));
  const estimatedQueuePressure = Object.fromEntries(
    layout.stations.map((station) => [
      station.stationId,
      safeDivide(
        assignedRackCountByStation[station.stationId],
        Math.max(1, station.maxQueueLength) * Math.max(1, layout.racks.length / Math.max(1, layout.stations.length))
      )
    ])
  );
  const bottleneckStationEstimate = Object.entries(estimatedQueuePressure).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    stationWorkloadBalanceScore: avg === 0 ? 0 : clamp(1 - safeDivide(std, avg)),
    estimatedQueuePressure,
    assignedRackCountByStation,
    bottleneckStationEstimate
  };
}
