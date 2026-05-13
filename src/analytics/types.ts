import type { CongestionMetrics } from "./congestionMetrics";
import type { DistanceMetrics } from "./distanceMetrics";
import type { OrientationMetrics } from "./orientationMetrics";
import type { PerformanceEstimate } from "./performanceEstimator";
import type { ScoringMetrics } from "./scoring";
import type { StationMetrics } from "./stationMetrics";
import type { StorageMetrics } from "./storageMetrics";

export interface AnalyticsResult {
  storage: StorageMetrics;
  distance: DistanceMetrics;
  orientation: OrientationMetrics;
  station: StationMetrics;
  congestion: CongestionMetrics;
  performance: PerformanceEstimate;
  scoring: ScoringMetrics;
}
