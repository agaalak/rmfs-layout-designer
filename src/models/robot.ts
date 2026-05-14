import type { GridCell } from "./grid";

export type RobotState =
  | "IDLE"
  | "ASSIGNED"
  | "MOVING_EMPTY"
  | "LIFTING_RACK"
  | "MOVING_LOADED"
  | "QUEUING_AT_STATION"
  | "SERVICING_AT_STATION"
  | "ROTATING_WITH_RACK"
  | "DROPPING_RACK"
  | "RETURNING_RACK"
  | "PARKING"
  | "CHARGING"
  | "BLOCKED"
  | "ERROR";

export interface RobotPose {
  x: number;
  y: number;
  yawDeg: number;
}

export interface Robot {
  robotId: string;
  robotTypeId: string;
  pose: RobotPose;
  currentCell: GridCell;
  targetCell?: GridCell;
  state: RobotState;
  carryingRackId?: string;
  assignedTaskId?: string;
  currentPath: GridCell[];
  pathProgress: number;
  routeIndex: number;
  segmentProgressM: number;
  speedUnloadedMps: number;
  speedLoadedMps: number;
  accelerationMps2: number;
  decelerationMps2: number;
  rotationSpeedDegPerSec: number;
  liftTimeSec: number;
  dropTimeSec: number;
  batteryPercent: number;
  color: string;
  routePhase?: "TO_RACK" | "PRE_ROTATION" | "TO_STATION" | "POST_ROTATION" | "RETURN_TO_STORAGE" | "TO_PARKING" | "TO_CHARGER";
  waitUntilSec?: number;
  blockedReason?: string;
}
