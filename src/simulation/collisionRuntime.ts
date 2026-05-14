import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Robot } from "../models/robot";
import type { SimulationConfig, SimulationEvent, SimulationState } from "../models/simulation";
import { cellKey } from "../utils/gridMath";
import {
  envelopeOverlapsBlockedCells,
  envelopeOverlapsStaticRacks,
  envelopesOverlap,
  getRobotEnvelope,
  type RobotEnvelope
} from "./collisionEnvelope";

export interface RuntimeCollisionIssue {
  type: "robot_robot" | "edge_swap" | "blocked_cell" | "static_rack";
  robotId: string;
  otherRobotId?: string;
  rackId?: string;
  cells: GridCell[];
  message: string;
}

export function getRobotRuntimeEnvelope(layout: WarehouseLayout, state: SimulationState, robot: Robot): RobotEnvelope {
  return getRobotEnvelope(layout, state, robot);
}

export function getAllRobotRuntimeEnvelopes(layout: WarehouseLayout, state: SimulationState): RobotEnvelope[] {
  return state.robots.map((robot) => getRobotRuntimeEnvelope(layout, state, robot));
}

function robotPriority(robot?: Robot) {
  if (!robot) return 0;
  let score = 0;
  if (robot.carryingRackId) score += 100;
  if (robot.assignedTaskId) score += 20;
  if (["SERVICING_AT_STATION", "ROTATING_WITH_RACK", "DROPPING_RACK", "LIFTING_RACK"].includes(robot.state)) score += 40;
  if (["MOVING_LOADED", "RETURNING_RACK"].includes(robot.state)) score += 30;
  return score;
}

function lowerPriorityRobot(a: Robot | undefined, b: Robot | undefined): Robot | undefined {
  if (!a) return b;
  if (!b) return a;
  const delta = robotPriority(a) - robotPriority(b);
  if (delta < 0) return a;
  if (delta > 0) return b;
  return a.robotId > b.robotId ? a : b;
}

export function detectRobotRobotOverlaps(layout: WarehouseLayout, state: SimulationState): RuntimeCollisionIssue[] {
  const envelopes = getAllRobotRuntimeEnvelopes(layout, state);
  const issues: RuntimeCollisionIssue[] = [];
  for (let i = 0; i < envelopes.length; i += 1) {
    for (let j = i + 1; j < envelopes.length; j += 1) {
      const a = envelopes[i];
      const b = envelopes[j];
      if (!envelopesOverlap(a, b)) continue;
      const overlap = a.occupiedCells.filter((cell) => b.occupiedCells.some((other) => cellKey(other) === cellKey(cell)));
      issues.push({
        type: "robot_robot",
        robotId: a.robotId,
        otherRobotId: b.robotId,
        cells: overlap,
        message: `${a.robotId} and ${b.robotId} attempted to occupy overlapping envelope cells.`
      });
    }
  }
  return issues;
}

export function detectRobotRackOverlaps(layout: WarehouseLayout, state: SimulationState): RuntimeCollisionIssue[] {
  return state.robots.flatMap((robot) => {
    const envelope = getRobotRuntimeEnvelope(layout, state, robot);
    return envelopeOverlapsStaticRacks(layout, state, envelope, robot.carryingRackId).map((overlap) => ({
      type: "static_rack" as const,
      robotId: robot.robotId,
      rackId: overlap.rackId,
      cells: [overlap.cell],
      message: `${robot.robotId} attempted to overlap stored rack ${overlap.rackId}.`
    }));
  });
}

export function detectRobotBlockedCellOverlaps(layout: WarehouseLayout, state: SimulationState): RuntimeCollisionIssue[] {
  return state.robots.flatMap((robot) => {
    const envelope = getRobotRuntimeEnvelope(layout, state, robot);
    const blocked = envelopeOverlapsBlockedCells(layout, envelope);
    return blocked.length > 0
      ? [{
          type: "blocked_cell" as const,
          robotId: robot.robotId,
          cells: blocked,
          message: `${robot.robotId} attempted to overlap blocked or out-of-bounds cells.`
        }]
      : [];
  });
}

export function detectRobotStaticResourceOverlaps(layout: WarehouseLayout, state: SimulationState): RuntimeCollisionIssue[] {
  return [...detectRobotBlockedCellOverlaps(layout, state), ...detectRobotRackOverlaps(layout, state)];
}

export function detectEdgeSwapOverlaps(previous: SimulationState, proposed: SimulationState): RuntimeCollisionIssue[] {
  const issues: RuntimeCollisionIssue[] = [];
  for (let i = 0; i < proposed.robots.length; i += 1) {
    for (let j = i + 1; j < proposed.robots.length; j += 1) {
      const a = proposed.robots[i];
      const b = proposed.robots[j];
      const prevA = previous.robots.find((robot) => robot.robotId === a.robotId);
      const prevB = previous.robots.find((robot) => robot.robotId === b.robotId);
      if (!prevA || !prevB) continue;
      const swapped =
        cellKey(prevA.currentCell) === cellKey(b.currentCell) &&
        cellKey(prevB.currentCell) === cellKey(a.currentCell) &&
        cellKey(prevA.currentCell) !== cellKey(a.currentCell);
      if (swapped) {
        issues.push({
          type: "edge_swap",
          robotId: a.robotId,
          otherRobotId: b.robotId,
          cells: [a.currentCell, b.currentCell],
          message: `${a.robotId} and ${b.robotId} attempted an edge-swap collision.`
        });
      }
    }
  }
  return issues;
}

