import type { AnalyticsResult } from "../../analytics/types";
import { exportAnalyticsCsv, exportAnalyticsJson, exportSummaryMarkdown } from "../../importExport/exportAnalytics";
import { downloadTextFile, exportLayoutJson } from "../../importExport/exportLayout";
import type { WarehouseLayout } from "../../models/layout";
import { importLayoutJson } from "../../importExport/importLayout";
import { useLayoutStore } from "../../store/layoutStore";
import { DialogShell } from "./DialogShell";

interface ImportExportDialogProps {
  open: boolean;
  onClose: () => void;
  layout: WarehouseLayout;
  analytics: AnalyticsResult;
}

export function ImportExportDialog({ open, onClose, layout, analytics }: ImportExportDialogProps) {
  const setLayout = useLayoutStore((state) => state.setLayout);
  const importFile = (file?: File) => {
    if (!file) return;
    file.text().then((text) => {
      setLayout(importLayoutJson(text));
      onClose();
    });
  };
  return (
    <DialogShell title="Import / Export" open={open} onClose={onClose}>
      <div className="grid gap-3 text-sm">
        <label className="toolbar-button w-fit cursor-pointer">
          Import layout JSON
          <input className="hidden" type="file" accept="application/json" onChange={(event) => importFile(event.target.files?.[0])} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}.json`, exportLayoutJson(layout), "application/json")}>
            Export layout JSON
          </button>
          <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.json`, exportAnalyticsJson(analytics), "application/json")}>
            Export analytics JSON
          </button>
          <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_analytics.csv`, exportAnalyticsCsv(analytics), "text/csv")}>
            Export analytics CSV
          </button>
          <button className="toolbar-button" onClick={() => downloadTextFile(`${layout.layoutId}_report.md`, exportSummaryMarkdown(layout, analytics), "text/markdown")}>
            Export Markdown report
          </button>
        </div>
        <div className="rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
          PNG and SVG exports are available from the main toolbar because they use the current canvas view.
        </div>
      </div>
    </DialogShell>
  );
}
