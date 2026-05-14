import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { RmfsOrder } from "../models/order";
import type { OperationalTask } from "../models/operationalTask";
import type { Robot, RobotState } from "../models/robot";
import {
  defaultSimulationConfig,
  emptySimulationMetrics,
  emptyTrafficDiagnostics,
  type SimulationConfig,
  type SimulationEvent,
  type SimulationMetrics,
  type SimulationState,
  type StationQueue
} from "../models/simulation";
import type { SimulationRoutePlan, SimulationTask } from "../models/task";
import { buildRoadGraph, rackApproachNodes } from "../graph/graphBuilder";
import { shortestPathBetweenSets } from "../graph/shortestPath";
import { validateLayout } from "../validation/validateLayout";
import { validateSimulationReadiness } from "../validation/validateSimulationReadiness";
import { cellKey, manhattanMeters, parseCellKey } from "../utils/gridMath";
import { rackOccupiedCells } from "../utils/rackFootprint";
import { ensureStorageLocations } from "../utils/storageLocations";
import { findNearestRotationZonePath, findPathToNearestRackApproach, findPathToStationQueue, nearestCompatibleStation } from "./pathPlanner";
import { createReservationTable, reserveResource } from "./reservationTable";
import { inventoryFromLayout, pickInventory, replenishInventory, reserveInventory, applyPickToOrder } from "./inventory";
import { generateSampleOrders } from "./orderGeneration";
import { selectRackForOrderLine } from "./controllers/rackSelectionController";
import { selectStationForRack } from "./controllers/stationAssignmentController";
import { selectStorageDestination } from "./controllers/rackStorageController";
import { selectRobotForCell } from "./controllers/robotAssignmentController";
import { reserveTaskRouteWithTrafficPolicy } from "./trafficController";
import { applyDeadlockRecovery, detectDeadlocks } from "./deadlockDetector";

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
  return [...eventLog, { eventId: event.eventId ?? `event_${eventLog.length + 1}_${Math.round(event.timeSec * 1000)}`, ...event }].slice(-500);
}

export function validateSimulationStart(layout: WarehouseLayout): string[] {
  const issues: string[] = [];
  const normalized = layout.storageLocations?.length ? layout : ensureStorageLocations(layout);
  const readiness = validateSimulationReadiness(normalized);
  const validation = readiness.validation;
  if (!validation.isValid) issues.push("Layout validation must pass before simulation starts.");
  for (const messages of Object.values(readiness.categories)) issues.push(...messages);
  if (normalized.racks.length === 0) issues.push("Simulation requires at least one rack.");
  if (normalized.stations.length === 0) issues.push("Simulation requires at least one station.");
  if (normalized.storageLocations.length === 0) issues.push("Simulation requires storage locations for rack pickup and return.");
  if (inventoryFromLayout(normalized).filter((bin) => bin.sku && bin.quantity > 0).length === 0) issues.push("Simulation requires at least one SKU with positive rack inventory.");
  if (normalized.cells.filter((cell) => ["ROAD", "QUEUE", "STATION", "CHARGING", "PARKING", "ROTATION"].includes(cell.cellType)).length === 0) {
    issues.push("Simulation requires at least one traversable graph cell.");
  }
  const spawnCells = getRobotSpawnCells(normalized, 1);
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
  const normalized = layout.storageLocations?.length ? layout : ensureStorageLocations(layout);
  const spawnCells = getRobotSpawnCells(normalized, config.robotCount);
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
      entityType: "robot",
      message: spawnCells.length > 0 ? `Initialized ${robots.length} robots.` : "No valid robot spawn locations found."
    }
  ];
  const storageLocationStates = Object.fromEntries(
    normalized.storageLocations.map((location) => [
      location.storageLocationId,
      {
        storageLocationId: location.storageLocationId,
        status: location.status,
        currentlyStoredRackId: location.currentlyStoredRackId,
        reservedForRackId: location.reservedForRackId
      }
    ])
  );
  const rackStates = Object.fromEntries(
    normalized.racks.map((rack) => [
      rack.id,
      {
        rackId: rack.id,
        operationalStatus: rack.operationalStatus ?? "STORED",
        homeStorageLocationId: rack.homeStorageLocationId,
        currentStorageLocationId: rack.currentStorageLocationId ?? rack.homeStorageLocationId,
        currentCell: rack.homeCell,
        currentOrientationDeg: rack.currentOrientationDeg
      }
    ])
  );
  const stationStates = Object.fromEntries(
    normalized.stations.map((station) => [
      station.id,
      {
        stationId: station.id,
        completedServiceCount: 0
      }
    ])
  );
  return {
    simTimeSec: 0,
    isRunning: false,
    speedMultiplier: 1,
    robots,
    tasks: [],
    operationalTasks: [],
    orders: [],
    completedOrders: [],
    failedOrders: [],
    inventory: inventoryFromLayout(normalized),
    rackStates,
    storageLocationStates,
    stationStates,
    storageLocations: normalized.storageLocations,
    completedTasks: [],
    failedTasks: [],
    reservationTable: createReservationTable(config.reservationTimeStepSec),
    stationQueues: normalized.stations.map((station): StationQueue => ({ stationId: station.id, waitingRobotIds: [] })),
    eventLog,
    trafficDiagnostics: structuredClone(emptyTrafficDiagnostics),
    metrics: calculateSimulationMetrics({ robots, tasks: [], completedTasks: [], failedTasks: [], stationQueues: [] }, 0, normalized),
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
    operationalTasks: [],
    orders: [],
    completedOrders: [],
    failedOrders: [],
    inventory: [],
    rackStates: {},
    storageLocationStates: {},
    stationStates: {},
    storageLocations: [],
    completedTasks: [],
    failedTasks: [],
    reservationTable: createReservationTable(config.reservationTimeStepSec),
    stationQueues: [],
    eventLog: [],
    trafficDiagnostics: structuredClone(emptyTrafficDiagnostics),
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
    requiredStationOrientationDeg: station.requiredRackOrientationDeg,
    sourceStorageLocationId: rack.currentStorageLocationId ?? rack.homeStorageLocationId,
    destinationStorageLocationId: rack.homeStorageLocationId,
    serviceKind: station.stationType === "REPLENISH" ? "REPLENISH" : station.stationType === "PICK" || station.stationType === "COMBI" ? "PICK" : "DWELL"
  };
}

