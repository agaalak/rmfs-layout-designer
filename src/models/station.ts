import type { GridCell } from "./grid";
import type { CardinalOrientation, RackFaceId } from "./rack";

export type StationType = "PICK" | "REPLENISH" | "COMBI" | "PACK" | "QC" | "BUFFER";
export type ServiceSide = "NORTH" | "SOUTH" | "EAST" | "WEST";

export interface Station {
  id: string;
  stationId: string;
  stationType: StationType;
  cell: GridCell;
  serviceSide: ServiceSide;
  acceptedRackFaces: RackFaceId[];
  requiredRackOrientationDeg: CardinalOrientation;
  targetServiceTimeSec: number;
  capacity: number;
  queueLaneIds: string[];
  locked?: boolean;
}

export const serviceSideOrientation: Record<ServiceSide, CardinalOrientation> = {
  NORTH: 0,
  EAST: 90,
  SOUTH: 180,
  WEST: 270
};
