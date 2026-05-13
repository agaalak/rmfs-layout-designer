import type { GridCell } from "./grid";

export type ParkingType = "IDLE" | "WAITING" | "BUFFER" | "MAINTENANCE";

export interface ParkingSpot {
  id: string;
  parkingId: string;
  cell: GridCell;
  parkingType: ParkingType;
  locked?: boolean;
}
