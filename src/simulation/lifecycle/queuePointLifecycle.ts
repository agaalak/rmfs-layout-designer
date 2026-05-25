import type { WarehouseLayout } from "../../models/layout";
import type { QueuePointRuntimeState, SimulationState } from "../../models/simulation";
import { cellKey } from "../../utils/gridMath";
import { queuePointIsDispatchable, queuePointsForStation, queuePointRuntimeLoad } from "../../utils/queuePoints";
import { stationServiceOccupancy } from "./queueLaneLifecycle";

export function createQueuePointStates(layout: WarehouseLayout): Record<string, QueuePointRuntimeState> {
  return Object.fromEntries(
    (layout.queuePoints ?? []).map((point) => [
      point.queuePointId,
      {
        queuePointId: point.queuePointId,
        reservedRobotIds: [],
        reservedTaskIds: [],
        capacity: Math.max(1, point.capacity)
      }
    ])
  );
}

export function syncQueuePointStates(layout: WarehouseLayout, state: SimulationState): SimulationState {
  const base = Object.keys(state.queuePointStates ?? {}).length > 0 ? state.queuePointStates : createQueuePointStates(layout);
  const activeTaskIds = new Set(state.tasks.filter((task) => ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(task.status)).map((task) => task.taskId));
  const nextStates: Record<string, QueuePointRuntimeState> = Object.fromEntries(
    (layout.queuePoints ?? []).map((point) => {
      const previous = base[point.queuePointId];
      const occupyingRobot = state.robots.find((robot) => cellKey(robot.currentCell) === cellKey(point.cell));
      const reservedRobotIds = (previous?.reservedRobotIds ?? []).filter((robotId) => {
        const robot = state.robots.find((item) => item.robotId === robotId);
        if (!robot?.assignedTaskId) return false;
        const task = state.tasks.find((item) => item.taskId === robot.assignedTaskId);
        return !task?.visitedQueuePoint;
      });
      const reservedTaskIds = (previous?.reservedTaskIds ?? []).filter((taskId) => {
        if (!activeTaskIds.has(taskId)) return false;
        const task = state.tasks.find((item) => item.taskId === taskId);
        return !task?.visitedQueuePoint;
      });
      return [
        point.queuePointId,
        {
          queuePointId: point.queuePointId,
          occupiedRobotId: occupyingRobot?.robotId,
          occupiedTaskId: occupyingRobot?.assignedTaskId,
          reservedRobotIds,
          reservedTaskIds,
          capacity: Math.max(1, point.capacity)
        }
      ];
    })
  );
  return { ...state, queuePointStates: nextStates };
}

export function stationHasQueuePointDispatchCapacity(layout: WarehouseLayout, state: SimulationState, stationId?: string) {
  if (!stationId) return false;
  const station = layout.stations.find((item) => item.id === stationId);
  if (!station) return false;
  const points = queuePointsForStation(layout, station);
  if (points.length === 0) return !stationServiceOccupancy(state, stationId);
  return points.some((point) => queuePointIsDispatchable(state, point));
}

export function reserveQueuePoint(state: SimulationState, queuePointId: string | undefined, robotId: string, taskId: string): SimulationState {
  if (!queuePointId) return state;
  const runtime = state.queuePointStates[queuePointId];
  if (!runtime) return state;
  if ((runtime.reservedRobotIds.includes(robotId) || runtime.reservedTaskIds.includes(taskId)) && runtime.reservedTaskIds.includes(taskId)) return state;
  if (new Set([...runtime.reservedRobotIds, ...runtime.reservedTaskIds]).size >= Math.max(1, runtime.capacity)) return state;
  return {
    ...state,
    queuePointStates: {
      ...state.queuePointStates,
      [queuePointId]: {
        ...runtime,
        reservedRobotIds: runtime.reservedRobotIds.includes(robotId) ? runtime.reservedRobotIds : [...runtime.reservedRobotIds, robotId],
        reservedTaskIds: runtime.reservedTaskIds.includes(taskId) ? runtime.reservedTaskIds : [...runtime.reservedTaskIds, taskId]
      }
    }
  };
}

export function releaseQueuePoint(state: SimulationState, queuePointId: string | undefined, robotId: string, taskId: string): SimulationState {
  if (!queuePointId) return state;
  const runtime = state.queuePointStates[queuePointId];
  if (!runtime) return state;
  return {
    ...state,
    queuePointStates: {
      ...state.queuePointStates,
      [queuePointId]: {
        ...runtime,
        reservedRobotIds: runtime.reservedRobotIds.filter((id) => id !== robotId),
        reservedTaskIds: runtime.reservedTaskIds.filter((id) => id !== taskId)
      }
    }
  };
}
