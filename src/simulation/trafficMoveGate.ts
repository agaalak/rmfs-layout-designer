import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Robot } from "../models/robot";
import type { SimulationConfig, SimulationEvent, SimulationState, TrafficDiagnostics } from "../models/simulation";
import { cellKey, inBounds, manhattanMeters } from "../utils/gridMath";
import { getRobotEnvelopeAtCell, envelopeOverlapsBlockedCells, envelopeOverlapsStaticRacks } from "./collisionEnvelope";
import { storageLocationForRackTask } from "./pathPlanner";
import { movementComplete } from "./lifecycle/robotTaskLifecycle";

export interface CellOccupancyClaim {
  cell: GridCell;
  ownerId: string;
  robotId?: string;
  taskId?: string;
  kind: "robot_current" | "robot_pose" | "robot_target" | "queue_reservation" | "station_service";
}

export interface TrafficMoveIntent {
  robotId: string;
  taskId?: string;
  fromCell: GridCell;
  toCell: GridCell;
  priority: number;
  routePhase?: Robot["routePhase"];
  state: Robot["state"];
}

export interface TrafficMoveDenial extends TrafficMoveIntent {
  reason: string;
  conflictTarget?: string;
  cells?: GridCell[];
}

export interface TrafficMoveGateResult {
  state: SimulationState;
  intents: TrafficMoveIntent[];
  deniedMoves: TrafficMoveDenial[];
  events: SimulationEvent[];
}

function poseForCell(cell: GridCell, yawDeg = 0) {
  return { x: cell.col + 0.5, y: cell.row + 0.5, yawDeg };
}

function yawBetween(from: GridCell, to: GridCell) {
  if (to.col > from.col) return 90;
  if (to.col < from.col) return 270;
  if (to.row > from.row) return 180;
  return 0;
}

function poseCell(robot: Robot, grid: WarehouseLayout["grid"]): GridCell | undefined {
  const cell = { row: Math.floor(robot.pose.y), col: Math.floor(robot.pose.x) };
  return inBounds(cell, grid) ? cell : undefined;
}

function sameCell(a?: GridCell, b?: GridCell) {
  return Boolean(a && b && cellKey(a) === cellKey(b));
}

function addEnvelopeClaims(
  claims: CellOccupancyClaim[],
  layout: WarehouseLayout,
  state: SimulationState,
  robot: Robot,
  cell: GridCell,
  kind: CellOccupancyClaim["kind"]
) {
  const envelope = getRobotEnvelopeAtCell(layout, state, robot, cell);
  for (const occupiedCell of envelope.occupiedCells) {
    claims.push({
      cell: occupiedCell,
      ownerId: robot.robotId,
      robotId: robot.robotId,
      taskId: robot.assignedTaskId,
      kind
    });
  }
}

function anticipatedNextCellForStoppedRobot(state: SimulationState, robot: Robot): GridCell | undefined {
  if (robot.state !== "ROTATING_WITH_RACK") return undefined;
  const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
  const path = robot.routePhase === "PRE_ROTATION" ? task?.routePlan?.loadedPathToStation : robot.routePhase === "POST_ROTATION" ? task?.routePlan?.returnPath : undefined;
  if (!path || path.length === 0) return undefined;
  const currentIndex = path.findIndex((cell) => sameCell(cell, robot.currentCell));
  return currentIndex >= 0 ? path[currentIndex + 1] : path[1];
}

function taskAllowsRackOverlap(layout: WarehouseLayout, state: SimulationState, robot: Robot, cell: GridCell) {
  const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
  if (!task || robot.carryingRackId) return robot.carryingRackId;
  const rack = layout.racks.find((item) => item.id === task.rackId);
  if (!rack) return undefined;
  const pickupCell = storageLocationForRackTask(layout, rack, task.sourceStorageLocationId)?.podServiceCell ?? rack.homeCell;
  return sameCell(cell, pickupCell) ? task.rackId : undefined;
}

