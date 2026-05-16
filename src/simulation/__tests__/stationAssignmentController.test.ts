import { describe, expect, it } from "vitest";
import { createEmptyLayout } from "../../generators/proceduralGenerator";
import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { QueueLaneRuntimeState, StationRuntimeState } from "../../models/simulation";
import { makeQueueLaneFromCells } from "../../utils/queueLanes";
import { selectStationForRack } from "../controllers/stationAssignmentController";

function layoutForQueues(): { layout: WarehouseLayout; rack: Rack; queueLaneStates: Record<string, QueueLaneRuntimeState>; stationStates: Record<string, StationRuntimeState> } {
  const rack: Rack = {
    id: "rack",
    rackId: "rack_001",
    rackTypeId: "rack",
    homeCell: { row: 2, col: 1 },
    footprintWidthM: 1,
    footprintDepthM: 1,
    heightM: 1.8,
    currentOrientationDeg: 0,
    allowedOrientationsDeg: [0, 90, 180, 270],
    faces: [
      { faceId: "A", localSide: "FRONT", rows: 1, columns: 1, bins: [] },
      { faceId: "B", localSide: "BACK", rows: 1, columns: 1, bins: [] }
    ]
  };
  const laneA = makeQueueLaneFromCells("lane_a", "station_a", [{ row: 0, col: 1 }, { row: 0, col: 2 }], { row: 0, col: 3 })!;
  const laneB = makeQueueLaneFromCells("lane_b", "station_b", [{ row: 1, col: 1 }, { row: 1, col: 2 }], { row: 1, col: 3 })!;
  const layout: WarehouseLayout = {
    ...createEmptyLayout({ rows: 4, columns: 5, cellWidthM: 1.2, cellDepthM: 1.2 }),
    layoutId: "queue_test",
    name: "Queue test",
    racks: [rack],
    storageLocations: [],
    stations: [
      {
        id: "station_a",
        stationId: "pick_a",
        stationType: "PICK",
        cell: { row: 0, col: 3 },
        serviceSide: "WEST",
        acceptedRackFaces: ["A"],
        requiredRackOrientationDeg: 0,
        targetServiceTimeSec: 30,
        capacity: 1,
        queueLaneIds: ["lane_a"]
      },
      {
        id: "station_b",
        stationId: "pick_b",
        stationType: "PICK",
        cell: { row: 1, col: 3 },
        serviceSide: "WEST",
        acceptedRackFaces: ["A"],
        requiredRackOrientationDeg: 0,
        targetServiceTimeSec: 30,
        capacity: 1,
        queueLaneIds: ["lane_b"]
      }
    ],
    queueLanes: [laneA, laneB],
    chargingSpots: [],
    parkingSpots: [],
    rotationZones: [],
    trafficRules: []
  };
  const queueLaneStates: Record<string, QueueLaneRuntimeState> = {
    lane_a: {
      queueLaneId: "lane_a",
      stationId: "station_a",
      occupiedCells: laneA.cells.map((cell, index) => ({ queueIndex: cell.queueIndex, cell: cell.cell, robotId: index === 0 ? "robot_a" : undefined })),
      reservedRobotIds: ["robot_b"],
      reservedTaskIds: ["task_b"]
    },
    lane_b: {
      queueLaneId: "lane_b",
      stationId: "station_b",
      occupiedCells: laneB.cells.map((cell) => ({ queueIndex: cell.queueIndex, cell: cell.cell })),
      reservedRobotIds: [],
      reservedTaskIds: []
    }
  };
  return { layout, rack, queueLaneStates, stationStates: { station_a: { stationId: "station_a", activeRobotId: "robot_active", completedServiceCount: 0 }, station_b: { stationId: "station_b", completedServiceCount: 0 } } };
}

describe("station assignment controller", () => {
  it("scores shortest_queue from queue-lane runtime state instead of stale waitingRobotIds", () => {
    const { layout, rack, queueLaneStates, stationStates } = layoutForQueues();
    const selected = selectStationForRack(layout, rack, "shortest_queue", {
      queueLaneStates,
      stationStates,
      stationQueues: [{ stationId: "station_b", waitingRobotIds: ["stale_1", "stale_2", "stale_3"] }]
    });
    expect(selected?.id).toBe("station_b");
  });
});
