import type { WarehouseLayout } from "../models/layout";
import { validateLayout } from "../validation/validateLayout";
import type { AnalyticsResult } from "./types";
import { clamp } from "../utils/units";

export interface ScoringMetrics {
  overallLayoutScore: number;
  storageDensityScore: number;
  averageDistanceScore: number;
  p90DistanceScore: number;
  stationBalanceScore: number;
  congestionRiskScore: number;
  orientationPenaltyScore: number;
}

const inverseScore = (value: number, softLimit: number) => clamp(1 - value / softLimit) * 100;

export function calculateScoring(layout: WarehouseLayout, analytics: Omit<AnalyticsResult, "scoring">): ScoringMetrics {
  const weights = layout.scoringWeights;
  const validation = validateLayout(layout);
  const storageDensityScore = clamp(analytics.storage.storageDensity / 0.65) * 100;
  const averageDistanceScore = inverseScore(analytics.distance.averageRackToNearestStationDistance, 80);
  const p90DistanceScore = inverseScore(analytics.distance.p90RackToNearestStationDistance, 120);
  const stationBalanceScore = analytics.station.stationWorkloadBalanceScore * 100;
  const congestionScore = inverseScore(analytics.congestion.congestionRiskScore, 1);
  const orientationPenaltyScore = inverseScore(
    analytics.orientation.averageRotationTimePenalty + analytics.orientation.invalidOrientationCount,
    30
  );
  const weighted =
    storageDensityScore * weights.storageDensity +
    averageDistanceScore * weights.averageDistance +
    p90DistanceScore * weights.p90Distance +
    stationBalanceScore * weights.stationBalance +
    congestionScore * weights.congestionRisk +
    orientationPenaltyScore * weights.orientationPenalty +
    inverseScore(analytics.distance.averageStationToChargerDistance, 80) * weights.chargingAccess +
    inverseScore(analytics.distance.averageStationToParkingDistance, 80) * weights.parkingAccess;
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return {
    overallLayoutScore: validation.isValid ? weighted / totalWeight : (weighted / totalWeight) * 0.65,
    storageDensityScore,
    averageDistanceScore,
    p90DistanceScore,
    stationBalanceScore,
    congestionRiskScore: congestionScore,
    orientationPenaltyScore
  };
}
