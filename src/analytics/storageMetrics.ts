import type { WarehouseLayout } from "../models/layout";
import { traversableCellTypes } from "../models/grid";
import { safeDivide } from "../utils/units";

export interface StorageMetrics {
  totalCells: number;
  usableCells: number;
  rackCount: number;
  rackStorageCells: number;
  rackFacesCount: number;
  binCount: number;
  stationCount: number;
  chargingSpotCount: number;
  parkingSpotCount: number;
  storageLocationCount: number;
  storageDensity: number;
  aisleRatio: number;
  hotWarmColdDistribution: Record<string, number>;
}

export function calculateStorageMetrics(layout: WarehouseLayout): StorageMetrics {
  const totalCells = layout.grid.rows * layout.grid.columns;
  const blocked = layout.cells.filter((cell) => cell.cellType === "BLOCKED" || cell.cellType === "HUMAN_ZONE").length;
  const usableCells = totalCells - blocked;
  const rackStorageCells = layout.cells.filter((cell) => cell.cellType === "RACK_STORAGE").length;
  const aisleCells = layout.cells.filter((cell) => traversableCellTypes.has(cell.cellType)).length;
  const distribution = layout.racks.reduce<Record<string, number>>((acc, rack) => {
    const key = rack.demandClass ?? "UNCLASSIFIED";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return {
    totalCells,
    usableCells,
    rackCount: layout.racks.length,
    rackStorageCells,
    rackFacesCount: layout.racks.reduce((sum, rack) => sum + rack.faces.length, 0),
    binCount: layout.racks.reduce((sum, rack) => sum + rack.faces.reduce((faceSum, face) => faceSum + face.bins.length, 0), 0),
    stationCount: layout.stations.length,
    chargingSpotCount: layout.chargingSpots.length,
    parkingSpotCount: layout.parkingSpots.length,
    storageLocationCount: layout.storageLocations?.length ?? 0,
    storageDensity: safeDivide(rackStorageCells, usableCells),
    aisleRatio: safeDivide(aisleCells, usableCells),
    hotWarmColdDistribution: distribution
  };
}
