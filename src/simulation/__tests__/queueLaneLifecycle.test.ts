import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../../generators/proceduralGenerator";
import { defaultSimulationConfig } from "../../models/simulation";
import { createQueueLaneStates, queueLaneUsedSlots, reserveQueueLaneSlot, syncQueueLaneStates } from "../lifecycle/queueLaneLifecycle";
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
});
