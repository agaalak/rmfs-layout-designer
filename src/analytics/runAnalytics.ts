import type { WarehouseLayout } from "../models/layout";
import { calculateCongestionMetrics } from "./congestionMetrics";
import { calculateDistanceMetrics } from "./distanceMetrics";
import { calculateOrientationMetrics } from "./orientationMetrics";
import { estimatePerformance } from "./performanceEstimator";
import { calculateScoring } from "./scoring";
import { calculateStationMetrics } from "./stationMetrics";
import { calculateStorageMetrics } from "./storageMetrics";
import type { AnalyticsResult } from "./types";

export function runAnalytics(layout: WarehouseLayout): AnalyticsResult {
  const storage = calculateStorageMetrics(layout);
  const distance = calculateDistanceMetrics(layout);
  const orientation = calculateOrientationMetrics(layout);
  const station = calculateStationMetrics(layout);
  const congestion = calculateCongestionMetrics(layout);
  const performance = estimatePerformance(layout, distance, orientation);
  const analyticsWithoutScore = { storage, distance, orientation, station, congestion, performance };
  return {
    ...analyticsWithoutScore,
    scoring: calculateScoring(layout, analyticsWithoutScore)
  };
}
