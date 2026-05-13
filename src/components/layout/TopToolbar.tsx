import {
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileInput,
  Grid3X3,
  Hammer,
  Flame,
  Play,
  Redo2,
  RotateCw,
  Save,
  Search,
  Keyboard,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { AnalyticsResult } from "../../analytics/types";
import type { WarehouseLayout } from "../../models/layout";
import { exportAnalyticsCsv, exportAnalyticsJson, exportSummaryMarkdown } from "../../importExport/exportAnalytics";
import { downloadTextFile, exportLayoutJson } from "../../importExport/exportLayout";
import { importLayoutJson } from "../../importExport/importLayout";
import { exportLayoutSvg } from "../../importExport/exportImage";
import { useLayoutStore } from "../../store/layoutStore";
import { useUiStore, type HeatmapMode } from "../../store/uiStore";

interface TopToolbarProps {
  layout: WarehouseLayout;
  analytics: AnalyticsResult;
  onNew: () => void;
  onGenerate: () => void;
  onHybrid: () => void;
  onImportExport: () => void;
  onAnalyticsSettings: () => void;
  onShortcuts: () => void;
  onStatus: (message: string) => void;
  onRunValidation: () => void;
  onRunAnalytics: () => void;
}

export function TopToolbar({ layout, analytics, onNew, onGenerate, onHybrid, onImportExport, onAnalyticsSettings, onShortcuts, onStatus, onRunValidation, onRunAnalytics }: TopToolbarProps) {
  const { setLayout, undo, redo, rotateSelected, loadDemo, newLayout } = useLayoutStore();
  const dirty = useLayoutStore((state) => state.history.past.length > 0);
  const {
    zoomIn,
    zoomOut,
    fitToScreen,
    toggleGrid,
    toggleLabels,
    toggleDirectionArrows,
    toggleHeatmap,
    heatmapMode,
    setHeatmapMode
  } = useUiStore();

  const importFile = (file?: File) => {
    if (!file) return;
    file.text()
      .then((text) => {
        setLayout(importLayoutJson(text));
        onStatus(`Imported ${file.name}`);
      })
      .catch((error: unknown) => onStatus(error instanceof Error ? error.message : "Import failed"));
  };
  const confirmIfDirty = (message: string) => !dirty || window.confirm(message);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-border bg-panel px-3 shadow-panel">
      <div className="flex min-w-max items-center gap-2">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-teal-700 text-sm font-bold text-white">R</div>
          <div>
            <div className="text-sm font-semibold leading-tight">RMFS Layout Designer</div>
            <div className="text-[11px] text-muted-foreground">Visual grid editor and analytics</div>
          </div>
        </div>
        <button className="toolbar-button" onClick={onNew}>
          <FileDown data-icon="inline-start" /> New layout
        </button>
        <button
          className="toolbar-button"
          onClick={() => {
            if (!confirmIfDirty("Load the demo layout and replace the current working layout?")) return;
            loadDemo();
            onStatus("Demo layout loaded");
          }}
        >
          <Play data-icon="inline-start" /> Load demo
        </button>
        <button
          className="toolbar-button"
          onClick={() => {
            if (!confirmIfDirty("Clear the current layout and start with an empty grid?")) return;
            newLayout();
            onStatus("Layout cleared");
          }}
        >
          Clear layout
        </button>
        <label className="toolbar-button cursor-pointer">
          <FileInput data-icon="inline-start" /> Open JSON
          <input className="hidden" type="file" accept="application/json" onChange={(event) => importFile(event.target.files?.[0])} />
        </label>
        <button className="toolbar-button" onClick={() => {
          downloadTextFile(`${layout.layoutId}.json`, exportLayoutJson(layout), "application/json");
          onStatus("Layout JSON exported");
        }}>
          <Save data-icon="inline-start" /> Save JSON
        </button>
        <button className="toolbar-button" onClick={onImportExport}>
          <FileInput data-icon="inline-start" /> Import/export
        </button>
        <button className="toolbar-button" onClick={onGenerate}>
          <Hammer data-icon="inline-start" /> Generate Mode B
        </button>
        <button className="toolbar-button" onClick={onHybrid}>
          <Grid3X3 data-icon="inline-start" /> Generate Hybrid
        </button>
        <button className="toolbar-button" onClick={onRunValidation}>
          <CheckCircle2 data-icon="inline-start" /> Run validation
        </button>
        <button className="toolbar-button" onClick={onRunAnalytics}>
          <BarChart3 data-icon="inline-start" /> Run analytics
        </button>
        <button className="toolbar-button" onClick={onAnalyticsSettings}>
          <BarChart3 data-icon="inline-start" /> Analytics settings
        </button>
        <button className="toolbar-button" onClick={() => {
          downloadTextFile(`${layout.layoutId}_analytics.json`, exportAnalyticsJson(analytics), "application/json");
          onStatus("Analytics JSON exported");
        }}>
          <Download data-icon="inline-start" /> Export analytics
        </button>
        <button className="toolbar-button" onClick={() => {
          downloadTextFile(`${layout.layoutId}_analytics.csv`, exportAnalyticsCsv(analytics), "text/csv");
          onStatus("Analytics CSV exported");
        }}>
          <Upload data-icon="inline-start" /> Export CSV
        </button>
        <button className="toolbar-button" onClick={() => {
          downloadTextFile(`${layout.layoutId}_report.md`, exportSummaryMarkdown(layout, analytics), "text/markdown");
          onStatus("Markdown report exported");
        }}>
          <Download data-icon="inline-start" /> Export report
        </button>
      </div>
      <div className="flex min-w-max items-center gap-1">
        <button className="icon-button" title="Undo" onClick={undo}>
          <Undo2 />
        </button>
        <button className="icon-button" title="Redo" onClick={redo}>
          <Redo2 />
        </button>
        <button className="icon-button" title="Rotate selected" onClick={rotateSelected}>
          <RotateCw />
        </button>
        <button className="icon-button" title="Zoom in" onClick={zoomIn}>
          <ZoomIn />
        </button>
        <button className="icon-button" title="Zoom out" onClick={zoomOut}>
          <ZoomOut />
        </button>
        <button className="icon-button" title="Fit to screen" onClick={fitToScreen}>
          <Search />
        </button>
        <button className="icon-button" title="Keyboard shortcuts" onClick={onShortcuts}>
          <Keyboard />
        </button>
        <button className="icon-button" title="Toggle grid" onClick={toggleGrid}>
          <Grid3X3 />
        </button>
        <button className="icon-button" title="Toggle labels" onClick={toggleLabels}>
          <Eye />
        </button>
        <button className="icon-button" title="Toggle direction arrows" onClick={toggleDirectionArrows}>
          <FileDown />
        </button>
        <button className="icon-button" title="Toggle heatmap" onClick={toggleHeatmap}>
          <Flame />
        </button>
        <select
          className="field-input h-8 w-32"
          title="Heatmap mode"
          value={heatmapMode}
          onChange={(event) => setHeatmapMode(event.target.value as HeatmapMode)}
        >
          <option value="distance">Distance</option>
          <option value="congestion">Congestion</option>
          <option value="unreachable">Validation</option>
        </select>
        <button className="toolbar-button" onClick={() => window.dispatchEvent(new Event("rmfs-export-png"))}>
          PNG
        </button>
        <button className="toolbar-button" onClick={() => exportLayoutSvg(layout)}>
          SVG
        </button>
      </div>
    </header>
  );
}
