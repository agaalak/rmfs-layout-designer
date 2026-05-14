import { FileDown, FileInput, ImageDown, Save } from "lucide-react";
import type { AnalyticsResult } from "../../analytics/types";
import { exportAnalyticsCsv, exportAnalyticsJson, exportSummaryMarkdown } from "../../importExport/exportAnalytics";
import { exportLayoutSvg } from "../../importExport/exportImage";
import { downloadTextFile, exportLayoutJson } from "../../importExport/exportLayout";
import { importLayoutJson } from "../../importExport/importLayout";
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
  const dirty = useLayoutStore((state) => state.history.past.length > 0);

  const importFile = (file?: File) => {
    if (!file) return;
    file.text()
      .then((text) => {
        setLayout(importLayoutJson(text));
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
      </section>

      <section className="grid gap-2">
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
