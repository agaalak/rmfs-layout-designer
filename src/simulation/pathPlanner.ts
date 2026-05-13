import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
import type { RotationZone } from "../models/rotation";
import type { Station } from "../models/station";
import { buildRoadGraph, rackApproachNodes, rotationNodes, stationNodes } from "../graph/graphBuilder";
import { shortestPathBetweenSets } from "../graph/shortestPath";
import { cellKey, manhattanMeters, parseCellKey } from "../utils/gridMath";

function nodesToCells(path: string[] = []): GridCell[] {
  return path.map(parseCellKey);
}

export function calculatePathDistanceMeters(path: GridCell[], grid: WarehouseLayout["grid"]): number {
  let distance = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    distance += manhattanMeters(path[index], path[index + 1], grid);
  }
  return distance;
}

export function findShortestPath(layout: WarehouseLayout, startCell: GridCell, goalCell: GridCell): GridCell[] {
  const graph = buildRoadGraph(layout);
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], [cellKey(goalCell)]);
  return nodesToCells(result?.path);
}

export function findPathToNearestRackApproach(layout: WarehouseLayout, startCell: GridCell, rack: Rack): GridCell[] {
  const graph = buildRoadGraph(layout);
  const targets = rackApproachNodes(layout, rack, graph);
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], targets);
  return nodesToCells(result?.path);
}

export function findPathToStationQueue(layout: WarehouseLayout, startCell: GridCell, station: Station): GridCell[] {
  const graph = buildRoadGraph(layout);
  const targets = stationNodes(station, graph);
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], targets);
  return nodesToCells(result?.path);
}

export function findNearestRotationZonePath(layout: WarehouseLayout, startCell: GridCell, requiredOrientation: number): GridCell[] {
  const graph = buildRoadGraph(layout);
  const zones = layout.rotationZones.filter((zone) => zone.supportedOrientationsDeg.includes(requiredOrientation as 0 | 90 | 180 | 270));
  const targets = zones.flatMap((zone) => rotationNodes(zone, graph));
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], targets);
  return nodesToCells(result?.path);
}

export function findReturnRackPath(layout: WarehouseLayout, stationCell: GridCell, rackHomeCell: GridCell): GridCell[] {
  const rack = layout.racks.find((candidate) => candidate.homeCell.row === rackHomeCell.row && candidate.homeCell.col === rackHomeCell.col);
  if (!rack) return findShortestPath(layout, stationCell, rackHomeCell);
  return findPathToNearestRackApproach(layout, stationCell, rack);
}

export function nearestCompatibleStation(layout: WarehouseLayout, rack: Rack): Station | undefined {
  const graph = buildRoadGraph(layout);
  const starts = rackApproachNodes(layout, rack, graph);
  const ranked = layout.stations
    .filter((station) => station.acceptedRackFaces.some((face) => rack.faces.some((rackFace) => rackFace.faceId === face)))
    .map((station) => ({
      station,
      result: shortestPathBetweenSets(graph, starts, stationNodes(station, graph))
    }))
    .filter((item): item is { station: Station; result: NonNullable<ReturnType<typeof shortestPathBetweenSets>> } => Boolean(item.result))
    .sort((a, b) => a.result.distance - b.result.distance);
  return ranked[0]?.station;
}

export function nearestRotationZone(layout: WarehouseLayout, startCell: GridCell, requiredOrientation: number): RotationZone | undefined {
  const path = findNearestRotationZonePath(layout, startCell, requiredOrientation);
  if (path.length === 0) return undefined;
  const destination = path.at(-1);
  return layout.rotationZones.find((zone) => destination && zone.cells.some((cell) => cellKey(cell) === cellKey(destination)));
}
