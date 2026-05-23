import type { DirectedNeighborLink } from "../models/direction";
import type { Direction, GridCell, LayoutCell } from "../models/grid";
import { allDirections, directionDelta } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import { cellKey, inBounds, neighbor } from "./gridMath";

export function linkId(fromCell: GridCell, toCell: GridCell) {
  return `link_${cellKey(fromCell)}__${cellKey(toCell)}`;
}

export function areNeighborCells(fromCell: GridCell, toCell: GridCell) {
  return Math.abs(fromCell.row - toCell.row) + Math.abs(fromCell.col - toCell.col) === 1;
}

export function directionForNeighbor(fromCell: GridCell, toCell: GridCell): Direction | undefined {
  const match = allDirections.find((direction) => {
    const [dr, dc] = directionDelta[direction];
    return fromCell.row + dr === toCell.row && fromCell.col + dc === toCell.col;
  });
  return match;
}

export function deriveDirectedLinksFromCells(layout: Pick<WarehouseLayout, "grid" | "cells">): DirectedNeighborLink[] {
  const traversable = new Set(["ROAD", "QUEUE", "CHARGING", "PARKING", "STATION"]);
  const cells = new Map(layout.cells.map((cell) => [cellKey(cell), cell]));
  const links: DirectedNeighborLink[] = [];
  for (const cell of layout.cells) {
    if (!traversable.has(cell.cellType)) continue;
    for (const direction of cell.allowedDirections ?? allDirections) {
      const toCell = neighbor(cell, direction);
      if (!inBounds(toCell, layout.grid)) continue;
      const target = cells.get(cellKey(toCell));
      if (!target || !traversable.has(target.cellType)) continue;
      links.push({
        linkId: linkId(cell, toCell),
        fromCell: { row: cell.row, col: cell.col },
        toCell,
        enabled: true,
        traversalMode: "NORMAL"
      });
    }
  }
  return links;
}

export function linkMap(links: DirectedNeighborLink[]) {
  return new Map(links.map((link) => [link.linkId, link]));
}

export function setOutgoingLinksForCell(
  links: DirectedNeighborLink[],
  cell: GridCell,
  directions: Direction[],
  layoutCells: LayoutCell[],
  grid: WarehouseLayout["grid"]
): DirectedNeighborLink[] {
  const cells = new Map(layoutCells.map((item) => [cellKey(item), item]));
  const next = links.filter((link) => cellKey(link.fromCell) !== cellKey(cell));
  for (const direction of directions) {
    const toCell = neighbor(cell, direction);
    if (!inBounds(toCell, grid)) continue;
    const target = cells.get(cellKey(toCell));
    if (!target || !["ROAD", "QUEUE", "CHARGING", "PARKING", "STATION"].includes(target.cellType)) continue;
    next.push({
      linkId: linkId(cell, toCell),
      fromCell: cell,
      toCell,
      enabled: true,
      traversalMode: "NORMAL"
    });
  }
  return next;
}
