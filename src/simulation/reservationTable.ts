import type { GridCell } from "../models/grid";
import type { ReservationTableSnapshot } from "../models/simulation";
import { cellKey } from "../utils/gridMath";

export interface ReservationConflict {
  type: "vertex" | "edge";
  timeStep: number;
  robotId: string;
  cell?: GridCell;
  from?: GridCell;
  to?: GridCell;
}

export function createReservationTable(reservationTimeStepSec = 1): ReservationTableSnapshot {
  return {
    reservedVertices: {},
    reservedEdges: {},
    reservationTimeStepSec
  };
}

function timeStep(table: ReservationTableSnapshot, timeSec: number) {
  return Math.max(0, Math.floor(timeSec / table.reservationTimeStepSec));
}

function sameCell(a: GridCell, b: GridCell) {
  return a.row === b.row && a.col === b.col;
}

export function isCellReserved(table: ReservationTableSnapshot, cell: GridCell, step: number, robotId?: string): boolean {
  return (table.reservedVertices[step] ?? []).some((record) => record.robotId !== robotId && sameCell(record.cell, cell));
}

export function isEdgeReserved(table: ReservationTableSnapshot, fromCell: GridCell, toCell: GridCell, step: number, robotId?: string): boolean {
  return (table.reservedEdges[step] ?? []).some(
    (edge) =>
      edge.robotId !== robotId &&
      ((sameCell(edge.from, fromCell) && sameCell(edge.to, toCell)) || (sameCell(edge.from, toCell) && sameCell(edge.to, fromCell)))
  );
}

export function findFirstConflict(
  table: ReservationTableSnapshot,
  path: GridCell[],
  startTimeSec: number,
  robotId?: string,
  footprintCells: GridCell[] = []
): ReservationConflict | undefined {
  for (let index = 0; index < path.length; index += 1) {
    const step = timeStep(table, startTimeSec) + index;
    const footprint = footprintCells.length > 0 ? footprintCells.map((cell) => ({ row: path[index].row + cell.row, col: path[index].col + cell.col })) : [path[index]];
    for (const cell of footprint) {
      const existing = (table.reservedVertices[step] ?? []).find((record) => record.robotId !== robotId && sameCell(record.cell, cell));
      if (existing) return { type: "vertex", timeStep: step, robotId: existing.robotId, cell };
    }
    if (index > 0) {
      const from = path[index - 1];
      const to = path[index];
      const existing = (table.reservedEdges[step] ?? []).find(
        (edge) => edge.robotId !== robotId && ((sameCell(edge.from, from) && sameCell(edge.to, to)) || (sameCell(edge.from, to) && sameCell(edge.to, from)))
      );
      if (existing) return { type: "edge", timeStep: step, robotId: existing.robotId, from, to };
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
  footprintCells: GridCell[] = []
): { table: ReservationTableSnapshot; conflict?: ReservationConflict } {
  const conflict = findFirstConflict(table, path, startTimeSec, robotId, footprintCells);
  if (conflict) return { table, conflict };
  const next = clearReservationsForRobot(table, robotId);
  const start = timeStep(next, startTimeSec);
  const stepSpacing = Math.max(1, Math.round(1 / Math.max(0.1, speedMps)));
  for (let index = 0; index < path.length; index += 1) {
    const step = start + index * stepSpacing;
    const footprint = footprintCells.length > 0 ? footprintCells.map((cell) => ({ row: path[index].row + cell.row, col: path[index].col + cell.col })) : [path[index]];
    next.reservedVertices[step] = next.reservedVertices[step] ?? [];
    for (const cell of footprint) {
      if (!next.reservedVertices[step].some((record) => record.robotId === robotId && cellKey(record.cell) === cellKey(cell))) {
        next.reservedVertices[step].push({ robotId, cell });
      }
    }
    if (index > 0) {
      next.reservedEdges[step] = next.reservedEdges[step] ?? [];
      next.reservedEdges[step].push({ robotId, from: path[index - 1], to: path[index] });
    }
  }
  return { table: next };
}
