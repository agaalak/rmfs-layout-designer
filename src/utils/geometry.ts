import type { GridCell } from "../models/grid";

export function cellToPoint(cell: GridCell, pixelSize: number) {
  return {
    x: cell.col * pixelSize,
    y: cell.row * pixelSize
  };
}

export function pointToCell(x: number, y: number, pixelSize: number): GridCell {
  return {
    row: Math.floor(y / pixelSize),
    col: Math.floor(x / pixelSize)
  };
}

export function orientationToVector(orientationDeg: number): [number, number] {
  const normalized = ((orientationDeg % 360) + 360) % 360;
  if (normalized === 0) return [0, -1];
  if (normalized === 90) return [1, 0];
  if (normalized === 180) return [0, 1];
  return [-1, 0];
}
