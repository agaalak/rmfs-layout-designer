export type LayoutMode = "manual" | "procedural" | "hybrid";

export type CellType =
  | "EMPTY"
  | "ROAD"
  | "RACK_STORAGE"
  | "STATION"
  | "QUEUE"
  | "CHARGING"
  | "PARKING"
  | "ROTATION"
  | "BLOCKED"
  | "HUMAN_ZONE"
  | "DOCK";

export type Direction = "north" | "south" | "east" | "west";

export interface GridCell {
  row: number;
  col: number;
}

export interface GridConfig {
  cellWidthM: number;
  cellDepthM: number;
  rows: number;
  columns: number;
}

export interface PhysicalDimensions {
  widthM: number;
  depthM: number;
}

export interface LayoutCell extends GridCell {
  cellType: CellType;
  allowedDirections: Direction[];
  zoneId?: string;
  locked?: boolean;
}

export const traversableCellTypes = new Set<CellType>([
  "ROAD",
  "QUEUE",
  "ROTATION",
  "CHARGING",
  "PARKING",
  "STATION"
]);

export const editableCellTypes: CellType[] = [
  "ROAD",
  "RACK_STORAGE",
  "QUEUE",
  "BLOCKED",
  "HUMAN_ZONE",
  "DOCK"
];

export const allDirections: Direction[] = ["north", "south", "east", "west"];

export const directionDelta: Record<Direction, [number, number]> = {
  north: [-1, 0],
  south: [1, 0],
  east: [0, 1],
  west: [0, -1]
};

export const oppositeDirection: Record<Direction, Direction> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east"
};