function centerCellAccessError(layout: WarehouseLayout, state: SimulationState, robot: Robot, cell: GridCell): string | undefined {
  const layoutCell = layout.cells.find((item) => sameCell(item, cell));
  const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
  if (!layoutCell || layoutCell.cellType === "EMPTY") return `Cell ${cellKey(cell)} is not a traversable runtime cell.`;
  if (layoutCell.cellType === "STATION") {
    const station = layout.stations.find((item) => sameCell(item.cell, cell));
    if (!station || task?.stationId !== station.id || robot.routePhase !== "TO_STATION") {
      return `Station cell ${cellKey(cell)} is reserved for its assigned service task.`;
    }
  }
  if (layoutCell.cellType === "RACK_STORAGE") {
    if (!task) return `Storage cell ${cellKey(cell)} is reserved for assigned pickup/drop.`;
    const rack = layout.racks.find((item) => item.id === task.rackId);
    if (!rack) return `Storage cell ${cellKey(cell)} is reserved for a valid rack task.`;
    const pickupCell = storageLocationForRackTask(layout, rack, task.sourceStorageLocationId)?.podServiceCell ?? rack.homeCell;
    const dropCell = storageLocationForRackTask(layout, rack, task.destinationStorageLocationId)?.podServiceCell ?? rack.homeCell;
    const enteringPickup = !robot.carryingRackId && robot.routePhase === "TO_RACK" && sameCell(cell, pickupCell);
    const enteringDrop = robot.carryingRackId === task.rackId && robot.routePhase === "RETURN_TO_STORAGE" && sameCell(cell, dropCell);
    if (!enteringPickup && !enteringDrop) return `Storage cell ${cellKey(cell)} is not pass-through road.`;
  }
  return undefined;
}

function isMovingRobot(robot: Robot) {
  return ["MOVING_EMPTY", "MOVING_LOADED", "RETURNING_RACK"].includes(robot.state) && !movementComplete(robot);
}

function priorityForRobot(layout: WarehouseLayout, state: SimulationState, robot: Robot, toCell: GridCell) {
  let priority = 0;
  if (robot.state === "RETURNING_RACK") priority += 80;
  if (robot.state === "MOVING_LOADED") priority += 70;
  if (robot.carryingRackId) priority += 20;
  const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
  const station = task?.stationId ? layout.stations.find((item) => item.id === task.stationId) : undefined;
  if (station && sameCell(station.cell, toCell)) priority += 40;
  const queueLane = task?.queueLaneId ? layout.queueLanes?.find((lane) => lane.queueLaneId === task.queueLaneId) : undefined;
  if (queueLane?.cells.some((item) => sameCell(item.cell, robot.currentCell))) priority += 25;
  if (robot.segmentProgressM > 0) priority += 15;
  priority += Math.max(0, 10 - Number(robot.robotId.replace(/\D/g, "") || 0) / 1000);
  return priority;
}

