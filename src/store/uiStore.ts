import { create } from "zustand";
import type { GridCell } from "../models/grid";
import type { AppMode } from "../models/simulation";

export type Workflow = "design" | "generate" | "analyze" | "simulation" | "files";

export type EditorTool =
  | "select"
  | "pan"
  | "road"
  | "rack-storage"
  | "rack"
  | "station"
  | "queue"
  | "charger"
  | "parking"
  | "rotation"
  | "blocked"
  | "human-zone"
  | "dock"
  | "eraser"
  | "traffic";

export type HeatmapMode = "distance" | "congestion" | "unreachable";

interface UiState {
  activeTool: EditorTool;
  appMode: AppMode;
  workflow: Workflow;
  showGrid: boolean;
  showLabels: boolean;
  showDirectionArrows: boolean;
  showHeatmap: boolean;
  heatmapMode: HeatmapMode;
  zoom: number;
  hoverCell?: GridCell;
  setTool: (tool: EditorTool) => void;
  setAppMode: (mode: AppMode) => void;
  setWorkflow: (workflow: Workflow) => void;
  setHoverCell: (cell?: GridCell) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  toggleGrid: () => void;
  toggleLabels: () => void;
  toggleDirectionArrows: () => void;
  toggleHeatmap: () => void;
  setHeatmapMode: (mode: HeatmapMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTool: "select",
  appMode: "design",
  workflow: "design",
  showGrid: true,
  showLabels: true,
  showDirectionArrows: true,
  showHeatmap: false,
  heatmapMode: "distance",
  zoom: 1,
  hoverCell: undefined,
  setTool: (activeTool) => set({ activeTool }),
  setAppMode: (appMode) => set({ appMode, workflow: appMode === "simulation" ? "simulation" : "design", activeTool: "select" }),
  setWorkflow: (workflow) => set({ workflow, appMode: workflow === "simulation" ? "simulation" : "design", activeTool: workflow === "design" ? "select" : "select" }),
  setHoverCell: (hoverCell) => set({ hoverCell }),
  setZoom: (zoom) => set({ zoom: Math.max(0.3, Math.min(2.5, zoom)) }),
  zoomIn: () => set((state) => ({ zoom: Math.min(2.5, state.zoom + 0.1) })),
  zoomOut: () => set((state) => ({ zoom: Math.max(0.3, state.zoom - 0.1) })),
  fitToScreen: () => set({ zoom: 0.72 }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleDirectionArrows: () => set((state) => ({ showDirectionArrows: !state.showDirectionArrows })),
  toggleHeatmap: () => set((state) => ({ showHeatmap: !state.showHeatmap })),
  setHeatmapMode: (heatmapMode) => set({ heatmapMode, showHeatmap: true })
}));