function createOperationalTaskForTask(task: SimulationTask, simTimeSec: number): OperationalTask {
  return {
    operationalTaskId: task.operationalTaskId ?? `op_${task.taskId}`,
    orderId: task.orderId,
    orderLineIds: task.orderLineIds ?? [],
    taskKind: task.serviceKind === "REPLENISH" ? "REPLENISH_RACK" : task.orderId ? "PICK_ORDER" : "MOVE_RACK_TO_STATION",
    rackId: task.rackId,
    stationId: task.stationId ?? "",
    robotId: task.robotId,
    sourceStorageLocationId: task.sourceStorageLocationId,
    destinationStorageLocationId: task.destinationStorageLocationId,
    status: "PLANNED",
    timestamps: { plannedAtSec: simTimeSec }
  };
}

export function generateSimulationTasks(layout: WarehouseLayout, config: SimulationConfig, simTimeSec: number): SimulationTask[] {
  const normalized = layout.storageLocations?.length ? layout : ensureStorageLocations(layout);
  const racks = config.taskGenerationMode === "weighted_hot_warm_cold" ? weightedRackSequence(normalized) : normalized.racks;
  const tasks: SimulationTask[] = [];
  for (let index = 0; index < config.taskCount && racks.length > 0; index += 1) {
    const rack = racks[index % racks.length];
    const station = nearestCompatibleStation(normalized, rack);
    if (!station) continue;
    const task = createTaskForRackStation(normalized, rack.id, station.id, simTimeSec, config.taskCount - index);
    if (task) tasks.push(task);
  }
  return tasks;
}

