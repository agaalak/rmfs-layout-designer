import { useMemo, useState } from "react";
import { runAnalytics } from "../../analytics/runAnalytics";
import { validateLayout } from "../../validation/validateLayout";
import type { ValidationIssue } from "../../validation/validateObjects";
import { useCurrentLayout, useLayoutStore } from "../../store/layoutStore";
import type { SelectedObjectRef } from "../../models/layout";
import { LayoutCanvas } from "../canvas/LayoutCanvas";
import { AnalyticsSettingsDialog } from "../dialogs/AnalyticsSettingsDialog";
import { HybridGeneratorDialog } from "../dialogs/HybridGeneratorDialog";
import { ImportExportDialog } from "../dialogs/ImportExportDialog";
import { KeyboardShortcutsDialog } from "../dialogs/KeyboardShortcutsDialog";
import { NewLayoutDialog } from "../dialogs/NewLayoutDialog";
import { ProceduralGeneratorDialog } from "../dialogs/ProceduralGeneratorDialog";
import { CandidateComparisonDrawer } from "../panels/CandidateComparisonDrawer";
import { BottomAnalyticsPanel } from "./BottomAnalyticsPanel";
import { LeftToolbox } from "./LeftToolbox";
import { RightPropertiesPanel } from "./RightPropertiesPanel";
import { TopToolbar } from "./TopToolbar";
import { useUiStore } from "../../store/uiStore";

export function AppShell() {
  const layout = useCurrentLayout();
  const [newOpen, setNewOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [hybridOpen, setHybridOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [analyticsSettingsOpen, setAnalyticsSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Live analytics ready");
  const selectObject = useLayoutStore((state) => state.selectObject);
  const selectCell = useLayoutStore((state) => state.selectCell);
  const candidateComparison = useLayoutStore((state) => state.candidateComparison);
  const selectCandidatePreview = useLayoutStore((state) => state.selectCandidatePreview);
  const sortCandidates = useLayoutStore((state) => state.sortCandidates);
  const applySelectedCandidate = useLayoutStore((state) => state.applySelectedCandidate);
  const closeCandidateComparison = useLayoutStore((state) => state.closeCandidateComparison);
  const selected = useLayoutStore((state) => state.selected);
  const selectedCell = useLayoutStore((state) => state.selectedCell);
  const history = useLayoutStore((state) => state.history);
  const { activeTool, hoverCell, zoom } = useUiStore();
  const validation = useMemo(() => validateLayout(layout), [layout]);
  const analytics = useMemo(() => runAnalytics(layout), [layout]);
  const selectIssue = (issue: ValidationIssue) => {
    if (issue.objectId) {
      const ref: SelectedObjectRef | undefined =
        layout.racks.some((item) => item.id === issue.objectId)
          ? { kind: "rack", id: issue.objectId }
          : layout.stations.some((item) => item.id === issue.objectId)
            ? { kind: "station", id: issue.objectId }
            : layout.chargingSpots.some((item) => item.id === issue.objectId)
              ? { kind: "charger", id: issue.objectId }
              : layout.parkingSpots.some((item) => item.id === issue.objectId)
                ? { kind: "parking", id: issue.objectId }
                : layout.rotationZones.some((item) => item.id === issue.objectId)
                  ? { kind: "rotation", id: issue.objectId }
                  : undefined;
      if (ref) {
        selectObject(ref);
        return;
      }
    }
    if (issue.cell) selectCell(issue.cell);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TopToolbar
        layout={layout}
        analytics={analytics}
        onNew={() => setNewOpen(true)}
        onGenerate={() => setGenerateOpen(true)}
        onHybrid={() => setHybridOpen(true)}
        onImportExport={() => setImportExportOpen(true)}
        onAnalyticsSettings={() => setAnalyticsSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onStatus={setStatusMessage}
        onRunValidation={() => setStatusMessage(`Validation ran: ${validation.issues.length} finding${validation.issues.length === 1 ? "" : "s"}`)}
        onRunAnalytics={() => setStatusMessage(`Analytics refreshed: score ${analytics.scoring.overallLayoutScore.toFixed(1)}, throughput ${analytics.performance.estimatedSystemThroughput.toFixed(1)} /hr`)}
      />
      <div className="flex items-center justify-between gap-3 border-b border-border bg-slate-50 px-3 py-1 text-xs text-muted-foreground">
        <span>{statusMessage}</span>
        <span className="min-w-max">
          {history.past.length > 0 ? "Unsaved changes" : "Saved baseline"} | Tool: {activeTool} | Selected: {selected[0]?.id ?? (selectedCell ? `cell ${selectedCell.row},${selectedCell.col}` : "none")} | Hover: {hoverCell ? `${hoverCell.row},${hoverCell.col}` : "none"} | Zoom {(zoom * 100).toFixed(0)}% | Validation errors {validation.issues.filter((issue) => issue.severity === "error").length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <LeftToolbox />
        <main className="relative min-w-0 flex-1">
          <LayoutCanvas validation={validation} analytics={analytics} />
          <CandidateComparisonDrawer
            comparison={candidateComparison}
            onSelect={(candidateId) => {
              selectCandidatePreview(candidateId);
              setStatusMessage(`Previewing ${candidateId}`);
            }}
            onSort={sortCandidates}
            onApply={() => {
              applySelectedCandidate();
              setStatusMessage("Selected candidate applied and ready for editing");
            }}
            onClose={closeCandidateComparison}
          />
        </main>
        <RightPropertiesPanel validation={validation} analytics={analytics} onSelectIssue={selectIssue} />
      </div>
      <div className="overflow-x-auto">
        <BottomAnalyticsPanel analytics={analytics} validation={validation} />
      </div>
      <NewLayoutDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ProceduralGeneratorDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <HybridGeneratorDialog open={hybridOpen} onClose={() => setHybridOpen(false)} />
      <ImportExportDialog open={importExportOpen} onClose={() => setImportExportOpen(false)} layout={layout} analytics={analytics} />
      <AnalyticsSettingsDialog open={analyticsSettingsOpen} onClose={() => setAnalyticsSettingsOpen(false)} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
