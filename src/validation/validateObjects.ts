import type { GridCell } from "../models/grid";
import type { WarehouseLayout } from "../models/layout";
import { cellKey, inBounds } from "../utils/gridMath";
import { rackFootprintCells, rackOccupiedCells } from "../utils/rackFootprint";

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

  const layoutCells = new Map(layout.cells.map((cell) => [cellKey(cell), cell]));

  for (const rack of layout.racks) {
    const footprint = rackFootprintCells(rack, layout.grid);
    if (footprint.rows > 2 || footprint.columns > 2) {
      issues.push({
        id: `rack_footprint_${rack.id}`,
        severity: "error",
        message: `Rack ${rack.rackId} footprint ${rack.footprintWidthM}m x ${rack.footprintDepthM}m maps to ${footprint.columns} x ${footprint.rows} cells. This version supports up to 2 x 2 cells.`,
        cell: rack.homeCell,
        objectId: rack.id
      });
    }
    for (const cell of rackOccupiedCells(rack, layout.grid)) {
      const layoutCell = layoutCells.get(cellKey(cell));
      if (layoutCell && layoutCell.cellType !== "RACK_STORAGE") {
        issues.push({
          id: `rack_cell_type_${rack.id}_${cell.row}_${cell.col}`,
          severity: "error",
          message: `Rack ${rack.rackId} overlaps ${layoutCell.cellType} cell at row ${cell.row}, column ${cell.col}.`,
          cell,
          objectId: rack.id
        });
      }
      claim(cell, rack.id, `Rack ${rack.rackId}`);
    }
    const allBins = rack.faces.flatMap((face) => face.bins);
    for (const field of ["binId", "barcode", "locationId"] as const) {
      const seen = new Set<string>();
      for (const bin of allBins) {
        const value = bin[field];
        if (!value) continue;
        if (seen.has(value)) {
          issues.push({
            id: `rack_duplicate_${field}_${rack.id}_${value}`,
            severity: "error",
            message: `Rack ${rack.rackId} has duplicate ${field} value "${value}".`,
            cell: rack.homeCell,
            objectId: rack.id
          });
        }
        seen.add(value);
      }
    }
    for (const bin of allBins) {
      if ((bin.quantity ?? 0) < 0) {
        issues.push({
          id: `rack_negative_quantity_${rack.id}_${bin.binId}`,
          severity: "error",
          message: `Rack ${rack.rackId} bin ${bin.binId} has a negative quantity.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
      if (bin.maxQuantity !== undefined && bin.quantity !== undefined && bin.quantity > bin.maxQuantity) {
        issues.push({
          id: `rack_quantity_over_max_${rack.id}_${bin.binId}`,
          severity: "error",
          message: `Rack ${rack.rackId} bin ${bin.binId} quantity exceeds max quantity.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
      if ((bin.reservedQuantity ?? 0) < 0) {
        issues.push({
          id: `rack_negative_reserved_quantity_${rack.id}_${bin.binId}`,
          severity: "error",
          message: `Rack ${rack.rackId} bin ${bin.binId} has a negative reserved quantity.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
      if ((bin.reservedQuantity ?? 0) > (bin.quantity ?? 0)) {
        issues.push({
          id: `rack_reserved_over_quantity_${rack.id}_${bin.binId}`,
          severity: "error",
          message: `Rack ${rack.rackId} bin ${bin.binId} reserves more inventory than is available.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
    }
  }

  const storageCellClaims = new Map<string, string>();
  for (const location of layout.storageLocations ?? []) {
    if (location.cells.length === 0) {
      issues.push({
        id: `storage_empty_cells_${location.storageLocationId}`,
        severity: "error",
        message: `Storage location ${location.storageLocationId} must contain at least one cell.`
      });
    }
    for (const cell of location.cells) {
      if (!inBounds(cell, layout.grid)) {
        issues.push({
          id: `storage_bounds_${location.storageLocationId}_${cell.row}_${cell.col}`,
          severity: "error",
          message: `Storage location ${location.storageLocationId} is outside the warehouse boundary.`,
          cell,
          objectId: location.storageLocationId
        });
      }
      const key = cellKey(cell);
      const existing = storageCellClaims.get(key);
      if (existing && existing !== location.storageLocationId) {
        issues.push({
          id: `storage_overlap_${key}_${location.storageLocationId}`,
          severity: "error",
          message: `Storage location ${location.storageLocationId} overlaps ${existing} at row ${cell.row}, column ${cell.col}.`,
          cell,
          objectId: location.storageLocationId
        });
      }
      storageCellClaims.set(key, location.storageLocationId);
    }
    if (location.status === "OCCUPIED" && !location.currentlyStoredRackId) {
      issues.push({
        id: `storage_occupied_missing_rack_${location.storageLocationId}`,
        severity: "error",
        message: `Storage location ${location.storageLocationId} is occupied but does not reference a rack.`,
        cell: location.cells[0],
        objectId: location.storageLocationId
      });
    }
    if (location.currentlyStoredRackId && !layout.racks.some((rack) => rack.id === location.currentlyStoredRackId)) {
      issues.push({
        id: `storage_invalid_rack_${location.storageLocationId}`,
        severity: "error",
        message: `Storage location ${location.storageLocationId} references a missing rack.`,
        cell: location.cells[0],
        objectId: location.storageLocationId
      });
    }
    if (location.approachWaypointIds.length === 0) {
      issues.push({
        id: `storage_no_approach_${location.storageLocationId}`,
        severity: "warning",
        message: `Storage location ${location.storageLocationId} has no reachable approach waypoint.`,
        cell: location.cells[0],
        objectId: location.storageLocationId
      });
    }
  }

  const storageOccupancy = new Map<string, string>();
  for (const rack of layout.racks) {
    if (rack.operationalStatus === "STORED" && !rack.currentStorageLocationId) {
      issues.push({
        id: `rack_missing_current_storage_${rack.id}`,
        severity: "error",
        message: `Stored rack ${rack.rackId} must reference a current storage location.`,
        cell: rack.homeCell,
        objectId: rack.id
      });
    }
    if (rack.currentStorageLocationId) {
      if (!layout.storageLocations?.some((location) => location.storageLocationId === rack.currentStorageLocationId)) {
        issues.push({
          id: `rack_invalid_current_storage_${rack.id}`,
          severity: "error",
          message: `Rack ${rack.rackId} references missing storage location ${rack.currentStorageLocationId}.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
      const existing = storageOccupancy.get(rack.currentStorageLocationId);
      if (existing && existing !== rack.id) {
        issues.push({
          id: `storage_duplicate_occupancy_${rack.currentStorageLocationId}`,
          severity: "error",
          message: `Storage location ${rack.currentStorageLocationId} is assigned to more than one rack.`,
          cell: rack.homeCell,
          objectId: rack.id
        });
      }
      storageOccupancy.set(rack.currentStorageLocationId, rack.id);
    }
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
