import { describe, expect, it } from "vitest";
import { runAnalytics } from "../src/analytics/runAnalytics";
import { calculateOrientationMetrics } from "../src/analytics/orientationMetrics";
import { exportLayoutJson } from "../src/importExport/exportLayout";
import { exportSummaryMarkdown } from "../src/importExport/exportAnalytics";
import { importLayoutJson } from "../src/importExport/importLayout";
import { applyHybridFill, createEmptyLayout, defaultGenerationParams, generateProceduralCandidates, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import type { WarehouseLayout } from "../src/models/layout";
import { useLayoutStore } from "../src/store/layoutStore";
import { deriveDimensions } from "../src/utils/gridMath";
import { validateConnectivity } from "../src/graph/connectivity";
import { validateLayout } from "../src/validation/validateLayout";

function connectedBase(): WarehouseLayout {
  const layout = createEmptyLayout({ rows: 5, columns: 5, cellWidthM: 1.2, cellDepthM: 1.2 });
  layout.cells = [
    { row: 0, col: 0, cellType: "STATION", allowedDirections: ["east"] },
    { row: 0, col: 1, cellType: "QUEUE", allowedDirections: ["east", "west"] },
    { row: 0, col: 2, cellType: "ROAD", allowedDirections: ["east", "west", "south"] },
    { row: 1, col: 2, cellType: "ROAD", allowedDirections: ["north", "south"] },
    { row: 2, col: 2, cellType: "ROAD", allowedDirections: ["north", "south", "east"] },
    { row: 2, col: 3, cellType: "RACK_STORAGE", allowedDirections: ["west"] },
    { row: 1, col: 3, cellType: "CHARGING", allowedDirections: ["west"] },
    { row: 2, col: 1, cellType: "PARKING", allowedDirections: ["east"] },
    { row: 3, col: 2, cellType: "ROTATION", allowedDirections: ["north"] }
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
      homeCell: { row: 2, col: 3 },
      footprintWidthM: 1,
      footprintDepthM: 1,
      heightM: 1.8,
      currentOrientationDeg: 0,
      allowedOrientationsDeg: [0, 90, 180, 270],
      faces: [
        { faceId: "A", localSide: "FRONT", rows: 1, columns: 1, bins: [] },
        { faceId: "B", localSide: "BACK", rows: 1, columns: 1, bins: [] }
      ]
    }
  ];
  layout.chargingSpots = [{ id: "charger", chargerId: "charger_001", cells: [{ row: 1, col: 3 }], capacityRobots: 1 }];
  layout.parkingSpots = [{ id: "parking", parkingId: "parking_001", cell: { row: 2, col: 1 }, parkingType: "IDLE" }];
  layout.rotationZones = [
    {
      id: "rotation",
      rotationZoneId: "rotation_001",
      cells: [{ row: 3, col: 2 }],
      allowedRackTypes: ["rack"],
      supportedOrientationsDeg: [0, 90, 180, 270],
      rotationTimeSec: 6,
      safetyClearanceCells: 1
    }
  ];
  return layout;
}

