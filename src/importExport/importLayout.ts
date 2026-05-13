import type { WarehouseLayout } from "../models/layout";
import { APP_VERSION, createEmptyLayout, LAYOUT_SCHEMA_VERSION } from "../generators/proceduralGenerator";
import { deriveDimensions } from "../utils/gridMath";

export interface LayoutImportResult {
  ok: boolean;
  layout?: WarehouseLayout;
  errors: string[];
  warnings: string[];
}

export function parseLayoutJson(json: string): LayoutImportResult {
  let parsed: Partial<WarehouseLayout>;
  try {
    parsed = JSON.parse(json) as Partial<WarehouseLayout>;
  } catch (error) {
    return {
      ok: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : "Unable to parse file."}`],
      warnings: []
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["Invalid RMFS layout JSON: root value must be an object."], warnings: [] };
  }
  if (!parsed.grid || !Array.isArray(parsed.cells)) {
    return { ok: false, errors: ["Invalid RMFS layout JSON: missing grid or cells."], warnings: [] };
  }
  const warnings: string[] = [];
  if (!parsed.layoutSchemaVersion) warnings.push("Older layout detected: missing layoutSchemaVersion. Applied 0.2.0 migration defaults.");
  const defaults = createEmptyLayout({
    rows: parsed.grid.rows,
    columns: parsed.grid.columns,
    cellWidthM: parsed.grid.cellWidthM,
    cellDepthM: parsed.grid.cellDepthM
  });
  const now = new Date().toISOString();
  return {
    ok: true,
    errors: [],
    warnings,
    layout: {
    ...defaults,
    ...parsed,
    layoutSchemaVersion: parsed.layoutSchemaVersion ?? LAYOUT_SCHEMA_VERSION,
    appVersion: parsed.appVersion ?? APP_VERSION,
    createdAt: parsed.createdAt ?? now,
    modifiedAt: now,
    physicalDimensions: parsed.physicalDimensions ?? deriveDimensions(parsed.grid),
    racks: parsed.racks ?? [],
    stations: parsed.stations ?? [],
    chargingSpots: parsed.chargingSpots ?? [],
    parkingSpots: parsed.parkingSpots ?? [],
    rotationZones: parsed.rotationZones ?? [],
    trafficRules: parsed.trafficRules ?? [],
    metadata: {
      ...(parsed.metadata ?? {}),
      importWarnings: warnings
    }
    }
  };
}

export function importLayoutJson(json: string): WarehouseLayout {
  const result = parseLayoutJson(json);
  if (!result.ok || !result.layout) {
    throw new Error(result.errors.join(" "));
  }
  return result.layout;
}