export function generateOperationalSimulationWork(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig) {
  const normalized = layout.storageLocations?.length ? layout : ensureStorageLocations(layout);
  const inventory = state.inventory.length > 0 ? state.inventory : inventoryFromLayout(normalized);
  const generatedOrders = generateSampleOrders(inventory, config.taskCount, state.simTimeSec, state.orders.length + state.completedOrders.length + state.failedOrders.length);
  let nextInventory = inventory;
  const tasks: SimulationTask[] = [];
  const operationalTasks: OperationalTask[] = [];
  const failedOrders: RmfsOrder[] = [];
  const eventLog = [...state.eventLog];
  const rackStates = { ...state.rackStates };
  const storageLocationStates = { ...state.storageLocationStates };

  for (const [orderIndex, order] of generatedOrders.entries()) {
    const line = order.orderLines[0];
    const selectedRack = selectRackForOrderLine(normalized, nextInventory, rackStates, line, config.rackSelectionStrategy);
    if (!selectedRack.rack || !selectedRack.bin) {
      const failedOrder: RmfsOrder = { ...order, status: "FAILED", failureReason: selectedRack.reason ?? "No rack selected." };
      failedOrders.push(failedOrder);
      generatedOrders[orderIndex] = failedOrder;
      eventLog.push({
        timeSec: state.simTimeSec,
        severity: "error",
        entityType: "order",
        entityId: failedOrder.orderId,
        message: `Order ${failedOrder.orderId} failed: ${failedOrder.failureReason}`
      });
      continue;
    }
    const station = selectStationForRack(normalized, selectedRack.rack, config.stationAssignmentStrategy, state.stationQueues);
    if (!station) {
      const failedOrder: RmfsOrder = { ...order, status: "FAILED", failureReason: `No compatible station for rack ${selectedRack.rack.rackId}.` };
      failedOrders.push(failedOrder);
      generatedOrders[orderIndex] = failedOrder;
      eventLog.push({
        timeSec: state.simTimeSec,
        severity: "error",
        entityType: "station",
        entityId: order.orderId,
        message: `Order ${order.orderId} failed: no compatible station for rack ${selectedRack.rack.rackId}.`
      });
      continue;
    }
    const destination = selectStorageDestination(normalized, selectedRack.rack, storageLocationStates, config.rackStorageStrategy, station.cell);
    const task = createTaskForRackStation(normalized, selectedRack.rack.id, station.id, state.simTimeSec, config.taskCount - tasks.length);
    if (!task) continue;
    task.taskType = "PICK_ORDER";
    task.orderId = order.orderId;
    task.orderLineIds = [line.lineId];
    task.operationalTaskId = `op_${task.taskId}`;
    task.destinationStorageLocationId = destination?.storageLocationId ?? selectedRack.rack.homeStorageLocationId;
    task.selectedBins = [{ lineId: line.lineId, binId: selectedRack.bin.binId, rackId: selectedRack.rack.id, sku: line.sku, quantity: line.quantity }];
    task.serviceKind = station.stationType === "REPLENISH" ? "REPLENISH" : "PICK";
    nextInventory = reserveInventory(nextInventory, selectedRack.bin.binId, line.quantity);
    rackStates[selectedRack.rack.id] = {
      ...(rackStates[selectedRack.rack.id] ?? {
        rackId: selectedRack.rack.id,
        currentCell: selectedRack.rack.homeCell,
        currentOrientationDeg: selectedRack.rack.currentOrientationDeg
      }),
      operationalStatus: "RESERVED",
      activeTaskId: task.taskId
    };
    if (selectedRack.rack.currentStorageLocationId && storageLocationStates[selectedRack.rack.currentStorageLocationId]) {
      storageLocationStates[selectedRack.rack.currentStorageLocationId] = {
        ...storageLocationStates[selectedRack.rack.currentStorageLocationId],
        reservedForRackId: selectedRack.rack.id,
        status: "RESERVED"
      };
    }
    if (destination) {
      storageLocationStates[destination.storageLocationId] = {
        ...(storageLocationStates[destination.storageLocationId] ?? { storageLocationId: destination.storageLocationId, status: "EMPTY" }),
        reservedForRackId: selectedRack.rack.id,
        status: destination.storageLocationId === selectedRack.rack.currentStorageLocationId ? "RESERVED" : "RESERVED"
      };
    }
    const assignedOrder: RmfsOrder = {
      ...order,
      status: "ASSIGNED",
      assignedStationId: station.id,
      orderLines: order.orderLines.map((item) =>
        item.lineId === line.lineId ? { ...item, status: "ASSIGNED", assignedRackId: selectedRack.rack!.id, assignedBinId: selectedRack.bin!.binId } : item
      )
    };
    tasks.push(task);
    operationalTasks.push(createOperationalTaskForTask(task, state.simTimeSec));
    eventLog.push(
      { timeSec: state.simTimeSec, severity: "info", entityType: "order", entityId: order.orderId, taskId: task.taskId, message: `Order ${order.orderId} created for ${line.quantity} x ${line.sku}.` },
      { timeSec: state.simTimeSec, severity: "info", entityType: "controller", entityId: "rackSelection", taskId: task.taskId, message: `Rack ${selectedRack.rack.rackId} selected for SKU ${line.sku}.` },
      { timeSec: state.simTimeSec, severity: "info", entityType: "controller", entityId: "stationAssignment", taskId: task.taskId, message: `Station ${station.stationId} selected for order ${order.orderId}.` },
      { timeSec: state.simTimeSec, severity: "info", entityType: "controller", entityId: "rackStorage", taskId: task.taskId, message: `Destination storage ${task.destinationStorageLocationId ?? "home"} selected for rack ${selectedRack.rack.rackId}.` }
    );
    generatedOrders[orderIndex] = assignedOrder;
  }

  return {
    orders: generatedOrders,
    failedOrders,
    tasks,
    operationalTasks,
    inventory: nextInventory,
    rackStates,
    storageLocationStates,
    eventLog: eventLog.slice(-500)
  };
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
  if (needsRotation && preRotation.length === 0) return undefined;
  const stationStart = preRotation.at(-1) ?? pickupApproach;
  const loadedPathToStation = findPathToStationQueue(layout, stationStart, station);
  if (loadedPathToStation.length === 0) return undefined;
  const stationArrival = loadedPathToStation.at(-1)!;
  const postRotation = needsRotation ? findNearestRotationZonePath(layout, stationArrival, rack.currentOrientationDeg) : [];
  if (needsRotation && postRotation.length === 0) return undefined;
  const returnStart = postRotation.at(-1) ?? stationArrival;
  let returnPath = findPathToNearestRackApproach(layout, returnStart, rack);
  const destination = layout.storageLocations?.find((location) => location.storageLocationId === task.destinationStorageLocationId);
  if (destination?.approachWaypointIds.length) {
    const graph = buildRoadGraph(layout);
    const result = shortestPathBetweenSets(graph, [cellKey(returnStart)], destination.approachWaypointIds);
    returnPath = result?.path.map(parseCellKey) ?? returnPath;
  }
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
  task: SimulationTask,
  route: SimulationRoutePlan,
  config: SimulationConfig
) {
  return reserveTaskRouteWithTrafficPolicy(layout, state, robot, task, route, config);
}

