import type { WarehouseLayout } from "../models/layout";
import { buildRoadGraph, objectApproachNodes, stationNodes } from "../graph/graphBuilder";
import { pathEdges, shortestPathBetweenSets } from "../graph/shortestPath";
import { clamp, mean } from "../utils/units";

export interface CongestionMetrics {
  likelyBusiestAisleEdges: Array<{ edge: string; count: number }>;
  congestionRiskScore: number;
  deadEndCount: number;
  narrowCorridorCount: number;
}

export function calculateCongestionMetrics(layout: WarehouseLayout): CongestionMetrics {
  const graph = buildRoadGraph(layout);
  const stationTargets = layout.stations.flatMap((station) => stationNodes(station, graph));
  const usage = new Map<string, number>();
  for (const rack of layout.racks.slice(0, 160)) {
    const path = shortestPathBetweenSets(graph, objectApproachNodes(layout, rack.homeCell, graph), stationTargets);
    if (!path) continue;
    for (const edge of pathEdges(path.path)) {
      usage.set(edge, (usage.get(edge) ?? 0) + 1);
    }
  }
  const degrees = [...graph.nodes].map((node) => {
    const outgoing = graph.adjacency.get(node)?.length ?? 0;
    const incoming = [...graph.adjacency.values()].reduce(
      (count, edges) => count + edges.filter((edge) => edge.to === node).length,
      0
    );
    return Math.max(outgoing, incoming);
  });
  const deadEndCount = degrees.filter((degree) => degree <= 1).length;
  const narrowCorridorCount = degrees.filter((degree) => degree === 2).length;
  const maxUsage = Math.max(0, ...usage.values());
  const congestionRiskScore = clamp(maxUsage / 40 + deadEndCount / Math.max(1, graph.nodes.size) + mean(degrees) / 20);
  return {
    likelyBusiestAisleEdges: [...usage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([edge, count]) => ({ edge, count })),
    congestionRiskScore,
    deadEndCount,
    narrowCorridorCount
  };
}
