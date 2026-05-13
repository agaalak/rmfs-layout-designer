import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Robot, RobotState } from "../models/robot";
import {
  defaultSimulationConfig,
  emptySimulationMetrics,
  type SimulationConfig,
  type SimulationEvent,
  type SimulationMetrics,
  type SimulationState,
  type StationQueue
} from "../models/simulation";
import type { SimulationRoutePlan, SimulationTask } from "../models/task";
import { buildRoadGraph, rackApproachNodes } from "../graph/graphBuilder";
import { validateLayout } from "../validation/validateLayout";
import { cellKey, manhattanMeters, parseCellKey } from "../utils/gridMath";
import { rackOccupiedCells } from "../utils/rackFootprint";
import { findNearestRotationZonePath, findPathToNearestRackApproach, findPathToStationQueue, nearestCompatibleStation } from "./pathPlanner";
import { addWaitSteps, createReservationTable, reservePath } from "./reservationTable";

const robotColors: Record<RobotState, string> = {
  IDLE: "#64748b",
  ASSIGNED: "#38bdf8",
  MOVING_EMPTY: "#2563eb",
  LIFTING_RACK: "#0f766e",
  MOVING_LOADED: "#16a34a",
  QUEUING_AT_STATION: "#f97316",
  SERVICING_AT_STATION: "#ea580c",
  ROTATING_WITH_RACK: "#f43f5e",
  DROPPING_RACK: "#0f766e",
  RETURNING_RACK: "#15803d",
  PARKING: "#64748b",
  CHARGING: "#8b5cf6",
  BLOCKED: "#ef4444",
  ERROR: "#b91c1c"
};

function poseForCell(cell: GridCell) {
  return { x: cell.col + 0.5, y: cell.row + 0.5, yawDeg: 0 };
}

function yawBetween(from: GridCell, to: GridCell) {
  if (to.col > from.col) return 90;
  if (to.col < from.col) return 270;
  if (to.row > from.row) return 180;
  return 0;
}

function log(eventLog: SimulationEvent[], event: SimulationEvent): SimulationEvent[] {
  return [...eventLog, event].slice(-500);
}

export function validateSimulationStart(layout: WarehouseLayout): string[] {
  const issues: string[] = [];
  const validation = validateLayout(layout);
  if (!validation.isValid) issues.push("Layout validation must pass before simulation starts.");
  if (layout.racks.length === 0) issues.push("Simulation requires at least one rack.");
  if (layout.stations.length === 0) issues.push("Simulation requires at least one station.");
  if (layout.cells.filter((cell) => ["ROAD", "QUEUE", "STATION", "CHARGING", "PARKING", "ROTATION"].includes(cell.cellType)).length === 0) {
    issues.push("Simulation requires at least one traversable graph cell.");
  }
  const spawnCells = getRobotSpawnCells(layout, 1);
  if (spawnCells.length === 0) issues.push("Simulation requires at least one parking, charging, or perimeter road spawn location.");
  return issues;
}

export function getRobotSpawnCells(layout: WarehouseLayout, count: number): GridCell[] {
  const graph = buildRoadGraph(layout);
  const parking = layout.parkingSpots.map((parkingSpot) => parkingSpot.cell).filter((cell) => graph.nodes.has(cellKey(cell)));
  const chargers = layout.chargingSpots.flatMap((charger) => charger.cells).filter((cell) => graph.nodes.has(cellKey(cell)));
  const perimeterRoads = layout.cells
    .filter((cell) => graph.nodes.has(cellKey(cell)) && (cell.row === 0 || cell.col === 0 || cell.row === layout.grid.rows - 1 || cell.col === layout.grid.columns - 1))
    .map((cell) => ({ row: cell.row, col: cell.col }));
  const cells = [...parking, ...chargers, ...perimeterRoads];
  const unique = [...new Map(cells.map((cell) => [cellKey(cell), cell])).values()];
  return unique.slice(0, count);
}

