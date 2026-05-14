import type { GridCell } from "./grid";

export type OperationalTaskKind =
  | "PICK_ORDER"
  | "REPLENISH_RACK"
  | "MOVE_RACK_TO_STATION"
  | "RETURN_RACK_TO_STORAGE"
  | "SEND_ROBOT_TO_CHARGER"
  | "SEND_ROBOT_TO_PARKING";

export type OperationalTaskStatus =
  | "PLANNED"
  | "RESERVED"
  | "ASSIGNED"
  | "TRAVEL_EMPTY"
  | "LIFTING"
  | "TRAVEL_LOADED"
  | "ROTATING_PRE_STATION"
  | "QUEUING"
  | "SERVICING"
  | "ROTATING_POST_STATION"
  | "RETURNING"
  | "DROPPING"
  | "COMPLETED"
  | "FAILED";

export interface MovementRoutePlan {
  pathToRackApproach: GridCell[];
  pathToPreStationRotationZone?: GridCell[];
  pathToStationQueue: GridCell[];
  pathToPostStationRotationZone?: GridCell[];
  pathToStorageApproach: GridCell[];
  pathToParking?: GridCell[];
  pathToCharger?: GridCell[];
}

export interface OperationalTaskTimestamps {
  plannedAtSec?: number;
  reservedAtSec?: number;
  assignedAtSec?: number;
  travelEmptyAtSec?: number;
  liftingAtSec?: number;
  travelLoadedAtSec?: number;
  queuingAtSec?: number;
  servicingAtSec?: number;
  returningAtSec?: number;
  droppingAtSec?: number;
  completedAtSec?: number;
  failedAtSec?: number;
}

export interface OperationalTask {
  operationalTaskId: string;
  orderId?: string;
  orderLineIds: string[];
  taskKind: OperationalTaskKind;
  rackId: string;
  stationId: string;
  robotId?: string;
  sourceStorageLocationId?: string;
  destinationStorageLocationId?: string;
  status: OperationalTaskStatus;
  timestamps: OperationalTaskTimestamps;
  routePlan?: MovementRoutePlan;
  failureReason?: string;
}

