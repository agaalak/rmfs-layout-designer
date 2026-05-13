import type { WarehouseLayout } from "../models/layout";

export function exportLayoutJson(layout: WarehouseLayout): string {
  return JSON.stringify(layout, null, 2);
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
