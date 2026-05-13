import type { Direction, GridCell } from "./grid";

export interface TrafficRule {
  id: string;
  fromCell: GridCell;
  toCell: GridCell;
  direction: Direction;
  oneWay: boolean;
  allowed: boolean;
  zoneSpeedFactor?: number;
}
