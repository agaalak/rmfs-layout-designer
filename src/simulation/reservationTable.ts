import type { GridCell } from "../models/grid";
import type { ReservationTableSnapshot } from "../models/simulation";
import { cellKey } from "../utils/gridMath";

export type ReservationKind =
  | "ROBOT_VERTEX"
  | "ROBOT_EDGE"
  | "LOADED_ENVELOPE"
  | "ROTATION_ZONE"
  | "STATION_QUEUE_SLOT"
  | "STATION_SERVICE"
  | "STORAGE_LOCATION"
  | "CHARGER"
  | "PARKING";

export interface ReservationConflict {
  type: "vertex" | "edge" | "resource" | "envelope";
  timeStep: number;
  robotId?: string;
  taskId?: string;
  resourceId?: string;
  kind?: ReservationKind | string;
  cell?: GridCell;
  cells?: GridCell[];
  from?: GridCell;
  to?: GridCell;
  message?: string;
}

export function createReservationTable(reservationTimeStepSec = 1): ReservationTableSnapshot {
  return {
    reservedVertices: {},
    reservedEdges: {},
    reservedResources: {},
    reservationTimeStepSec
  };
}

export function reservationTimeStep(table: ReservationTableSnapshot, timeSec: number) {
  return Math.max(0, Math.floor(timeSec / table.reservationTimeStepSec));
}

function sameCell(a: GridCell, b: GridCell) {
  return a.row === b.row && a.col === b.col;
}

export function isCellReserved(table: ReservationTableSnapshot, cell: GridCell, step: number, robotId?: string): boolean {
  return (table.reservedVertices[step] ?? []).some((record) => record.robotId !== robotId && (record.cells ?? (record.cell ? [record.cell] : [])).some((item) => sameCell(item, cell)));
}

export function isEdgeReserved(table: ReservationTableSnapshot, fromCell: GridCell, toCell: GridCell, step: number, robotId?: string): boolean {
  return (table.reservedEdges[step] ?? []).some(
    (edge) =>
      edge.robotId !== robotId &&
      edge.from &&
      edge.to &&
      ((sameCell(edge.from, fromCell) && sameCell(edge.to, toCell)) || (sameCell(edge.from, toCell) && sameCell(edge.to, fromCell)))
  );
}

function footprintAt(path: GridCell[], index: number, footprintCells: GridCell[] | ((cell: GridCell, index: number) => GridCell[])) {
  const cell = path[index];
  if (typeof footprintCells === "function") return footprintCells(cell, index);
  return footprintCells.length > 0 ? footprintCells.map((offset) => ({ row: cell.row + offset.row, col: cell.col + offset.col })) : [cell];
}

export function findFirstConflict(
  table: ReservationTableSnapshot,
  path: GridCell[],
  startTimeSec: number,
  robotId?: string,
  footprintCells: GridCell[] | ((cell: GridCell, index: number) => GridCell[]) = []
): ReservationConflict | undefined {
  for (let index = 0; index < path.length; index += 1) {
    const step = reservationTimeStep(table, startTimeSec) + index;
    const footprint = footprintAt(path, index, footprintCells);
    for (const cell of footprint) {
      const existing = (table.reservedVertices[step] ?? []).find((record) => record.robotId !== robotId && (record.cells ?? (record.cell ? [record.cell] : [])).some((item) => sameCell(item, cell)));
      if (existing) return { type: footprint.length > 1 || existing.kind === "LOADED_ENVELOPE" ? "envelope" : "vertex", timeStep: step, robotId: existing.robotId, taskId: existing.taskId, kind: existing.kind, cell, cells: footprint, message: `Cell ${cell.row},${cell.col} is already reserved by ${existing.robotId ?? existing.taskId ?? "another reservation"}.` };
    }
    if (index > 0) {
      const from = path[index - 1];
      const to = path[index];
      const existing = (table.reservedEdges[step] ?? []).find(
        (edge) => edge.robotId !== robotId && edge.from && edge.to && ((sameCell(edge.from, from) && sameCell(edge.to, to)) || (sameCell(edge.from, to) && sameCell(edge.to, from)))
      );
      if (existing) return { type: "edge", timeStep: step, robotId: existing.robotId, taskId: existing.taskId, kind: existing.kind, from, to, message: `Edge ${cellKey(from)}>${cellKey(to)} conflicts with ${existing.robotId ?? existing.taskId ?? "another robot"}.` };
    }
  }
  return undefined;
}

