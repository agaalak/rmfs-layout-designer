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
  | "resource"
  | "deadlock"
  | "inventory"
  | "task";
export type DeadlockRecoveryPolicy = "wait" | "replan" | "priority_escalation" | "fail_low_priority";

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
  maxWaitBeforeReplanSec: number;
  maxReplanAttempts: number;
  maxBlockedTimeSec: number;
  priorityAgingEnabled: boolean;
  loadedRobotPriorityBoost: number;
  deadlockDetectionEnabled: boolean;
  deadlockRecoveryPolicy: DeadlockRecoveryPolicy;
  reservationHorizonSec: number;
  showLoadedEnvelope: boolean;
}

export interface StationQueue {
  stationId: string;
  waitingRobotIds: string[];
  activeRobotId?: string;
  serviceEndTimeSec?: number;
}

export interface ReservationRecord {
  reservationId?: string;
  robotId?: string;
  taskId?: string;
  resourceId?: string;
  kind?: string;
  timeStep?: number;
  cell?: GridCell;
  cells?: GridCell[];
  from?: GridCell;
  to?: GridCell;
  fromCell?: GridCell;
  toCell?: GridCell;
}

export interface ReservationTableSnapshot {
  reservedVertices: Record<number, ReservationRecord[]>;
  reservedEdges: Record<number, ReservationRecord[]>;
  reservedResources: Record<number, ReservationRecord[]>;
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
  totalWaitTimeSec: number;
  averageWaitTimePerTaskSec: number;
  reservationConflictCount: number;
  replanCount: number;
  deadlockCount: number;
  deadlockRecoveryCount: number;
  failedDueToTrafficCount: number;
  runtimeCollisionPreventionCount: number;
  averageQueueWaitTimeSec: number;
  maxQueueWaitTimeSec: number;
  loadedTravelDistanceM: number;
  emptyTravelDistanceM: number;
  loadedTravelTimeSec: number;
  emptyTravelTimeSec: number;
  robotUtilizationByState: Record<string, number>;
  stationQueueUtilization: number;
  rotationZoneUtilization: number;
  storageReallocationCount: number;
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
  trafficDiagnostics: TrafficDiagnostics;
  metrics: SimulationMetrics;
  initialized: boolean;
}

export interface TrafficDiagnostics {
  reservationConflictCount: number;
  replanCount: number;
  deadlockCount: number;
  deadlockRecoveryCount: number;
  failedDueToTrafficCount: number;
  totalWaitTimeSec: number;
  robotWaitTimes: Record<string, number>;
  robotReplanAttempts: Record<string, number>;
  robotBlockedSinceSec: Record<string, number>;
  repeatedConflictPairs: Record<string, number>;
  activeDeadlocks: Array<{ robotIds: string[]; detectedAtSec: number; reason: string }>;
  lastConflicts: Array<{ timeSec: number; robotId?: string; taskId?: string; resourceId?: string; message: string }>;
  runtimeCollisionPreventionCount: number;
  unsafeAttemptedMoves: Array<{ timeSec: number; robotId: string; message: string; cells?: GridCell[] }>;
}

export const defaultSimulationConfig: SimulationConfig = {
  robotCount: 4,
  unloadedSpeedMps: 1.5,
  loadedSpeedMps: 1.2,
  accelerationMps2: 0.8,
  decelerationMps2: 0.8,
  rotationSpeedDegPerSec: 90,
  liftTimeSec: 8,
  dropTimeSec: 8,
  stationServiceTimeSec: 30,
  taskGenerationMode: "random_nearest",
  taskCount: 6,
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
  chargingStrategy: "none",
  maxWaitBeforeReplanSec: 6,
  maxReplanAttempts: 2,
  maxBlockedTimeSec: 20,
  priorityAgingEnabled: true,
  loadedRobotPriorityBoost: 2,
  deadlockDetectionEnabled: true,
  deadlockRecoveryPolicy: "replan",
  reservationHorizonSec: 60,
  showLoadedEnvelope: false
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
  stationUtilization: 0,
  totalWaitTimeSec: 0,
  averageWaitTimePerTaskSec: 0,
  reservationConflictCount: 0,
  replanCount: 0,
  deadlockCount: 0,
  deadlockRecoveryCount: 0,
  failedDueToTrafficCount: 0,
  runtimeCollisionPreventionCount: 0,
  averageQueueWaitTimeSec: 0,
  maxQueueWaitTimeSec: 0,
  loadedTravelDistanceM: 0,
  emptyTravelDistanceM: 0,
  loadedTravelTimeSec: 0,
  emptyTravelTimeSec: 0,
  robotUtilizationByState: {},
  stationQueueUtilization: 0,
  rotationZoneUtilization: 0,
  storageReallocationCount: 0
};

export const emptyTrafficDiagnostics: TrafficDiagnostics = {
  reservationConflictCount: 0,
  replanCount: 0,
  deadlockCount: 0,
  deadlockRecoveryCount: 0,
  failedDueToTrafficCount: 0,
  totalWaitTimeSec: 0,
  robotWaitTimes: {},
  robotReplanAttempts: {},
  robotBlockedSinceSec: {},
  repeatedConflictPairs: {},
  activeDeadlocks: [],
  lastConflicts: [],
  runtimeCollisionPreventionCount: 0,
  unsafeAttemptedMoves: []
};