export function initializeSimulation(layout: WarehouseLayout, config: SimulationConfig = defaultSimulationConfig): SimulationState {
  const spawnCells = getRobotSpawnCells(layout, config.robotCount);
  const robots: Robot[] = spawnCells.map((cell, index) => ({
    robotId: `robot_${String(index + 1).padStart(3, "0")}`,
    robotTypeId: "standard_rmfs_bot",
    pose: poseForCell(cell),
    currentCell: cell,
    state: index < layout.parkingSpots.length ? "PARKING" : index < layout.parkingSpots.length + layout.chargingSpots.length ? "CHARGING" : "IDLE",
    currentPath: [],
    pathProgress: 0,
    routeIndex: 0,
    segmentProgressM: 0,
    speedUnloadedMps: config.unloadedSpeedMps,
    speedLoadedMps: config.loadedSpeedMps,
    accelerationMps2: config.accelerationMps2,
    decelerationMps2: config.decelerationMps2,
    rotationSpeedDegPerSec: config.rotationSpeedDegPerSec,
    liftTimeSec: config.liftTimeSec,
    dropTimeSec: config.dropTimeSec,
    batteryPercent: 100,
    color: robotColors.IDLE
  }));
  const eventLog: SimulationEvent[] = [
    {
      timeSec: 0,
      severity: spawnCells.length > 0 ? "info" : "error",
      message: spawnCells.length > 0 ? `Initialized ${robots.length} robots.` : "No valid robot spawn locations found."
    }
  ];
  return {
    simTimeSec: 0,
    isRunning: false,
    speedMultiplier: 1,
    robots,
    tasks: [],
    completedTasks: [],
    failedTasks: [],
    reservationTable: createReservationTable(config.reservationTimeStepSec),
    stationQueues: layout.stations.map((station): StationQueue => ({ stationId: station.id, waitingRobotIds: [] })),
    eventLog,
    metrics: calculateSimulationMetrics({ robots, tasks: [], completedTasks: [], failedTasks: [], stationQueues: [] }, 0, layout),
    initialized: true
  };
}

export function resetSimulation(config: SimulationConfig = defaultSimulationConfig): SimulationState {
  return {
    simTimeSec: 0,
    isRunning: false,
    speedMultiplier: 1,
    robots: [],
    tasks: [],
    completedTasks: [],
    failedTasks: [],
    reservationTable: createReservationTable(config.reservationTimeStepSec),
    stationQueues: [],
    eventLog: [],
    metrics: emptySimulationMetrics,
    initialized: false
  };
}

function weightedRackSequence(layout: WarehouseLayout) {
  return [...layout.racks].sort((a, b) => {
    const weight = { HOT: 0, WARM: 1, COLD: 2 };
    return (weight[a.demandClass ?? "WARM"] ?? 1) - (weight[b.demandClass ?? "WARM"] ?? 1);
  });
}

export function createTaskForRackStation(layout: WarehouseLayout, rackId: string, stationId: string, simTimeSec: number, priority = 1): SimulationTask | undefined {
  const rack = layout.racks.find((item) => item.id === rackId);
  const station = layout.stations.find((item) => item.id === stationId);
  if (!rack || !station) return undefined;
  if (!station.acceptedRackFaces.some((face) => rack.faces.some((rackFace) => rackFace.faceId === face))) return undefined;
  return {
    taskId: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    taskType: "MOVE_RACK_TO_STATION",
    rackId: rack.id,
    stationId: station.id,
    priority,
    status: "PENDING",
    createdAtSec: simTimeSec,
    requiredRackFace: station.acceptedRackFaces[0],
    requiredStationOrientationDeg: station.requiredRackOrientationDeg
  };
}

export function generateSimulationTasks(layout: WarehouseLayout, config: SimulationConfig, simTimeSec: number): SimulationTask[] {
  const racks = config.taskGenerationMode === "weighted_hot_warm_cold" ? weightedRackSequence(layout) : layout.racks;
  const tasks: SimulationTask[] = [];
  for (let index = 0; index < config.taskCount && racks.length > 0; index += 1) {
    const rack = racks[index % racks.length];
    const station = nearestCompatibleStation(layout, rack);
    if (!station) continue;
    const task = createTaskForRackStation(layout, rack.id, station.id, simTimeSec, config.taskCount - index);
    if (task) tasks.push(task);
  }
  return tasks;
}

function planTaskRoute(layout: WarehouseLayout, robot: Robot, task: SimulationTask): SimulationRoutePlan | undefined {
  const rack = layout.racks.find((item) => item.id === task.rackId);
  const station = layout.stations.find((item) => item.id === task.stationId);
  if (!rack || !station) return undefined;
  const emptyPathToRack = findPathToNearestRackApproach(layout, robot.currentCell, rack);
  if (emptyPathToRack.length === 0) return undefined;
  const pickupApproach = emptyPathToRack.at(-1)!;
  const needsRotation = rack.currentOrientationDeg !== station.requiredRackOrientationDeg;
  const preRotation = needsRotation ? findNearestRotationZonePath(layout, pickupApproach, station.requiredRackOrientationDeg) : [];
  const stationStart = preRotation.at(-1) ?? pickupApproach;
  const loadedPathToStation = findPathToStationQueue(layout, stationStart, station);
  if (loadedPathToStation.length === 0) return undefined;
  const stationArrival = loadedPathToStation.at(-1)!;
  const postRotation = needsRotation ? findNearestRotationZonePath(layout, stationArrival, rack.currentOrientationDeg) : [];
  const returnStart = postRotation.at(-1) ?? stationArrival;
  const returnPath = findPathToNearestRackApproach(layout, returnStart, rack);
  if (returnPath.length === 0) return undefined;
  return {
    emptyPathToRack,
    pathToPreStationRotationZone: preRotation.length > 0 ? preRotation : undefined,
    loadedPathToStation,
    pathToPostStationRotationZone: postRotation.length > 0 ? postRotation : undefined,
    returnPath
  };
}

