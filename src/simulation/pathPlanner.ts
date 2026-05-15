import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
import type { Station } from "../models/station";
import { buildRoadGraph, rotationCellNodes, stationNodes } from "../graph/graphBuilder";
import { shortestPathBetweenSets } from "../graph/shortestPath";
import { cellKey, manhattanMeters, parseCellKey } from "../utils/gridMath";
import { stationQueueLanes } from "../utils/queueLanes";
import { ensureStorageLocations } from "../utils/storageLocations";

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

function layoutWithTemporaryCells(layout: WarehouseLayout, temporaryCells: GridCell[]): WarehouseLayout {
  const map = new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
  for (const cell of temporaryCells) {
    const key = cellKey(cell);
    const existing = map.get(key);
    map.set(key, {
      row: cell.row,
      col: cell.col,
      cellType: existing?.cellType === "RACK_STORAGE" || existing?.cellType === "STATION" ? "ROAD" : existing?.cellType ?? "ROAD",
      allowedDirections: existing?.allowedDirections?.length ? existing.allowedDirections : ["north", "south", "east", "west"],
      allowRotation: existing?.allowRotation,
      supportedRotationOrientationsDeg: existing?.supportedRotationOrientationsDeg,
      rotationTimeSec: existing?.rotationTimeSec,
      rotationCapacity: existing?.rotationCapacity,
      allowedRotationRackTypes: existing?.allowedRotationRackTypes,
      locked: existing?.locked,
      zoneId: existing?.zoneId
    });
  }
  return { ...layout, cells: [...map.values()] };
}

function layoutWithTemporaryServiceCell(layout: WarehouseLayout, serviceCell: GridCell): WarehouseLayout {
  return layoutWithTemporaryCells(layout, [serviceCell]);
}

function appendWithoutDuplicate(base: GridCell[], addition: GridCell[]): GridCell[] {
  const result = [...base];
  for (const cell of addition) {
    if (result.length === 0 || cellKey(result[result.length - 1]) !== cellKey(cell)) {
      result.push(cell);
    }
  }
  return result;
}

export function storageLocationForRackTask(layout: WarehouseLayout, rack: Rack, storageLocationId?: string) {
  const normalized = ensureStorageLocations(layout);
  return (
    normalized.storageLocations.find((location) => storageLocationId && location.storageLocationId === storageLocationId) ??
    normalized.storageLocations.find((location) => location.storageLocationId === rack.currentStorageLocationId || location.storageLocationId === rack.homeStorageLocationId) ??
    normalized.storageLocations.find((location) => location.cells.some((cell) => cellKey(cell) === cellKey(rack.homeCell)))
  );
}

export function findPathToStorageServiceCell(layout: WarehouseLayout, startCell: GridCell, serviceCell: GridCell): GridCell[] {
  const graphLayout = layoutWithTemporaryCells(layout, [startCell, serviceCell]);
  const graph = buildRoadGraph(graphLayout);
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], [cellKey(serviceCell)]);
  return nodesToCells(result?.path);
}

export function findPathToRackServiceCell(layout: WarehouseLayout, startCell: GridCell, rack: Rack, storageLocationId?: string): GridCell[] {
  const storage = storageLocationForRackTask(layout, rack, storageLocationId);
  const target = storage?.podServiceCell ?? rack.homeCell;
  return findPathToStorageServiceCell(layout, startCell, target);
}

export function findPathToNearestRackApproach(layout: WarehouseLayout, startCell: GridCell, rack: Rack): GridCell[] {
  return findPathToRackServiceCell(layout, startCell, rack);
}

export function findPathToStationQueue(layout: WarehouseLayout, startCell: GridCell, station: Station): GridCell[] {
  const graphLayout = layoutWithTemporaryCells(layout, [startCell]);
  const graph = buildRoadGraph(graphLayout);
  const lanes = stationQueueLanes(layout, station);
  const candidates = lanes
    .map((lane) => {
      const pathToEntry = shortestPathBetweenSets(graph, [cellKey(startCell)], [cellKey(lane.entryCell)]);
      if (!pathToEntry) return undefined;
      const lanePath = [...lane.cells.map((item) => item.cell), station.cell];
      return {
        distance: pathToEntry.distance + lane.cells.length,
        path: appendWithoutDuplicate(nodesToCells(pathToEntry.path), lanePath)
      };
    })
    .filter((item): item is { distance: number; path: GridCell[] } => Boolean(item))
    .sort((a, b) => a.distance - b.distance);
  if (candidates[0]) return candidates[0].path;
  const targets = stationNodes(station, graph);
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], targets);
  return nodesToCells(result?.path);
}

export function findNearestRotationCellPath(layout: WarehouseLayout, startCell: GridCell, requiredOrientation: number): GridCell[] {
  const graphLayout = layoutWithTemporaryCells(layout, [startCell]);
  const graph = buildRoadGraph(graphLayout);
  const targets = rotationCellNodes(
    {
      ...graphLayout,
      cells: graphLayout.cells.filter((cell) => cell.allowRotation && (cell.supportedRotationOrientationsDeg ?? [0, 90, 180, 270]).includes(requiredOrientation as 0 | 90 | 180 | 270))
    },
    graph
  );
  const result = shortestPathBetweenSets(graph, [cellKey(startCell)], targets);
  return nodesToCells(result?.path);
}

export const findNearestRotationZonePath = findNearestRotationCellPath;

export function findReturnRackPath(layout: WarehouseLayout, stationCell: GridCell, rackHomeCell: GridCell): GridCell[] {
  const rack = layout.racks.find((candidate) => candidate.homeCell.row === rackHomeCell.row && candidate.homeCell.col === rackHomeCell.col);
  if (!rack) return findShortestPath(layout, stationCell, rackHomeCell);
  return findPathToRackServiceCell(layout, stationCell, rack);
}

export function nearestCompatibleStation(layout: WarehouseLayout, rack: Rack): Station | undefined {
  const servicePathStart = storageLocationForRackTask(layout, rack)?.podServiceCell ?? rack.homeCell;
  const ranked = layout.stations
    .filter((station) => station.acceptedRackFaces.some((face) => rack.faces.some((rackFace) => rackFace.faceId === face)))
    .map((station) => ({
      station,
      path: findPathToStationQueue(layout, servicePathStart, station)
    }))
    .filter((item) => item.path.length > 0)
    .sort((a, b) => calculatePathDistanceMeters(a.path, layout.grid) - calculatePathDistanceMeters(b.path, layout.grid));
  return ranked[0]?.station;
}

export function nearestRotationZone(layout: WarehouseLayout, startCell: GridCell, requiredOrientation: number) {
  const path = findNearestRotationCellPath(layout, startCell, requiredOrientation);
  if (path.length === 0) return undefined;
  const destination = path.at(-1);
  return destination ? layout.cells.find((cell) => cellKey(cell) === cellKey(destination) && cell.allowRotation) : undefined;
}