function collectClaims(
  layout: WarehouseLayout,
  state: SimulationState,
  robots: Robot[],
  unprocessedMovingRobotIds: Set<string>,
  excludeRobotId?: string
): CellOccupancyClaim[] {
  const claims: CellOccupancyClaim[] = [];
  for (const robot of robots) {
    if (robot.robotId === excludeRobotId) continue;
    addEnvelopeClaims(claims, layout, state, robot, robot.currentCell, "robot_current");
    const visualCell = poseCell(robot, layout.grid);
    if (visualCell && !sameCell(visualCell, robot.currentCell)) {
      addEnvelopeClaims(claims, layout, state, robot, visualCell, "robot_pose");
    }
    const targetIsAlreadyOwned = Boolean(robot.targetCell && (!unprocessedMovingRobotIds.has(robot.robotId) || robot.segmentProgressM > 0));
    if (targetIsAlreadyOwned && robot.targetCell && !sameCell(robot.targetCell, robot.currentCell)) {
      addEnvelopeClaims(claims, layout, state, robot, robot.targetCell, "robot_target");
    }
    const anticipatedNext = anticipatedNextCellForStoppedRobot(state, robot);
    if (anticipatedNext && !sameCell(anticipatedNext, robot.currentCell)) {
      addEnvelopeClaims(claims, layout, state, robot, anticipatedNext, "robot_target");
    }
  }
  for (const laneState of Object.values(state.queueLaneStates ?? {})) {
    for (const queueCell of laneState.occupiedCells) {
      if (!queueCell.reservedRobotId && !queueCell.reservedTaskId) continue;
      claims.push({
        cell: queueCell.cell,
        ownerId: queueCell.reservedRobotId ?? queueCell.reservedTaskId ?? laneState.queueLaneId,
        robotId: queueCell.reservedRobotId,
        taskId: queueCell.reservedTaskId,
        kind: "queue_reservation"
      });
    }
  }
  for (const [queuePointId, pointState] of Object.entries(state.queuePointStates ?? {})) {
    const queuePoint = layout.queuePoints?.find((point) => point.queuePointId === queuePointId);
    if (!queuePoint) continue;
    const ownerId = pointState.occupiedRobotId ?? pointState.reservedRobotIds[0] ?? pointState.occupiedTaskId ?? pointState.reservedTaskIds[0];
    if (!ownerId) continue;
    claims.push({
      cell: queuePoint.cell,
      ownerId,
      robotId: pointState.occupiedRobotId ?? pointState.reservedRobotIds[0],
      taskId: pointState.occupiedTaskId ?? pointState.reservedTaskIds[0],
      kind: "queue_reservation"
    });
  }
  for (const [stationId, stationState] of Object.entries(state.stationStates ?? {})) {
    if (!stationState.activeRobotId) continue;
    const station = layout.stations.find((item) => item.id === stationId);
    if (!station) continue;
    claims.push({
      cell: station.cell,
      ownerId: stationState.activeRobotId,
      robotId: stationState.activeRobotId,
      kind: "station_service"
    });
  }
  return claims;
}

function ownerMatchesRobotOrTask(claim: CellOccupancyClaim, robot: Robot) {
  return claim.robotId === robot.robotId || Boolean(robot.assignedTaskId && claim.taskId === robot.assignedTaskId);
}

function blockedByClaim(claims: CellOccupancyClaim[], robot: Robot, cells: GridCell[]) {
  const cellKeys = new Set(cells.map(cellKey));
  return claims.find((claim) => !ownerMatchesRobotOrTask(claim, robot) && cellKeys.has(cellKey(claim.cell)));
}

function edgeSwapBlocker(robots: Robot[], robot: Robot, toCell: GridCell) {
  return robots.find(
    (other) =>
      other.robotId !== robot.robotId &&
      other.targetCell &&
      sameCell(other.currentCell, toCell) &&
      sameCell(other.targetCell, robot.currentCell)
  );
}

function denyRobot(robot: Robot, denial: TrafficMoveDenial, config: SimulationConfig, simTimeSec: number): Robot {
  return {
    ...robot,
    pose: poseForCell(robot.currentCell, robot.pose.yawDeg),
    targetCell: undefined,
    segmentProgressM: 0,
    pathProgress: robot.routeIndex,
    waitingReason: denial.reason,
    conflictTarget: denial.conflictTarget,
    blockedSinceSec: robot.blockedSinceSec ?? simTimeSec,
    totalWaitTimeSec: (robot.totalWaitTimeSec ?? 0) + config.reservationTimeStepSec
  };
}