function concatPaths(paths: GridCell[][]) {
  const result: GridCell[] = [];
  for (const path of paths) {
    for (const cell of path) {
      if (result.length === 0 || cellKey(result.at(-1)!) !== cellKey(cell)) result.push(cell);
    }
  }
  return result;
}

function planLoadedPath(route: SimulationRoutePlan) {
  return concatPaths([route.pathToPreStationRotationZone ?? [], route.loadedPathToStation]);
}

function movementComplete(robot: Robot) {
  return robot.currentPath.length <= 1 || robot.routeIndex >= robot.currentPath.length - 1;
}

function advanceRobotOnPath(layout: WarehouseLayout, robot: Robot, deltaTimeSec: number): Robot {
  if (movementComplete(robot)) return robot;
  const speed = robot.state === "MOVING_EMPTY" ? robot.speedUnloadedMps : robot.speedLoadedMps;
  let next = { ...robot };
  let remainingMeters = speed * deltaTimeSec;
  while (remainingMeters > 0 && !movementComplete(next)) {
    const from = next.currentPath[next.routeIndex];
    const to = next.currentPath[next.routeIndex + 1];
    const segmentDistance = Math.max(0.001, manhattanMeters(from, to, layout.grid));
    const remainingSegment = segmentDistance - next.segmentProgressM;
    const consume = Math.min(remainingMeters, remainingSegment);
    next.segmentProgressM += consume;
    remainingMeters -= consume;
    const t = Math.min(1, next.segmentProgressM / segmentDistance);
    next = {
      ...next,
      pose: {
        x: from.col + 0.5 + (to.col - from.col) * t,
        y: from.row + 0.5 + (to.row - from.row) * t,
        yawDeg: yawBetween(from, to)
      },
      targetCell: to,
      pathProgress: next.routeIndex + t
    };
    if (next.segmentProgressM >= segmentDistance - 1e-6) {
      next = {
        ...next,
        routeIndex: next.routeIndex + 1,
        segmentProgressM: 0,
        currentCell: to,
        pose: poseForCell(to),
        pathProgress: next.routeIndex + 1
      };
    }
  }
  return next;
}

function activePathWithWaits(
  layout: WarehouseLayout,
  state: SimulationState,
  robot: Robot,
  route: SimulationRoutePlan,
  config: SimulationConfig
) {
  const fullPath = concatPaths([route.emptyPathToRack, planLoadedPath(route), route.pathToPostStationRotationZone ?? [], route.returnPath]);
  if (!config.collisionCheckingEnabled) return { path: route.emptyPathToRack, table: state.reservationTable };
  let candidate = fullPath;
  let table = state.reservationTable;
  for (let wait = 0; wait <= 12; wait += 1) {
    const result = reservePath(table, robot.robotId, candidate, state.simTimeSec, robot.speedUnloadedMps);
    if (!result.conflict) return { path: addWaitSteps(route.emptyPathToRack, wait), table: result.table };
    candidate = addWaitSteps(fullPath, wait + 1);
  }
  return { path: route.emptyPathToRack, table };
}

