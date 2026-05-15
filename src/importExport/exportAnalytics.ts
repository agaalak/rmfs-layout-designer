import type { AnalyticsResult } from "../analytics/types";
import type { WarehouseLayout } from "../models/layout";

function flatten(prefix: string, value: unknown, rows: Record<string, string | number | boolean>) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => flatten(prefix ? `${prefix}.${key}` : key, child, rows));
  } else if (Array.isArray(value)) {
    rows[prefix] = value.length;
  } else {
    rows[prefix] = value as string | number | boolean;
  }
}

export function exportAnalyticsJson(analytics: AnalyticsResult): string {
  return JSON.stringify(analytics, null, 2);
}

export function exportAnalyticsCsv(analytics: AnalyticsResult): string {
  const flat: Record<string, string | number | boolean> = {};
  flatten("", analytics, flat);
  const headers = Object.keys(flat);
  const values = headers.map((key) => JSON.stringify(flat[key] ?? ""));
  return `${headers.join(",")}\n${values.join(",")}\n`;
}

export function exportSummaryMarkdown(layout: WarehouseLayout, analytics: AnalyticsResult): string {
  return `# ${layout.name} Summary Report

## Layout

- Mode: ${layout.mode}
- Grid: ${layout.grid.rows} rows x ${layout.grid.columns} columns
- Cell size: ${layout.grid.cellWidthM} m x ${layout.grid.cellDepthM} m

## Key Metrics

- Total cells: ${analytics.storage.totalCells}
- Rack count: ${analytics.storage.rackCount}
- Rack storage cells: ${analytics.storage.rackStorageCells}
- Storage density: ${analytics.storage.storageDensity.toFixed(3)}
- Aisle ratio: ${analytics.storage.aisleRatio.toFixed(3)}
- Average rack-to-station distance: ${analytics.distance.averageRackToNearestStationDistance.toFixed(2)} m
- P90 rack-to-station distance: ${analytics.distance.p90RackToNearestStationDistance.toFixed(2)} m
- Invalid orientation cases: ${analytics.orientation.invalidOrientationCount}
- Estimated throughput: ${analytics.performance.estimatedSystemThroughput.toFixed(1)} orders/hour
- Overall layout score: ${analytics.scoring.overallLayoutScore.toFixed(1)}

## Assumptions

- Analytics use graph shortest paths, not animated robot simulation.
- Orientation penalties are estimated through rotation-enabled cells.
- Congestion is an approximate shortest-path edge-use score.

## Limitations

- Analytics are separate from Experimental Simulation Mode.
- No full MAPF traffic planning.
- No production-grade collision-avoidance model.
`;
}
