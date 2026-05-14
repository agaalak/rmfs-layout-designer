import { generateProceduralLayout, smallDemoGenerationParams } from "../../generators/proceduralGenerator";
import type { SimulationConfig, SimulationState } from "../../models/simulation";
import { defaultSimulationConfig } from "../../models/simulation";
import { initializeSimulation, stepSimulation } from "../simulationEngine";
import { detectRuntimeCollisions } from "../collisionRuntime";

export type CollisionScenarioId =
  | "two_robots_same_intersection"
  | "edge_swap_single_lane"
  | "loaded_2x2_rack_narrow_aisle"
  | "rotation_zone_capacity_conflict"
  | "station_queue_full"
  | "deadlock_corridor";

export interface CollisionScenarioResult {
  scenarioId: CollisionScenarioId;
  state: SimulationState;
  runtimeCollisionCount: number;
  collisionPreventionCount: number;
  eventMessages: string[];
}

export function makeCollisionScenarioLayout() {
  return generateProceduralLayout({
    ...smallDemoGenerationParams,
    rows: 12,
    columns: 16,
    stationCount: 1,
    chargerCount: 1,
    parkingSpotCount: 2,
    rotationZoneCount: 1,
    rackFillRatio: 0.15
  });
}

export function runCollisionScenario(
  scenarioId: CollisionScenarioId,
  config: Partial<SimulationConfig> = {}
): CollisionScenarioResult {
  const layout = makeCollisionScenarioLayout();
  const simulationConfig = { ...defaultSimulationConfig, ...config, robotCount: Math.max(2, config.robotCount ?? 2), taskCount: Math.max(1, config.taskCount ?? 1) };
  let state = initializeSimulation(layout, simulationConfig);
  if (scenarioId === "two_robots_same_intersection" && state.robots.length >= 2) {
    state.robots[0] = { ...state.robots[0], state: "MOVING_EMPTY", currentCell: { row: 0, col: 1 }, currentPath: [{ row: 0, col: 1 }, { row: 0, col: 2 }], routeIndex: 0 };
    state.robots[1] = { ...state.robots[1], state: "MOVING_EMPTY", currentCell: { row: 0, col: 3 }, currentPath: [{ row: 0, col: 3 }, { row: 0, col: 2 }], routeIndex: 0 };
  }
  if (scenarioId === "edge_swap_single_lane" && state.robots.length >= 2) {
    state.robots[0] = { ...state.robots[0], state: "MOVING_EMPTY", currentCell: { row: 0, col: 1 }, currentPath: [{ row: 0, col: 1 }, { row: 0, col: 2 }], routeIndex: 0 };
    state.robots[1] = { ...state.robots[1], state: "MOVING_EMPTY", currentCell: { row: 0, col: 2 }, currentPath: [{ row: 0, col: 2 }, { row: 0, col: 1 }], routeIndex: 0 };
  }
  state = stepSimulation(layout, state, { ...simulationConfig, unloadedSpeedMps: 100, loadedSpeedMps: 100 }, 1);
  return {
    scenarioId,
    state,
    runtimeCollisionCount: detectRuntimeCollisions(layout, undefined, state).length,
    collisionPreventionCount: state.trafficDiagnostics.runtimeCollisionPreventionCount,
    eventMessages: state.eventLog.map((event) => event.message)
  };
}
