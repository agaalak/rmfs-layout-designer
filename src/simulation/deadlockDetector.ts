import type { SimulationConfig, SimulationEvent, SimulationState } from "../models/simulation";
import { clearReservationsForRobot } from "./reservationTable";

export interface DeadlockDetection {
  robotIds: string[];
  detectedAtSec: number;
  reason: string;
}

function sortedIds(ids: string[]) {
  return [...new Set(ids)].sort();
}

export function detectDeadlocks(state: SimulationState, config: SimulationConfig): DeadlockDetection[] {
  if (!config.deadlockDetectionEnabled) return [];
  const detections: DeadlockDetection[] = [];
  const blocked = state.robots.filter((robot) => {
    if (!["ASSIGNED", "MOVING_EMPTY", "MOVING_LOADED", "RETURNING_RACK", "BLOCKED"].includes(robot.state)) return false;
    const blockedSince = robot.blockedSinceSec ?? state.trafficDiagnostics.robotBlockedSinceSec[robot.robotId];
    return blockedSince !== undefined && state.simTimeSec - blockedSince >= config.maxBlockedTimeSec;
  });
  if (blocked.length > 0) {
    detections.push({
      robotIds: sortedIds(blocked.map((robot) => robot.robotId)),
      detectedAtSec: state.simTimeSec,
      reason: `${blocked.length} robot(s) exceeded max blocked time.`
    });
  }

  for (const [pairKey, count] of Object.entries(state.trafficDiagnostics.repeatedConflictPairs)) {
    if (count < 2) continue;
    const robotIds = pairKey.split("__").filter((id) => id && id !== "resource");
    if (robotIds.length >= 2) {
      detections.push({
        robotIds: sortedIds(robotIds),
        detectedAtSec: state.simTimeSec,
        reason: `Repeated reservation conflicts between ${robotIds.join(" and ")}.`
      });
    }
  }

  const unique = new Map<string, DeadlockDetection>();
  for (const detection of detections) unique.set(detection.robotIds.join("__"), detection);
  return [...unique.values()];
}

function alreadyTracked(state: SimulationState, detection: DeadlockDetection) {
  const key = detection.robotIds.join("__");
  return state.trafficDiagnostics.activeDeadlocks.some((item) => item.robotIds.join("__") === key);
}

function chooseRecoveryRobot(state: SimulationState, detection: DeadlockDetection) {
  const robots = detection.robotIds.map((id) => state.robots.find((robot) => robot.robotId === id)).filter(Boolean);
  return (
    robots.find((robot) => !robot?.carryingRackId) ??
    robots.sort((a, b) => {
      const taskA = state.tasks.find((task) => task.taskId === a?.assignedTaskId)?.priority ?? 0;
      const taskB = state.tasks.find((task) => task.taskId === b?.assignedTaskId)?.priority ?? 0;
      return taskA - taskB;
    })[0]
  );
}

export function applyDeadlockRecovery(
  state: SimulationState,
  detections: DeadlockDetection[],
  config: SimulationConfig
): { state: SimulationState; events: SimulationEvent[] } {
  if (detections.length === 0) return { state, events: [] };
  let next = structuredClone(state) as SimulationState;
  const events: SimulationEvent[] = [];
  for (const detection of detections) {
    if (alreadyTracked(next, detection)) continue;
    const recoveryRobot = chooseRecoveryRobot(next, detection);
    next.trafficDiagnostics.deadlockCount += 1;
    next.trafficDiagnostics.activeDeadlocks = [
      ...next.trafficDiagnostics.activeDeadlocks,
      { robotIds: detection.robotIds, detectedAtSec: detection.detectedAtSec, reason: detection.reason }
    ].slice(-10);
    events.push({
      timeSec: state.simTimeSec,
      severity: "error",
      entityType: "deadlock",
      entityId: detection.robotIds.join(","),
      relatedIds: { robotIds: detection.robotIds },
      message: `Deadlock detected: ${detection.reason}`
    });
    if (!recoveryRobot) continue;
    next.reservationTable = clearReservationsForRobot(next.reservationTable, recoveryRobot.robotId);
    next.trafficDiagnostics.deadlockRecoveryCount += 1;
    next.robots = next.robots.map((robot) =>
      robot.robotId === recoveryRobot.robotId
        ? {
            ...robot,
            state: config.deadlockRecoveryPolicy === "wait" ? robot.state : "BLOCKED",
            color: config.deadlockRecoveryPolicy === "wait" ? robot.color : "#ef4444",
            waitUntilSec: state.simTimeSec + config.reservationTimeStepSec,
            blockedSinceSec: robot.blockedSinceSec ?? state.simTimeSec,
            blockedReason: detection.reason,
            waitingReason: config.deadlockRecoveryPolicy === "wait" ? "Deadlock recovery wait" : "Deadlock recovery requires operator/replan",
            currentPath: config.deadlockRecoveryPolicy === "wait" ? robot.currentPath : [],
            replanAttempts: (robot.replanAttempts ?? 0) + 1
          }
        : robot
    );
    next.trafficDiagnostics.robotBlockedSinceSec[recoveryRobot.robotId] = state.simTimeSec;
    next.trafficDiagnostics.robotReplanAttempts[recoveryRobot.robotId] = (next.trafficDiagnostics.robotReplanAttempts[recoveryRobot.robotId] ?? 0) + 1;
    events.push({
      timeSec: state.simTimeSec,
      severity: "warning",
      entityType: "deadlock",
      entityId: recoveryRobot.robotId,
      robotId: recoveryRobot.robotId,
      taskId: recoveryRobot.assignedTaskId,
      message: `Deadlock recovery selected ${recoveryRobot.robotId}; future reservations were cleared.`
    });
  }
  return { state: next, events };
}
