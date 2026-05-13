import type { GridCell } from "./grid";
import type { Robot } from "./robot";
import type { SimulationTask } from "./task";

export type AppMode = "design" | "simulation";
export type TaskGenerationMode = "manual" | "random_nearest" | "weighted_hot_warm_cold";
export type SimulationEventSeverity = "info" | "warning" | "error";

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
  timeSec: number;
  severity: SimulationEventSeverity;
  message: string;
  robotId?: string;
  taskId?: string;
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
  collisionCheckingEnabled: true
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
