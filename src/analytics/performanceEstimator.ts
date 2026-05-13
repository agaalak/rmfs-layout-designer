import type { WarehouseLayout } from "../models/layout";
import type { DistanceMetrics } from "./distanceMetrics";
import type { OrientationMetrics } from "./orientationMetrics";
import { safeDivide } from "../utils/units";

export interface PerformanceEstimate {
  averageRobotCycleDistance: number;
  averageRobotCycleTime: number;
  estimatedRobotLimitedThroughput: number;
  estimatedStationLimitedThroughput: number;
  estimatedSystemThroughput: number;
  estimatedRobotUtilization: number;
  estimatedStationUtilization: number;
  warnings: string[];
}

export function estimatePerformance(
  layout: WarehouseLayout,
  distance: DistanceMetrics,
  orientation: OrientationMetrics
): PerformanceEstimate {
  const assumptions = layout.robotAssumptions;
  const demand = layout.demandAssumptions;
  const oneWay = distance.averageRackToNearestStationDistance;
  const detour = orientation.averageRotationDetourDistance;
  const cycleDistance = oneWay * 2 + detour;
  const serviceTime =
    layout.stations.length > 0
      ? layout.stations.reduce((sum, station) => sum + station.targetServiceTimeSec, 0) / layout.stations.length
      : assumptions.stationServiceTimeSec;
  const averageRobotCycleTime =
    safeDivide(oneWay + detour / 2, assumptions.unloadedSpeedMps) +
    safeDivide(oneWay + detour / 2, assumptions.loadedSpeedMps) +
    assumptions.pickupTimeSec +
    assumptions.dropoffTimeSec +
    serviceTime +
    orientation.averageRotationTimePenalty;
  const estimatedRobotLimitedThroughput = safeDivide(
    assumptions.robotCount * 3600,
    averageRobotCycleTime * demand.averageRackVisitsPerOrder
  );
  const estimatedStationLimitedThroughput = safeDivide(
    layout.stations.reduce((sum, station) => sum + 3600 / station.targetServiceTimeSec, 0),
    demand.averageRackVisitsPerOrder
  );
  const estimatedSystemThroughput =
    estimatedStationLimitedThroughput === 0
      ? estimatedRobotLimitedThroughput
      : Math.min(estimatedRobotLimitedThroughput, estimatedStationLimitedThroughput);
  const estimatedRobotUtilization = safeDivide(demand.expectedOrdersPerHour, estimatedRobotLimitedThroughput);
  const estimatedStationUtilization = safeDivide(demand.expectedOrdersPerHour, estimatedStationLimitedThroughput);
  const warnings: string[] = [];
  if (estimatedRobotUtilization > 0.85) warnings.push("Robot utilization exceeds 85%.");
  if (estimatedStationUtilization > 0.85) warnings.push("Station utilization exceeds 85%.");
  return {
    averageRobotCycleDistance: cycleDistance,
    averageRobotCycleTime,
    estimatedRobotLimitedThroughput,
    estimatedStationLimitedThroughput,
    estimatedSystemThroughput,
    estimatedRobotUtilization,
    estimatedStationUtilization,
    warnings
  };
}