function assignTasks(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig): SimulationState {
  let next = structuredClone(state) as SimulationState;
  const pending = [...next.tasks].filter((task) => task.status === "PENDING").sort((a, b) => b.priority - a.priority);
  for (const task of pending) {
    const rack = layout.racks.find((item) => item.id === task.rackId);
    const station = layout.stations.find((item) => item.id === task.stationId);
    if (!rack || !station) continue;
    const rackState = next.rackStates[task.rackId];
    if (rackState && !["STORED", "RESERVED"].includes(rackState.operationalStatus)) continue;
    const queue = next.stationQueues.find((item) => item.stationId === task.stationId);
    const occupiedQueueSlots = (queue?.waitingRobotIds.length ?? 0) + (queue?.activeRobotId ? 1 : 0);
    if (queue && occupiedQueueSlots >= station.maxQueueLength) {
      next.eventLog = log(next.eventLog, {
        timeSec: next.simTimeSec,
        severity: "warning",
        entityType: "station",
        entityId: station.id,
        taskId: task.taskId,
        message: `Task ${task.taskId} delayed: station ${station.stationId} queue is full.`
      });
      continue;
    }
    const robot = selectRobotForCell(layout, next.robots, rack.homeCell, config.robotAssignmentStrategy);
    if (!robot) break;
    const routePlan = planTaskRoute(layout, robot, task);
    if (!routePlan) {
      next.tasks = next.tasks.map((item) => (item.taskId === task.taskId ? { ...item, status: "FAILED", failureReason: "No valid route found." } : item));
      next.failedTasks.push({ ...task, status: "FAILED", failureReason: "No valid route found." });
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "error", taskId: task.taskId, message: `Task ${task.taskId} failed: no route.` });
      continue;
    }
    const reservation = activePathWithWaits(layout, next, robot, task, routePlan, config);
    if (reservation.conflict) {
      const message = reservation.explanation ?? `Traffic reservation conflict for task ${task.taskId}.`;
      const pairKey = reservation.conflict.robotId ? [robot.robotId, reservation.conflict.robotId].sort().join("__") : `${robot.robotId}__resource`;
      next.trafficDiagnostics = {
        ...next.trafficDiagnostics,
        reservationConflictCount: next.trafficDiagnostics.reservationConflictCount + 1,
        replanCount: next.trafficDiagnostics.replanCount + reservation.replanAttempts,
        repeatedConflictPairs: {
          ...next.trafficDiagnostics.repeatedConflictPairs,
          [pairKey]: (next.trafficDiagnostics.repeatedConflictPairs[pairKey] ?? 0) + 1
        },
        lastConflicts: [
          ...next.trafficDiagnostics.lastConflicts,
          {
            timeSec: next.simTimeSec,
            robotId: robot.robotId,
            taskId: task.taskId,
            resourceId: reservation.conflict.resourceId,
            message
          }
        ].slice(-20)
      };
      next.eventLog = log(next.eventLog, {
        timeSec: next.simTimeSec,
        severity: reservation.blocked ? "error" : "warning",
        entityType: "traffic",
        entityId: robot.robotId,
        robotId: robot.robotId,
        taskId: task.taskId,
        relatedIds: { conflictRobotId: reservation.conflict.robotId, resourceId: reservation.conflict.resourceId },
        message
      });
      if (reservation.blocked) {
        next.trafficDiagnostics.failedDueToTrafficCount += 1;
        next.tasks = next.tasks.map((item) => (item.taskId === task.taskId ? { ...item, status: "FAILED", failureReason: message } : item));
        next.failedTasks.push({ ...task, status: "FAILED", failureReason: message });
        continue;
      }
    }
    if (reservation.waitSteps > 0) {
      const waitSec = reservation.waitSteps * config.reservationTimeStepSec;
      next.trafficDiagnostics = {
        ...next.trafficDiagnostics,
        totalWaitTimeSec: next.trafficDiagnostics.totalWaitTimeSec + waitSec,
        robotWaitTimes: {
          ...next.trafficDiagnostics.robotWaitTimes,
          [robot.robotId]: (next.trafficDiagnostics.robotWaitTimes[robot.robotId] ?? 0) + waitSec
        },
        robotReplanAttempts: {
          ...next.trafficDiagnostics.robotReplanAttempts,
          [robot.robotId]: (next.trafficDiagnostics.robotReplanAttempts[robot.robotId] ?? 0) + reservation.replanAttempts
        }
      };
      next.eventLog = log(next.eventLog, {
        timeSec: next.simTimeSec,
        severity: "info",
        entityType: "traffic",
        entityId: robot.robotId,
        robotId: robot.robotId,
        taskId: task.taskId,
        message: `${robot.robotId} inserted ${reservation.waitSteps} wait step(s) before dispatch.`
      });
    }
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
            pathProgress: 0,
            routePhase: "TO_RACK",
            waitingReason: reservation.waitSteps > 0 ? "Traffic reservation delay before dispatch" : undefined,
            conflictTarget: reservation.conflict?.robotId ?? reservation.conflict?.resourceId,
            replanAttempts: reservation.replanAttempts,
            totalWaitTimeSec: (item.totalWaitTimeSec ?? 0) + reservation.waitSteps * config.reservationTimeStepSec
          }
        : item
    );
    next.tasks = next.tasks.map((item) =>
      item.taskId === task.taskId
        ? { ...item, status: "ASSIGNED", robotId: robot.robotId, assignedAtSec: next.simTimeSec, routePlan }
        : item
    );
    next.operationalTasks = next.operationalTasks.map((item) =>
      item.operationalTaskId === task.operationalTaskId
        ? { ...item, robotId: robot.robotId, status: "ASSIGNED", timestamps: { ...item.timestamps, assignedAtSec: next.simTimeSec }, routePlan: {
          pathToRackApproach: routePlan.emptyPathToRack,
          pathToPreStationRotationZone: routePlan.pathToPreStationRotationZone,
          pathToStationQueue: routePlan.loadedPathToStation,
          pathToPostStationRotationZone: routePlan.pathToPostStationRotationZone,
          pathToStorageApproach: routePlan.returnPath
        } }
        : item
    );
    next.rackStates[task.rackId] = {
      ...(next.rackStates[task.rackId] ?? {
        rackId: task.rackId,
        currentCell: rack.homeCell,
        currentOrientationDeg: rack.currentOrientationDeg
      }),
      operationalStatus: "RESERVED",
      activeTaskId: task.taskId
    };
    next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "controller", entityId: "robotAssignment", robotId: robot.robotId, taskId: task.taskId, message: `Task ${task.taskId} assigned to ${robot.robotId}.` });
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
      if (task?.selectedBins && task.serviceKind === "PICK") {
        for (const selected of task.selectedBins) {
          next.inventory = pickInventory(next.inventory, selected.binId, selected.quantity, next.simTimeSec);
        }
        next.orders = next.orders.map((order) =>
          order.orderId === task.orderId
            ? applyPickToOrder(
                { ...order, status: "IN_PROGRESS" },
                task.orderLineIds ?? [],
                task.selectedBins!.map((bin) => ({ lineId: bin.lineId, quantity: bin.quantity, binId: bin.binId, rackId: bin.rackId })),
                next.simTimeSec
              )
            : order
        );
        const completedNow = next.orders.filter((order) => order.orderId === task.orderId && order.status === "COMPLETED");
        next.completedOrders = [...next.completedOrders, ...completedNow.filter((order) => !next.completedOrders.some((item) => item.orderId === order.orderId))];
        next.orders = next.orders.filter((order) => order.status !== "COMPLETED");
        next.eventLog = log(next.eventLog, {
          timeSec: next.simTimeSec,
          severity: "info",
          entityType: "inventory",
          entityId: task.rackId,
          taskId: task.taskId,
          robotId: active.robotId,
          message: `Inventory picked for order ${task.orderId ?? "manual task"}.`
        });
      } else if (task?.serviceKind === "REPLENISH") {
        const sku = task.selectedBins?.[0]?.sku ?? "SKU-REPLENISH";
        next.inventory = replenishInventory(next.inventory, task.rackId, sku, task.selectedBins?.[0]?.quantity ?? 5, next.simTimeSec);
        next.eventLog = log(next.eventLog, {
          timeSec: next.simTimeSec,
          severity: "info",
          entityType: "inventory",
          entityId: task.rackId,
          taskId: task.taskId,
          robotId: active.robotId,
          message: `Inventory replenished on rack ${task.rackId}.`
        });
      }
      const returnPath = task?.routePlan
        ? task.routePlan.pathToPostStationRotationZone?.length
          ? task.routePlan.pathToPostStationRotationZone
          : task.routePlan.returnPath
        : [];
      next.robots = next.robots.map((robot) =>
        robot.robotId === active.robotId
          ? {
              ...robot,
              state: "RETURNING_RACK",
              color: robotColors.RETURNING_RACK,
              currentPath: returnPath,
              routeIndex: 0,
              segmentProgressM: 0,
              pathProgress: 0,
              routePhase: task?.routePlan?.pathToPostStationRotationZone?.length ? "POST_ROTATION" : "RETURN_TO_STORAGE"
            }
          : robot
      );
      if (task) {
        next.rackStates[task.rackId] = {
          ...next.rackStates[task.rackId],
          operationalStatus: "RETURNING",
          destinationStorageLocationId: task.destinationStorageLocationId
        };
        next.operationalTasks = next.operationalTasks.map((item) =>
          item.operationalTaskId === task.operationalTaskId ? { ...item, status: "RETURNING", timestamps: { ...item.timestamps, returningAtSec: next.simTimeSec } } : item
        );
      }
      queue.activeRobotId = undefined;
      queue.serviceEndTimeSec = undefined;
      if (next.stationStates[queue.stationId]) {
        next.stationStates[queue.stationId] = { ...next.stationStates[queue.stationId], activeRobotId: undefined, activeRackId: undefined, serviceEndTimeSec: undefined, completedServiceCount: next.stationStates[queue.stationId].completedServiceCount + 1 };
      }
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "station", entityId: queue.stationId, robotId: active.robotId, taskId: active.assignedTaskId, message: `${active.robotId} completed station service.` });
    }
    if (!queue.activeRobotId && queue.waitingRobotIds.length > 0) {
      const robotId = queue.waitingRobotIds.shift()!;
      const robotTaskId = next.robots.find((robot) => robot.robotId === robotId)?.assignedTaskId;
      const task = next.tasks.find((item) => item.taskId === robotTaskId);
      queue.activeRobotId = robotId;
      queue.serviceEndTimeSec = next.simTimeSec + config.stationServiceTimeSec;
      next.robots = next.robots.map((robot) =>
        robot.robotId === robotId ? { ...robot, state: "SERVICING_AT_STATION", color: robotColors.SERVICING_AT_STATION, currentPath: [] } : robot
      );
      if (task) {
        next.rackStates[task.rackId] = {
          ...next.rackStates[task.rackId],
          operationalStatus: "AT_STATION"
        };
        next.operationalTasks = next.operationalTasks.map((item) =>
          item.operationalTaskId === task.operationalTaskId ? { ...item, status: "SERVICING", timestamps: { ...item.timestamps, servicingAtSec: next.simTimeSec } } : item
        );
      }
      if (next.stationStates[queue.stationId]) {
        next.stationStates[queue.stationId] = { ...next.stationStates[queue.stationId], activeRobotId: robotId, activeRackId: task?.rackId, serviceEndTimeSec: queue.serviceEndTimeSec };
      }
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "station", entityId: queue.stationId, robotId, taskId: robotTaskId, message: `${robotId} started station service.` });
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
      next.operationalTasks = next.operationalTasks.map((item) =>
        item.operationalTaskId === task.operationalTaskId ? { ...item, status: "LIFTING", timestamps: { ...item.timestamps, liftingAtSec: next.simTimeSec } } : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "robot", entityId: robot.robotId, robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} reached rack pickup approach.` });
    }
    if (robot.state === "LIFTING_RACK" && robot.waitUntilSec !== undefined && next.simTimeSec >= robot.waitUntilSec) {
      const loadedPath = task.routePlan?.pathToPreStationRotationZone?.length ? task.routePlan.pathToPreStationRotationZone : task.routePlan?.loadedPathToStation ?? [];
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId
          ? {
              ...item,
              state: "MOVING_LOADED",
              color: robotColors.MOVING_LOADED,
              carryingRackId: task.rackId,
              currentPath: loadedPath,
              routeIndex: 0,
              segmentProgressM: 0,
              pathProgress: 0,
              waitUntilSec: undefined,
              routePhase: task.routePlan?.pathToPreStationRotationZone?.length ? "PRE_ROTATION" : "TO_STATION"
            }
          : item
      );
      const sourceStorageId = next.rackStates[task.rackId]?.currentStorageLocationId ?? task.sourceStorageLocationId;
      next.rackStates[task.rackId] = {
        ...next.rackStates[task.rackId],
        operationalStatus: "BEING_CARRIED",
        currentStorageLocationId: undefined,
        carriedByRobotId: robot.robotId
      };
      if (sourceStorageId && next.storageLocationStates[sourceStorageId]) {
        next.storageLocationStates[sourceStorageId] = {
          ...next.storageLocationStates[sourceStorageId],
          status: "EMPTY",
          currentlyStoredRackId: undefined,
          reservedForRackId: undefined
        };
      }
      next.operationalTasks = next.operationalTasks.map((item) =>
        item.operationalTaskId === task.operationalTaskId ? { ...item, status: "TRAVEL_LOADED", timestamps: { ...item.timestamps, travelLoadedAtSec: next.simTimeSec } } : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "rack", entityId: task.rackId, robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} lifted rack ${task.rackId}; storage ${sourceStorageId ?? "unknown"} freed.` });
    }
    if (robot.state === "MOVING_LOADED" && movementComplete(robot)) {
      if (robot.waitUntilSec !== undefined && next.simTimeSec < robot.waitUntilSec) continue;
      if (robot.routePhase === "PRE_ROTATION") {
        const zone = layout.rotationZones.find((item) => item.cells.some((cell) => cellKey(cell) === cellKey(robot.currentCell)));
        const zoneRotationTime = zone?.rotationTimeSec;
        const rotationTime = zoneRotationTime ?? (config.rotationSpeedDegPerSec > 0 ? 360 / Math.max(1, config.rotationSpeedDegPerSec) : 6);
        if (zone) {
          const reservation = reserveResource(next.reservationTable, zone.id, "ROTATION_ZONE", next.simTimeSec, rotationTime, 1, {
            robotId: robot.robotId,
            taskId: task.taskId,
            cells: zone.cells
          });
          if (reservation.conflict) {
            next.trafficDiagnostics.reservationConflictCount += 1;
            next.trafficDiagnostics.totalWaitTimeSec += config.reservationTimeStepSec;
            next.trafficDiagnostics.robotWaitTimes[robot.robotId] = (next.trafficDiagnostics.robotWaitTimes[robot.robotId] ?? 0) + config.reservationTimeStepSec;
            next.trafficDiagnostics.lastConflicts = [
              ...next.trafficDiagnostics.lastConflicts,
              {
                timeSec: next.simTimeSec,
                robotId: robot.robotId,
                taskId: task.taskId,
                resourceId: zone.id,
                message: reservation.conflict.message ?? `Rotation zone ${zone.rotationZoneId} is reserved.`
              }
            ].slice(-20);
            next.robots = next.robots.map((item) =>
              item.robotId === robot.robotId
                ? {
                    ...item,
                    waitUntilSec: next.simTimeSec + config.reservationTimeStepSec,
                    waitingReason: `Waiting for rotation zone ${zone.rotationZoneId}`,
                    conflictTarget: zone.id,
                    totalWaitTimeSec: (item.totalWaitTimeSec ?? 0) + config.reservationTimeStepSec
                  }
                : item
            );
            next.eventLog = log(next.eventLog, {
              timeSec: next.simTimeSec,
              severity: "warning",
              entityType: "resource",
              entityId: zone.id,
              robotId: robot.robotId,
              taskId: task.taskId,
              message: `Rotation zone ${zone.rotationZoneId} is busy; ${robot.robotId} will wait.`
            });
            continue;
          }
          next.reservationTable = reservation.table;
        }
        next.robots = next.robots.map((item) =>
          item.robotId === robot.robotId ? { ...item, state: "ROTATING_WITH_RACK", color: robotColors.ROTATING_WITH_RACK, waitUntilSec: next.simTimeSec + rotationTime } : item
        );
        next.operationalTasks = next.operationalTasks.map((item) =>
          item.operationalTaskId === task.operationalTaskId ? { ...item, status: "ROTATING_PRE_STATION" } : item
        );
        next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "rack", entityId: task.rackId, robotId: robot.robotId, taskId: task.taskId, message: `Rack ${task.rackId} entered pre-station rotation zone.` });
        continue;
      }
      const stationId = task.stationId;
      const queue = next.stationQueues.find((item) => item.stationId === stationId);
      if (queue && !queue.waitingRobotIds.includes(robot.robotId) && queue.activeRobotId !== robot.robotId) queue.waitingRobotIds.push(robot.robotId);
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId ? { ...item, state: "QUEUING_AT_STATION", color: robotColors.QUEUING_AT_STATION, currentPath: [] } : item
      );
      next.operationalTasks = next.operationalTasks.map((item) =>
        item.operationalTaskId === task.operationalTaskId ? { ...item, status: "QUEUING", timestamps: { ...item.timestamps, queuingAtSec: next.simTimeSec } } : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "station", entityId: stationId, robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} arrived at station queue.` });
    }
    if (robot.state === "ROTATING_WITH_RACK" && robot.waitUntilSec !== undefined && next.simTimeSec >= robot.waitUntilSec) {
      const targetOrientation = robot.routePhase === "PRE_ROTATION" ? task.requiredStationOrientationDeg : layout.racks.find((rack) => rack.id === task.rackId)?.currentOrientationDeg;
      next.rackStates[task.rackId] = {
        ...next.rackStates[task.rackId],
        currentOrientationDeg: targetOrientation ?? next.rackStates[task.rackId]?.currentOrientationDeg ?? 0
      };
      if (robot.routePhase === "PRE_ROTATION") {
        next.tasks = next.tasks.map((item) => (item.taskId === task.taskId ? { ...item, rotationPreCompleted: true } : item));
        next.robots = next.robots.map((item) =>
          item.robotId === robot.robotId
            ? { ...item, state: "MOVING_LOADED", color: robotColors.MOVING_LOADED, currentPath: task.routePlan?.loadedPathToStation ?? [], routeIndex: 0, segmentProgressM: 0, pathProgress: 0, waitUntilSec: undefined, routePhase: "TO_STATION" }
            : item
        );
      } else {
        next.tasks = next.tasks.map((item) => (item.taskId === task.taskId ? { ...item, rotationPostCompleted: true } : item));
        next.robots = next.robots.map((item) =>
          item.robotId === robot.robotId
            ? { ...item, state: "RETURNING_RACK", color: robotColors.RETURNING_RACK, currentPath: task.routePlan?.returnPath ?? [], routeIndex: 0, segmentProgressM: 0, pathProgress: 0, waitUntilSec: undefined, routePhase: "RETURN_TO_STORAGE" }
            : item
        );
      }
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "rack", entityId: task.rackId, robotId: robot.robotId, taskId: task.taskId, message: `Rack ${task.rackId} rotated to ${targetOrientation ?? "default"} degrees.` });
    }
    if (robot.state === "RETURNING_RACK" && movementComplete(robot)) {
      if (robot.waitUntilSec !== undefined && next.simTimeSec < robot.waitUntilSec) continue;
      if (robot.routePhase === "POST_ROTATION") {
        const zone = layout.rotationZones.find((item) => item.cells.some((cell) => cellKey(cell) === cellKey(robot.currentCell)));
        const rotationTime = zone?.rotationTimeSec ?? 6;
        if (zone) {
          const reservation = reserveResource(next.reservationTable, zone.id, "ROTATION_ZONE", next.simTimeSec, rotationTime, 1, {
            robotId: robot.robotId,
            taskId: task.taskId,
            cells: zone.cells
          });
          if (reservation.conflict) {
            next.trafficDiagnostics.reservationConflictCount += 1;
            next.trafficDiagnostics.totalWaitTimeSec += config.reservationTimeStepSec;
            next.trafficDiagnostics.robotWaitTimes[robot.robotId] = (next.trafficDiagnostics.robotWaitTimes[robot.robotId] ?? 0) + config.reservationTimeStepSec;
            next.robots = next.robots.map((item) =>
              item.robotId === robot.robotId
                ? {
                    ...item,
                    waitUntilSec: next.simTimeSec + config.reservationTimeStepSec,
                    waitingReason: `Waiting for rotation zone ${zone.rotationZoneId}`,
                    conflictTarget: zone.id,
                    totalWaitTimeSec: (item.totalWaitTimeSec ?? 0) + config.reservationTimeStepSec
                  }
                : item
            );
            next.eventLog = log(next.eventLog, {
              timeSec: next.simTimeSec,
              severity: "warning",
              entityType: "resource",
              entityId: zone.id,
              robotId: robot.robotId,
              taskId: task.taskId,
              message: `Rotation zone ${zone.rotationZoneId} is busy; ${robot.robotId} will wait.`
            });
            continue;
          }
          next.reservationTable = reservation.table;
        }
        next.robots = next.robots.map((item) =>
          item.robotId === robot.robotId ? { ...item, state: "ROTATING_WITH_RACK", color: robotColors.ROTATING_WITH_RACK, waitUntilSec: next.simTimeSec + rotationTime } : item
        );
        next.operationalTasks = next.operationalTasks.map((item) =>
          item.operationalTaskId === task.operationalTaskId ? { ...item, status: "ROTATING_POST_STATION" } : item
        );
        next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "rack", entityId: task.rackId, robotId: robot.robotId, taskId: task.taskId, message: `Rack ${task.rackId} entered post-station rotation zone.` });
        continue;
      }
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId ? { ...item, state: "DROPPING_RACK", color: robotColors.DROPPING_RACK, waitUntilSec: next.simTimeSec + item.dropTimeSec, currentPath: [] } : item
      );
      next.operationalTasks = next.operationalTasks.map((item) =>
        item.operationalTaskId === task.operationalTaskId ? { ...item, status: "DROPPING", timestamps: { ...item.timestamps, droppingAtSec: next.simTimeSec } } : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "rack", entityId: task.rackId, robotId: robot.robotId, taskId: task.taskId, message: `${robot.robotId} returned rack to storage approach.` });
    }
    if (robot.state === "DROPPING_RACK" && robot.waitUntilSec !== undefined && next.simTimeSec >= robot.waitUntilSec) {
      const completed = { ...task, status: "COMPLETED" as const, completedAtSec: next.simTimeSec };
      next.completedTasks.push(completed);
      next.tasks = next.tasks.filter((item) => item.taskId !== task.taskId);
      const destinationStorageId = task.destinationStorageLocationId ?? next.rackStates[task.rackId]?.homeStorageLocationId;
      next.rackStates[task.rackId] = {
        ...next.rackStates[task.rackId],
        operationalStatus: "STORED",
        currentStorageLocationId: destinationStorageId,
        destinationStorageLocationId: undefined,
        carriedByRobotId: undefined,
        activeTaskId: undefined
      };
      if (destinationStorageId && next.storageLocationStates[destinationStorageId]) {
        next.storageLocationStates[destinationStorageId] = {
          ...next.storageLocationStates[destinationStorageId],
          status: "OCCUPIED",
          currentlyStoredRackId: task.rackId,
          reservedForRackId: undefined
        };
      }
      next.operationalTasks = next.operationalTasks.map((item) =>
        item.operationalTaskId === task.operationalTaskId ? { ...item, status: "COMPLETED", timestamps: { ...item.timestamps, completedAtSec: next.simTimeSec } } : item
      );
      next.robots = next.robots.map((item) =>
        item.robotId === robot.robotId
          ? { ...item, state: "IDLE", color: robotColors.IDLE, assignedTaskId: undefined, carryingRackId: undefined, currentPath: [], routeIndex: 0, segmentProgressM: 0, pathProgress: 0, waitUntilSec: undefined, routePhase: undefined }
          : item
      );
      next.eventLog = log(next.eventLog, { timeSec: next.simTimeSec, severity: "info", entityType: "task", entityId: task.taskId, robotId: robot.robotId, taskId: task.taskId, message: `Task ${task.taskId} completed; rack stored at ${destinationStorageId ?? "unknown storage"}.` });
    }
  }
  void layout;
  void config;
  return next;
}

export function calculateSimulationMetrics(
  stateLike: Pick<SimulationState, "robots" | "tasks" | "completedTasks" | "failedTasks" | "stationQueues"> & Partial<Pick<SimulationState, "trafficDiagnostics">>,
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
  const diagnostics = stateLike.trafficDiagnostics ?? emptyTrafficDiagnostics;
  const robotUtilizationByState = stateLike.robots.reduce<Record<string, number>>((counts, robot) => {
    counts[robot.state] = (counts[robot.state] ?? 0) + 1;
    return counts;
  }, {});
  const denominator = Math.max(1, activeTaskCount + stateLike.completedTasks.length + stateLike.failedTasks.length);
  return {
    activeRobotCount: stateLike.robots.length,
    activeTaskCount,
    completedTaskCount: stateLike.completedTasks.length,
    failedTaskCount: stateLike.failedTasks.length,
    blockedRobotCount: stateLike.robots.filter((robot) => ["BLOCKED", "ERROR"].includes(robot.state)).length,
    averageTaskCycleTimeSec,
    estimatedThroughputPerHour: simTimeSec > 0 ? (stateLike.completedTasks.length / simTimeSec) * 3600 : 0,
    averageRobotUtilization: stateLike.robots.length > 0 ? busyRobots / stateLike.robots.length : 0,
    stationUtilization: layout.stations.length > 0 ? busyStations / layout.stations.length : 0,
    totalWaitTimeSec: diagnostics.totalWaitTimeSec,
    averageWaitTimePerTaskSec: diagnostics.totalWaitTimeSec / denominator,
    reservationConflictCount: diagnostics.reservationConflictCount,
    replanCount: diagnostics.replanCount,
    deadlockCount: diagnostics.deadlockCount,
    deadlockRecoveryCount: diagnostics.deadlockRecoveryCount,
    failedDueToTrafficCount: diagnostics.failedDueToTrafficCount,
    averageQueueWaitTimeSec: 0,
    maxQueueWaitTimeSec: 0,
    loadedTravelDistanceM: 0,
    emptyTravelDistanceM: 0,
    loadedTravelTimeSec: 0,
    emptyTravelTimeSec: 0,
    robotUtilizationByState,
    stationQueueUtilization:
      layout.stations.length > 0
        ? stateLike.stationQueues.reduce((sum, queue) => {
            const station = layout.stations.find((item) => item.id === queue.stationId);
            return sum + (station?.maxQueueLength ? queue.waitingRobotIds.length / station.maxQueueLength : 0);
          }, 0) / layout.stations.length
        : 0,
    rotationZoneUtilization: 0,
    storageReallocationCount: 0
  };
}

export function stepSimulation(layout: WarehouseLayout, state: SimulationState, config: SimulationConfig, deltaTimeSec: number): SimulationState {
  if (!state.initialized) return state;
  const normalized = layout.storageLocations?.length ? layout : ensureStorageLocations(layout);
  let next: SimulationState = {
    ...structuredClone(state),
    simTimeSec: state.simTimeSec + deltaTimeSec
  };
  next = assignTasks(normalized, next, config);
  next.robots = next.robots.map((robot) => {
    if (["MOVING_EMPTY", "MOVING_LOADED", "RETURNING_RACK"].includes(robot.state)) return advanceRobotOnPath(normalized, robot, deltaTimeSec);
    return robot;
  });
  next = handleRobotTransitions(normalized, next, config);
  next = updateStationQueues(normalized, next, config);
  if (config.deadlockDetectionEnabled) {
    const detections = detectDeadlocks(next, config);
    if (detections.length > 0) {
      const recovery = applyDeadlockRecovery(next, detections, config);
      next = recovery.state;
      for (const event of recovery.events) next.eventLog = log(next.eventLog, event);
    }
  }
  next.metrics = calculateSimulationMetrics(next, next.simTimeSec, normalized);
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
    .flatMap(([, records]) => records.flatMap((record) => record.cells ?? (record.cell ? [record.cell] : [])));
}
