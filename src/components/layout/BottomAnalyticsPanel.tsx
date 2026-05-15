import type { AnalyticsResult } from "../../analytics/types";
import type { ValidationResult } from "../../validation/validateLayout";

interface BottomAnalyticsPanelProps {
  analytics: AnalyticsResult;
  validation: ValidationResult;
}

const fmt = (value: number, digits = 1) => value.toFixed(digits);

export function BottomAnalyticsPanel({ analytics, validation }: BottomAnalyticsPanelProps) {
  const items = [
    ["Total cells", analytics.storage.totalCells],
    ["Usable", analytics.storage.usableCells],
    ["Racks", analytics.storage.rackCount],
    ["Rack cells", analytics.storage.rackStorageCells],
    ["Rack faces", analytics.storage.rackFacesCount],
    ["Bins", analytics.storage.binCount],
    ["Stations", analytics.storage.stationCount],
    ["Chargers", analytics.storage.chargingSpotCount],
    ["Parking", analytics.storage.parkingSpotCount],
    ["Density", fmt(analytics.storage.storageDensity, 3)],
    ["Aisle ratio", fmt(analytics.storage.aisleRatio, 3)],
    ["Avg dist", `${fmt(analytics.distance.averageRackToNearestStationDistance)} m`],
    ["Median dist", `${fmt(analytics.distance.medianRackToNearestStationDistance)} m`],
    ["P90 dist", `${fmt(analytics.distance.p90RackToNearestStationDistance)} m`],
    ["Max dist", `${fmt(analytics.distance.maxRackToStationDistance)} m`],
    ["Charger dist", `${fmt(analytics.distance.averageStationToChargerDistance)} m`],
    ["Parking dist", `${fmt(analytics.distance.averageStationToParkingDistance)} m`],
    ["Rotation-cell dist", `${fmt(analytics.distance.averageRackToRotationZoneDistance)} m`],
    ["Pre rotate", `${fmt(analytics.orientation.percentPreStationRotation)}%`],
    ["Post rotate", `${fmt(analytics.orientation.percentPostStationRotation)}%`],
    ["Rotate detour", `${fmt(analytics.orientation.averageRotationDetourDistance)} m`],
    ["Rotate time", `${fmt(analytics.orientation.averageRotationTimePenalty)} s`],
    ["Invalid orient", analytics.orientation.invalidOrientationCount],
    ["Face violations", analytics.orientation.stationFaceAccessViolationCount],
    ["Station balance", fmt(analytics.station.stationWorkloadBalanceScore, 2)],
    ["Bottleneck", analytics.station.bottleneckStationEstimate ?? "n/a"],
    ["Dead ends", analytics.congestion.deadEndCount],
    ["Narrow", analytics.congestion.narrowCorridorCount],
    ["Throughput", `${fmt(analytics.performance.estimatedSystemThroughput)} /hr`],
    ["Cycle dist", `${fmt(analytics.performance.averageRobotCycleDistance)} m`],
    ["Cycle time", `${fmt(analytics.performance.averageRobotCycleTime)} s`],
    ["Robot cap", `${fmt(analytics.performance.estimatedRobotLimitedThroughput)} /hr`],
    ["Station cap", `${fmt(analytics.performance.estimatedStationLimitedThroughput)} /hr`],
    ["Robot util", `${fmt(analytics.performance.estimatedRobotUtilization * 100)}%`],
    ["Station util", `${fmt(analytics.performance.estimatedStationUtilization * 100)}%`],
    ["Congestion", fmt(analytics.congestion.congestionRiskScore, 2)],
    ["Score", fmt(analytics.scoring.overallLayoutScore)]
  ];
  return (
    <footer className="grid h-24 shrink-0 grid-cols-1 border-t border-border bg-panel xl:grid-cols-[1fr_280px]">
      <div className="grid min-w-[1700px] grid-cols-12 gap-px overflow-hidden bg-border">
        {items.map(([label, value]) => (
          <div key={label} className="flex flex-col justify-center bg-panel px-2">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold text-foreground">{value}</span>
          </div>
        ))}
      </div>
      <div className="hidden border-l border-border p-3 xl:block">
        <div className="panel-title">Validation</div>
        <div className="mt-2 flex items-center justify-between">
          <span className={validation.isValid ? "text-sm font-semibold text-teal-700" : "text-sm font-semibold text-red-600"}>
            {validation.isValid ? "Valid layout" : `${validation.issues.filter((issue) => issue.severity === "error").length} errors`}
          </span>
          <span className="text-xs text-muted-foreground">{validation.issues.length} total findings</span>
        </div>
      </div>
    </footer>
  );
}
