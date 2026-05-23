import type { GridCell } from "./grid";

export type QueuePointWaitPolicy = "OCCUPY_POINT" | "HOLD_UPSTREAM";
export type QueuePointSelectionStrategy = "nearest_feasible" | "least_congested" | "fixed_preferred" | "manual";

export interface QueuePoint {
  queuePointId: string;
  cell: GridCell;
  appliesToAllStations: boolean;
  stationIds: string[];
  priority: number;
  capacity: number;
  loadedOnly: boolean;
  waitPolicy: QueuePointWaitPolicy;
  locked?: boolean;
}

export interface StationQueuePolicy {
  requireQueuePointVisit: boolean;
  queuePointSelectionStrategy: QueuePointSelectionStrategy;
  sharedQueuePointsAllowed: boolean;
  stationCapacity: number;
}