function backoffIfBlockingHigherPriority(
  layout: WarehouseLayout,
  state: SimulationState,
  robots: Robot[],
  robot: Robot,
  denial: TrafficMoveDenial,
  config: SimulationConfig,
  simTimeSec: number
): Robot | undefined {
  const blocker = denial.conflictTarget ? robots.find((item) => item.robotId === denial.conflictTarget) : undefined;
  const blockerNext = blocker?.currentPath?.[blocker.routeIndex + 1];
  if (!blocker || !sameCell(blockerNext, robot.currentCell)) return undefined;
  const previousCell = robot.currentPath[robot.routeIndex - 1];
  if (!previousCell) return undefined;
  const claims = collectClaims(layout, state, robots, new Set(), robot.robotId);
  const envelope = getRobotEnvelopeAtCell(layout, state, robot, previousCell);
  if (blockedByClaim(claims, robot, envelope.occupiedCells)) return undefined;
  if (envelopeOverlapsBlockedCells(layout, envelope).length > 0) return undefined;
  return {
    ...robot,
    currentCell: previousCell,
    pose: poseForCell(previousCell, yawBetween(robot.currentCell, previousCell)),
    routeIndex: Math.max(0, robot.routeIndex - 1),
    segmentProgressM: 0,
    pathProgress: Math.max(0, robot.routeIndex - 1),
    targetCell: undefined,
    waitingReason: `Backed off from ${cellKey(robot.currentCell)} to clear ${blocker.robotId}`,
    conflictTarget: blocker.robotId,
    blockedSinceSec: robot.blockedSinceSec ?? simTimeSec,
    totalWaitTimeSec: (robot.totalWaitTimeSec ?? 0) + config.reservationTimeStepSec
  };
}

function robotTravelDistance(robot: Robot, deltaTimeSec: number) {
  const speed = robot.state === "MOVING_EMPTY" ? robot.speedUnloadedMps : robot.speedLoadedMps;
  return speed * deltaTimeSec;
}

function advanceRobotByMeters(layout: WarehouseLayout, robot: Robot, meters: number): { robot: Robot; consumedMeters: number; completedSegment: boolean } {
  if (movementComplete(robot)) return { robot, consumedMeters: 0, completedSegment: false };
  const from = robot.currentPath[robot.routeIndex];
  const to = robot.currentPath[robot.routeIndex + 1];
  const segmentDistance = Math.max(0.001, manhattanMeters(from, to, layout.grid));
  const consume = Math.min(meters, segmentDistance - robot.segmentProgressM);
  const segmentProgressM = robot.segmentProgressM + consume;
  const t = Math.min(1, segmentProgressM / segmentDistance);
  if (segmentProgressM >= segmentDistance - 1e-6) {
    return {
      robot: {
        ...robot,
        routeIndex: robot.routeIndex + 1,
        segmentProgressM: 0,
        currentCell: to,
        pose: poseForCell(to, yawBetween(from, to)),
        targetCell: undefined,
        pathProgress: robot.routeIndex + 1,
        waitingReason: undefined,
        conflictTarget: undefined,
        blockedSinceSec: undefined
      },
      consumedMeters: consume,
      completedSegment: true
    };
  }
  return {
    robot: {
      ...robot,
      segmentProgressM,
      pose: {
        x: from.col + 0.5 + (to.col - from.col) * t,
        y: from.row + 0.5 + (to.row - from.row) * t,
        yawDeg: yawBetween(from, to)
      },
      targetCell: to,
      pathProgress: robot.routeIndex + t,
      waitingReason: undefined,
      conflictTarget: undefined,
      blockedSinceSec: undefined
    },
    consumedMeters: consume,
    completedSegment: false
  };
}

function deniedEvent(denial: TrafficMoveDenial, timeSec: number): SimulationEvent {
  return {
    timeSec,
    severity: "warning",
    entityType: "traffic",
    entityId: denial.robotId,
    robotId: denial.robotId,
    taskId: denial.taskId,
    message: `Collision prevented before entry: ${denial.reason}`,
    details: {
      fromCell: denial.fromCell,
      toCell: denial.toCell,
      conflictTarget: denial.conflictTarget,
      cells: denial.cells
    }
  };
}

