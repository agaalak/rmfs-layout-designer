import type { GridCell, GridConfig } from "../models/grid";
import type { Rack } from "../models/rack";
import { inBounds } from "./gridMath";

export interface RackFootprintCells {
  rows: number;
  columns: number;
}

export function rackFootprintCells(rack: Pick<Rack, "footprintWidthM" | "footprintDepthM" | "currentOrientationDeg">, grid: GridConfig): RackFootprintCells {
  const baseColumns = Math.max(1, Math.ceil(rack.footprintWidthM / grid.cellWidthM));
  const baseRows = Math.max(1, Math.ceil(rack.footprintDepthM / grid.cellDepthM));
  if (rack.currentOrientationDeg === 90 || rack.currentOrientationDeg === 270) {
    return { rows: baseColumns, columns: baseRows };
  }
  return { rows: baseRows, columns: baseColumns };
}

export function rackOccupiedCells(rack: Pick<Rack, "homeCell" | "footprintWidthM" | "footprintDepthM" | "currentOrientationDeg">, grid: GridConfig): GridCell[] {
  const footprint = rackFootprintCells(rack, grid);
  const cells: GridCell[] = [];
  for (let rowOffset = 0; rowOffset < footprint.rows; rowOffset += 1) {
    for (let colOffset = 0; colOffset < footprint.columns; colOffset += 1) {
      cells.push({ row: rack.homeCell.row + rowOffset, col: rack.homeCell.col + colOffset });
    }
  }
  return cells;
}

export function rackFootprintInBounds(rack: Pick<Rack, "homeCell" | "footprintWidthM" | "footprintDepthM" | "currentOrientationDeg">, grid: GridConfig): boolean {
  return rackOccupiedCells(rack, grid).every((cell) => inBounds(cell, grid));
}