function assignTasks(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig): SimulationState {
  let next = structuredClone(state) as SimulationState;
  const pending = [...next.tasks].filter((task) => task.status === "PENDING").sort((a, b) => b.priority - a.priority);
  for (const task of pending) {
    const robot = next.robots.find((candidate) => ["IDLE", "PARKING", "CHARGING"].includes(candidate.state) && !candidate.assignedTaskId);
    if (!robot) break;
    const routePlan = planTaskRoute(layout, robot, task);
    if (!routePlan) {
      next.tasks = next.tasks.map((item) => (item.taskId === task.taskId ? { ...item, status: "FAILED", failureReason: "No valid route found." } : item));
      next.failedTasks.push({ ...task, status: "FAILED", failureReason: "No valid route found." });
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "error", taskId: task.taskId, message: `Task ${task.taskId} failed: no route.` });
      continue;
    }
    const reservation = activePathWithWaits(layout, next, robot, routePlan, config);
    next.reservationTable = reservation.table;
    next.robots = next.robots.map((item) =>
      item.robotId === robot.robotId
        ? {
            ...item,
            state: "MOVING_EMPTY",
            color: robotColors.MOVING_EMPTY,
            assignedTaskId: task.taskId,
            currentPath: reservation.path,
            routeIndex: 0,
            segmentProgressM: 0,
            pathProgress: 0
          }
        : item
    );
    next.tasks = next.tasks.map((item) =>
      item.taskId === task.taskId
        ? { ...item, status: "ASSIGNED", robotId: robot.robotId, assignedAtSec: next.simTimeSec, routePlan }
        : item
    );
    next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: robot.robotId, taskId: task.taskId, message: `Task ${task.taskId} assigned to ${robot.robotId}.` });
  }
  return next;
}

function robotTask(state: SimulationState, robot: Robot) {
  return state.tasks.find((task) => task.taskId === robot.assignedTaskId);
}

function updateStationQueues(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig): SimulationState {
  let next = structuredClone(state) as SimulationState;
  for (const queue of next.stationQueues) {
    const active = queue.activeRobotId ? next.robots.find((robot) => robot.robotId === queue.activeRobotId) : undefined;
    if (active && queue.serviceEndTimeSec !== undefined && next.simTimeSec >= queue.serviceEndTimeSec) {
      const task = robotTask(next, active);
      const returnPath = task?.routePlan ? concatPaths([task.routePlan.pathToPostStationRotationZone ?? [], task.routePlan.returnPath]) : [];
      next.robots = next.robots.map((robot) =>
        robot.robotId === active.robotId
          ? { ...robot, state: "RETURNING_RACK", color: robotColors.RETURNING_RACK, currentPath: returnPath, routeIndex: 0, segmentProgressM: 0, pathProgress: 0 }
          : robot
      );
      queue.activeRobotId = undefined;
      queue.serviceEndTimeSec = undefined;
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: active.robotId, taskId: active.assignedTaskId, message: `${active.robotId} completed station service.` });
    }
    if (!queue.activeRobotId && queue.waitingRobotIds.length > 0) {
      const robotId = queue.waitingRobotIds.shift()!;
      queue.activeRobotId = robotId;
      queue.serviceEndTimeSec = next.simTimeSec + config.stationServiceTimeSec;
      next.robots = next.robots.map((robot) =>
        robot.robotId === robotId ? { ...robot, state: "SERVICING_AT_STATION", color: robotColors.SERVICING_AT_STATION, currentPath: [] } : robot
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId, taskId: next.robots.find((robot) => robot.robotId === robotId)?.assignedTaskId, message: `${robotId} started station service.` });
    }
  }
  void layout;
  return next;
}

function handleRobotTransitions(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig): SimulationState {
  let next = structuredClone(state) as SimulationState;
  for (const robot of next.robots) {
    const task = robotTask(next, robot);
    if (!task) continue;
    if (robot.state === "MOVING_EMPTY" && movementComplete(robot)) {
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId ? { ...item, state: "LIFTING_RACK", color: robotColors.LIFTING_RACK, waitUntilSec: next.simTimeSec + item.liftTimeSec } : item
      );
      next.tasks = next.tasks.map((item) => (item.taskId === task.taskId ? { ...item, status: "IN_PROGRESS" } : item));
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} reached rack pickup approach.` });
    }
    if (robot.state === "LIFTING_RACK" && robot.waitUntilSec !== undefined && next.simTimeSec >= robot.waitUntilSec) {
      const loadedPath = task.routePlan ? planLoadedPath(task.routePlan) : [];
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId
          ? { ...item, state: "MOVING_LOADED", color: robotColors.MOVING_LOADED, carryingRackId: task.rackId, currentPath: loadedPath, routeIndex: 0, segmentProgressM: 0, pathProgress: 0, waitUntilSec: undefined }
          : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} picked rack.` });
    }
    if (robot.state === "MOVING_LOADED" && movementComplete(robot)) {
      const stationId = task.stationId;
      const queue = next.stationQueues.find((item) => item.stationId === stationId);
      if (queue && !queue.waitingRobotIds.includes(robot.robotId) && queue.activeRobotId !== robot.robotId) queue.waitingRobotIds.push(robot.robotId);
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId ? { ...item, state: "QUEUING_AT_STATION", color: robotColors.QUEUING_AT_STATION, currentPath: [] } : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} arrived at station queue.` });
    }
    if (robot.state === "RETURNING_RACK" && movementComplete(robot)) {
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId ? { ...item, state: "DROPPING_RACK", color: robotColors.DROPPING_RACK, waitUntilSec: next.simTimeSec + item.dropTimeSec, currentPath: [] } : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} returned rack to home approach.` });
    }
    if (robot.state === "DROPPING_RACK" && robot.waitUntilSec !== undefined && next.simTimeSec >= robot.waitUntilSec) {
      const completed = { ...task, status: "COMPLETED" as const, completedAtSec: next.simTimeSec };
      next.completedTasks.push(completed);
      next.tasks = next.tasks.filter((item) => item.taskId !== task.taskId);
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId
          ? { ...item, state: "IDLE", color: robotColors.IDLE, assignedTaskId: undefined, carryingRackId: undefined, currentPath: [], routeIndex: 0, segmentProgressM: 0, pathProgress: 0, waitUntilSec: undefined }
          : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", robotId: robot.robotId, taskId: task.taskId, message: `Task ${task.taskId} completed.` });
    }
  }
  void layout;
  void config;
  return next;
}

