import type { WarehouseLayout } from "../models/layout";
import { APP_VERSION, LAYOUT_SCHEMA_VERSION, normalizeLayoutSemantics } from "../utils/layoutSemantics";

export function exportLayoutJson(layout: WarehouseLayout): string {
  const now = new Date().toISOString();
  const normalized = normalizeLayoutSemantics(layout);
  return JSON.stringify(
    {
      ...normalized,
      layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: normalized.createdAt ?? now,
      modifiedAt: now,
      rotationZones: [],
      metadata: {
        ...normalized.metadata,
        exportedAt: now
      }
    },
    null,
    2
  );
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
