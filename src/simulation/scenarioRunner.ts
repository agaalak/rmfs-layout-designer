import type { WarehouseLayout } from "../models/layout";
import { defaultSimulationConfig, type SimulationConfig, type SimulationState } from "../models/simulation";
import { generateOperationalSimulationWork, initializeSimulation, stepSimulation } from "./simulationEngine";

export interface SimulationScenarioConfig {
  scenarioId: string;
  seed?: number;
  robotCount: number;
  orderCount: number;
  maxSimTimeSec: number;
  stopWhenAllOrdersComplete: boolean;
  expectedMinCompletedOrders?: number;
  expectedMaxFailedOrders?: number;
  simulationConfig?: Partial<SimulationConfig>;
}

export interface SimulationScenarioResult {
  scenarioId: string;
  completedOrders: number;
  failedOrders: number;
  completedTasks: number;
  failedTasks: number;
  averageCycleTimeSec: number;
  throughputPerHour: number;
  conflictCount: number;
  deadlockCount: number;
  replanCount: number;
  eventLog: SimulationState["eventLog"];
  finalSimulationState: SimulationState;
}

function scenarioConfig(config: SimulationScenarioConfig): SimulationConfig {
  return {
    ...defaultSimulationConfig,
    ...config.simulationConfig,
    robotCount: config.robotCount,
    taskCount: config.orderCount
  };
}

function seedNote(seed?: number) {
  return seed === undefined ? "" : ` Seed ${seed}.`;
}

export function runScenarioUntil(
  layout: WarehouseLayout,
  scenario: SimulationScenarioConfig,
  predicate: (state: SimulationState) => boolean
): SimulationScenarioResult {
  const config = scenarioConfig(scenario);
  let state = initializeSimulation(layout, config);
  state.eventLog = [
    ...state.eventLog,
    {
      timeSec: state.simTimeSec,
      severity: "info",
      entityType: "controller",
      entityId: scenario.scenarioId,
      message: `Scenario ${scenario.scenarioId} initialized.${seedNote(scenario.seed)}`
    }
  ];
  const work = generateOperationalSimulationWork(layout, state, config);
  state = {
    ...state,
    orders: [...state.orders, ...work.orders.filter((order) => order.status !== "FAILED")],
    failedOrders: [...state.failedOrders, ...work.failedOrders],
    operationalTasks: [...state.operationalTasks, ...work.operationalTasks],
    inventory: work.inventory,
    rackStates: work.rackStates,
    storageLocationStates: work.storageLocationStates,
    tasks: [...state.tasks, ...work.tasks],
    eventLog: work.eventLog
  };

  const stepSec = 1;
  while (state.simTimeSec < scenario.maxSimTimeSec && !predicate(state)) {
    state = stepSimulation(layout, state, config, stepSec);
    if (scenario.stopWhenAllOrdersComplete && state.orders.length === 0 && state.tasks.length === 0) break;
  }
  return summarizeScenarioResult(scenario.scenarioId, state);
}

export function runScenario(layout: WarehouseLayout, scenario: SimulationScenarioConfig): SimulationScenarioResult {
  return runScenarioUntil(layout, scenario, (state) => {
    if (scenario.stopWhenAllOrdersComplete && state.orders.length === 0 && state.tasks.length === 0) return true;
    return false;
  });
}

export function summarizeScenarioResult(scenarioId: string, state: SimulationState): SimulationScenarioResult {
  return {
    scenarioId,
    completedOrders: state.completedOrders.length,
    failedOrders: state.failedOrders.length,
    completedTasks: state.completedTasks.length,
    failedTasks: state.failedTasks.length,
    averageCycleTimeSec: state.metrics.averageTaskCycleTimeSec,
    throughputPerHour: state.metrics.estimatedThroughputPerHour,
    conflictCount: state.metrics.reservationConflictCount,
    deadlockCount: state.metrics.deadlockCount,
    replanCount: state.metrics.replanCount,
    eventLog: state.eventLog,
    finalSimulationState: state
  };
}
