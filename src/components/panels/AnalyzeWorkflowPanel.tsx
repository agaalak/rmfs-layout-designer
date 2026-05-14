import { useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Download, Flame, Route } from "lucide-react";
import type { AnalyticsResult } from "../../analytics/types";
import { exportAnalyticsCsv, exportAnalyticsJson, exportSummaryMarkdown } from "../../importExport/exportAnalytics";
import { downloadTextFile } from "../../importExport/exportLayout";
import type { WarehouseLayout } from "../../models/layout";
import type { ValidationResult } from "../../validation/validateLayout";
import type { ValidationIssue } from "../../validation/validateObjects";
import { useUiStore, type HeatmapMode } from "../../store/uiStore";
import { cn } from "../../utils/cn";

interface AnalyzeWorkflowPanelProps {
  layout: WarehouseLayout;
  analytics: AnalyticsResult;
  validation: ValidationResult;
  onRunValidation: () => void;
  onRunAnalytics: () => void;
  onSelectIssue: (issue: ValidationIssue) => void;
  display?: "desktop" | "drawer";
}

type AnalyzeTab = "validation" | "storage" | "distance" | "stations" | "orientation" | "congestion" | "performance" | "exports";

const tabs: Array<{ id: AnalyzeTab; label: string }> = [
  { id: "validation", label: "Validation" },
  { id: "storage", label: "Storage" },
  { id: "distance", label: "Distance" },
  { id: "stations", label: "Stations" },
  { id: "orientation", label: "Orientation" },
  { id: "congestion", label: "Congestion" },
  { id: "performance", label: "Performance" },
  { id: "exports", label: "Exports" }
];

function fmt(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <div className="metric-card">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-base font-semibold", toneClass)}>{value}</div>
    </div>
  );
}

function ValidationBadge({ severity }: { severity: ValidationIssue["severity"] }) {
  return (
    <span className={severity === "error" ? "rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700" : "rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"}>
      {severity}
    </span>
  );
}

