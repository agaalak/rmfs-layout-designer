import { describe, expect, it } from "vitest";
import { defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { calculateOrientationMetrics } from "../src/analytics/orientationMetrics";

describe("orientation analytics", () => {
  it("detects rack/station orientation mismatches", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 18, columns: 24 });
    layout.racks[0].currentOrientationDeg = 90;
    layout.stations[0].requiredRackOrientationDeg = 180;
    const metrics = calculateOrientationMetrics(layout);
    expect(metrics.percentPreStationRotation).toBeGreaterThan(0);
    expect(metrics.percentPostStationRotation).toBeGreaterThan(0);
  });
});
