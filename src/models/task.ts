import type { CardinalOrientation, RackFaceId } from "./rack";
import type { GridCell } from "./grid";

export type SimulationTaskType =
  | "MOVE_RACK_TO_STATION"
  | "PICK_ORDER"
  | "REPLENISH_RACK"
  | "RETURN_RACK_HOME"
  | "SEND_ROBOT_TO_CHARGER"
  | "SEND_ROBOT_TO_PARKING";

export type SimulationTaskStatus = "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface SimulationRoutePlan {
  emptyPathToRack: GridCell[];
  loadedPathToStation: GridCell[];
  pathToPreStationRotationZone?: GridCell[];
  pathToPostStationRotationZone?: GridCell[];
  returnPath: GridCell[];
}

export interface SimulationTaskBinSelection {
  lineId?: string;
  binId: string;
  rackId: string;
  sku: string;
  quantity: number;
}

export interface SimulationTask {
  taskId: string;
  taskType: SimulationTaskType;
  rackId: string;
  stationId?: string;
  robotId?: string;
  priority: number;
  status: SimulationTaskStatus;
  createdAtSec: number;
  assignedAtSec?: number;
  completedAtSec?: number;
  routePlan?: SimulationRoutePlan;
  requiredRackFace?: RackFaceId;
  requiredStationOrientationDeg?: CardinalOrientation;
  orderId?: string;
  orderLineIds?: string[];
  operationalTaskId?: string;
  sourceStorageLocationId?: string;
  destinationStorageLocationId?: string;
  selectedBins?: SimulationTaskBinSelection[];
  serviceKind?: "PICK" | "REPLENISH" | "DWELL";
  rotationPreCompleted?: boolean;
  rotationPostCompleted?: boolean;
  failureReason?: string;
}
