import type { WarehouseLayout } from "../models/layout";
import { createEmptyLayout } from "../generators/proceduralGenerator";
import { APP_VERSION, LAYOUT_SCHEMA_VERSION, normalizeLayoutSemantics } from "../utils/layoutSemantics";
import { deriveDimensions } from "../utils/gridMath";
import { ensureStorageLocations } from "../utils/storageLocations";

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
  if (!parsed.layoutSchemaVersion) warnings.push("Older layout detected: missing layoutSchemaVersion. Applied 0.3.0 migration defaults.");
  if (parsed.layoutSchemaVersion && parsed.layoutSchemaVersion !== LAYOUT_SCHEMA_VERSION) warnings.push(`Layout schema ${parsed.layoutSchemaVersion} migrated to ${LAYOUT_SCHEMA_VERSION}.`);
  const defaults = createEmptyLayout({
    rows: parsed.grid.rows,
    columns: parsed.grid.columns,
    cellWidthM: parsed.grid.cellWidthM,
    cellDepthM: parsed.grid.cellDepthM
  });
  const now = new Date().toISOString();
  const layout = ensureStorageLocations(normalizeLayoutSemantics({
    ...defaults,
    ...parsed,
    layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
    appVersion: parsed.appVersion ?? APP_VERSION,
    createdAt: parsed.createdAt ?? now,
    modifiedAt: now,
    physicalDimensions: parsed.physicalDimensions ?? deriveDimensions(parsed.grid),
    racks: parsed.racks ?? [],
    storageLocations: parsed.storageLocations ?? [],
    stations: parsed.stations ?? [],
    directedLinks: parsed.directedLinks ?? [],
    queuePoints: parsed.queuePoints ?? [],
    queueLanes: parsed.queueLanes ?? [],
    chargingSpots: parsed.chargingSpots ?? [],
    parkingSpots: parsed.parkingSpots ?? [],
    rotationZones: parsed.rotationZones ?? [],
    trafficRules: parsed.trafficRules ?? [],
    metadata: {
      ...(parsed.metadata ?? {}),
      importWarnings: warnings
    }
  }));
  return {
    ok: true,
    errors: [],
    warnings,
    layout
  };
}

export function importLayoutJson(json: string): WarehouseLayout {
  const result = parseLayoutJson(json);
  if (!result.ok || !result.layout) {
    throw new Error(result.errors.join(" "));
  }
  return result.layout;
}