function diagnosticsAfterMoveGate(
  diagnostics: TrafficDiagnostics,
  config: SimulationConfig,
  simTimeSec: number,
  intents: TrafficMoveIntent[],
  deniedMoves: TrafficMoveDenial[]
): TrafficDiagnostics {
  const robotWaitTimes = { ...diagnostics.robotWaitTimes };
  const robotBlockedSinceSec = { ...diagnostics.robotBlockedSinceSec };
  for (const denial of deniedMoves) {
    robotWaitTimes[denial.robotId] = (robotWaitTimes[denial.robotId] ?? 0) + config.reservationTimeStepSec;
    robotBlockedSinceSec[denial.robotId] = robotBlockedSinceSec[denial.robotId] ?? simTimeSec;
  }
  const moveRecords = [
    ...diagnostics.lastMoveIntents,
    ...intents.map((intent) => {
      const denial = deniedMoves.find((item) => item.robotId === intent.robotId);
      return {
        timeSec: simTimeSec,
        robotId: intent.robotId,
        fromCell: intent.fromCell,
        toCell: intent.toCell,
        granted: !denial,
        reason: denial?.reason,
        conflictTarget: denial?.conflictTarget
      };
    })
  ].slice(-80);
  return {
    ...diagnostics,
    moveIntentCount: diagnostics.moveIntentCount + intents.length,
    deniedMoveCount: diagnostics.deniedMoveCount + deniedMoves.length,
    reservationConflictCount: diagnostics.reservationConflictCount + deniedMoves.length,
    totalWaitTimeSec: diagnostics.totalWaitTimeSec + deniedMoves.length * config.reservationTimeStepSec,
    robotWaitTimes,
    robotBlockedSinceSec,
    lastMoveIntents: moveRecords,
    lastConflicts: [
      ...diagnostics.lastConflicts,
      ...deniedMoves.map((denial) => ({
        timeSec: simTimeSec,
        robotId: denial.robotId,
        taskId: denial.taskId,
        message: denial.reason
      }))
    ].slice(-20),
    runtimeCollisionPreventionCount: diagnostics.runtimeCollisionPreventionCount + deniedMoves.length,
    unsafeAttemptedMoves: [
      ...diagnostics.unsafeAttemptedMoves,
      ...deniedMoves.map((denial) => ({
        timeSec: simTimeSec,
        robotId: denial.robotId,
        message: denial.reason,
        cells: denial.cells ?? [denial.toCell]
      }))
    ].slice(-30)
  };
}

