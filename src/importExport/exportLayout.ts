import type { WarehouseLayout } from "../models/layout";
import { APP_VERSION, LAYOUT_SCHEMA_VERSION } from "../generators/proceduralGenerator";

export function exportLayoutJson(layout: WarehouseLayout): string {
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      ...layout,
      layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: layout.createdAt ?? now,
      modifiedAt: now,
      metadata: {
        ...layout.metadata,
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
