import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../../generators/proceduralGenerator";
import { defaultSimulationConfig } from "../../models/simulation";
import { cellKey } from "../../utils/gridMath";
import { queuePointsForStation } from "../../utils/queuePoints";
import { createQueuePointStates, releaseQueuePoint, reserveQueuePoint, stationHasQueuePointDispatchCapacity, syncQueuePointStates } from "../lifecycle/queuePointLifecycle";
import { initializeSimulation } from "../simulationEngine";
import { applyTrafficMoveGate } from "../trafficMoveGate";

describe("queue pre-point lifecycle", () => {
  it("tracks pre-point reservations and live occupancy", () => {
    const layout = generateSmallDemoLayout();
    const station = layout.stations[0];
    const point = queuePointsForStation(layout, station)[0];
    let state = initializeSimulation(layout, defaultSimulationConfig);

    state = reserveQueuePoint(state, point.queuePointId, state.robots[0].robotId, "task_queue_point");
    expect(state.queuePointStates[point.queuePointId].reservedTaskIds).toContain("task_queue_point");
    expect(stationHasQueuePointDispatchCapacity(layout, state, station.id)).toBe(false);

    state = {
      ...state,
      tasks: [
        {
          taskId: "task_queue_point",
          taskType: "PICK_ORDER",
          rackId: layout.racks[0].id,
          stationId: station.id,
          robotId: state.robots[0].robotId,
          priority: 1,
          status: "ASSIGNED",
          createdAtSec: 0,
          assignedAtSec: 0,
          queuePointId: point.queuePointId,
          queuePointCell: point.cell
        }
      ],
      robots: state.robots.map((robot, index) =>
        index === 0
          ? {
              ...robot,
              state: "MOVING_LOADED",
              assignedTaskId: "task_queue_point",
              currentCell: point.cell,
              pose: { x: point.cell.col + 0.5, y: point.cell.row + 0.5, yawDeg: 0 }
            }
          : robot
      )
    };

    const synced = syncQueuePointStates(layout, state);
    expect(synced.queuePointStates[point.queuePointId].occupiedRobotId).toBe(state.robots[0].robotId);
    expect(synced.queuePointStates[point.queuePointId].occupiedTaskId).toBe("task_queue_point");
  });

  it("releases pre-point reservations when station service starts or task ends", () => {
    const layout = generateSmallDemoLayout();
    const point = layout.queuePoints[0];
    let state = initializeSimulation(layout, defaultSimulationConfig);
    state = reserveQueuePoint(state, point.queuePointId, "robot_001", "task_001");
    state = releaseQueuePoint(state, point.queuePointId, "robot_001", "task_001");
    expect(state.queuePointStates[point.queuePointId].reservedRobotIds).toHaveLength(0);
    expect(state.queuePointStates[point.queuePointId].reservedTaskIds).toHaveLength(0);
  });

  it("does not admit a robot into an occupied station service cell from a pre-point", () => {
    const layout = generateSmallDemoLayout();
    const station = layout.stations[0];
    const point = queuePointsForStation(layout, station)[0];
    let state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    state = {
      ...state,
      tasks: [
        {
          taskId: "queued",
          taskType: "PICK_ORDER" as const,
          rackId: layout.racks[1].id,
          stationId: station.id,
          robotId: "robot_002",
          priority: 1,
          status: "ASSIGNED" as const,
          createdAtSec: 0,
          assignedAtSec: 0,
          queuePointId: point.queuePointId,
          queuePointCell: point.cell
        }
      ],
      stationStates: {
        ...state.stationStates,
        [station.id]: { ...state.stationStates[station.id], activeRobotId: "robot_001", completedServiceCount: 0 }
      },
      robots: state.robots.map((robot, index) =>
        index === 0
          ? { ...robot, robotId: "robot_001", state: "SERVICING_AT_STATION" as const, currentCell: station.cell, pose: { x: station.cell.col + 0.5, y: station.cell.row + 0.5, yawDeg: 0 } }
          : { ...robot, robotId: "robot_002", state: "MOVING_LOADED" as const, assignedTaskId: "queued", currentCell: point.cell, pose: { x: point.cell.col + 0.5, y: point.cell.row + 0.5, yawDeg: 0 }, currentPath: [point.cell, station.cell], routeIndex: 0, segmentProgressM: 0, routePhase: "TO_STATION" as const }
      )
    };

    const gated = applyTrafficMoveGate(layout, syncQueuePointStates(layout, state), { ...defaultSimulationConfig, collisionCheckingEnabled: true }, 1).state;
    const queued = gated.robots.find((robot) => robot.robotId === "robot_002")!;
    expect(cellKey(queued.currentCell)).toBe(cellKey(point.cell));
    expect(queued.waitingReason).toContain("Waiting at queue head");
  });
});