export function calculateSimulationMetrics(
  stateLike: Pick<SimulationState, "robots" | "tasks" | "completedTasks" | "failedTasks" | "stationQueues">,
  simTimeSec: number,
  layout: WarehouseLayout
): SimulationMetrics {
  const activeTaskCount = stateLike.tasks.filter((task) => ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(task.status)).length;
  const completedDurations = stateLike.completedTasks
    .map((task) => (task.completedAtSec ?? simTimeSec) - task.createdAtSec)
    .filter((value) => value >= 0);
  const averageTaskCycleTimeSec = completedDurations.length > 0 ? completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length : 0;
  const busyRobots = stateLike.robots.filter((robot) => !["IDLE", "PARKING", "CHARGING"].includes(robot.state)).length;
  const busyStations = stateLike.stationQueues.filter((queue) => queue.activeRobotId).length;
  return {
    activeRobotCount: stateLike.robots.length,
    activeTaskCount,
    completedTaskCount: stateLike.completedTasks.length,
    failedTaskCount: stateLike.failedTasks.length,
    blockedRobotCount: stateLike.robots.filter((robot) => ["BLOCKED", "ERROR"].includes(robot.state)).length,
    averageTaskCycleTimeSec,
    estimatedThroughputPerHour: simTimeSec > 0 ? (stateLike.completedTasks.length / simTimeSec) * 3600 : 0,
    averageRobotUtilization: stateLike.robots.length > 0 ? busyRobots / stateLike.robots.length : 0,
    stationUtilization: layout.stations.length > 0 ? busyStations / layout.stations.length : 0
  };
}

export function stepSimulation(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig, deltaTimeSec: number): SimulationState {
  if (!state.initialized) return state;
  let next: SimulationState = {
    ...structuredClone(state),
    simTimeSec: state.simTimeSec + deltaTimeSec
  };
  next = assignTasks(layout, next, config);
  next.robots = next.robots.map((robot) => {
    if (["MOVING_EMPTY", "MOVING_LOADED", "RETURNING_RACK"].includes(robot.state)) return advanceRobotOnPath(layout, robot, deltaTimeSec);
    return robot;
  });
  next = handleRobotTransitions(layout, next, config);
  next = updateStationQueues(layout, next, config);
  next.metrics = calculateSimulationMetrics(next, next.simTimeSec, layout);
  return next;
}

export function robotCarriedRackOffsets(layout: WarehouseLayout, robot: Robot): GridCell[] {
  const rack = layout.racks.find((item) => item.id === robot.carryingRackId);
  if (!rack) return [{ row: 0, col: 0 }];
  return rackOccupiedCells(rack, layout.grid).map((cell) => ({
    row: cell.row - rack.homeCell.row,
    col: cell.col - rack.homeCell.col
  }));
}

export function firstRobotPathCell(state: SimulationState, robotId: string): GridCell | undefined {
  return state.robots.find((robot) => robot.robotId === robotId)?.currentPath[0];
}

export function reservationCellsForDisplay(state: SimulationState): GridCell[] {
  const currentStep = Math.floor(state.simTimeSec / Math.max(0.1, state.reservationTable.reservationTimeStepSec));
  return Object.entries(state.reservationTable.reservedVertices)
    .filter(([step]) => Number(step) >= currentStep && Number(step) <= currentStep + 10)
    .flatMap(([, records]) => records.map((record) => record.cell));
}
