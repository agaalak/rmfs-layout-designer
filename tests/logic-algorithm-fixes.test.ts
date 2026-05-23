import { describe, expect, it } from "vitest";
import { generateSmallDemoLayout } from "../src/generators/proceduralGenerator";
import { defaultSimulationConfig, type SimulationConfig } from "../src/models/simulation";
import { getRackRuntimeRenderState } from "../src/simulation/rackRuntimeView";
import { selectStorageDestination } from "../src/simulation/controllers/rackStorageController";
import { runLogicBugScenario } from "../src/simulation/scenarios/logicBugScenarios";
import { generateOperationalSimulationWork, initializeSimulation, stepSimulation } from "../src/simulation/simulationEngine";
import { applyCollisionGuard } from "../src/simulation/collisionRuntime";
import { cellKey } from "../src/utils/gridMath";
import { queuePointsForStation } from "../src/utils/queuePoints";

const fastConfig: SimulationConfig = {
  ...defaultSimulationConfig,
  robotCount: 4,
  taskCount: 6,
  unloadedSpeedMps: 30,
  loadedSpeedMps: 30,
  liftTimeSec: 0.1,
  dropTimeSec: 0.1,
  stationServiceTimeSec: 0.2,
  collisionCheckingEnabled: false,
  deadlockDetectionEnabled: false,
  stationAssignmentStrategy: "shortest_queue",
  reservationTimeStepSec: 1
};

function applyWork(layout = generateSmallDemoLayout(), config = fastConfig) {
  let state = initializeSimulation(layout, config);
  const work = generateOperationalSimulationWork(layout, state, config);
  state = {
    ...state,
    orders: work.orders,
    failedOrders: work.failedOrders,
    tasks: work.tasks,
    operationalTasks: work.operationalTasks,
    inventory: work.inventory,
    rackStates: work.rackStates,
    storageLocationStates: work.storageLocationStates,
    eventLog: work.eventLog
  };
  return { layout, state, work };
}

function withExtraEmptyStorage() {
  const layout = generateSmallDemoLayout();
  const station = layout.stations[0];
  const rack = layout.racks[0];
  const occupied = new Set(layout.racks.map((item) => cellKey(item.homeCell)));
  const candidate =
    layout.cells
      .filter((cell) => cell.cellType === "ROAD" && !occupied.has(cellKey(cell)))
      .sort((a, b) => Math.abs(a.row - station.cell.row) + Math.abs(a.col - station.cell.col) - (Math.abs(b.row - station.cell.row) + Math.abs(b.col - station.cell.col)))[0] ??
    { row: Math.max(1, station.cell.row - 1), col: station.cell.col };
  layout.cells = layout.cells.map((cell) => (cellKey(cell) === cellKey(candidate) ? { ...cell, cellType: "RACK_STORAGE" as const } : cell));
  layout.storageLocations.push({
    storageLocationId: "storage_extra_near_station",
    cells: [candidate],
    podServiceCell: candidate,
    allowedRackTypes: [rack.rackTypeId],
    defaultRackOrientationDeg: rack.currentOrientationDeg,
    approachWaypointIds: [],
    status: "EMPTY"
  });
  return layout;
}

