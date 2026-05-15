import type { Direction, GridCell } from "../models/grid";
import { allDirections, oppositeDirection, traversableCellTypes } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
import type { RmfsWaypoint, WaypointType } from "../models/rmfsDomain";
import { cellKey, inBounds, neighbor } from "../utils/gridMath";
import { rackOccupiedCells } from "../utils/rackFootprint";

export type GraphNode = string;

export interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
  weight: number;
}

export interface RoadGraph {
  nodes: Set<GraphNode>;
  adjacency: Map<GraphNode, GraphEdge[]>;
}

const terminalRoutingCellTypes = new Set(["PARKING", "CHARGING", "STATION"]);

function waypointTypeForCell(cellType: string): WaypointType {
  if (cellType === "QUEUE") return "queue";
  if (cellType === "CHARGING") return "charger_approach";
  if (cellType === "PARKING") return "parking";
  if (cellType === "STATION") return "station_approach";
  return "road";
}

export function buildCellMap(layout: WarehouseLayout) {
  return new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
}

export function buildRoutingWaypoints(layout: WarehouseLayout): Map<GraphNode, RmfsWaypoint> {
  const waypoints = new Map<GraphNode, RmfsWaypoint>();
  for (const cell of layout.cells) {
    if (!traversableCellTypes.has(cell.cellType)) continue;
    const waypointId = cellKey(cell);
    waypoints.set(waypointId, {
      waypointId,
      cell: { row: cell.row, col: cell.col },
      waypointType: waypointTypeForCell(cell.cellType),
      allowedDirections: cell.allowedDirections ?? allDirections,
      neighborWaypointIds: [],
      travelCost: 1
    });
  }
  for (const waypoint of waypoints.values()) {
    waypoint.neighborWaypointIds = (waypoint.allowedDirections as Direction[])
      .map((direction) => cellKey(neighbor(waypoint.cell, direction)))
      .filter((candidate) => waypoints.has(candidate));
  }
  return waypoints;
}

export function buildRoadGraph(layout: WarehouseLayout): RoadGraph {
  const cellMap = buildCellMap(layout);
  const waypoints = buildRoutingWaypoints(layout);
  const nodes = new Set<GraphNode>(waypoints.keys());
  const adjacency = new Map<GraphNode, GraphEdge[]>();
  const terminalConnectors = new Map<GraphNode, Direction>();

  for (const node of nodes) {
    adjacency.set(node, []);
  }

  for (const waypoint of waypoints.values()) {
    const cell = cellMap.get(waypoint.waypointId);
    if (!cell || !terminalRoutingCellTypes.has(cell.cellType)) continue;
    const connector =
      allDirections.find((direction) => {
        const target = neighbor(waypoint.cell, direction);
        const targetCell = cellMap.get(cellKey(target));
        return targetCell && nodes.has(cellKey(target)) && !terminalRoutingCellTypes.has(targetCell.cellType);
      }) ??
      allDirections.find((direction) => {
        const target = neighbor(waypoint.cell, direction);
        return nodes.has(cellKey(target));
      });
    if (connector) terminalConnectors.set(waypoint.waypointId, connector);
  }

  const blockedEdges = new Set(
    layout.trafficRules
      .filter((rule) => !rule.allowed)
      .map((rule) => `${cellKey(rule.fromCell)}>${cellKey(rule.toCell)}`)
  );

  for (const waypoint of waypoints.values()) {
    const from = waypoint.waypointId;
    const sourceCell = cellMap.get(from);
    for (const direction of waypoint.allowedDirections as Direction[]) {
      const sourceConnector = terminalConnectors.get(from);
      if (sourceCell && terminalRoutingCellTypes.has(sourceCell.cellType) && sourceConnector !== direction) continue;
      const cell = waypoint.cell;
      const target = neighbor(cell, direction);
      if (!inBounds(target, layout.grid)) continue;
      const to = cellKey(target);
      const targetCell = cellMap.get(to);
      if (!targetCell || !nodes.has(to)) continue;
      const targetConnector = terminalConnectors.get(to);
      if (terminalRoutingCellTypes.has(targetCell.cellType) && targetConnector !== oppositeDirection[direction]) continue;
      if (blockedEdges.has(`${from}>${to}`)) continue;
      adjacency.get(from)!.push({
        from,
        to,
        weight: direction === "north" || direction === "south" ? layout.grid.cellDepthM : layout.grid.cellWidthM
      });
    }
  }
  return { nodes, adjacency };
}

export function objectApproachNodes(layout: WarehouseLayout, cell: GridCell, graph: RoadGraph): GraphNode[] {
  const result: GraphNode[] = [];
  for (const direction of allDirections) {
    const candidate = neighbor(cell, direction);
    const key = cellKey(candidate);
    if (inBounds(candidate, layout.grid) && graph.nodes.has(key)) {
      result.push(key);
    }
  }
  return result;
}

export function rackApproachNodes(layout: WarehouseLayout, rack: Rack, graph: RoadGraph): GraphNode[] {
  const occupied = rackOccupiedCells(rack, layout.grid);
  const occupiedKeys = new Set(occupied.map(cellKey));
  const result = new Set<GraphNode>();
  for (const cell of occupied) {
    for (const direction of allDirections) {
      const candidate = neighbor(cell, direction);
      const key = cellKey(candidate);
      if (inBounds(candidate, layout.grid) && !occupiedKeys.has(key) && graph.nodes.has(key)) {
        result.add(key);
      }
    }
  }
  return [...result];
}

export function stationNodes(station: { cell: GridCell }, graph?: RoadGraph): GraphNode[] {
  const nodes = [station.cell].map(cellKey);
  return graph ? nodes.filter((node) => graph.nodes.has(node)) : nodes;
}

export function chargerNodes(charger: { cells: GridCell[] }, graph?: RoadGraph): GraphNode[] {
  const nodes = charger.cells.map(cellKey);
  return graph ? nodes.filter((node) => graph.nodes.has(node)) : nodes;
}

export function rotationCellNodes(layout: WarehouseLayout, graph?: RoadGraph): GraphNode[] {
  const nodes = layout.cells.filter((cell) => cell.allowRotation).map(cellKey);
  return graph ? nodes.filter((node) => graph.nodes.has(node)) : nodes;
}

export function directionBetween(from: GridCell, to: GridCell): Direction | undefined {
  if (to.row === from.row - 1 && to.col === from.col) return "north";
  if (to.row === from.row + 1 && to.col === from.col) return "south";
  if (to.row === from.row && to.col === from.col + 1) return "east";
  if (to.row === from.row && to.col === from.col - 1) return "west";
  return undefined;
}
