import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../../generators/proceduralGenerator";
import type { Robot } from "../../models/robot";
import type { SimulationTask } from "../../models/task";
import { canDropRackAtCurrentCell, canLiftRackAtCurrentCell } from "../lifecycle/rackLifecycle";

function robotAt(cell: { row: number; col: number }): Robot {
  return {
    robotId: "robot_001",
    robotTypeId: "bot",
    pose: { x: cell.col + 0.5, y: cell.row + 0.5, yawDeg: 0 },
    currentCell: cell,
    state: "IDLE",
    currentPath: [],
    pathProgress: 0,
    routeIndex: 0,
    segmentProgressM: 0,
    speedUnloadedMps: 1,
    speedLoadedMps: 1,
    accelerationMps2: 1,
    decelerationMps2: 1,
    rotationSpeedDegPerSec: 90,
    liftTimeSec: 1,
    dropTimeSec: 1,
    batteryPercent: 100,
    color: "#000"
  };
}

describe("rack lifecycle service-cell gates", () => {
  it("allows lift and drop only on the relevant podServiceCell", () => {
    const layout = generateSmallDemoLayout();
    const rack = layout.racks[0];
    const source = layout.storageLocations.find((item) => item.storageLocationId === rack.currentStorageLocationId)!;
    const destination = layout.storageLocations.find((item) => item.storageLocationId !== source.storageLocationId && item.status === "EMPTY") ?? source;
    const task: Pick<SimulationTask, "sourceStorageLocationId" | "destinationStorageLocationId"> = {
      sourceStorageLocationId: source.storageLocationId,
      destinationStorageLocationId: destination.storageLocationId
    };

    expect(canLiftRackAtCurrentCell(layout, robotAt(source.podServiceCell), rack, task).allowed).toBe(true);
    expect(canLiftRackAtCurrentCell(layout, robotAt({ row: source.podServiceCell.row, col: source.podServiceCell.col + 1 }), rack, task).allowed).toBe(false);
    expect(canDropRackAtCurrentCell(layout, robotAt(destination.podServiceCell), rack, task).allowed).toBe(true);
    expect(canDropRackAtCurrentCell(layout, robotAt({ row: destination.podServiceCell.row, col: destination.podServiceCell.col + 1 }), rack, task).allowed).toBe(false);
  });
});
