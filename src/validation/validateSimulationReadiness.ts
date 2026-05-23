import type { WarehouseLayout } from "../models/layout";
import { validateLayout, type ValidationResult } from "./validateLayout";
import { inventoryFromLayout } from "../simulation/inventory";
import { ensureStorageLocations } from "../utils/storageLocations";
import { queuePointsForStation } from "../utils/queuePoints";

export interface SimulationReadinessResult {
  ready: boolean;
  categories: {
    layout: string[];
    inventory: string[];
    stations: string[];
    storage: string[];
    simulation: string[];
  };
  validation: ValidationResult;
}

export function validateSimulationReadiness(layout: WarehouseLayout): SimulationReadinessResult {
  const normalized = ensureStorageLocations(layout);
  const validation = validateLayout(normalized);
  const inventory = inventoryFromLayout(normalized);
  const categories: SimulationReadinessResult["categories"] = {
    layout: [],
    inventory: [],
    stations: [],
    storage: [],
    simulation: []
  };

  if (!validation.isValid) categories.layout.push("Layout validation has blocking errors.");
  if (normalized.racks.length === 0) categories.layout.push("At least one rack is required.");
  if (normalized.cells.filter((cell) => ["ROAD", "QUEUE", "STATION", "CHARGING", "PARKING"].includes(cell.cellType)).length === 0) {
    categories.layout.push("At least one traversable road graph cell is required.");
  }
  if (!inventory.some((bin) => bin.sku && bin.quantity > 0)) categories.inventory.push("At least one bin must contain a SKU with positive quantity.");
  if (inventory.some((bin) => bin.quantity < 0 || bin.reservedQuantity < 0)) categories.inventory.push("Inventory quantities and reserved quantities must be non-negative.");
  if (inventory.some((bin) => bin.reservedQuantity > bin.quantity)) categories.inventory.push("Reserved quantity cannot exceed available quantity.");
  if (normalized.stations.length === 0) categories.stations.push("At least one station is required.");
  if (normalized.stations.some((station) => (station.queuePolicy?.requireQueuePointVisit ?? false) && queuePointsForStation(normalized, station).length === 0)) {
    categories.stations.push("Stations requiring pre-point visits need at least one assigned queue pre-point.");
  }
  if (normalized.storageLocations.length === 0) categories.storage.push("Storage locations are required for rack pickup and return.");
  if (normalized.racks.some((rack) => !rack.currentStorageLocationId && rack.operationalStatus !== "BEING_CARRIED")) categories.storage.push("Stored racks must reference a current storage location.");
  const ready = Object.values(categories).every((messages) => messages.length === 0);
  return { ready, categories, validation };
}
