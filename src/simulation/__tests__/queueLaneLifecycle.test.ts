import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../../generators/proceduralGenerator";
import { defaultSimulationConfig } from "../../models/simulation";
import { advanceQueueLaneRobots, createQueueLaneStates, queueLaneUsedSlots, reserveQueueLaneSlot, reserveQueueLaneSlotWithCell, syncQueueLaneStates } from "../lifecycle/queueLaneLifecycle";
import { initializeSimulation } from "../simulationEngine";
import { cellKey } from "../../utils/gridMath";

describe("queue lane lifecycle", () => {
  it("tracks reservations and live occupancy in one queue-lane runtime state", () => {
    const layout = generateSmallDemoLayout();
    const station = layout.stations.find((item) => item.queueLaneIds.length > 0)!;
    const lane = layout.queueLanes.find((item) => item.queueLaneId === station.queueLaneIds[0])!;
    const head = lane.headCell;
    let state = initializeSimulation(layout, defaultSimulationConfig);
    state = { ...state, queueLaneStates: createQueueLaneStates(layout) };
    state.tasks = [
      {
        taskId: "task_queue",
        taskType: "PICK_ORDER",
        rackId: layout.racks[0].id,
        stationId: station.id,
        robotId: state.robots[0].robotId,
        priority: 1,
        status: "ASSIGNED",
        createdAtSec: 0,
        assignedAtSec: 0,
        queueLaneId: lane.queueLaneId
      }
    ];
    state = reserveQueueLaneSlot(state, lane.queueLaneId, state.robots[0].robotId, "task_queue");
    expect(queueLaneUsedSlots(state.queueLaneStates[lane.queueLaneId])).toBe(1);

    state.robots = state.robots.map((robot, index) =>
      index === 0
        ? {
            ...robot,
            state: "MOVING_LOADED",
            assignedTaskId: "task_queue",
            currentCell: head,
            pose: { x: head.col + 0.5, y: head.row + 0.5, yawDeg: 0 }
          }
        : robot
    );

    const synced = syncQueueLaneStates(layout, state);
    const laneState = synced.queueLaneStates[lane.queueLaneId];
    expect(laneState.reservedTaskIds).toHaveLength(0);
    expect(laneState.activeHeadRobotId).toBe(state.robots[0].robotId);
    expect(laneState.occupiedCells.find((cell) => cellKey(cell.cell) === cellKey(head))?.robotId).toBe(state.robots[0].robotId);
  });

  it("reserves only the physical queue entry cell for dispatch", () => {
    const layout = generateSmallDemoLayout();
    const lane = layout.queueLanes[0];
    let state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 3 });
    state.tasks = [0, 1, 2].map((index) => ({
      taskId: `task_${index}`,
      taskType: "PICK_ORDER" as const,
      rackId: layout.racks[index].id,
      stationId: lane.stationId,
      robotId: state.robots[index].robotId,
      priority: 1,
      status: "ASSIGNED" as const,
      createdAtSec: 0,
      assignedAtSec: 0,
      queueLaneId: lane.queueLaneId
    }));

    const first = reserveQueueLaneSlotWithCell(state, lane.queueLaneId, state.robots[0].robotId, "task_0");
    state = first.state;
    const second = reserveQueueLaneSlotWithCell(state, lane.queueLaneId, state.robots[1].robotId, "task_1");

    expect(first.cell?.queueIndex).toBe(0);
    expect(second.cell).toBeUndefined();
    expect(queueLaneUsedSlots(state.queueLaneStates[lane.queueLaneId])).toBe(1);
  });

  it("does not admit a queue-head robot into an occupied station cell", () => {
    const layout = generateSmallDemoLayout();
    const station = layout.stations.find((item) => item.queueLaneIds.length > 0)!;
    const lane = layout.queueLanes.find((item) => item.queueLaneId === station.queueLaneIds[0])!;
    const head = lane.headCell;
    let state = initializeSimulation(layout, { ...defaultSimulationConfig, robotCount: 2 });
    state = {
      ...state,
      tasks: [
        {
          taskId: "queued",
          taskType: "PICK_ORDER" as const,
          rackId: layout.racks[0].id,
          stationId: station.id,
          robotId: "robot_002",
          priority: 1,
          status: "ASSIGNED" as const,
          createdAtSec: 0,
          assignedAtSec: 0,
          queueLaneId: lane.queueLaneId
        }
      ],
      stationStates: {
        ...state.stationStates,
        [station.id]: { ...state.stationStates[station.id], activeRobotId: "robot_001", completedServiceCount: 0 }
      },
      robots: state.robots.map((robot, index) =>
        index === 0
          ? { ...robot, robotId: "robot_001", state: "SERVICING_AT_STATION" as const, currentCell: station.cell, pose: { x: station.cell.col + 0.5, y: station.cell.row + 0.5, yawDeg: 0 } }
          : { ...robot, robotId: "robot_002", state: "QUEUING_AT_STATION" as const, assignedTaskId: "queued", currentCell: head, pose: { x: head.col + 0.5, y: head.row + 0.5, yawDeg: 0 }, currentPath: [] }
      )
    };

    const result = advanceQueueLaneRobots(layout, syncQueueLaneStates(layout, state), "#16a34a").state;
    const queued = result.robots.find((robot) => robot.robotId === "robot_002")!;
    expect(queued.state).toBe("QUEUING_AT_STATION");
    expect(cellKey(queued.currentCell)).toBe(cellKey(head));
    expect(queued.waitingReason).toContain("Waiting at queue head");
  });
});
