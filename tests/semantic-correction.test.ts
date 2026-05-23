import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../src/generators/proceduralGenerator";
import { importLayoutJson, parseLayoutJson } from "../src/importExport/importLayout";
import { traversableCellTypes, type LayoutCell } from "../src/models/grid";
import { findNearestRotationCellPath, findPathToNearestRackApproach, findPathToStationQueue, nearestCompatibleStation } from "../src/simulation/pathPlanner";
import { cellKey } from "../src/utils/gridMath";
import { queuePointsForStation } from "../src/utils/queuePoints";
import { validateLayout } from "../src/validation/validateLayout";

describe("queue/station/pod/rotation semantic corrections", () => {
  it("does not treat ROTATION as an active cell type", () => {
    expect(traversableCellTypes.has("ROTATION" as never)).toBe(false);
    const layout = generateSmallDemoLayout();
    expect(layout.cells.some((cell) => (cell.cellType as string) === "ROTATION")).toBe(false);
    expect(layout.cells.filter((cell) => cell.allowRotation).length).toBeGreaterThan(0);
    expect(layout.rotationZones).toHaveLength(0);
  });

  it("migrates legacy station queueCells and rotationZones into queue pre-points and rotation-enabled cells", () => {
    const legacy = generateSmallDemoLayout();
    const station = legacy.stations[0];
    const queueCells = queuePointsForStation(legacy, station).map((point) => point.cell);
    const rotationCell = legacy.cells.find((cell) => cell.allowRotation)!;
    const imported = importLayoutJson(
      JSON.stringify({
        ...legacy,
        layoutSchemaVersion: "0.2.0",
        queueLanes: [],
        stations: [
          {
            ...station,
            queueLaneIds: undefined,
            queueCells,
            maxQueueLength: queueCells.length
          }
        ],
        cells: legacy.cells.map((cell) =>
          cellKey(cell) === cellKey(rotationCell)
            ? ({ ...cell, cellType: "ROTATION", allowRotation: undefined } as unknown as LayoutCell)
            : { ...cell, allowRotation: undefined }
        ),
        rotationZones: [
          {
            id: "legacy_rotation_001",
            rotationZoneId: "legacy_rotation_001",
            cells: [rotationCell],
            allowedRackTypes: ["two_face_mobile_rack"],
            supportedOrientationsDeg: [0, 90, 180, 270],
            rotationTimeSec: 6,
            safetyClearanceCells: 1
          }
        ]
      })
    );

    expect(imported.layoutSchemaVersion).toBe("0.3.1");
    expect(imported.queuePoints.length).toBeGreaterThan(0);
    expect(imported.queueLanes.length).toBe(0);
    expect(imported.stations[0].queueLaneIds.length).toBe(0);
    expect(imported.cells.some((cell) => (cell.cellType as string) === "ROTATION")).toBe(false);
    expect(imported.cells.some((cell) => cell.allowRotation)).toBe(true);
  });

  it("routes station visits through the queue pre-point and ends at the station service cell", () => {
    const layout = generateSmallDemoLayout();
    const rack = layout.racks[0];
    const station = nearestCompatibleStation(layout, rack)!;
    const queuePoint = queuePointsForStation(layout, station)[0];
    const storage = layout.storageLocations.find((location) => location.storageLocationId === rack.homeStorageLocationId)!;
    const path = findPathToStationQueue(layout, storage.podServiceCell, station);
    const pathKeys = path.map(cellKey);

    expect(path.at(-1)).toEqual(station.cell);
    expect(pathKeys).toContain(cellKey(queuePoint.cell));
    expect(cellKey(queuePoint.cell)).not.toBe(cellKey(station.cell));
  });

  it("targets the storage podServiceCell for pickup/drop and rotation-enabled cells for rotation", () => {
    const layout = generateSmallDemoLayout();
    const rack = layout.racks[0];
    const storage = layout.storageLocations.find((location) => location.storageLocationId === rack.homeStorageLocationId)!;
    const pickupPath = findPathToNearestRackApproach(layout, layout.parkingSpots[0].cell, rack);
    const rotationPath = findNearestRotationCellPath(layout, storage.podServiceCell, 180);
    const rotationCell = rotationPath.at(-1);

    expect(pickupPath.at(-1)).toEqual(storage.podServiceCell);
    expect(rotationCell).toBeTruthy();
    expect(layout.cells.find((cell) => rotationCell && cellKey(cell) === cellKey(rotationCell))?.allowRotation).toBe(true);
  });

  it("flags legacy ROTATION cells as invalid if migration was bypassed", () => {
    const layout = generateSmallDemoLayout();
    layout.cells.push({ row: 0, col: 0, cellType: "ROTATION", allowedDirections: ["east"] } as unknown as LayoutCell);
    const result = validateLayout(layout);
    expect(result.issues.some((issue) => issue.message.includes("ROTATION is no longer a valid cell type"))).toBe(true);
  });

  it("safe import keeps invalid JSON user-friendly", () => {
    const imported = parseLayoutJson("{not valid");
    expect(imported.ok).toBe(false);
    expect(imported.errors[0]).toContain("Invalid JSON");
  });
});
