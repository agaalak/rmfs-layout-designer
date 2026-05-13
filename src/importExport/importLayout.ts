import type { WarehouseLayout } from "../models/layout";
import { createEmptyLayout } from "../generators/proceduralGenerator";
import { deriveDimensions } from "../utils/gridMath";

export function importLayoutJson(json: string): WarehouseLayout {
  const parsed = JSON.parse(json) as WarehouseLayout;
  if (!parsed.grid || !parsed.cells) {
    throw new Error("Invalid RMFS layout JSON: missing grid or cells.");
  }
  const defaults = createEmptyLayout({
    rows: parsed.grid.rows,
    columns: parsed.grid.columns,
    cellWidthM: parsed.grid.cellWidthM,
    cellDepthM: parsed.grid.cellDepthM
  });
  return {
    ...defaults,
    ...parsed,
    physicalDimensions: parsed.physicalDimensions ?? deriveDimensions(parsed.grid),
    racks: parsed.racks ?? [],
    stations: parsed.stations ?? [],
    chargingSpots: parsed.chargingSpots ?? [],
    parkingSpots: parsed.parkingSpots ?? [],
    rotationZones: parsed.rotationZones ?? [],
    trafficRules: parsed.trafficRules ?? [],
    metadata: parsed.metadata ?? {}
  };
}
