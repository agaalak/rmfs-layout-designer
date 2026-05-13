import type { GridCell } from "./grid";
import type { CardinalOrientation } from "./rack";

export interface RotationZone {
  id: string;
  rotationZoneId: string;
  cells: GridCell[];
  allowedRackTypes: string[];
  supportedOrientationsDeg: CardinalOrientation[];
  rotationTimeSec: number;
  safetyClearanceCells: number;
  locked?: boolean;
}