export function clearReservationsForRobot(table: ReservationTableSnapshot, robotId: string): ReservationTableSnapshot {
  const next = structuredClone(table);
  Object.keys(next.reservedVertices).forEach((step) => {
    next.reservedVertices[Number(step)] = next.reservedVertices[Number(step)].filter((record) => record.robotId !== robotId);
  });
  Object.keys(next.reservedEdges).forEach((step) => {
    next.reservedEdges[Number(step)] = next.reservedEdges[Number(step)].filter((record) => record.robotId !== robotId);
  });
  Object.keys(next.reservedResources ?? {}).forEach((step) => {
    next.reservedResources[Number(step)] = next.reservedResources[Number(step)].filter((record) => record.robotId !== robotId);
  });
  return next;
}

export function clearReservationsForTask(table: ReservationTableSnapshot, taskId: string): ReservationTableSnapshot {
  const next = structuredClone(table);
  Object.keys(next.reservedVertices).forEach((step) => {
    next.reservedVertices[Number(step)] = next.reservedVertices[Number(step)].filter((record) => record.taskId !== taskId);
  });
  Object.keys(next.reservedEdges).forEach((step) => {
    next.reservedEdges[Number(step)] = next.reservedEdges[Number(step)].filter((record) => record.taskId !== taskId);
  });
  Object.keys(next.reservedResources ?? {}).forEach((step) => {
    next.reservedResources[Number(step)] = next.reservedResources[Number(step)].filter((record) => record.taskId !== taskId);
  });
  return next;
}

export function clearExpiredReservations(table: ReservationTableSnapshot, currentTimeSec: number): ReservationTableSnapshot {
  const next = structuredClone(table);
  const current = reservationTimeStep(next, currentTimeSec);
  for (const bucket of [next.reservedVertices, next.reservedEdges, next.reservedResources ?? {}]) {
    Object.keys(bucket).forEach((step) => {
      if (Number(step) < current - 1) delete bucket[Number(step)];
    });
  }
  return next;
}

export function addWaitSteps(path: GridCell[], waitCount: number): GridCell[] {
  if (path.length === 0 || waitCount <= 0) return path;
  return [path[0], ...Array.from({ length: waitCount }, () => path[0]), ...path.slice(1)];
}

export function reservePath(
  table: ReservationTableSnapshot,
  robotId: string,
  path: GridCell[],
  startTimeSec: number,
  speedMps: number,
  footprintCells: GridCell[] = [],
  taskId?: string
): { table: ReservationTableSnapshot; conflict?: ReservationConflict } {
  const conflict = findFirstConflict(table, path, startTimeSec, robotId, footprintCells);
  if (conflict) return { table, conflict };
  const next = clearReservationsForRobot(table, robotId);
  const start = reservationTimeStep(next, startTimeSec);
  const stepSpacing = Math.max(1, Math.round(1 / Math.max(0.1, speedMps)));
  for (let index = 0; index < path.length; index += 1) {
    const step = start + index * stepSpacing;
    const footprint = footprintAt(path, index, footprintCells);
    next.reservedVertices[step] = next.reservedVertices[step] ?? [];
    for (const cell of footprint) {
      if (!next.reservedVertices[step].some((record) => record.robotId === robotId && (record.cells ?? (record.cell ? [record.cell] : [])).some((item) => cellKey(item) === cellKey(cell)))) {
        next.reservedVertices[step].push({ reservationId: `${robotId}_${step}_${cellKey(cell)}`, robotId, taskId, kind: footprint.length > 1 ? "LOADED_ENVELOPE" : "ROBOT_VERTEX", timeStep: step, cell, cells: [cell] });
      }
    }
    if (index > 0) {
      next.reservedEdges[step] = next.reservedEdges[step] ?? [];
      next.reservedEdges[step].push({ reservationId: `${robotId}_${step}_${cellKey(path[index - 1])}_${cellKey(path[index])}`, robotId, taskId, kind: "ROBOT_EDGE", timeStep: step, from: path[index - 1], to: path[index], fromCell: path[index - 1], toCell: path[index] });
    }
  }
  return { table: next };
}

export function findEnvelopeConflict(
  table: ReservationTableSnapshot,
  path: GridCell[],
  startTimeSec: number,
  robotId: string,
  footprintAtIndex: (cell: GridCell, index: number) => GridCell[]
): ReservationConflict | undefined {
  return findFirstConflict(table, path, startTimeSec, robotId, footprintAtIndex);
}

