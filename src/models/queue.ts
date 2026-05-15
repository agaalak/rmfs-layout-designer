import type { Direction, GridCell } from "./grid";

export interface OrderedQueueCell {
  cell: GridCell;
  queueIndex: number;
  directionToNext: Direction;
}

export interface QueueLane {
  queueLaneId: string;
  stationId: string;
  cells: OrderedQueueCell[];
  entryCell: GridCell;
  headCell: GridCell;
  directionToStation: Direction;
  maxLength: number;
  locked?: boolean;
}
