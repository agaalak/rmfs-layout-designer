import { describe, expect, it } from "vitest";
import { defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { cellKey } from "../src/utils/gridMath";

describe("procedural generator", () => {
  it("creates the default demo layout with core RMFS objects", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 20, columns: 30 });
    expect(layout.racks.length).toBeGreaterThan(0);
    expect(layout.stations.length).toBe(defaultGenerationParams.stationCount);
    expect(layout.chargingSpots.length).toBeGreaterThan(0);
    expect(layout.parkingSpots.length).toBeGreaterThan(0);
    expect(layout.rotationZones.length).toBeGreaterThan(0);
  });

  it("places generated rotation zones before and after stations", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 20, columns: 30, stationCount: 2 });
    const rotationCells = new Set(layout.rotationZones.flatMap((zone) => zone.cells.map(cellKey)));
    const firstStation = layout.stations[0];
    const queueEnd = firstStation.queueCells.at(-1)!;
    expect(rotationCells.has(cellKey({ row: queueEnd.row - 1, col: queueEnd.col }))).toBe(true);
    expect(rotationCells.has(cellKey({ row: firstStation.cell.row, col: firstStation.cell.col + 1 }))).toBe(true);
  });
});
