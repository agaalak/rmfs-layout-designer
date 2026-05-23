import { describe, expect, it } from "vitest";
import { defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { cellKey } from "../src/utils/gridMath";
import { queuePointsForStation } from "../src/utils/queuePoints";

describe("procedural generator", () => {
  it("creates the default demo layout with core RMFS objects", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 20, columns: 30 });
    expect(layout.racks.length).toBeGreaterThan(0);
    expect(layout.stations.length).toBe(defaultGenerationParams.stationCount);
    expect(layout.chargingSpots.length).toBeGreaterThan(0);
    expect(layout.parkingSpots.length).toBeGreaterThan(0);
    expect(layout.cells.filter((cell) => cell.allowRotation).length).toBeGreaterThan(0);
    expect(layout.queuePoints.length).toBeGreaterThan(0);
    expect(layout.queueLanes.length).toBe(0);
    expect(layout.cells.filter((cell) => cell.cellType === "QUEUE")).toHaveLength(0);
  });

  it("places generated rotation-enabled cells before and after stations", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 20, columns: 30, stationCount: 2 });
    const rotationCells = new Set(layout.cells.filter((cell) => cell.allowRotation).map(cellKey));
    const firstStation = layout.stations[0];
    const queueEnd = queuePointsForStation(layout, firstStation)[0].cell;
    const nearQueueHeadOrStation = [
      { row: queueEnd.row - 1, col: queueEnd.col },
      { row: queueEnd.row + 1, col: queueEnd.col },
      { row: firstStation.cell.row, col: firstStation.cell.col + 1 },
      { row: firstStation.cell.row, col: firstStation.cell.col - 1 }
    ];
    expect(nearQueueHeadOrStation.some((cell) => rotationCells.has(cellKey(cell)))).toBe(true);
  });
});
