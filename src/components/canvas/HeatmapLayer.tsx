import { Group, Rect } from "react-konva";
import type { AnalyticsResult } from "../../analytics/types";
import { buildRoadGraph, objectApproachNodes, stationNodes } from "../../graph/graphBuilder";
import { dijkstraFromSources, reverseGraph } from "../../graph/shortestPath";
import type { WarehouseLayout } from "../../models/layout";
import type { HeatmapMode } from "../../store/uiStore";
import type { ValidationResult } from "../../validation/validateLayout";
import { cellKey } from "../../utils/gridMath";

interface HeatmapLayerProps {
  layout: WarehouseLayout;
  analytics: AnalyticsResult;
  validation: ValidationResult;
  cellSize: number;
  visible: boolean;
  mode: HeatmapMode;
}

export function HeatmapLayer({ layout, analytics, validation, cellSize, visible, mode }: HeatmapLayerProps) {
  if (!visible || layout.stations.length === 0) return null;
  const graph = buildRoadGraph(layout);
  const stationSources = layout.stations.flatMap((station) => stationNodes(station, graph));
  const toStation = dijkstraFromSources(reverseGraph(graph), stationSources);
  const edgeUsage = new Map(analytics.congestion.likelyBusiestAisleEdges.map((edge) => [edge.edge, edge.count]));
  const maxEdgeUsage = Math.max(1, ...edgeUsage.values());
  const cells = layout.cells.map((cell) => {
    const key = cellKey(cell);
    let opacity = 0;
    let fill = "#ef4444";
    if (mode === "distance") {
      const distances = graph.nodes.has(key)
        ? [toStation.get(key) ?? Infinity]
        : objectApproachNodes(layout, cell, graph).map((node) => toStation.get(node) ?? Infinity);
      const distance = Math.min(...distances);
      const maxDistance = Math.max(1, analytics.distance.p90RackToNearestStationDistance || analytics.distance.maxRackToStationDistance || 1);
      opacity = Number.isFinite(distance) ? Math.min(0.48, (distance / maxDistance) * 0.42) : 0.58;
      fill = Number.isFinite(distance) ? "#ef4444" : "#991b1b";
    }
    if (mode === "congestion") {
      const outgoing = graph.adjacency.get(key) ?? [];
      const usage = Math.max(0, ...outgoing.map((edge) => edgeUsage.get(`${edge.from}>${edge.to}`) ?? 0));
      opacity = usage > 0 ? Math.min(0.58, (usage / maxEdgeUsage) * 0.58) : 0;
      fill = "#f97316";
    }
    if (mode === "unreachable") {
      opacity = validation.issueCells.has(key) ? 0.62 : 0;
      fill = "#dc2626";
    }
    return opacity > 0 ? (
      <Rect
        key={`${mode}:${key}`}
        x={cell.col * cellSize}
        y={cell.row * cellSize}
        width={cellSize}
        height={cellSize}
        fill={fill}
        opacity={opacity}
        listening={false}
      />
    ) : null;
  });
  if (cells.every((cell) => cell === null)) {
    return null;
  }
  return <Group listening={false}>{cells}</Group>;
}
