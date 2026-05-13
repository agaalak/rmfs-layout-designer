import { describe, expect, it } from "vitest";
import { defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { runAnalytics } from "../src/analytics/runAnalytics";

describe("analytics", () => {
  it("returns positive storage and throughput metrics", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 18, columns: 24 });
    const analytics = runAnalytics(layout);
    expect(analytics.storage.totalCells).toBe(18 * 24);
    expect(analytics.storage.rackCount).toBeGreaterThan(0);
    expect(analytics.performance.averageRobotCycleTime).toBeGreaterThan(0);
    expect(analytics.performance.estimatedSystemThroughput).toBeGreaterThan(0);
  });
});
