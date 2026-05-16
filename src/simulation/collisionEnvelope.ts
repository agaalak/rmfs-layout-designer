import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import type { Rack } from "../models/rack";
import type { Robot } from "../models/robot";
import type { SimulationState } from "../models/simulation";
import { cellKey, inBounds } from "../utils/gridMath";
import { rackOccupiedCells } from "../utils/rackFootprint";

export interface RobotEnvelope {
  robotId: string;
  occupiedCells: GridCell[];
  centerCell: GridCell;
  orientationDeg: number;
  isLoaded: boolean;
  carryingRackId?: string;
  rackOccupiedCells?: GridCell[];
}

function uniqueCells(cells: GridCell[]): GridCell[] {
  return [...new Map(cells.map((cell) => [cellKey(cell), cell])).values()];
}

export function getCarriedRackFootprintOffsets(layout: WarehouseLayout, rack: Rack, orientationDeg = rack.currentOrientationDeg): GridCell[] {
  const footprintRack = {
    ...rack,
    homeCell: { row: 0, col: 0 },
    currentOrientationDeg: orientationDeg as Rack["currentOrientationDeg"]
  };
  return rackOccupiedCells(footprintRack, layout.grid);
}

export function getLoadedRobotEnvelopeAtCell(
  layout: WarehouseLayout,
  robot: Pick<Robot, "robotId" | "carryingRackId">,
  rack: Rack,
  cell: GridCell,
  orientationDeg = rack.currentOrientationDeg
): RobotEnvelope {
  const rackOccupied = getCarriedRackFootprintOffsets(layout, rack, orientationDeg).map((offset) => ({
    row: cell.row + offset.row,
    col: cell.col + offset.col
  }));
  return {
    robotId: robot.robotId,
    centerCell: cell,
    orientationDeg,
    isLoaded: true,
    carryingRackId: robot.carryingRackId ?? rack.id,
    rackOccupiedCells: rackOccupied,
    occupiedCells: uniqueCells([cell, ...rackOccupied])
  };
}

export function getRobotEnvelopeAtCell(layout: WarehouseLayout, state: SimulationState, robot: Robot, cell: GridCell): RobotEnvelope {
  const carryingRackId = robot.carryingRackId ?? state.rackStates[robot.carryingRackId ?? ""]?.rackId;
  const rack = carryingRackId ? layout.racks.find((item) => item.id === carryingRackId) : undefined;
  if (rack) {
    const orientation = state.rackStates[rack.id]?.currentOrientationDeg ?? rack.currentOrientationDeg;
    return getLoadedRobotEnvelopeAtCell(layout, robot, rack, cell, orientation);
  }
  return {
    robotId: robot.robotId,
    centerCell: cell,
    orientationDeg: robot.pose.yawDeg,
    isLoaded: false,
    occupiedCells: [cell]
  };
}

export function getRobotEnvelope(layout: WarehouseLayout, state: SimulationState, robot: Robot): RobotEnvelope {
  return getRobotEnvelopeAtCell(layout, state, robot, robot.currentCell);
}

export function envelopeOverlapsBlockedCells(layout: WarehouseLayout, envelope: RobotEnvelope): GridCell[] {
  const blockingTypes = new Set(["BLOCKED", "HUMAN_ZONE", "DOCK"]);
  const cellMap = new Map(layout.cells.map((cell) => [cellKey(cell), cell.cellType]));
  return envelope.occupiedCells.filter((cell) => !inBounds(cell, layout.grid) || blockingTypes.has(cellMap.get(cellKey(cell)) ?? "EMPTY"));
}

export function envelopeOverlapsStaticRacks(layout: WarehouseLayout, state: SimulationState, envelope: RobotEnvelope, ignoredRackId?: string): Array<{ rackId: string; cell: GridCell }> {
  const result: Array<{ rackId: string; cell: GridCell }> = [];
  const envelopeCells = new Set(envelope.occupiedCells.map(cellKey));
  for (const rack of layout.racks) {
    if (rack.id === ignoredRackId || rack.id === envelope.carryingRackId) continue;
    const status = state.rackStates[rack.id]?.operationalStatus ?? rack.operationalStatus ?? "STORED";
    if (!["STORED", "RESERVED", "UNAVAILABLE"].includes(status)) continue;
    const runtimeRack = {
      ...rack,
      homeCell: state.rackStates[rack.id]?.currentCell ?? rack.homeCell,
      currentOrientationDeg: state.rackStates[rack.id]?.currentOrientationDeg ?? rack.currentOrientationDeg
    };
    for (const cell of rackOccupiedCells(runtimeRack, layout.grid)) {
      if (envelopeCells.has(cellKey(cell))) result.push({ rackId: rack.id, cell });
    }
  }
  return result;
}

export function envelopesOverlap(a: RobotEnvelope, b: RobotEnvelope): boolean {
  const aCells = new Set(a.occupiedCells.map(cellKey));
  return b.occupiedCells.some((cell) => aCells.has(cellKey(cell)));
}

export function envelopeToReservationFootprint(envelope: RobotEnvelope): GridCell[] {
  return envelope.occupiedCells.map((cell) => ({
    row: cell.row - envelope.centerCell.row,
    col: cell.col - envelope.centerCell.col
  }));
}
