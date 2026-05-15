import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Robot } from "../models/robot";
import type { SimulationConfig, SimulationState } from "../models/simulation";
import type { SimulationRoutePlan, SimulationTask } from "../models/task";
import { cellKey } from "../utils/gridMath";
import { getLoadedRobotEnvelopeAtCell, envelopeOverlapsBlockedCells, envelopeOverlapsStaticRacks } from "./collisionEnvelope";
import { addWaitSteps, explainConflict, reserveEnvelopePath, type ReservationConflict } from "./reservationTable";

function concatPaths(paths: GridCell[][]) {
  const result: GridCell[] = [];
  for (const path of paths) {
    for (const cell of path) {
      if (result.length === 0 || cellKey(result.at(-1)!) !== cellKey(cell)) result.push(cell);
    }
  }
  return result;
}

function routePath(route: SimulationRoutePlan) {
  return concatPaths([
    route.emptyPathToRack,
    route.pathToPreStationRotationCell ?? [],
    route.loadedPathToStation,
    route.pathToPostStationRotationCell ?? [],
    route.returnPath
  ]);
}

function loadedStartIndex(route: SimulationRoutePlan, waitSteps: number) {
  return Math.max(0, route.emptyPathToRack.length - 1 + waitSteps);
}

function staticEnvelopeConflict(
  layout: WarehouseLayout,
  state: SimulationState,
  robot: Robot,
  task: SimulationTask,
  path: GridCell[],
  startLoadedIndex: number
): ReservationConflict | undefined {
  const rack = layout.racks.find((item) => item.id === task.rackId);
  if (!rack) return undefined;
  const targetOrientation = task.requiredStationOrientationDeg ?? state.rackStates[rack.id]?.currentOrientationDeg ?? rack.currentOrientationDeg;
  for (let index = startLoadedIndex; index < path.length; index += 1) {
    const envelope = getLoadedRobotEnvelopeAtCell(layout, robot, rack, path[index], targetOrientation);
    const blocked = envelopeOverlapsBlockedCells(layout, envelope);
    if (blocked.length > 0) {
      return {
        type: "envelope",
        timeStep: index,
        robotId: robot.robotId,
        taskId: task.taskId,
        cell: blocked[0],
        cells: envelope.occupiedCells,
        message: `Loaded rack envelope for ${robot.robotId} would overlap blocked cell ${blocked[0].row},${blocked[0].col}.`
      };
    }
    const rackOverlap = envelopeOverlapsStaticRacks(layout, state, envelope, task.rackId);
    if (rackOverlap.length > 0) {
      return {
        type: "envelope",
        timeStep: index,
        robotId: robot.robotId,
        taskId: task.taskId,
        cell: rackOverlap[0].cell,
        cells: envelope.occupiedCells,
        message: `Loaded rack envelope for ${robot.robotId} would overlap stored rack ${rackOverlap[0].rackId}.`
      };
    }
  }
  return undefined;
}

export interface TrafficReservationResult {
  path: GridCell[];
  table: SimulationState["reservationTable"];
  waitSteps: number;
  replanAttempts: number;
  conflict?: ReservationConflict;
  blocked: boolean;
  explanation?: string;
}

export function reserveTaskRouteWithTrafficPolicy(
  layout: WarehouseLayout,
  state: SimulationState,
  robot: Robot,
  task: SimulationTask,
  route: SimulationRoutePlan,
  config: SimulationConfig
): TrafficReservationResult {
  const fullPath = routePath(route);
  if (!config.collisionCheckingEnabled) {
    return { path: route.emptyPathToRack, table: state.reservationTable, waitSteps: 0, replanAttempts: 0, blocked: false };
  }

  const rack = layout.racks.find((item) => item.id === task.rackId);
  const maxWaitSteps = Math.max(0, Math.ceil(config.maxWaitBeforeReplanSec / Math.max(0.1, config.reservationTimeStepSec)));
  const maxAttempts = Math.max(1, config.maxReplanAttempts + 1);
  let lastConflict: ReservationConflict | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    for (let wait = 0; wait <= maxWaitSteps; wait += 1) {
      const candidate = addWaitSteps(fullPath, wait + attempt * maxWaitSteps);
      const startLoadedIndex = loadedStartIndex(route, wait + attempt * maxWaitSteps);
      const staticConflict = staticEnvelopeConflict(layout, state, robot, task, candidate, startLoadedIndex);
      if (staticConflict) {
        lastConflict = staticConflict;
        break;
      }
      const targetOrientation = rack
        ? task.requiredStationOrientationDeg ?? state.rackStates[rack.id]?.currentOrientationDeg ?? rack.currentOrientationDeg
        : undefined;
      const result = reserveEnvelopePath(
        state.reservationTable,
        robot.robotId,
        task.taskId,
        candidate,
        state.simTimeSec,
        robot.speedUnloadedMps,
        (cell, index) => {
          if (!rack || index < startLoadedIndex) return [cell];
          return getLoadedRobotEnvelopeAtCell(layout, robot, rack, cell, targetOrientation).occupiedCells;
        }
      );
      if (!result.conflict) {
        const waitSteps = wait + attempt * maxWaitSteps;
        return {
          path: addWaitSteps(route.emptyPathToRack, waitSteps),
          table: result.table,
          waitSteps,
          replanAttempts: attempt,
          blocked: false
        };
      }
      lastConflict = result.conflict;
    }
  }

  return {
    path: route.emptyPathToRack,
    table: state.reservationTable,
    waitSteps: maxWaitSteps,
    replanAttempts: config.maxReplanAttempts,
    conflict: lastConflict,
    blocked: true,
    explanation: lastConflict ? explainConflict(lastConflict) : "No safe reserved route could be found within the reservation horizon."
  };
}