export function AnalyzeWorkflowPanel({
  layout,
  analytics,
  validation,
  onRunValidation,
  onRunAnalytics,
  onSelectIssue,
  display = "desktop"
}: AnalyzeWorkflowPanelProps) {
  const [tab, setTab] = useState<AnalyzeTab>("validation");
  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationIssue["severity"]>("all");
  const { heatmapMode, setHeatmapMode, showHeatmap, toggleHeatmap } = useUiStore();
  const errorCount = validation.issues.filter((issue) => issue.severity === "error").length;
  const filteredIssues = validation.issues.filter((issue) => severityFilter === "all" || issue.severity === severityFilter);
  const assignedCounts = Object.values(analytics.station.assignedRackCountByStation);
  const queuePressure = Object.values(analytics.station.estimatedQueuePressure);
  const averageAssignedRacks = assignedCounts.length > 0 ? assignedCounts.reduce((sum, value) => sum + value, 0) / assignedCounts.length : 0;
  const peakQueuePressure = queuePressure.length > 0 ? Math.max(...queuePressure) : 0;

  return (
    <aside
      className={cn(
        display === "desktop"
          ? "hidden w-[26rem] shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-3 xl:flex"
          : "flex h-full w-full flex-col gap-4 overflow-auto bg-panel p-3"
      )}
      aria-label="Analyze panel"
    >
      <div>
        <div className="panel-title">Analyze</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MetricCard label="Storage density" value={fmt(analytics.storage.storageDensity, 3)} />
          <MetricCard label="Racks" value={analytics.storage.rackCount} />
          <MetricCard label="Stations" value={analytics.storage.stationCount} />
          <MetricCard label="Validation errors" value={errorCount} tone={errorCount > 0 ? "bad" : "good"} />
          <MetricCard label="Avg rack distance" value={`${fmt(analytics.distance.averageRackToNearestStationDistance)} m`} />
          <MetricCard label="Throughput" value={`${fmt(analytics.performance.estimatedSystemThroughput)} /hr`} />
          <MetricCard label="Overall score" value={fmt(analytics.scoring.overallLayoutScore)} />
          <MetricCard label="Congestion risk" value={fmt(analytics.congestion.congestionRiskScore, 2)} tone={analytics.congestion.congestionRiskScore > 0.7 ? "warn" : "default"} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2">
        <button className="toolbar-button-primary justify-center" onClick={onRunValidation}>
          <CheckCircle2 data-icon="inline-start" />
          Run validation
        </button>
        <button className="toolbar-button justify-center" onClick={onRunAnalytics}>
          <BarChart3 data-icon="inline-start" />
          Run analytics
        </button>
      </section>

      <section className="rounded-md border border-border bg-slate-50 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Flame className="size-4 text-amber-600" />
            Heatmap
          </div>
          <button className="toolbar-button h-7" onClick={toggleHeatmap}>{showHeatmap ? "Hide" : "Show"}</button>
        </div>
        <select className="field-input" value={heatmapMode} onChange={(event) => setHeatmapMode(event.target.value as HeatmapMode)}>
          <option value="distance">Distance to nearest station</option>
          <option value="congestion">Congestion proxy</option>
          <option value="unreachable">Validation issues</option>
        </select>
      </section>

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Analyze sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "toolbar-button-primary h-7" : "toolbar-button h-7"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "validation" ? (
        <section className="flex min-h-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Validation findings</div>
            <select className="field-input h-8 w-28" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}>
              <option value="all">All</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
            </select>
          </div>
          <div className="max-h-[26rem] overflow-auto rounded-md border border-border bg-white">
            {filteredIssues.length === 0 ? (
              <div className="flex items-center gap-2 p-3 text-xs text-emerald-700">
                <CheckCircle2 className="size-4" />
                No validation issues in this filter.
              </div>
            ) : (
              filteredIssues.map((issue) => (
                <button
                  key={issue.id}
                  className="block w-full border-b border-border p-3 text-left text-xs hover:bg-slate-50 last:border-b-0"
                  onClick={() => onSelectIssue(issue)}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <ValidationBadge severity={issue.severity} />
                    <span className="text-[11px] text-muted-foreground">{issue.objectId ?? (issue.cell ? `cell ${issue.cell.row},${issue.cell.col}` : "layout")}</span>
                  </div>
                  <div className="font-medium text-foreground">{issue.message}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <AlertTriangle className="size-3" />
                    Select this issue to highlight the object or cell, then fix it in Design.
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      {tab === "storage" ? (
        <MetricGrid
          rows={[
            ["Total cells", analytics.storage.totalCells],
            ["Usable cells", analytics.storage.usableCells],
            ["Rack storage cells", analytics.storage.rackStorageCells],
            ["Rack faces", analytics.storage.rackFacesCount],
            ["Bins", analytics.storage.binCount],
            ["Aisle ratio", fmt(analytics.storage.aisleRatio, 3)]
          ]}
        />
      ) : null}

      {tab === "distance" ? (
        <MetricGrid
          rows={[
            ["Average rack to station", `${fmt(analytics.distance.averageRackToNearestStationDistance)} m`],
            ["Median rack to station", `${fmt(analytics.distance.medianRackToNearestStationDistance)} m`],
            ["P90 rack to station", `${fmt(analytics.distance.p90RackToNearestStationDistance)} m`],
            ["Max rack to station", `${fmt(analytics.distance.maxRackToStationDistance)} m`],
            ["Station to charger", `${fmt(analytics.distance.averageStationToChargerDistance)} m`],
            ["Station to parking", `${fmt(analytics.distance.averageStationToParkingDistance)} m`],
            ["Rack to rotation zone", `${fmt(analytics.distance.averageRackToRotationZoneDistance)} m`]
          ]}
        />
      ) : null}

      {tab === "stations" ? (
        <MetricGrid
          rows={[
            ["Workload balance", fmt(analytics.station.stationWorkloadBalanceScore, 2)],
            ["Avg racks per station", fmt(averageAssignedRacks, 1)],
            ["Peak queue pressure", fmt(peakQueuePressure, 2)],
            ["Bottleneck", analytics.station.bottleneckStationEstimate ?? "n/a"]
          ]}
        />
      ) : null}

      {tab === "orientation" ? (
        <MetricGrid
          rows={[
            ["Pre-station rotation", `${fmt(analytics.orientation.percentPreStationRotation)}%`],
            ["Post-station rotation", `${fmt(analytics.orientation.percentPostStationRotation)}%`],
            ["Average detour", `${fmt(analytics.orientation.averageRotationDetourDistance)} m`],
            ["Rotation penalty", `${fmt(analytics.orientation.averageRotationTimePenalty)} s`],
            ["Invalid orientations", analytics.orientation.invalidOrientationCount],
            ["Face access violations", analytics.orientation.stationFaceAccessViolationCount]
          ]}
        />
      ) : null}

      {tab === "congestion" ? (
        <section className="grid gap-2">
          <MetricGrid
            rows={[
              ["Congestion risk score", fmt(analytics.congestion.congestionRiskScore, 2)],
              ["Dead ends", analytics.congestion.deadEndCount],
              ["Narrow corridors", analytics.congestion.narrowCorridorCount]
            ]}
          />
          <div className="rounded-md border border-border bg-white p-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
              <Route className="size-4 text-teal-700" />
              Likely busiest edges
            </div>
            <div className="max-h-28 overflow-auto text-xs text-muted-foreground">
              {analytics.congestion.likelyBusiestAisleEdges.slice(0, 8).map((edge) => (
                <div key={edge.edge} className="flex justify-between gap-2 border-t border-slate-100 py-1 first:border-t-0">
                  <span className="truncate">{edge.edge}</span>
                  <span>{edge.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "performance" ? (
        <MetricGrid
          rows={[
            ["Cycle distance", `${fmt(analytics.performance.averageRobotCycleDistance)} m`],
            ["Cycle time", `${fmt(analytics.performance.averageRobotCycleTime)} s`],
            ["Robot-limited throughput", `${fmt(analytics.performance.estimatedRobotLimitedThroughput)} /hr`],
            ["Station-limited throughput", `${fmt(analytics.performance.estimatedStationLimitedThroughput)} /hr`],
            ["System throughput", `${fmt(analytics.performance.estimatedSystemThroughput)} /hr`],
            ["Robot utilization", `${fmt(analytics.performance.estimatedRobotUtilization * 100)}%`],
            ["Station utilization", `${fmt(analytics.performance.estimatedStationUtilization * 100)}%`]
          ]}
        />
      ) : null}

      {tab === "exports" ? (
        <section className="grid gap-2">
          <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.json`, exportAnalyticsJson(analytics), "application/json")}>
            <Download data-icon="inline-start" />
            Analytics JSON
          </button>
          <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.csv`, exportAnalyticsCsv(analytics), "text/csv")}>Analytics CSV</button>
          <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}_report.md`, exportSummaryMarkdown(layout, analytics), "text/markdown")}>Markdown report</button>
        </section>
      ) : null}
    </aside>
  );
}

function MetricGrid({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <section className="grid grid-cols-2 gap-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border border-border bg-white p-2">
          <div className="text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-sm font-semibold">{value}</div>
        </div>
      ))}
    </section>
  );
}
