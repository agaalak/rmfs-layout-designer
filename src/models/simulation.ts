import type { GridCell } from "./grid";
import type { RmfsOrder } from "./order";
import type { OperationalTask } from "./operationalTask";
import type { Robot } from "./robot";
import type { CardinalOrientation } from "./rack";
import type { StorageLocation, StorageLocationStatus } from "./storage";
import type { SimulationTask } from "./task";

export type AppMode = "design" | "simulation";
export type TaskGenerationMode = "manual" | "random_nearest" | "weighted_hot_warm_cold";
export type SimulationEventSeverity = "info" | "warning" | "error";
export type SimulationEventEntityType =
  | "order"
  | "order_line"
  | "rack"
  | "robot"
  | "station"
  | "storage_location"
  | "controller"
  | "path_planner"
  | "traffic"
  | "inventory"
  | "task";

export type OrderAssignmentStrategy = "FIFO" | "priority_first" | "earliest_due_time";
export type RackSelectionStrategy = "nearest_rack_with_sku" | "most_inventory_for_sku" | "hot_warm_cold_weighted" | "manual";
export type StationAssignmentStrategy = "nearest_compatible_station" | "shortest_queue" | "station_type_match";
export type RobotAssignmentStrategy = "nearest_idle_robot" | "first_available_robot";
export type RackStorageStrategy = "return_home" | "nearest_available_storage" | "keep_hot_near_station";
export type ChargingStrategy = "none" | "low_battery_to_nearest_charger";

export interface SimulationConfig {
  robotCount: number;
  unloadedSpeedMps: number;
  loadedSpeedMps: number;
  accelerationMps2: number;
  decelerationMps2: number;
  rotationSpeedDegPerSec: number;
  liftTimeSec: number;
  dropTimeSec: number;
  stationServiceTimeSec: number;
  taskGenerationMode: TaskGenerationMode;
  taskCount: number;
  reservationTimeStepSec: number;
  showPaths: boolean;
  showReservations: boolean;
  showRobotLabels: boolean;
  collisionCheckingEnabled: boolean;
  orderAssignmentStrategy: OrderAssignmentStrategy;
  rackSelectionStrategy: RackSelectionStrategy;
  stationAssignmentStrategy: StationAssignmentStrategy;
  robotAssignmentStrategy: RobotAssignmentStrategy;
  rackStorageStrategy: RackStorageStrategy;
  chargingStrategy: ChargingStrategy;
}

export interface StationQueue {
  stationId: string;
  waitingRobotIds: string[];
  activeRobotId?: string;
  serviceEndTimeSec?: number;
}

export interface ReservationRecord {
  robotId: string;
  cell: GridCell;
}

export interface ReservationTableSnapshot {
  reservedVertices: Record<number, ReservationRecord[]>;
  reservedEdges: Record<number, Array<{ robotId: string; from: GridCell; to: GridCell }>>;
  reservationTimeStepSec: number;
}

export interface SimulationEvent {
  eventId?: string;
  timeSec: number;
  severity: SimulationEventSeverity;
  entityType?: SimulationEventEntityType;
  entityId?: string;
  relatedIds?: Record<string, string | string[] | undefined>;
  message: string;
  robotId?: string;
  taskId?: string;
  details?: Record<string, unknown>;
}

export interface SimulationInventoryBin {
  rackId: string;
  faceId: string;
  binId: string;
  barcode: string;
  locationId: string;
  sku?: string;
  quantity: number;
  reservedQuantity: number;
  maxQuantity?: number;
  lastUpdatedSimTimeSec?: number;
}

export interface RackRuntimeState {
  rackId: string;
  operationalStatus: "STORED" | "RESERVED" | "BEING_CARRIED" | "AT_STATION" | "RETURNING" | "UNAVAILABLE";
  homeStorageLocationId?: string;
  currentStorageLocationId?: string;
  destinationStorageLocationId?: string;
  currentCell: GridCell;
  currentOrientationDeg: CardinalOrientation;
  carriedByRobotId?: string;
  activeTaskId?: string;
}

export interface StorageLocationRuntimeState {
  storageLocationId: string;
  status: StorageLocationStatus;
  currentlyStoredRackId?: string;
  reservedForRackId?: string;
}

export interface StationRuntimeState {
  stationId: string;
  activeRobotId?: string;
  activeRackId?: string;
  serviceEndTimeSec?: number;
  completedServiceCount: number;
}

export interface SimulationMetrics {
  activeRobotCount: number;
  activeTaskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  blockedRobotCount: number;
  averageTaskCycleTimeSec: number;
  estimatedThroughputPerHour: number;
  averageRobotUtilization: number;
  stationUtilization: number;
}

export interface SimulationState {
  simTimeSec: number;
  isRunning: boolean;
  speedMultiplier: number;
  robots: Robot[];
  tasks: SimulationTask[];
  operationalTasks: OperationalTask[];
  orders: RmfsOrder[];
  completedOrders: RmfsOrder[];
  failedOrders: RmfsOrder[];
  inventory: SimulationInventoryBin[];
  rackStates: Record<string, RackRuntimeState>;
  storageLocationStates: Record<string, StorageLocationRuntimeState>;
  stationStates: Record<string, StationRuntimeState>;
  storageLocations: StorageLocation[];
  completedTasks: SimulationTask[];
  failedTasks: SimulationTask[];
  reservationTable: ReservationTableSnapshot;
  stationQueues: StationQueue[];
  eventLog: SimulationEvent[];
  metrics: SimulationMetrics;
  initialized: boolean;
}

export const defaultSimulationConfig: SimulationConfig = {
  robotCount: 10,
  unloadedSpeedMps: 1.5,
  loadedSpeedMps: 1.2,
  accelerationMps2: 0.8,
  decelerationMps2: 0.8,
  rotationSpeedDegPerSec: 90,
  liftTimeSec: 8,
  dropTimeSec: 8,
  stationServiceTimeSec: 30,
  taskGenerationMode: "random_nearest",
  taskCount: 10,
  reservationTimeStepSec: 1,
  showPaths: true,
  showReservations: false,
  showRobotLabels: true,
  collisionCheckingEnabled: true,
  orderAssignmentStrategy: "FIFO",
  rackSelectionStrategy: "nearest_rack_with_sku",
  stationAssignmentStrategy: "nearest_compatible_station",
  robotAssignmentStrategy: "first_available_robot",
  rackStorageStrategy: "return_home",
  chargingStrategy: "none"
};

export const emptySimulationMetrics: SimulationMetrics = {
  activeRobotCount: 0,
  activeTaskCount: 0,
  completedTaskCount: 0,
  failedTaskCount: 0,
  blockedRobotCount: 0,
  averageTaskCycleTimeSec: 0,
  estimatedThroughputPerHour: 0,
  averageRobotUtilization: 0,
  stationUtilization: 0
};
