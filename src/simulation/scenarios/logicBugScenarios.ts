import { generateSmallDemoLayout } from "../../generators/proceduralGenerator";
import type { SimulationConfig, SimulationState } from "../../models/simulation";
import { defaultSimulationConfig } from "../../models/simulation";
import { generateOperationalSimulationWork, initializeSimulation, stepSimulation } from "../simulationEngine";
import { getRackRuntimeRenderState } from "../rackRuntimeView";
import { cellKey } from "../../utils/gridMath";

export type LogicBugScenarioId =
  | "multi_robot_single_station_queue"
  | "nearest_available_storage_relocation"
  | "return_home_storage"
  | "station_queue_semantics"
  | "pod_service_cell_semantics";

export interface LogicBugScenarioResult {
  scenarioId: LogicBugScenarioId;
  state: SimulationState;
  activeRobotCount: number;
  maxQueueLaneLoad: number;
  completedTaskCount: number;
  rackRuntimeMatchesVisual: boolean;
}

function applyGeneratedWork(state: SimulationState, work: ReturnType<typeof generateOperationalSimulationWork>): SimulationState {
  return {
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
}

export function runLogicBugScenario(
  scenarioId: LogicBugScenarioId,
  overrides: Partial<SimulationConfig> = {},
  maxSteps = 120
): LogicBugScenarioResult {
  const layout = generateSmallDemoLayout();
  const config: SimulationConfig = {
    ...defaultSimulationConfig,
    robotCount: 4,
    taskCount: scenarioId === "multi_robot_single_station_queue" ? 6 : 1,
    unloadedSpeedMps: 30,
    loadedSpeedMps: 30,
    liftTimeSec: 0.1,
    dropTimeSec: 0.1,
    stationServiceTimeSec: 0.2,
    collisionCheckingEnabled: false,
    deadlockDetectionEnabled: false,
    rackStorageStrategy: scenarioId === "return_home_storage" ? "return_home" : "nearest_available_storage",
    ...overrides
  };
  let state = initializeSimulation(layout, config);
  state = applyGeneratedWork(state, generateOperationalSimulationWork(layout, state, config));
  for (let step = 0; step < maxSteps && (scenarioId === "multi_robot_single_station_queue" ? step < 3 : state.completedTasks.length === 0); step += 1) {
    state = stepSimulation(layout, state, config, 1);
  }

  const activeRobotCount = state.robots.filter((robot) => !["IDLE", "PARKING", "CHARGING"].includes(robot.state)).length;
  const maxQueueLaneLoad = Math.max(
    0,
    ...Object.values(state.queueLaneStates).map((lane) => lane.reservedTaskIds.length + lane.occupiedCells.filter((cell) => cell.robotId).length)
  );
  const rackRuntimeMatchesVisual = state.completedTasks.every((task) => {
    const rack = layout.racks.find((item) => item.id === task.rackId);
    const rackState = state.rackStates[task.rackId];
    if (!rack || !rackState) return false;
    const visual = getRackRuntimeRenderState(layout, state, rack);
    return !visual.hidden && cellKey(visual.cell) === cellKey(rackState.currentCell);
  });
  return {
    scenarioId,
    state,
    activeRobotCount,
    maxQueueLaneLoad,
    completedTaskCount: state.completedTasks.length,
    rackRuntimeMatchesVisual
  };
}

