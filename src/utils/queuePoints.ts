import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { QueuePoint } from "../models/queuePoint";
import type { SimulationState } from "../models/simulation";
import type { Station } from "../models/station";
import { cellKey } from "./gridMath";

export function queuePointsForStation(layout: WarehouseLayout, station: Pick<Station, "id">): QueuePoint[] {
  return (layout.queuePoints ?? [])
    .filter((point) => point.appliesToAllStations || point.stationIds.includes(station.id))
    .sort((a, b) => a.priority - b.priority || a.queuePointId.localeCompare(b.queuePointId));
}

export function stationQueuePointCells(layout: WarehouseLayout, station: Pick<Station, "id">): GridCell[] {
  return queuePointsForStation(layout, station).map((point) => point.cell);
}

export function queuePointRuntimeLoad(state: Pick<SimulationState, "queuePointStates" | "robots" | "tasks">, point: QueuePoint) {
  const runtime = state.queuePointStates?.[point.queuePointId];
  const occupied = state.robots.filter((robot) => cellKey(robot.currentCell) === cellKey(point.cell)).length;
  const reserved = new Set([...(runtime?.reservedRobotIds ?? []), ...(runtime?.reservedTaskIds ?? [])]).size;
  return occupied + reserved;
}

export function queuePointIsDispatchable(state: Pick<SimulationState, "queuePointStates" | "robots" | "tasks">, point: QueuePoint) {
  if (point.waitPolicy === "HOLD_UPSTREAM") return true;
  return queuePointRuntimeLoad(state, point) < Math.max(1, point.capacity);
}

export function chooseQueuePointForStation(
  layout: WarehouseLayout,
  state: Pick<SimulationState, "queuePointStates" | "robots" | "tasks">,
  station: Pick<Station, "id">
): QueuePoint | undefined {
  const points = queuePointsForStation(layout, station);
  return points
    .map((point) => ({
      point,
      load: queuePointRuntimeLoad(state, point),
      capacity: Math.max(1, point.capacity)
    }))
    .filter((item) => queuePointIsDispatchable(state, item.point))
    .sort((a, b) => a.load - b.load || a.point.priority - b.point.priority || a.point.queuePointId.localeCompare(b.point.queuePointId))[0]?.point;
}

export function queuePointVisitRequired(station: Pick<Station, "queuePolicy"> | undefined, points: QueuePoint[]) {
  return (station?.queuePolicy?.requireQueuePointVisit ?? points.length > 0) && points.length > 0;
}
