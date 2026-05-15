import type { Direction, GridCell } from "../models/grid";
import { allDirections, directionDelta } from "../models/grid";
import type { QueueLane } from "../models/queue";
import type { Station } from "../models/station";
import { cellKey } from "./gridMath";

export function directionBetweenCells(from: GridCell, to: GridCell): Direction | undefined {
  return allDirections.find((direction) => {
    const [dr, dc] = directionDelta[direction];
    return from.row + dr === to.row && from.col + dc === to.col;
  });
}

export function stationQueueLanes(layout: { queueLanes?: QueueLane[] }, station: Pick<Station, "id" | "queueLaneIds">): QueueLane[] {
  const ids = new Set(station.queueLaneIds ?? []);
  return (layout.queueLanes ?? []).filter((lane) => ids.has(lane.queueLaneId) || lane.stationId === station.id);
}

export function stationQueueCells(layout: { queueLanes?: QueueLane[] }, station: Pick<Station, "id" | "queueLaneIds">): GridCell[] {
  return stationQueueLanes(layout, station).flatMap((lane) => lane.cells.map((item) => item.cell));
}

export function makeQueueLaneFromCells(queueLaneId: string, stationId: string, cells: GridCell[], stationCell: GridCell, locked?: boolean): QueueLane | undefined {
  if (cells.length === 0) return undefined;
  const orderedCells = cells.map((cell, index) => {
    const next = cells[index + 1] ?? stationCell;
    const directionToNext = directionBetweenCells(cell, next) ?? "north";
    return {
      cell,
      queueIndex: index,
      directionToNext
    };
  });
  const headCell = cells[cells.length - 1];
  return {
    queueLaneId,
    stationId,
    cells: orderedCells,
    entryCell: cells[0],
    headCell,
    directionToStation: directionBetweenCells(headCell, stationCell) ?? orderedCells[orderedCells.length - 1].directionToNext,
    maxLength: cells.length,
    locked
  };
}

export function queueLaneCellKeys(lane: QueueLane): Set<string> {
  return new Set(lane.cells.map((item) => cellKey(item.cell)));
}
