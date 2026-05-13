import type { Direction, GridCell } from "../models/grid";
import { allDirections, traversableCellTypes } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
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

export function buildCellMap(layout: WarehouseLayout) {
  return new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
}

export function buildRoadGraph(layout: WarehouseLayout): RoadGraph {
  const cellMap = buildCellMap(layout);
  const nodes = new Set<GraphNode>();
  const adjacency = new Map<GraphNode, GraphEdge[]>();

  for (const cell of layout.cells) {
    if (traversableCellTypes.has(cell.cellType)) {
      const key = cellKey(cell);
      nodes.add(key);
      adjacency.set(key, []);
    }
  }

  const blockedEdges = new Set(
    layout.trafficRules
      .filter((rule) => !rule.allowed)
      .map((rule) => `${cellKey(rule.fromCell)}>${cellKey(rule.toCell)}`)
  );

  for (const cell of layout.cells) {
    const from = cellKey(cell);
    if (!nodes.has(from)) continue;
    for (const direction of cell.allowedDirections ?? allDirections) {
      const target = neighbor(cell, direction);
      if (!inBounds(target, layout.grid)) continue;
      const to = cellKey(target);
      const targetCell = cellMap.get(to);
      if (!targetCell || !nodes.has(to)) continue;
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

export function stationNodes(station: { cell: GridCell; queueCells: GridCell[] }, graph?: RoadGraph): GraphNode[] {
  const nodes = [station.cell, ...station.queueCells].map(cellKey);
  return graph ? nodes.filter((node) => graph.nodes.has(node)) : nodes;
}

export function chargerNodes(charger: { cells: GridCell[] }, graph?: RoadGraph): GraphNode[] {
  const nodes = charger.cells.map(cellKey);
  return graph ? nodes.filter((node) => graph.nodes.has(node)) : nodes;
}

export function rotationNodes(zone: { cells: GridCell[] }, graph?: RoadGraph): GraphNode[] {
  const nodes = zone.cells.map(cellKey);
  return graph ? nodes.filter((node) => graph.nodes.has(node)) : nodes;
}

export function directionBetween(from: GridCell, to: GridCell): Direction | undefined {
  if (to.row === from.row - 1 && to.col === from.col) return "north";
  if (to.row === from.row + 1 && to.col === from.col) return "south";
  if (to.row === from.row && to.col === from.col + 1) return "east";
  if (to.row === from.row && to.col === from.col - 1) return "west";
  return undefined;
}
