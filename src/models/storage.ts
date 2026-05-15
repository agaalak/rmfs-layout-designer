import type { GridCell } from "./grid";
import type { CardinalOrientation } from "./rack";

export type StorageLocationStatus = "EMPTY" | "OCCUPIED" | "RESERVED" | "BLOCKED";

export interface StorageLocation {
  storageLocationId: string;
  cells: GridCell[];
  podServiceCell: GridCell;
  allowedRackTypes: string[];
  defaultRackOrientationDeg: CardinalOrientation;
  approachWaypointIds: string[];
  currentlyStoredRackId?: string;
  reservedForRackId?: string;
  status: StorageLocationStatus;
  zoneId?: string;
  locked?: boolean;
}
