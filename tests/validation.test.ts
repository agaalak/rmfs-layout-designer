import { describe, expect, it } from "vitest";
import { createEmptyLayout } from "../src/generators/proceduralGenerator";
import { validateLayout } from "../src/validation/validateLayout";

describe("layout validation", () => {
  it("rejects rack footprints beyond supported 2x2 cells", () => {
    const layout = createEmptyLayout({ rows: 6, columns: 6, cellWidthM: 1, cellDepthM: 1 });
    layout.cells = [
      { row: 0, col: 0, cellType: "STATION", allowedDirections: ["east", "south"] },
      { row: 0, col: 1, cellType: "ROAD", allowedDirections: ["east", "west", "south"] },
      { row: 1, col: 1, cellType: "ROAD", allowedDirections: ["north", "south"] },
      { row: 2, col: 1, cellType: "RACK_STORAGE", allowedDirections: ["north", "south"] }
    ];
    layout.stations = [
      {
        id: "station",
        stationId: "pick_001",
        stationType: "PICK",
        cell: { row: 0, col: 0 },
        serviceSide: "NORTH",
        acceptedRackFaces: ["A", "B"],
        requiredRackOrientationDeg: 0,
        queueCells: [{ row: 0, col: 1 }],
        targetServiceTimeSec: 30,
        maxQueueLength: 1
      }
    ];
    layout.racks = [
      {
        id: "rack",
        rackId: "rack_001",
        rackTypeId: "rack",
        homeCell: { row: 2, col: 1 },
        footprintWidthM: 3.2,
        footprintDepthM: 1.2,
        heightM: 1.8,
        currentOrientationDeg: 0,
        allowedOrientationsDeg: [0, 90, 180, 270],
        faces: [
          { faceId: "A", localSide: "FRONT", rows: 1, columns: 1, bins: [] },
          { faceId: "B", localSide: "BACK", rows: 1, columns: 1, bins: [] }
        ]
      }
    ];
    const result = validateLayout(layout);
    expect(result.issues.some((issue) => issue.message.includes("supports up to 2 x 2 cells"))).toBe(true);
  });

  it("rejects charger sizes other than one or two cells", () => {
    const layout = createEmptyLayout({ rows: 6, columns: 6 });
    layout.chargingSpots = [
      {
        id: "charger",
        chargerId: "charger_001",
        cells: [
          { row: 1, col: 1 },
          { row: 1, col: 2 },
          { row: 1, col: 3 }
        ],
        capacityRobots: 3
      }
    ];
    const result = validateLayout(layout);
    expect(result.issues.some((issue) => issue.message.includes("must occupy 1 or 2 cells"))).toBe(true);
  });
});
