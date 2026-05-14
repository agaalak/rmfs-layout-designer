import type { GridCell } from "./grid";
import type { CardinalOrientation, RackFaceId } from "./rack";
import type { StationType } from "./station";
export type { RmfsOrder, RmfsOrderLine, OrderPriority } from "./order";
export type { StorageLocation, StorageLocationStatus } from "./storage";

export type WaypointType = "road" | "rack_approach" | "station_approach" | "queue" | "charger_approach" | "parking" | "rotation";
export type RackOperationalStatus = "stored" | "reserved" | "being_carried" | "at_station" | "unavailable";

export interface RmfsWaypoint {
  waypointId: string;
  cell: GridCell;
  waypointType: WaypointType;
  allowedDirections: string[];
  neighborWaypointIds: string[];
  travelCost: number;
}

export interface RackPodOperationalState {
  rackId: string;
  rackTypeId: string;
  homeStorageLocationId?: string;
  currentStorageLocationId?: string;
  currentCell: GridCell;
  currentOrientationDeg: CardinalOrientation;
  occupiedCells: GridCell[];
  demandClass?: "HOT" | "WARM" | "COLD";
  status: RackOperationalStatus;
}

export interface StationResourceState {
  stationId: string;
  stationType: StationType;
  servicePointWaypointId: string;
  queueWaypointIds: string[];
  acceptedRackFaces: RackFaceId[];
  requiredRackOrientationDeg: CardinalOrientation;
  serviceTimeSec: number;
  capacity: number;
  currentRobotId?: string;
  currentRackId?: string;
  queuedRobotIds: string[];
}

export interface RmfsDecisionControllers {
  orderAssignmentController: "nearest_station" | "manual" | "future";
  rackSelectionController: "nearest_compatible_rack" | "hot_warm_cold_weighted" | "future";
  stationAssignmentController: "nearest_compatible_station" | "manual" | "future";
  rackStorageController: "return_home" | "nearest_available_storage" | "future";
  pathPlanningController: "shortest_path" | "reservation_shortest_path" | "future_mapf";
  trafficControlController: "none" | "time_expanded_reservations" | "future_mapf";
  chargingController: "manual" | "nearest_available_charger" | "future";
}
