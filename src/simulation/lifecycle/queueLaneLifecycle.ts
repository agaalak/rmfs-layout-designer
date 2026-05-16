import type { WarehouseLayout } from "../../models/layout";
import type { QueueLane } from "../../models/queue";
import type { Robot } from "../../models/robot";
import type { QueueLaneRuntimeState, SimulationState, StationQueue } from "../../models/simulation";
import type { SimulationTask } from "../../models/task";
import { cellKey } from "../../utils/gridMath";
import { stationQueueLanes } from "../../utils/queueLanes";
import { movementComplete } from "./robotTaskLifecycle";

export function createQueueLaneStates(layout: WarehouseLayout): Record<string, QueueLaneRuntimeState> {
  return Object.fromEntries(
    (layout.queueLanes ?? []).map((lane) => [
      lane.queueLaneId,
      {
        queueLaneId: lane.queueLaneId,
        stationId: lane.stationId,
        occupiedCells: lane.cells.map((item) => ({ queueIndex: item.queueIndex, cell: item.cell })),
        reservedRobotIds: [],
        reservedTaskIds: []
      }
    ])
  );
}

export function taskIsActiveForQueue(task: SimulationTask) {
  return ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(task.status);
}

export function queueLaneUsedSlots(laneState?: QueueLaneRuntimeState) {
  if (!laneState) return 0;
  const occupiedTaskIds = new Set(laneState.occupiedCells.map((cell) => cell.taskId).filter(Boolean));
  const occupied = laneState.occupiedCells.filter((cell) => cell.robotId || cell.taskId).length;
  const reserved = laneState.reservedTaskIds.filter((taskId) => !occupiedTaskIds.has(taskId)).length;
  return occupied + reserved;
}

export function queueLaneCapacity(lane: QueueLane) {
  return Math.max(1, lane.maxLength ?? lane.cells.length);
}

export function chooseQueueLaneForStation(layout: WarehouseLayout, state: SimulationState, stationId: string) {
  const station = layout.stations.find((item) => item.id === stationId);
  if (!station) return undefined;
  const lanes = stationQueueLanes(layout, station);
  return lanes
    .map((lane) => ({
      lane,
      state: state.queueLaneStates[lane.queueLaneId],
      usedSlots: queueLaneUsedSlots(state.queueLaneStates[lane.queueLaneId]),
      capacity: queueLaneCapacity(lane)
    }))
    .filter((item) => item.usedSlots < item.capacity)
    .sort((a, b) => a.usedSlots - b.usedSlots || a.lane.queueLaneId.localeCompare(b.lane.queueLaneId))[0]?.lane;
}

export function stationServiceOccupancy(state: SimulationState, stationId: string) {
  const runtime = state.stationStates[stationId];
  const queue = state.stationQueues.find((item) => item.stationId === stationId);
  return runtime?.activeRobotId ?? queue?.activeRobotId;
}

export function stationHasDispatchCapacity(layout: WarehouseLayout, state: SimulationState, stationId?: string) {
  if (!stationId) return false;
  const station = layout.stations.find((item) => item.id === stationId);
  if (!station) return false;
  const lanes = stationQueueLanes(layout, station);
  if (lanes.length === 0) return !stationServiceOccupancy(state, stationId);
  return lanes.some((lane) => queueLaneUsedSlots(state.queueLaneStates[lane.queueLaneId]) < queueLaneCapacity(lane));
}

export function reserveQueueLaneSlot(state: SimulationState, laneId: string, robotId: string, taskId: string): SimulationState {
  const laneState = state.queueLaneStates[laneId];
  if (!laneState) return state;
  return {
    ...state,
    queueLaneStates: {
      ...state.queueLaneStates,
      [laneId]: {
        ...laneState,
        reservedRobotIds: laneState.reservedRobotIds.includes(robotId) ? laneState.reservedRobotIds : [...laneState.reservedRobotIds, robotId],
        reservedTaskIds: laneState.reservedTaskIds.includes(taskId) ? laneState.reservedTaskIds : [...laneState.reservedTaskIds, taskId]
      }
    }
  };
}

export function syncQueueLaneStates(layout: WarehouseLayout, state: SimulationState): SimulationState {
  const base = Object.keys(state.queueLaneStates).length > 0 ? state.queueLaneStates : createQueueLaneStates(layout);
  const activeTaskById = new Map(state.tasks.filter(taskIsActiveForQueue).map((task) => [task.taskId, task]));
  const nextStates: Record<string, QueueLaneRuntimeState> = Object.fromEntries(
    Object.entries(base).map(([laneId, laneState]) => [
      laneId,
      {
        ...laneState,
        occupiedCells: laneState.occupiedCells.map((cell) => ({ queueIndex: cell.queueIndex, cell: cell.cell })),
        reservedRobotIds: laneState.reservedRobotIds.filter((robotId) => state.robots.some((robot) => robot.robotId === robotId && robot.assignedTaskId && activeTaskById.has(robot.assignedTaskId))),
        reservedTaskIds: laneState.reservedTaskIds.filter((taskId) => activeTaskById.has(taskId)),
        activeHeadRobotId: undefined
      }
    ])
  );

  for (const robot of state.robots) {
    const task = robot.assignedTaskId ? activeTaskById.get(robot.assignedTaskId) : undefined;
    if (!task?.queueLaneId) continue;
    const laneState = nextStates[task.queueLaneId];
    if (!laneState) continue;
    const occupiedIndex = laneState.occupiedCells.findIndex((cell) => cellKey(cell.cell) === cellKey(robot.currentCell));
    if (occupiedIndex >= 0) {
      laneState.occupiedCells[occupiedIndex] = {
        ...laneState.occupiedCells[occupiedIndex],
        robotId: robot.robotId,
        taskId: task.taskId
      };
      laneState.reservedRobotIds = laneState.reservedRobotIds.filter((id) => id !== robot.robotId);
      laneState.reservedTaskIds = laneState.reservedTaskIds.filter((id) => id !== task.taskId);
      const maxIndex = Math.max(...laneState.occupiedCells.map((cell) => cell.queueIndex));
      if (laneState.occupiedCells[occupiedIndex].queueIndex === maxIndex) laneState.activeHeadRobotId = robot.robotId;
    }
  }

  return { ...state, queueLaneStates: nextStates };
}

