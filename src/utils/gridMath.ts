import type { Direction, GridCell, GridConfig } from "../models/grid";
import { directionDelta } from "../models/grid";

export const cellKey = (cell: GridCell): string => `${cell.row}:${cell.col}`;

export function parseCellKey(key: string): GridCell {
  const [row, col] = key.split(":").map(Number);
  return { row, col };
}

export function inBounds(cell: GridCell, grid: GridConfig): boolean {
  return cell.row >= 0 && cell.col >= 0 && cell.row < grid.rows && cell.col < grid.columns;
}

export function neighbor(cell: GridCell, direction: Direction): GridCell {
  const [dr, dc] = directionDelta[direction];
  return { row: cell.row + dr, col: cell.col + dc };
}

export function neighbors(cell: GridCell, grid: GridConfig): GridCell[] {
  return (["north", "south", "east", "west"] as Direction[])
    .map((direction) => neighbor(cell, direction))
    .filter((candidate) => inBounds(candidate, grid));
}

export function manhattanCells(a: GridCell, b: GridCell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function manhattanMeters(a: GridCell, b: GridCell, grid: GridConfig): number {
  return Math.abs(a.row - b.row) * grid.cellDepthM + Math.abs(a.col - b.col) * grid.cellWidthM;
}

export function uniqueCells(cells: GridCell[]): GridCell[] {
  const seen = new Set<string>();
  const result: GridCell[] = [];
  for (const cell of cells) {
    const key = cellKey(cell);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cell);
    }
  }
  return result;
}

export function deriveDimensions(grid: GridConfig) {
  return {
    widthM: grid.columns * grid.cellWidthM,
    depthM: grid.rows * grid.cellDepthM
  };
}

export function deriveGridFromPhysical(
  cellWidthM: number,
  cellDepthM: number,
  widthM: number,
  depthM: number
): GridConfig {
  const columns = Math.round(widthM / cellWidthM);
  const rows = Math.round(depthM / cellDepthM);
  if (Math.abs(columns * cellWidthM - widthM) > 1e-6) {
    throw new Error("Physical width must divide evenly by cell width.");
  }
  if (Math.abs(rows * cellDepthM - depthM) > 1e-6) {
    throw new Error("Physical depth must divide evenly by cell depth.");
  }
  return { cellWidthM, cellDepthM, rows, columns };
}

export function rectCells(start: GridCell, end: GridCell): GridCell[] {
  const rows = [start.row, end.row].sort((a, b) => a - b);
  const cols = [start.col, end.col].sort((a, b) => a - b);
  const result: GridCell[] = [];
  for (let row = rows[0]; row <= rows[1]; row += 1) {
    for (let col = cols[0]; col <= cols[1]; col += 1) {
      result.push({ row, col });
    }
  }
  return result;
}

export function spreadIndices(count: number, low: number, high: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.floor((low + high) / 2)];
  const span = high - low;
  return Array.from({ length: count }, (_, index) => low + Math.round((span * index) / (count - 1)));
}