describe("completion coverage", () => {
  it("converts grid dimensions into physical dimensions", () => {
    expect(deriveDimensions({ rows: 40, columns: 60, cellWidthM: 1.2, cellDepthM: 1.2 })).toEqual({
      widthM: 72,
      depthM: 48
    });
  });

  it("accepts a 1.0m rack in a 1.2m grid cell", () => {
    const result = validateLayout(connectedBase());
    expect(result.issues.some((issue) => issue.id.startsWith("rack_footprint"))).toBe(false);
  });

  it("validates charger and parking sizes", () => {
    const one = connectedBase();
    one.chargingSpots[0].cells = [{ row: 1, col: 3 }];
    expect(validateLayout(one).issues.some((issue) => issue.id.startsWith("charger_size"))).toBe(false);

    const two = connectedBase();
    two.chargingSpots[0].cells = [
      { row: 1, col: 3 },
      { row: 1, col: 4 }
    ];
    expect(validateLayout(two).issues.some((issue) => issue.id.startsWith("charger_size"))).toBe(false);

    const three = connectedBase();
    three.chargingSpots[0].cells = [
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 }
    ];
    expect(validateLayout(three).issues.some((issue) => issue.id.startsWith("charger_size"))).toBe(true);

    const parkingTwo = connectedBase();
    parkingTwo.parkingSpots[0] = { ...parkingTwo.parkingSpots[0], cells: [{ row: 2, col: 1 }, { row: 2, col: 2 }] } as never;
    expect(validateLayout(parkingTwo).issues.some((issue) => issue.id.startsWith("parking_size"))).toBe(true);
  });

  it("accepts parking spots with exactly one cell", () => {
    const layout = connectedBase();
    expect(validateLayout(layout).issues.some((issue) => issue.id.startsWith("parking_size"))).toBe(false);
  });

  it("generates candidates and preserves locked hybrid constraints", () => {
    const candidates = generateProceduralCandidates({ ...defaultGenerationParams, rows: 16, columns: 24, candidateCount: 4 });
    expect(candidates).toHaveLength(4);
    const base = createEmptyLayout({ rows: 16, columns: 24 });
    base.cells = [{ row: 4, col: 4, cellType: "BLOCKED", allowedDirections: [], locked: true }];
    const hybrid = applyHybridFill(base, { ...defaultGenerationParams, rows: 16, columns: 24 });
    expect(hybrid.cells.find((cell) => cell.row === 4 && cell.col === 4)?.cellType).toBe("BLOCKED");
  });

  it("catches unreachable rack, charger, and parking objects", () => {
    const layout = connectedBase();
    layout.racks[0].homeCell = { row: 4, col: 4 };
    layout.chargingSpots[0].cells = [{ row: 4, col: 3 }];
    layout.parkingSpots[0].cell = { row: 4, col: 2 };
    layout.cells = layout.cells.filter((cell) => !["2:3", "1:3", "2:1"].includes(`${cell.row}:${cell.col}`));
    layout.cells.push(
      { row: 4, col: 4, cellType: "RACK_STORAGE", allowedDirections: [] },
      { row: 4, col: 3, cellType: "CHARGING", allowedDirections: [] },
      { row: 4, col: 2, cellType: "PARKING", allowedDirections: [] }
    );
    const connectivity = validateConnectivity(layout);
    expect(connectivity.unreachableRacks.size).toBeGreaterThan(0);
    expect(connectivity.unreachableChargers.size).toBeGreaterThan(0);
    expect(connectivity.unreachableParking.size).toBeGreaterThan(0);
  });

  it("detects orientation and face access problems", () => {
    const layout = connectedBase();
    layout.racks[0].currentOrientationDeg = 90;
    layout.stations[0].requiredRackOrientationDeg = 180;
    layout.stations[0].acceptedRackFaces = ["A"];
    layout.racks[0].faces = [{ faceId: "B", localSide: "BACK", rows: 1, columns: 1, bins: [] }];
    const metrics = calculateOrientationMetrics(layout);
    expect(metrics.percentPreStationRotation).toBeGreaterThan(0);
    expect(metrics.stationFaceAccessViolationCount).toBeGreaterThan(0);
  });

  it("roundtrips import/export and exports a Markdown report", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 16, columns: 24 });
    const imported = importLayoutJson(exportLayoutJson(layout));
    expect(imported.racks.length).toBe(layout.racks.length);
    const report = exportSummaryMarkdown(imported, runAnalytics(imported));
    expect(report).toContain("Summary Report");
    expect(report).toContain("Estimated throughput");
  });

  it("supports undo and redo for property edits", () => {
    const store = useLayoutStore.getState();
    store.newLayout({ rows: 8, columns: 8 });
    useLayoutStore.getState().addRack({ row: 2, col: 2 });
    const rack = useLayoutStore.getState().history.present.racks.at(-1)!;
    useLayoutStore.getState().updateRack(rack.id, { rackId: "rack_custom" });
    expect(useLayoutStore.getState().history.present.racks.find((item) => item.id === rack.id)?.rackId).toBe("rack_custom");
    useLayoutStore.getState().undo();
    expect(useLayoutStore.getState().history.present.racks.find((item) => item.id === rack.id)?.rackId).toBe(rack.rackId);
    useLayoutStore.getState().redo();
    expect(useLayoutStore.getState().history.present.racks.find((item) => item.id === rack.id)?.rackId).toBe("rack_custom");
  });

  it("returns non-negative analytics metrics", () => {
    const analytics = runAnalytics(generateProceduralLayout({ ...defaultGenerationParams, rows: 16, columns: 24 }));
    expect(analytics.distance.averageRackToNearestStationDistance).toBeGreaterThanOrEqual(0);
    expect(analytics.congestion.congestionRiskScore).toBeGreaterThanOrEqual(0);
    expect(analytics.scoring.overallLayoutScore).toBeGreaterThanOrEqual(0);
  });
});
