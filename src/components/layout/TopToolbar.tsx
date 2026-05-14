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
  Keyboard,
  Play,
  Redo2,
  RotateCw,
  Save,
  Search,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { ReactNode } from "react";
import type { AnalyticsResult } from "../../analytics/types";
import type { WarehouseLayout } from "../../models/layout";
import { exportAnalyticsCsv, exportAnalyticsJson, exportSummaryMarkdown } from "../../importExport/exportAnalytics";
import { downloadTextFile, exportLayoutJson } from "../../importExport/exportLayout";
import { importLayoutJson } from "../../importExport/importLayout";
import { exportLayoutSvg } from "../../importExport/exportImage";
import { useLayoutStore } from "../../store/layoutStore";
import { useUiStore, type EditorTool, type HeatmapMode } from "../../store/uiStore";

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

function IconButton({ title, children, onClick }: { title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button className="icon-button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

function ToolButton({ tool, label }: { tool: EditorTool; label: string }) {
  const { activeTool, setTool } = useUiStore();
  return (
    <button className={activeTool === tool ? "toolbar-button-primary" : "toolbar-button"} onClick={() => setTool(tool)} aria-pressed={activeTool === tool}>
      {label}
    </button>
  );
}

export function TopToolbar({ layout, analytics, onNew, onGenerate, onHybrid, onImportExport, onAnalyticsSettings, onShortcuts, onStatus, onRunValidation, onRunAnalytics }: TopToolbarProps) {
  const { setLayout, undo, redo, rotateSelected, deleteSelected, loadDemo, newLayout, candidateComparison, applySelectedCandidate } = useLayoutStore();
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
    setHeatmapMode,
    workflow,
    setWorkflow
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
  const workflowLabel = workflow === "simulation" ? "Simulate Experimental" : workflow[0].toUpperCase() + workflow.slice(1);

  return (
    <header className="shrink-0 border-b border-border bg-panel shadow-panel">
      <div className="flex min-h-14 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-sm font-bold text-white">R</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">RMFS Layout Designer</div>
            <div className="truncate text-[11px] text-muted-foreground">{layout.name} - {workflowLabel} - {dirty ? "Unsaved changes" : "Saved baseline"}</div>
          </div>
          {workflow === "simulation" ? <span className="badge-experimental">Experimental</span> : <span className="badge-stable">Stable</span>}
        </div>
        <div className="hidden text-xs text-amber-700 max-lg:block">For best layout editing, use a larger screen.</div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="toolbar-button-primary" onClick={workflow === "generate" ? onGenerate : workflow === "analyze" ? onRunAnalytics : workflow === "files" ? onImportExport : workflow === "simulation" ? () => setWorkflow("design") : onNew}>
            {workflow === "generate" ? "Generate" : workflow === "analyze" ? "Refresh analytics" : workflow === "files" ? "Import/export" : workflow === "simulation" ? "Return to Design" : "New layout"}
          </button>
          <IconButton title="Keyboard shortcuts" onClick={onShortcuts}><Keyboard /></IconButton>
        </div>
      </div>

      <div className="flex min-h-11 items-center gap-2 overflow-hidden border-t border-border bg-slate-50 px-3 py-1">
        {workflow === "design" ? (
          <>
            <button className="toolbar-button" onClick={onNew}><FileDown data-icon="inline-start" /> New</button>
            <button
              className="toolbar-button"
              onClick={() => {
                if (!confirmIfDirty("Load the demo layout and replace the current working layout?")) return;
                loadDemo();
                onStatus("Demo layout loaded");
              }}
            >
              <Play data-icon="inline-start" /> Demo
            </button>
            <button
              className="toolbar-button"
              onClick={() => {
                if (!confirmIfDirty("Clear the current layout and start with an empty grid?")) return;
                newLayout();
                onStatus("Layout cleared");
              }}
            >
              Clear
            </button>
            <div className="mx-1 h-7 w-px bg-border" />
            <IconButton title="Undo" onClick={undo}><Undo2 /></IconButton>
            <IconButton title="Redo" onClick={redo}><Redo2 /></IconButton>
            <ToolButton tool="select" label="Select" />
            <ToolButton tool="pan" label="Pan" />
            <IconButton title="Rotate selected" onClick={rotateSelected}><RotateCw /></IconButton>
            <IconButton title="Delete selected" onClick={deleteSelected}><Trash2 /></IconButton>
            <div className="mx-1 h-7 w-px bg-border" />
            <IconButton title="Fit to screen" onClick={fitToScreen}><Search /></IconButton>
            <IconButton title="Zoom in" onClick={zoomIn}><ZoomIn /></IconButton>
            <IconButton title="Zoom out" onClick={zoomOut}><ZoomOut /></IconButton>
            <IconButton title="Toggle grid" onClick={toggleGrid}><Grid3X3 /></IconButton>
            <IconButton title="Toggle labels" onClick={toggleLabels}><Eye /></IconButton>
            <IconButton title="Toggle direction arrows" onClick={toggleDirectionArrows}><FileDown /></IconButton>
          </>
        ) : null}

        {workflow === "generate" ? (
          <>
            <button className="toolbar-button-primary" onClick={onGenerate}><Hammer data-icon="inline-start" /> Generate Mode B</button>
            <button className="toolbar-button" onClick={onHybrid}><Grid3X3 data-icon="inline-start" /> Generate Hybrid</button>
            <button className="toolbar-button" onClick={candidateComparison ? applySelectedCandidate : onGenerate} disabled={!candidateComparison}>
              Apply selected candidate
            </button>
            <span className="text-xs text-muted-foreground">Preview candidates in the drawer before applying.</span>
          </>
        ) : null}

        {workflow === "analyze" ? (
          <>
            <button className="toolbar-button-primary" onClick={onRunValidation}><CheckCircle2 data-icon="inline-start" /> Run validation</button>
            <button className="toolbar-button" onClick={onRunAnalytics}><BarChart3 data-icon="inline-start" /> Run analytics</button>
            <button className="toolbar-button" onClick={onAnalyticsSettings}><BarChart3 data-icon="inline-start" /> Settings</button>
            <button className="toolbar-button" onClick={toggleHeatmap}><Flame data-icon="inline-start" /> Heatmap</button>
            <select className="field-input h-8 w-36" title="Heatmap mode" aria-label="Heatmap mode" value={heatmapMode} onChange={(event) => setHeatmapMode(event.target.value as HeatmapMode)}>
              <option value="distance">Distance</option>
              <option value="congestion">Congestion</option>
              <option value="unreachable">Validation</option>
            </select>
            <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_report.md`, exportSummaryMarkdown(layout, analytics), "text/markdown")}><Download data-icon="inline-start" /> Report</button>
            <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.json`, exportAnalyticsJson(analytics), "application/json")}>JSON</button>
            <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.csv`, exportAnalyticsCsv(analytics), "text/csv")}>CSV</button>
          </>
        ) : null}

        {workflow === "simulation" ? (
          <>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">Experimental 2D playback. Not full MAPF. Not final traffic validation.</span>
            <button className="toolbar-button" onClick={() => setWorkflow("design")}>Return to Design</button>
          </>
        ) : null}

        {workflow === "files" ? (
          <>
            <label className="toolbar-button cursor-pointer"><FileInput data-icon="inline-start" /> Open JSON<input className="hidden" type="file" accept="application/json" onChange={(event) => importFile(event.target.files?.[0])} /></label>
            <button className="toolbar-button-primary" onClick={() => downloadTextFile(`${layout.layoutId}.json`, exportLayoutJson(layout), "application/json")}><Save data-icon="inline-start" /> Save JSON</button>
            <button className="toolbar-button" onClick={onImportExport}><FileInput data-icon="inline-start" /> Import/export</button>
            <button className="toolbar-button" onClick={() => window.dispatchEvent(new Event("rmfs-export-png"))}>PNG</button>
            <button className="toolbar-button" onClick={() => exportLayoutSvg(layout)}>SVG</button>
            <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_report.md`, exportSummaryMarkdown(layout, analytics), "text/markdown")}>Markdown report</button>
          </>
        ) : null}
      </div>
    </header>
  );
}