export function applyTrafficMoveGate(
  layout: WarehouseLayout,
  state: SimulationState,
  config: SimulationConfig,
  deltaTimeSec: number
): TrafficMoveGateResult {
  const movingRobots = state.robots
    .filter(isMovingRobot)
    .map((robot) => ({
      robot,
      toCell: robot.currentPath[robot.routeIndex + 1],
      priority: robot.currentPath[robot.routeIndex + 1] ? priorityForRobot(layout, state, robot, robot.currentPath[robot.routeIndex + 1]) : 0
    }))
    .filter((item): item is { robot: Robot; toCell: GridCell; priority: number } => Boolean(item.toCell))
    .sort((a, b) => b.priority - a.priority || a.robot.robotId.localeCompare(b.robot.robotId));

  const intents: TrafficMoveIntent[] = [];
  const deniedMoves: TrafficMoveDenial[] = [];
  const events: SimulationEvent[] = [];
  let robots = [...state.robots];
  const unprocessed = new Set(movingRobots.map((item) => item.robot.robotId));

  for (const { robot: originalRobot, priority } of movingRobots) {
    let robot = robots.find((item) => item.robotId === originalRobot.robotId);
    if (!robot || movementComplete(robot)) {
      unprocessed.delete(originalRobot.robotId);
      continue;
    }
    let remainingMeters = robotTravelDistance(robot, deltaTimeSec);
    while (remainingMeters > 1e-6 && robot && !movementComplete(robot)) {
      const currentRobot = robot;
      const toCell = currentRobot.currentPath[currentRobot.routeIndex + 1];
      if (!toCell) break;
      const intent: TrafficMoveIntent = {
        robotId: currentRobot.robotId,
        taskId: currentRobot.assignedTaskId,
        fromCell: currentRobot.currentCell,
        toCell,
        priority,
        routePhase: currentRobot.routePhase,
        state: currentRobot.state
      };
      intents.push(intent);
      const accessError = centerCellAccessError(layout, state, currentRobot, toCell);
      const claims = collectClaims(layout, state, robots, unprocessed, currentRobot.robotId);
      const envelope = getRobotEnvelopeAtCell(layout, state, currentRobot, toCell);
      const claim = blockedByClaim(claims, currentRobot, envelope.occupiedCells);
      const swap = edgeSwapBlocker(robots, currentRobot, toCell);
      const ignoredRackId = taskAllowsRackOverlap(layout, state, currentRobot, toCell);
      const blockedCells = envelopeOverlapsBlockedCells(layout, envelope);
      const staticRack = envelopeOverlapsStaticRacks(layout, state, envelope, ignoredRackId)[0];
      let denial: TrafficMoveDenial | undefined;

      if (accessError) {
        denial = { ...intent, reason: accessError, conflictTarget: cellKey(toCell), cells: [toCell] };
      } else if (blockedCells.length > 0) {
        denial = { ...intent, reason: `Envelope would overlap blocked or out-of-bounds cell ${cellKey(blockedCells[0])}.`, conflictTarget: cellKey(blockedCells[0]), cells: blockedCells };
      } else if (staticRack) {
        denial = { ...intent, reason: `Envelope would overlap stored rack ${staticRack.rackId} at ${cellKey(staticRack.cell)}.`, conflictTarget: staticRack.rackId, cells: [staticRack.cell] };
      } else if (swap) {
        denial = { ...intent, reason: `${currentRobot.robotId} cannot edge-swap with ${swap.robotId}.`, conflictTarget: swap.robotId, cells: [currentRobot.currentCell, toCell] };
      } else if (claim) {
        const stationWait = layout.stations.find((station) => sameCell(station.cell, toCell));
        const reason = stationWait ? `Waiting at queue head for station ${stationWait.stationId} service cell` : `Cell ${cellKey(claim.cell)} is occupied or claimed by ${claim.ownerId}.`;
        denial = { ...intent, reason, conflictTarget: claim.ownerId, cells: [claim.cell] };
      }

      if (denial) {
        deniedMoves.push(denial);
        events.push(deniedEvent(denial, state.simTimeSec));
        const backedOff = backoffIfBlockingHigherPriority(layout, state, robots, currentRobot, denial, config, state.simTimeSec);
        robots = robots.map((item) => (item.robotId === currentRobot.robotId ? backedOff ?? denyRobot(item, denial!, config, state.simTimeSec) : item));
        robot = robots.find((item) => item.robotId === originalRobot.robotId);
        break;
      }

      const advanced = advanceRobotByMeters(layout, currentRobot, remainingMeters);
      remainingMeters -= advanced.consumedMeters;
      robots = robots.map((item) => (item.robotId === currentRobot.robotId ? advanced.robot : item));
      robot = advanced.robot;
      if (!advanced.completedSegment) break;
    }
    unprocessed.delete(originalRobot.robotId);
  }

  const nextState = {
    ...state,
    robots,
    trafficDiagnostics: diagnosticsAfterMoveGate(state.trafficDiagnostics, config, state.simTimeSec, intents, deniedMoves)
  };
  return { state: nextState, intents, deniedMoves, events };
}

export function trafficOccupancySnapshot(layout: WarehouseLayout, state: SimulationState): CellOccupancyClaim[] {
  return collectClaims(layout, state, state.robots, new Set(), undefined);
}
