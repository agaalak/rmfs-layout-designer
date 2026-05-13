import type Konva from "konva";
import type { WarehouseLayout } from "../models/layout";

export function exportStagePng(stage: Konva.Stage, filename = "rmfs-layout.png") {
  const uri = stage.toDataURL({ pixelRatio: 2 });
  const anchor = document.createElement("a");
  anchor.href = uri;
  anchor.download = filename;
  anchor.click();
}

export function exportLayoutSvg(layout: WarehouseLayout, filename = "rmfs-layout.svg") {
  const cell = 16;
  const width = layout.grid.columns * cell;
  const height = layout.grid.rows * cell;
  const color: Record<string, string> = {
    ROAD: "#d1d5db",
    RACK_STORAGE: "#4ade80",
    STATION: "#fb923c",
    QUEUE: "#fed7aa",
    CHARGING: "#38bdf8",
    PARKING: "#a78bfa",
    ROTATION: "#fde047",
    BLOCKED: "#111827",
    HUMAN_ZONE: "#fca5a5",
    DOCK: "#94a3b8",
    EMPTY: "#ffffff"
  };
  const rects = layout.cells
    .map(
      (cellItem) =>
        `<rect x="${cellItem.col * cell}" y="${cellItem.row * cell}" width="${cell}" height="${cell}" fill="${color[cellItem.cellType] ?? "#fff"}" stroke="#e5e7eb" />`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
