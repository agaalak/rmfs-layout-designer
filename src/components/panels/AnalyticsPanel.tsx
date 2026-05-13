import type { AnalyticsResult } from "../../analytics/types";

interface AnalyticsPanelProps {
  analytics: AnalyticsResult;
}

export function AnalyticsPanel({ analytics }: AnalyticsPanelProps) {
  return (
    <section>
      <div className="panel-title">Analytics Detail</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Pre-station rotation</div>
          <div className="text-sm font-semibold">{analytics.orientation.percentPreStationRotation.toFixed(1)}%</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Post-station rotation</div>
          <div className="text-sm font-semibold">{analytics.orientation.percentPostStationRotation.toFixed(1)}%</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Queue bottleneck</div>
          <div className="truncate text-sm font-semibold">{analytics.station.bottleneckStationEstimate ?? "n/a"}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Dead ends</div>
          <div className="text-sm font-semibold">{analytics.congestion.deadEndCount}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Busiest edge</div>
          <div className="truncate text-sm font-semibold">{analytics.congestion.likelyBusiestAisleEdges[0]?.edge ?? "n/a"}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Cycle time</div>
          <div className="text-sm font-semibold">{analytics.performance.averageRobotCycleTime.toFixed(1)}s</div>
        </div>
      </div>
    </section>
  );
}