export function detectRuntimeCollisions(layout: WarehouseLayout, previous: SimulationState | undefined, proposed: SimulationState): RuntimeCollisionIssue[] {
  return [
    ...detectRobotRobotOverlaps(layout, proposed),
    ...(previous ? detectEdgeSwapOverlaps(previous, proposed) : []),
    ...detectRobotStaticResourceOverlaps(layout, proposed)
  ];
}

export function assertNoRuntimeCollisions(layout: WarehouseLayout, state: SimulationState): void {
  const issues = detectRuntimeCollisions(layout, undefined, state);
  if (issues.length > 0) throw new Error(issues[0].message);
}

export function applyCollisionGuard(
  layout: WarehouseLayout,
  previous: SimulationState,
  proposed: SimulationState,
  config: SimulationConfig
): SimulationState {
  if (!config.collisionCheckingEnabled) return proposed;
  const issues = detectRuntimeCollisions(layout, previous, proposed);
  if (issues.length === 0) return proposed;

  const rollbackRobotIds = new Set<string>();
  for (const issue of issues) {
    if (issue.otherRobotId) {
      const a = proposed.robots.find((robot) => robot.robotId === issue.robotId);
      const b = proposed.robots.find((robot) => robot.robotId === issue.otherRobotId);
      const prevA = previous.robots.find((robot) => robot.robotId === issue.robotId);
      const prevB = previous.robots.find((robot) => robot.robotId === issue.otherRobotId);
      const aMoved = Boolean(a && prevA && cellKey(a.currentCell) !== cellKey(prevA.currentCell));
      const bMoved = Boolean(b && prevB && cellKey(b.currentCell) !== cellKey(prevB.currentCell));
      const rollback = aMoved && !bMoved ? a : bMoved && !aMoved ? b : lowerPriorityRobot(a, b);
      if (rollback) rollbackRobotIds.add(rollback.robotId);
    } else {
      rollbackRobotIds.add(issue.robotId);
    }
  }

  const events: SimulationEvent[] = [];
  const blockedSince = { ...proposed.trafficDiagnostics.robotBlockedSinceSec };
  const waitTimes = { ...proposed.trafficDiagnostics.robotWaitTimes };
  const unsafeAttemptedMoves = [...proposed.trafficDiagnostics.unsafeAttemptedMoves];
  const lastConflicts = [...proposed.trafficDiagnostics.lastConflicts];

  const robots = proposed.robots.map((robot) => {
    if (!rollbackRobotIds.has(robot.robotId)) return robot;
    const previousRobot = previous.robots.find((item) => item.robotId === robot.robotId) ?? robot;
    const issue = issues.find((item) => item.robotId === robot.robotId || item.otherRobotId === robot.robotId);
    const message = issue?.message ?? `${robot.robotId} unsafe move prevented.`;
    blockedSince[robot.robotId] = blockedSince[robot.robotId] ?? proposed.simTimeSec;
    waitTimes[robot.robotId] = (waitTimes[robot.robotId] ?? 0) + config.reservationTimeStepSec;
    unsafeAttemptedMoves.push({ timeSec: proposed.simTimeSec, robotId: robot.robotId, message, cells: issue?.cells });
    lastConflicts.push({ timeSec: proposed.simTimeSec, robotId: robot.robotId, message });
    events.push({
      timeSec: proposed.simTimeSec,
      severity: "warning",
      entityType: "traffic",
      entityId: robot.robotId,
      robotId: robot.robotId,
      taskId: robot.assignedTaskId,
      message: `Collision prevented: ${message}`,
      details: { type: issue?.type, cells: issue?.cells }
    });
    return {
      ...previousRobot,
      waitingReason: `Collision guard: ${message}`,
      conflictTarget: issue?.otherRobotId ?? issue?.rackId,
      blockedSinceSec: blockedSince[robot.robotId],
      totalWaitTimeSec: (previousRobot.totalWaitTimeSec ?? 0) + config.reservationTimeStepSec,
      color: "#ef4444"
    };
  });

  return {
    ...proposed,
    robots,
    eventLog: [...proposed.eventLog, ...events].slice(-500),
    trafficDiagnostics: {
      ...proposed.trafficDiagnostics,
      runtimeCollisionPreventionCount: proposed.trafficDiagnostics.runtimeCollisionPreventionCount + rollbackRobotIds.size,
      totalWaitTimeSec: proposed.trafficDiagnostics.totalWaitTimeSec + rollbackRobotIds.size * config.reservationTimeStepSec,
      robotBlockedSinceSec: blockedSince,
      robotWaitTimes: waitTimes,
      unsafeAttemptedMoves: unsafeAttemptedMoves.slice(-30),
      lastConflicts: lastConflicts.slice(-20)
    }
  };
}
