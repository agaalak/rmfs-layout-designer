import type { GridCell } from "./grid";

export interface ChargingSpot {
  id: string;
  chargerId: string;
  cells: GridCell[];
  capacityRobots: number;
  chargerType?: string;
  locked?: boolean;
}
