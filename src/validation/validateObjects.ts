import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import { cellKey, inBounds } from "../utils/gridMath";

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  cell?: GridCell;
  objectId?: string;
}

export function validateObjects(layout: WarehouseLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const occupied = new Map<string, string>();
  const claim = (cell: GridCell, objectId: string, label: string) => {
    if (!inBounds(cell, layout.grid)) {
      issues.push({
        id: `bounds_${label}_${cell.row}_${cell.col}`,
        severity: "error",
        message: `${label} is outside the warehouse boundary.`,
        cell,
        objectId
      });
      return;
    }
    const key = cellKey(cell);
    const existing = occupied.get(key);
    if (existing && existing !== objectId) {
      issues.push({
        id: `overlap_${key}_${objectId}`,
        severity: "error",
        message: `Object overlap at row ${cell.row}, column ${cell.col}.`,
        cell,
        objectId
      });
    }
    occupied.set(key, objectId);
  };

  if (layout.grid.cellWidthM <= 0 || layout.grid.cellDepthM <= 0) {
    issues.push({
      id: "grid_cell_size",
      severity: "error",
      message: "Grid cell width and depth must be positive."
    });
  }
  if (layout.grid.rows <= 0 || layout.grid.columns <= 0) {
    issues.push({
      id: "grid_dimensions",
      severity: "error",
      message: "Layout rows and columns must be positive."
    });
  }
  const expectedWidth = layout.grid.columns * layout.grid.cellWidthM;
  const expectedDepth = layout.grid.rows * layout.grid.cellDepthM;
  if (
    layout.physicalDimensions &&
    (Math.abs(layout.physicalDimensions.widthM - expectedWidth) > 0.001 ||
      Math.abs(layout.physicalDimensions.depthM - expectedDepth) > 0.001)
  ) {
    issues.push({
      id: "physical_dimensions",
      severity: "error",
      message: `Physical dimensions must match rows/columns and grid size (${expectedWidth.toFixed(2)} m x ${expectedDepth.toFixed(2)} m).`
    });
  }

  for (const cell of layout.cells) {
    if (!inBounds(cell, layout.grid)) {
      issues.push({
        id: `cell_bounds_${cell.row}_${cell.col}`,
        severity: "error",
        message: `Cell ${cell.row},${cell.col} is outside the warehouse boundary.`,
        cell
      });
    }
    if (["BLOCKED", "HUMAN_ZONE", "DOCK"].includes(cell.cellType)) {
      claim(cell, `cell:${cellKey(cell)}`, `${cell.cellType} cell`);
    }
  }

  for (const rack of layout.racks) {
    if (rack.footprintWidthM > layout.grid.cellWidthM || rack.footprintDepthM > layout.grid.cellDepthM) {
      issues.push({
        id: `rack_footprint_${rack.id}`,
        severity: "error",
        message: `Rack ${rack.rackId} footprint exceeds one grid cell: ${rack.footprintWidthM}m x ${rack.footprintDepthM}m does not fit inside grid cell ${layout.grid.cellWidthM}m x ${layout.grid.cellDepthM}m. Multi-cell racks are not implemented yet.`,
        cell: rack.homeCell,
        objectId: rack.id
      });
    }
    claim(rack.homeCell, rack.id, `Rack ${rack.rackId}`);
  }

  for (const station of layout.stations) {
    claim(station.cell, station.id, `Station ${station.stationId}`);
    if (station.queueCells.length === 0) {
      issues.push({
        id: `station_queue_${station.id}`,
        severity: "warning",
        message: `Station ${station.stationId} has no queue or approach cells.`,
        cell: station.cell,
        objectId: station.id
      });
    }
    for (const cell of station.queueCells) claim(cell, `${station.id}:queue`, `Queue for ${station.stationId}`);
  }

  for (const charger of layout.chargingSpots) {
    if (![1, 2].includes(charger.cells.length)) {
      issues.push({
        id: `charger_size_${charger.id}`,
        severity: "error",
        message: `Charger ${charger.chargerId} must occupy 1 or 2 cells.`,
        cell: charger.cells[0],
        objectId: charger.id
      });
    }
    for (const cell of charger.cells) claim(cell, charger.id, `Charger ${charger.chargerId}`);
  }

  for (const parking of layout.parkingSpots) {
    const parkingCells = "cells" in parking ? ((parking as unknown as { cells: GridCell[] }).cells ?? [parking.cell]) : [parking.cell];
    if (parkingCells.length !== 1) {
      issues.push({
        id: `parking_size_${parking.id}`,
        severity: "error",
        message: `Parking ${parking.parkingId} must occupy exactly 1 cell.`,
        cell: parkingCells[0] ?? parking.cell,
        objectId: parking.id
      });
    }
    for (const cell of parkingCells) claim(cell, parking.id, `Parking ${parking.parkingId}`);
  }

  for (const zone of layout.rotationZones) {
    for (const cell of zone.cells) claim(cell, zone.id, `Rotation zone ${zone.rotationZoneId}`);
  }

  return issues;
}