export function robotsReadyForStationService(layout: WarehouseLayout, state: SimulationState, stationId: string): Robot[] {
  const station = layout.stations.find((item) => item.id === stationId);
  if (!station) return [];
  return state.robots
    .filter((robot) => {
      if (robot.state !== "QUEUING_AT_STATION") return false;
      if (cellKey(robot.currentCell) !== cellKey(station.cell)) return false;
      const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
      return task?.stationId === stationId;
    })
    .sort((a, b) => {
      const taskA = a.assignedTaskId ? state.tasks.find((item) => item.taskId === a.assignedTaskId) : undefined;
      const taskB = b.assignedTaskId ? state.tasks.find((item) => item.taskId === b.assignedTaskId) : undefined;
      return (taskA?.assignedAtSec ?? taskA?.createdAtSec ?? 0) - (taskB?.assignedAtSec ?? taskB?.createdAtSec ?? 0);
    });
}

export function deriveStationQueuesFromRuntime(layout: WarehouseLayout, state: SimulationState): StationQueue[] {
  return layout.stations.map((station) => {
    const existing = state.stationQueues.find((queue) => queue.stationId === station.id);
    const runtime = state.stationStates[station.id];
    const activeRobotId = runtime?.activeRobotId ?? existing?.activeRobotId;
    return {
      stationId: station.id,
      waitingRobotIds: robotsReadyForStationService(layout, state, station.id)
        .map((robot) => robot.robotId)
        .filter((robotId) => robotId !== activeRobotId),
      activeRobotId,
      serviceEndTimeSec: runtime?.serviceEndTimeSec ?? existing?.serviceEndTimeSec
    };
  });
}

export function holdRobotBeforeBlockedStationEntry(layout: WarehouseLayout, state: SimulationState, robot: Robot): Robot {
  if (robot.state !== "MOVING_LOADED" || robot.routePhase !== "TO_STATION" || movementComplete(robot)) return robot;
  const task = robot.assignedTaskId ? state.tasks.find((item) => item.taskId === robot.assignedTaskId) : undefined;
  const station = task?.stationId ? layout.stations.find((item) => item.id === task.stationId) : undefined;
  if (!station) return robot;
  const nextCell = robot.currentPath[robot.routeIndex + 1];
  if (!nextCell || cellKey(nextCell) !== cellKey(station.cell)) return robot;
  const activeRobotId = stationServiceOccupancy(state, station.id);
  if (!activeRobotId || activeRobotId === robot.robotId) return robot;
  return {
    ...robot,
    pose: { x: robot.currentCell.col + 0.5, y: robot.currentCell.row + 0.5, yawDeg: robot.pose.yawDeg },
    segmentProgressM: 0,
    pathProgress: robot.routeIndex,
    waitingReason: `Waiting at queue head for station ${station.stationId} service cell`,
    conflictTarget: activeRobotId
  };
}

export interface StationQueueRuntimeScore {
  stationId: string;
  queuedOrReserved: number;
  queueCapacity: number;
  activeService: number;
  score: number;
}

export function stationQueueRuntimeScore(layout: WarehouseLayout, state: Pick<SimulationState, "queueLaneStates" | "stationStates" | "stationQueues">, stationId: string): StationQueueRuntimeScore {
  const station = layout.stations.find((item) => item.id === stationId);
  const lanes = station ? stationQueueLanes(layout, station) : [];
  const queuedOrReserved = lanes.reduce((sum, lane) => sum + queueLaneUsedSlots(state.queueLaneStates[lane.queueLaneId]), 0);
  const queueCapacity = lanes.reduce((sum, lane) => sum + queueLaneCapacity(lane), 0);
  const activeService = stationServiceOccupancy(state as SimulationState, stationId) ? 1 : 0;
  if (lanes.length > 0) {
    const normalizedQueue = queuedOrReserved / Math.max(1, queueCapacity);
    return { stationId, queuedOrReserved, queueCapacity, activeService, score: normalizedQueue + activeService };
  }
  const legacy = state.stationQueues.find((queue) => queue.stationId === stationId);
  const legacyWaiting = legacy?.waitingRobotIds.length ?? 0;
  return {
    stationId,
    queuedOrReserved: legacyWaiting,
    queueCapacity: 1,
    activeService,
    score: legacyWaiting + activeService
  };
}
