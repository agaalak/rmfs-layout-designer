import { useEffect, useMemo, useState } from "react";
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
import { AnalyzeWorkflowPanel } from "../panels/AnalyzeWorkflowPanel";
import { CandidateComparisonDrawer } from "../panels/CandidateComparisonDrawer";
import { FilesWorkflowPanel } from "../panels/FilesWorkflowPanel";
import { GenerateWorkflowPanel } from "../panels/GenerateWorkflowPanel";
import { SimulationPanel } from "../panels/SimulationPanel";
import { BottomAnalyticsPanel } from "./BottomAnalyticsPanel";
import { LeftToolbox } from "./LeftToolbox";
import { RightPropertiesPanel } from "./RightPropertiesPanel";
import { TopToolbar } from "./TopToolbar";
import { WorkflowRail } from "./WorkflowRail";
import { useUiStore } from "../../store/uiStore";
import { useSimulationStore } from "../../store/simulationStore";

type MobileDrawer = "tools" | "panel" | null;

export function AppShell() {
  const layout = useCurrentLayout();
  const [newOpen, setNewOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [hybridOpen, setHybridOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [analyticsSettingsOpen, setAnalyticsSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawer>(null);
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
  const { activeTool, appMode, workflow, hoverCell, zoom } = useUiStore();
  const simulationState = useSimulationStore((state) => state.state);
  const simulationStep = useSimulationStore((state) => state.step);
  const validation = useMemo(() => validateLayout(layout), [layout]);
  const analytics = useMemo(() => runAnalytics(layout), [layout]);
  useEffect(() => {
    if (appMode !== "simulation" || !simulationState.isRunning) return;
    const timer = window.setInterval(() => simulationStep(layout, 0.2), 200);
    return () => window.clearInterval(timer);
  }, [appMode, layout, simulationState.isRunning, simulationStep]);
  useEffect(() => {
    setMobileDrawer(null);
  }, [workflow]);
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
      <div data-testid="status-bar" className="flex items-center justify-between gap-3 border-b border-border bg-slate-50 px-3 py-1 text-xs text-muted-foreground">
        <span>{statusMessage}</span>
        <span className="min-w-max">
          Workflow: {workflow} | Mode: {appMode} | {history.past.length > 0 ? "Unsaved changes" : "Saved baseline"} | Tool: {activeTool} | Selected: {selected[0]?.id ?? (selectedCell ? `cell ${selectedCell.row},${selectedCell.col}` : "none")} | Hover: {hoverCell ? `${hoverCell.row},${hoverCell.col}` : "none"} | Zoom {(zoom * 100).toFixed(0)}% | Validation errors {validation.issues.filter((issue) => issue.severity === "error").length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <WorkflowRail />
        {workflow === "design" ? <LeftToolbox /> : null}
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
        {workflow === "generate" ? (
          <GenerateWorkflowPanel
            comparison={candidateComparison}
            onGenerateModeB={() => setGenerateOpen(true)}
            onGenerateHybrid={() => setHybridOpen(true)}
            onApplyCandidate={() => {
              applySelectedCandidate();
              setStatusMessage("Selected candidate applied and ready for editing");
            }}
          />
        ) : null}
        {workflow === "analyze" ? (
          <AnalyzeWorkflowPanel
            layout={layout}
            analytics={analytics}
            validation={validation}
            onRunValidation={() => setStatusMessage(`Validation ran: ${validation.issues.length} finding${validation.issues.length === 1 ? "" : "s"}`)}
            onRunAnalytics={() => setStatusMessage(`Analytics refreshed: score ${analytics.scoring.overallLayoutScore.toFixed(1)}, throughput ${analytics.performance.estimatedSystemThroughput.toFixed(1)} /hr`)}
            onSelectIssue={selectIssue}
          />
        ) : null}
        {workflow === "files" ? (
          <FilesWorkflowPanel layout={layout} analytics={analytics} onOpenDialog={() => setImportExportOpen(true)} onStatus={setStatusMessage} />
        ) : null}
        {workflow === "simulation" ? (
          <SimulationPanel layout={layout} />
        ) : null}
        {workflow === "design" ? (
          <RightPropertiesPanel validation={validation} analytics={analytics} onSelectIssue={selectIssue} />
        ) : null}
        <div className="fixed bottom-3 right-3 z-30 flex gap-2 xl:hidden" aria-label="Responsive panel controls">
          {workflow === "design" ? (
            <button className="toolbar-button-primary shadow-2xl" onClick={() => setMobileDrawer("tools")} aria-label="Open Design tools">
              Tools
            </button>
          ) : null}
          <button className="toolbar-button-primary shadow-2xl" onClick={() => setMobileDrawer("panel")} aria-label={`Open ${workflow} panel`}>
            {workflow === "design" ? "Properties" : workflow === "simulation" ? "Simulation" : workflow[0].toUpperCase() + workflow.slice(1)}
          </button>
        </div>
        {mobileDrawer ? (
          <div className="fixed inset-0 z-40 bg-slate-950/45 xl:hidden" role="presentation" onClick={() => setMobileDrawer(null)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-label={mobileDrawer === "tools" ? "Design tools drawer" : `${workflow} workflow drawer`}
              className="absolute bottom-0 left-0 right-0 max-h-[82vh] rounded-t-xl border border-border bg-panel shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div>
                  <div className="text-sm font-semibold">{mobileDrawer === "tools" ? "Design tools" : "Workflow panel"}</div>
                  <div className="text-xs text-muted-foreground">Drawer view for smaller screens.</div>
                </div>
                <button className="icon-button" onClick={() => setMobileDrawer(null)} aria-label="Close responsive drawer" title="Close drawer">
                  X
                </button>
              </div>
              <div className="h-[calc(82vh-3.5rem)] overflow-hidden">
                {mobileDrawer === "tools" ? <LeftToolbox display="drawer" /> : null}
                {mobileDrawer === "panel" && workflow === "design" ? (
                  <RightPropertiesPanel display="drawer" validation={validation} analytics={analytics} onSelectIssue={selectIssue} />
                ) : null}
                {mobileDrawer === "panel" && workflow === "generate" ? (
                  <GenerateWorkflowPanel
                    display="drawer"
                    comparison={candidateComparison}
                    onGenerateModeB={() => setGenerateOpen(true)}
                    onGenerateHybrid={() => setHybridOpen(true)}
                    onApplyCandidate={() => {
                      applySelectedCandidate();
                      setMobileDrawer(null);
                      setStatusMessage("Selected candidate applied and ready for editing");
                    }}
                  />
                ) : null}
                {mobileDrawer === "panel" && workflow === "analyze" ? (
                  <AnalyzeWorkflowPanel
                    display="drawer"
                    layout={layout}
                    analytics={analytics}
                    validation={validation}
                    onRunValidation={() => setStatusMessage(`Validation ran: ${validation.issues.length} finding${validation.issues.length === 1 ? "" : "s"}`)}
                    onRunAnalytics={() => setStatusMessage(`Analytics refreshed: score ${analytics.scoring.overallLayoutScore.toFixed(1)}, throughput ${analytics.performance.estimatedSystemThroughput.toFixed(1)} /hr`)}
                    onSelectIssue={selectIssue}
                  />
                ) : null}
                {mobileDrawer === "panel" && workflow === "files" ? (
                  <FilesWorkflowPanel display="drawer" layout={layout} analytics={analytics} onOpenDialog={() => setImportExportOpen(true)} onStatus={setStatusMessage} />
                ) : null}
                {mobileDrawer === "panel" && workflow === "simulation" ? <SimulationPanel display="drawer" layout={layout} /> : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
      {workflow === "analyze" ? (
        <div className="overflow-x-auto">
          <BottomAnalyticsPanel analytics={analytics} validation={validation} />
        </div>
      ) : null}
      <NewLayoutDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ProceduralGeneratorDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <HybridGeneratorDialog open={hybridOpen} onClose={() => setHybridOpen(false)} />
      <ImportExportDialog open={importExportOpen} onClose={() => setImportExportOpen(false)} layout={layout} analytics={analytics} />
      <AnalyticsSettingsDialog open={analyticsSettingsOpen} onClose={() => setAnalyticsSettingsOpen(false)} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
