import { useMemo, useState } from "react";
import { FileDown, FileInput, ImageDown, Save, Star, Trash2 } from "lucide-react";
import type { AnalyticsResult } from "../../analytics/types";
import { exportAnalyticsCsv, exportAnalyticsJson, exportSummaryMarkdown } from "../../importExport/exportAnalytics";
import { exportLayoutSvg } from "../../importExport/exportImage";
import { downloadTextFile, exportLayoutJson } from "../../importExport/exportLayout";
import { importLayoutJson } from "../../importExport/importLayout";
import {
  clearDefaultLayoutId,
  deleteSavedLayout,
  getDefaultLayoutId,
  listSavedLayouts,
  loadSavedLayout,
  saveLayoutToBrowser,
  setDefaultLayoutId
} from "../../importExport/layoutPersistence";
import type { WarehouseLayout } from "../../models/layout";
import { useLayoutStore } from "../../store/layoutStore";
import { cn } from "../../utils/cn";

interface FilesWorkflowPanelProps {
  layout: WarehouseLayout;
  analytics: AnalyticsResult;
  onOpenDialog: () => void;
  onStatus: (message: string) => void;
  display?: "desktop" | "drawer";
}

export function FilesWorkflowPanel({ layout, analytics, onOpenDialog, onStatus, display = "desktop" }: FilesWorkflowPanelProps) {
  const setLayout = useLayoutStore((state) => state.setLayout);
  const markSavedBaseline = useLayoutStore((state) => state.markSavedBaseline);
  const dirty = useLayoutStore((state) => state.history.past.length > 0);
  const [savedLayouts, setSavedLayouts] = useState(() => listSavedLayouts());
  const [defaultLayoutId, setDefaultLayoutState] = useState(() => getDefaultLayoutId());
  const currentIsDefault = defaultLayoutId === layout.layoutId;
  const savedCurrent = useMemo(() => savedLayouts.some((item) => item.id === layout.layoutId), [layout.layoutId, savedLayouts]);

  const refreshSavedLayouts = () => {
    setSavedLayouts(listSavedLayouts());
    setDefaultLayoutState(getDefaultLayoutId());
  };

  const saveCurrent = (makeDefault: boolean) => {
    try {
      const summary = saveLayoutToBrowser(layout, makeDefault);
      markSavedBaseline();
      refreshSavedLayouts();
      onStatus(makeDefault ? `Saved ${summary.name} and set it as the startup default` : `Saved ${summary.name} in this browser`);
    } catch (error: unknown) {
      onStatus(error instanceof Error ? error.message : "Could not save layout in this browser");
    }
  };

  const loadSaved = (layoutId: string) => {
    const saved = loadSavedLayout(layoutId);
    if (!saved) {
      onStatus("Saved layout was not found in this browser");
      refreshSavedLayouts();
      return;
    }
    setLayout(saved);
    markSavedBaseline();
    onStatus(`Loaded ${saved.name}`);
  };

  const makeDefault = (layoutId: string) => {
    setDefaultLayoutId(layoutId);
    refreshSavedLayouts();
    onStatus("Startup default updated");
  };

  const clearDefault = () => {
    clearDefaultLayoutId();
    refreshSavedLayouts();
    onStatus("Startup default cleared; Small Demo will load on next fresh visit");
  };

  const deleteSaved = (layoutId: string) => {
    deleteSavedLayout(layoutId);
    refreshSavedLayouts();
    onStatus("Saved layout removed from this browser");
  };

  const importFile = (file?: File) => {
    if (!file) return;
    file.text()
      .then((text) => {
        setLayout(importLayoutJson(text));
        markSavedBaseline();
        onStatus(`Imported ${file.name}`);
      })
      .catch((error: unknown) => onStatus(error instanceof Error ? error.message : "Import failed"));
  };

  return (
    <aside
      className={cn(
        display === "desktop"
          ? "hidden w-80 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-3 xl:flex"
          : "flex h-full w-full flex-col gap-4 overflow-auto bg-panel p-3"
      )}
      aria-label="Files panel"
    >
      <div>
        <div className="panel-title">Files</div>
        <div className="mt-2 text-sm font-semibold">Import, export, and reports</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Layout JSON includes schema versioning, rack bins, traffic directions, locks, metadata, and optional simulation config.
        </p>
      </div>

      <section className="rounded-md border border-border bg-slate-50 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Current layout</span>
          <span className="font-semibold">{layout.name}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className={dirty ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>{dirty ? "Unsaved changes" : "Saved baseline"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Schema</span>
          <span className="font-semibold">{layout.layoutSchemaVersion}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Startup default</span>
          <span className={currentIsDefault ? "font-semibold text-emerald-700" : "font-semibold text-muted-foreground"}>{currentIsDefault ? "This layout" : "Small Demo or saved default"}</span>
        </div>
      </section>

      <section className="grid gap-2">
        <div className="panel-title">Save current layout</div>
        <button className="toolbar-button-primary justify-center" onClick={() => saveCurrent(false)}>
          <Save data-icon="inline-start" />
          Save in browser
        </button>
        <button className="toolbar-button justify-center" onClick={() => saveCurrent(true)}>
          <Star data-icon="inline-start" />
          Save and make default
        </button>
        <button className="toolbar-button justify-center" onClick={() => saveCurrent(true)}>
          Make current layout default
        </button>
        {defaultLayoutId ? (
          <button className="toolbar-button justify-center" onClick={clearDefault}>
            Clear startup default
          </button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Browser saves stay on this machine. Download JSON when you need a portable file or backup.
        </p>
      </section>

      <section className="grid gap-2">
        <div className="panel-title">Portable JSON</div>
        <label className="toolbar-button-primary cursor-pointer justify-center">
          <FileInput data-icon="inline-start" />
          Import layout JSON
          <input className="hidden" type="file" accept="application/json,.json" onChange={(event) => importFile(event.target.files?.[0])} />
        </label>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}.json`, exportLayoutJson(layout), "application/json")}>
          <Save data-icon="inline-start" />
          Download layout JSON
        </button>
        <button className="toolbar-button justify-center" onClick={onOpenDialog}>
          Import/export dialog
        </button>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <div className="panel-title">Saved layouts</div>
          <span className="text-[11px] text-muted-foreground">{savedLayouts.length} saved</span>
        </div>
        {savedLayouts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-white p-3 text-xs text-muted-foreground">
            No browser-saved layouts yet. Save the current layout to keep it available after reloads.
          </div>
        ) : (
          <div className="grid gap-2">
            {savedLayouts.map((saved) => (
              <article key={saved.id} className="rounded-md border border-border bg-white p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{saved.name}</div>
                    <div className="mt-1 text-muted-foreground">
                      {saved.rows} x {saved.columns} · {saved.rackCount} racks · {saved.stationCount} stations
                    </div>
                    <div className="mt-1 text-muted-foreground">Saved {new Date(saved.savedAt).toLocaleString()}</div>
                  </div>
                  {defaultLayoutId === saved.id ? <span className="badge-stable">Default</span> : null}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button className="toolbar-button justify-center" onClick={() => loadSaved(saved.id)}>Load</button>
                  <button className="toolbar-button justify-center" onClick={() => makeDefault(saved.id)} disabled={defaultLayoutId === saved.id}>
                    Default
                  </button>
                  <button className="toolbar-button justify-center" onClick={() => deleteSaved(saved.id)} aria-label={`Delete saved layout ${saved.name}`} title={`Delete ${saved.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {savedCurrent ? <p className="text-xs text-emerald-700">The current layout has a browser-saved copy.</p> : null}
      </section>

      <section className="grid gap-2">
        <div className="panel-title">Exports</div>
        <button className="toolbar-button justify-center" onClick={() => window.dispatchEvent(new Event("rmfs-export-png"))}>
          <ImageDown data-icon="inline-start" />
          Export PNG
        </button>
        <button className="toolbar-button justify-center" onClick={() => exportLayoutSvg(layout)}>Export SVG</button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}_report.md`, exportSummaryMarkdown(layout, analytics), "text/markdown")}>
          <FileDown data-icon="inline-start" />
          Export Markdown report
        </button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.json`, exportAnalyticsJson(analytics), "application/json")}>Export analytics JSON</button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.csv`, exportAnalyticsCsv(analytics), "text/csv")}>Export analytics CSV</button>
      </section>
    </aside>
  );
}