describe("logic and algorithm bug fixes", () => {
  it("dispatches multiple robots instead of serializing all work behind one active station task", () => {
    const { layout, state } = applyWork();
    let next = state;
    for (let index = 0; index < 80 && next.robots.filter((robot) => robot.assignedTaskId).length <= 1; index += 1) {
      next = stepSimulation(layout, next, fastConfig, 0.5);
    }
    const assignedRobots = next.robots.filter((robot) => robot.assignedTaskId);
    expect(assignedRobots.length).toBeGreaterThan(1);
    expect(next.eventLog.filter((event) => event.message.includes("assigned to robot_")).length).toBeGreaterThan(1);
  });

  it("tracks queue pre-point reservations without duplicate owners", () => {
    const { layout, state } = applyWork();
    const next = stepSimulation(layout, state, fastConfig, 0.2);
    const pointLoads = Object.values(next.queuePointStates).map((point) => point.reservedTaskIds.length + (point.occupiedRobotId ? 1 : 0));
    expect(Math.max(...pointLoads)).toBeGreaterThan(0);
    const reservedCells = Object.entries(next.queuePointStates).flatMap(([pointId, point]) => point.reservedTaskIds.map((taskId) => `${pointId}:${taskId}`));
    expect(new Set(reservedCells).size).toBe(reservedCells.length);
  });

  it("scenario runner confirms multi-robot queue dispatch", () => {
    const result = runLogicBugScenario("multi_robot_single_station_queue");
    expect(result.activeRobotCount).toBeGreaterThan(1);
    expect(result.maxQueueLaneLoad).toBeGreaterThan(0);
  });

  it("nearest_available_storage selects an empty destination by pod service cell route", () => {
    const layout = withExtraEmptyStorage();
    const state = initializeSimulation(layout, { ...fastConfig, rackStorageStrategy: "nearest_available_storage", taskCount: 1 });
    const rack = layout.racks[0];
    const destination = selectStorageDestination(layout, rack, state.storageLocationStates, "nearest_available_storage", layout.stations[0].cell);
    expect(destination?.storageLocationId).toBeTruthy();
    expect(destination?.storageLocationId).not.toBe(rack.currentStorageLocationId ?? rack.homeStorageLocationId);
    expect(destination?.podServiceCell).toBeTruthy();
  });

  it("runtime rack render position follows nearest-available storage after drop", () => {
    const config = { ...fastConfig, taskCount: 1, rackStorageStrategy: "nearest_available_storage" as const };
    const { layout, state: initial, work } = applyWork(withExtraEmptyStorage(), config);
    const task = work.tasks[0];
    expect(task.destinationStorageLocationId).not.toBe(task.sourceStorageLocationId);
    let state = initial;
    for (let index = 0; index < 120 && state.completedTasks.length === 0; index += 1) {
      state = stepSimulation(layout, state, config, 1);
    }
    expect(state.completedTasks).toHaveLength(1);
    const rack = layout.racks.find((item) => item.id === task.rackId)!;
    const destination = layout.storageLocations.find((location) => location.storageLocationId === task.destinationStorageLocationId)!;
    expect(state.rackStates[rack.id].currentStorageLocationId).toBe(destination.storageLocationId);
    expect(cellKey(state.rackStates[rack.id].currentCell)).toBe(cellKey(destination.podServiceCell));
    const visual = getRackRuntimeRenderState(layout, state, rack);
    expect(visual.hidden).toBe(false);
    expect(cellKey(visual.cell)).toBe(cellKey(destination.podServiceCell));
    expect(rack.homeStorageLocationId).toBe(task.sourceStorageLocationId);
  });

  it("scenario runner confirms runtime rack visual state matches rack state", () => {
    const result = runLogicBugScenario("nearest_available_storage_relocation");
    expect(result.completedTaskCount).toBe(1);
    expect(result.rackRuntimeMatchesVisual).toBe(true);
  });

  it("holds a loaded robot at queue head while the station service cell is occupied", () => {
    const layout = generateSmallDemoLayout();
    let state = initializeSimulation(layout, { ...fastConfig, collisionCheckingEnabled: true });
    const station = layout.stations[0];
    const point = queuePointsForStation(layout, station)[0];
    const head = point.cell;
    const task = {
      taskId: "task_wait_for_station",
      taskType: "PICK_ORDER" as const,
      rackId: layout.racks[1].id,
      stationId: station.id,
      robotId: "robot_002",
      priority: 1,
      status: "ASSIGNED" as const,
      createdAtSec: 0,
      assignedAtSec: 0,
      queuePointId: point.queuePointId,
      queuePointCell: point.cell,
      sourceStorageLocationId: layout.racks[1].currentStorageLocationId,
      destinationStorageLocationId: layout.racks[1].homeStorageLocationId,
      routePlan: {
        emptyPathToRack: [],
        loadedPathToStation: [head, station.cell],
        returnPath: []
      }
    };
    state = {
      ...state,
      tasks: [task],
      stationQueues: state.stationQueues.map((queue) => (queue.stationId === station.id ? { ...queue, activeRobotId: "robot_001", serviceEndTimeSec: 100 } : queue)),
      stationStates: {
        ...state.stationStates,
        [station.id]: { ...state.stationStates[station.id], activeRobotId: "robot_001", serviceEndTimeSec: 100, completedServiceCount: 0 }
      },
      robots: state.robots.map((robot, index) =>
        index === 0
          ? { ...robot, robotId: "robot_001", state: "SERVICING_AT_STATION", currentCell: station.cell, pose: { x: station.cell.col + 0.5, y: station.cell.row + 0.5, yawDeg: 0 }, carryingRackId: layout.racks[0].id, assignedTaskId: "servicing_task", currentPath: [] }
          : index === 1
            ? { ...robot, robotId: "robot_002", state: "MOVING_LOADED", currentCell: head, pose: { x: head.col + 0.5, y: head.row + 0.5, yawDeg: 180 }, carryingRackId: layout.racks[1].id, assignedTaskId: task.taskId, currentPath: [head, station.cell], routeIndex: 0, segmentProgressM: 0, pathProgress: 0, routePhase: "TO_STATION" }
            : robot
      )
    };

    const next = stepSimulation(layout, state, { ...fastConfig, collisionCheckingEnabled: true }, 1);
    const waitingRobot = next.robots.find((robot) => robot.robotId === "robot_002")!;
    expect(cellKey(waitingRobot.currentCell)).toBe(cellKey(head));
    expect(waitingRobot.pose.y).toBe(head.row + 0.5);
    expect(waitingRobot.waitingReason).toContain("Waiting at queue head");
  });

  it("does not stack two robots on the same queue-head cell while a station is busy", () => {
    const config = { ...fastConfig, collisionCheckingEnabled: true, stationServiceTimeSec: 10 };
    const { layout, state: initial } = applyWork(generateSmallDemoLayout(), config);
    let state = initial;
    for (let index = 0; index < 12; index += 1) {
      state = stepSimulation(layout, state, config, 0.2);
      const queueRobotCells = state.robots
        .filter((robot) => robot.state === "QUEUING_AT_STATION")
        .map((robot) => cellKey(robot.currentCell));
      expect(new Set(queueRobotCells).size).toBe(queueRobotCells.length);
    }
  });

  it("collision guard rolls unsafe movement back to the safe cell center", () => {
    const layout = generateSmallDemoLayout();
    let previous = initializeSimulation(layout, { ...fastConfig, collisionCheckingEnabled: true });
    previous = {
      ...previous,
      robots: previous.robots.map((robot, index) =>
        index === 0
          ? { ...robot, robotId: "robot_001", currentCell: { row: 5, col: 5 }, pose: { x: 5.5, y: 5.5, yawDeg: 0 }, state: "SERVICING_AT_STATION" }
          : index === 1
            ? { ...robot, robotId: "robot_002", currentCell: { row: 4, col: 5 }, pose: { x: 5.5, y: 5.95, yawDeg: 180 }, state: "MOVING_LOADED", currentPath: [{ row: 4, col: 5 }, { row: 5, col: 5 }], routeIndex: 0, segmentProgressM: 0.9, pathProgress: 0.9 }
            : robot
      )
    };
    const proposed = {
      ...previous,
      robots: previous.robots.map((robot) => (robot.robotId === "robot_002" ? { ...robot, currentCell: { row: 5, col: 5 }, pose: { x: 5.5, y: 5.5, yawDeg: 180 }, routeIndex: 1, segmentProgressM: 0, pathProgress: 1 } : robot))
    };

    const guarded = applyCollisionGuard(layout, previous, proposed, { ...fastConfig, collisionCheckingEnabled: true });
    const rolledBack = guarded.robots.find((robot) => robot.robotId === "robot_002")!;
    expect(cellKey(rolledBack.currentCell)).toBe("4:5");
    expect(rolledBack.pose.x).toBe(5.5);
    expect(rolledBack.pose.y).toBe(4.5);
    expect(guarded.trafficDiagnostics.runtimeCollisionPreventionCount).toBeGreaterThan(0);
  });
});