export function reserveEnvelopePath(
  table: ReservationTableSnapshot,
  robotId: string,
  taskId: string | undefined,
  path: GridCell[],
  startTimeSec: number,
  speedMps: number,
  footprintAtIndex: (cell: GridCell, index: number) => GridCell[]
): { table: ReservationTableSnapshot; conflict?: ReservationConflict } {
  const conflict = findEnvelopeConflict(table, path, startTimeSec, robotId, footprintAtIndex);
  if (conflict) return { table, conflict };
  const next = clearReservationsForRobot(table, robotId);
  const start = reservationTimeStep(next, startTimeSec);
  const stepSpacing = Math.max(1, Math.round(1 / Math.max(0.1, speedMps)));
  for (let index = 0; index < path.length; index += 1) {
    const step = start + index * stepSpacing;
    const cells = footprintAtIndex(path[index], index);
    next.reservedVertices[step] = next.reservedVertices[step] ?? [];
    for (const cell of cells) {
      next.reservedVertices[step].push({ reservationId: `${robotId}_${step}_${cellKey(cell)}`, robotId, taskId, kind: cells.length > 1 ? "LOADED_ENVELOPE" : "ROBOT_VERTEX", timeStep: step, cell, cells: [cell] });
    }
    if (index > 0) {
      next.reservedEdges[step] = next.reservedEdges[step] ?? [];
      next.reservedEdges[step].push({ reservationId: `${robotId}_${step}_${cellKey(path[index - 1])}_${cellKey(path[index])}`, robotId, taskId, kind: "ROBOT_EDGE", timeStep: step, from: path[index - 1], to: path[index], fromCell: path[index - 1], toCell: path[index] });
    }
  }
  return { table: next };
}

export function isResourceReserved(table: ReservationTableSnapshot, resourceId: string, step: number, capacity = 1, taskId?: string): boolean {
  const count = (table.reservedResources?.[step] ?? []).filter((record) => record.resourceId === resourceId && (taskId ? record.taskId !== taskId : true)).length;
  return count >= capacity;
}

export function reserveResource(
  table: ReservationTableSnapshot,
  resourceId: string,
  kind: ReservationKind,
  startTimeSec: number,
  durationSec: number,
  capacity = 1,
  options: { robotId?: string; taskId?: string; cells?: GridCell[] } = {}
): { table: ReservationTableSnapshot; conflict?: ReservationConflict } {
  const next = structuredClone(table);
  next.reservedResources = next.reservedResources ?? {};
  const start = reservationTimeStep(next, startTimeSec);
  const steps = Math.max(1, Math.ceil(durationSec / Math.max(0.1, next.reservationTimeStepSec)));
  for (let offset = 0; offset < steps; offset += 1) {
    const step = start + offset;
    if (isResourceReserved(next, resourceId, step, capacity, options.taskId)) {
      const existing = (next.reservedResources[step] ?? []).find((record) => record.resourceId === resourceId);
      return {
        table,
        conflict: {
          type: "resource",
          timeStep: step,
          robotId: existing?.robotId,
          taskId: existing?.taskId,
          resourceId,
          kind,
          cells: options.cells,
          message: `${kind} ${resourceId} is already reserved at time step ${step}.`
        }
      };
    }
  }
  for (let offset = 0; offset < steps; offset += 1) {
    const step = start + offset;
    next.reservedResources[step] = next.reservedResources[step] ?? [];
    next.reservedResources[step].push({
      reservationId: `${kind}_${resourceId}_${step}_${options.robotId ?? options.taskId ?? "resource"}`,
      robotId: options.robotId,
      taskId: options.taskId,
      resourceId,
      kind,
      timeStep: step,
      cells: options.cells
    });
  }
  return { table: next };
}

export function explainConflict(conflict: ReservationConflict): string {
  if (conflict.message) return conflict.message;
  if (conflict.type === "edge") return `Edge conflict at step ${conflict.timeStep}.`;
  if (conflict.type === "resource") return `Resource ${conflict.resourceId ?? "unknown"} is unavailable at step ${conflict.timeStep}.`;
  if (conflict.type === "envelope") return `Loaded envelope conflict at step ${conflict.timeStep}.`;
  return `Cell conflict at step ${conflict.timeStep}.`;
}
