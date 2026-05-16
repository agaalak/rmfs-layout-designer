import { useMemo, useState } from "react";
import { AlertTriangle, Bug, Download, X } from "lucide-react";
import { createDiagnosticsBundle, createIssueReport, createRuntimeInspectors, issueReportMarkdown } from "../../debug/diagnosticsExport";
import { useDebugStore } from "../../debug/debugStore";
import { downloadTextFile } from "../../importExport/exportLayout";
import { useLayoutStore } from "../../store/layoutStore";
import { useSimulationStore } from "../../store/simulationStore";
import { useUiStore } from "../../store/uiStore";

function timestampForFile() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

export function DebugPanel() {
  const { panelOpen, setPanelOpen, events, performanceSamples, clearDiagnostics, verbose, enableVerboseMode, disableVerboseMode, invariantViolationCount } = useDebugStore();
  const [reportTitle, setReportTitle] = useState("Observed RMFS issue");
  const [category, setCategory] = useState("simulation");
  const [severity, setSeverity] = useState("P1");
  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [actualBehavior, setActualBehavior] = useState("");
  const stores = useMemo(() => ({ layout: useLayoutStore, simulation: useSimulationStore, ui: useUiStore }), []);
  const layout = useLayoutStore((state) => state.history.present);
  const simulation = useSimulationStore((state) => state.state);
  const inspectors = useMemo(() => createRuntimeInspectors(layout, simulation), [layout, simulation]);
  const errors = events.filter((event) => event.severity === "error").slice(-12);
  const warnings = events.filter((event) => event.severity === "warning").slice(-12);
  const simulationEvents = events.filter((event) => ["simulation", "traffic", "controller", "invariant"].includes(event.category)).slice(-40);
  const actions = events.filter((event) => event.category === "user_action").slice(-30);
  const latestPerformance = performanceSamples.slice(-8);

  if (!panelOpen) return null;

  const exportDiagnostics = () => {
    downloadTextFile(`rmfs-diagnostics-${timestampForFile()}.json`, JSON.stringify(createDiagnosticsBundle(stores), null, 2), "application/json");
  };
  const exportIssue = () => {
    const report = createIssueReport(stores, { title: reportTitle, description, expectedBehavior, actualBehavior, severity, category });
    downloadTextFile(`issue-report-${timestampForFile()}.json`, JSON.stringify(report, null, 2), "application/json");
    downloadTextFile(`issue-report-${timestampForFile()}.md`, issueReportMarkdown(report), "text/markdown");
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-slate-300 bg-white shadow-2xl" data-testid="debug-panel">
      <div className="flex items-center justify-between border-b border-border bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Bug className="size-5" />
          <div>
            <div className="font-semibold">Debug / QA</div>
            <div className="text-xs text-slate-300">Live diagnostics, action recorder, and issue export</div>
          </div>
        </div>
        <button className="icon-button bg-white/10 text-white hover:bg-white/20" onClick={() => setPanelOpen(false)} aria-label="Close Debug / QA panel" title="Close Debug / QA panel">
          <X />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        <button className="toolbar-button-primary" onClick={exportDiagnostics}><Download data-icon="inline-start" /> Export diagnostics</button>
        <button className="toolbar-button" onClick={clearDiagnostics}>Clear</button>
        <button className="toolbar-button" onClick={verbose ? disableVerboseMode : enableVerboseMode}>{verbose ? "Verbose on" : "Verbose off"}</button>
        {invariantViolationCount > 0 ? <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"><AlertTriangle className="inline size-3" /> {invariantViolationCount} invariant issue(s)</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <section className="grid gap-2 rounded-md border border-border p-3">
          <div className="panel-title">Report Issue</div>
          <input className="field-input" value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} aria-label="Issue title" />
          <div className="grid grid-cols-2 gap-2">
            <select className="field-input" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Issue category">
              {["simulation", "traffic", "inventory", "layout", "ui", "performance", "import_export", "other"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className="field-input" value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Issue severity">
              {["P0", "P1", "P2", "P3"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <textarea className="field-input min-h-16" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
          <textarea className="field-input min-h-14" placeholder="Expected behavior" value={expectedBehavior} onChange={(event) => setExpectedBehavior(event.target.value)} />
          <textarea className="field-input min-h-14" placeholder="Actual behavior" value={actualBehavior} onChange={(event) => setActualBehavior(event.target.value)} />
          <button className="toolbar-button-primary justify-center" onClick={exportIssue}>Export issue JSON + Markdown</button>
        </section>

        <section className="mt-3 grid gap-2">
          <div className="panel-title">Console Errors</div>
          {[...errors, ...warnings].slice(-12).length === 0 ? <div className="empty-state">No captured console/runtime errors.</div> : null}
          {[...errors, ...warnings].slice(-12).map((event) => (
            <div key={event.eventId} className={`rounded border p-2 text-xs ${event.severity === "error" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="font-semibold">{event.severity.toUpperCase()} - {event.source ?? event.category}</div>
              <div>{event.message}</div>
            </div>
          ))}
        </section>

        <section className="mt-3 grid gap-2">
          <div className="panel-title">Queue / Station Runtime</div>
          {inspectors.queueLanes.length === 0 ? <div className="empty-state">No queue lanes in the current layout.</div> : null}
          {inspectors.queueLanes.slice(0, 8).map((lane) => (
            <div key={lane.queueLaneId} className="rounded border border-border bg-teal-50 p-2 text-xs">
              <div className="font-semibold">{lane.queueLaneId} to {lane.stationId}</div>
              <div className="text-muted-foreground">
                reserved {lane.reservedTaskIds.length} / occupied {lane.cells.filter((cell) => cell.robotId).length}
                {lane.activeHeadRobotId ? ` / head ${lane.activeHeadRobotId}` : ""}
              </div>
              <div className="mt-1 truncate">
                {lane.cells.map((cell) => `${cell.queueIndex}:${cell.cell}${cell.robotId ? `=${cell.robotId}` : ""}`).join(" | ")}
              </div>
            </div>
          ))}
          {inspectors.stationAdmission.slice(0, 8).map((station) => (
            <div key={station.stationId} className="rounded border border-border p-2 text-xs">
              <div className="font-semibold">{station.stationId} service cell {station.stationCell}</div>
              <div className="text-muted-foreground">active {station.activeRobotId ?? "none"} / ready {station.readyRobotIds.join(", ") || "none"}</div>
            </div>
          ))}
        </section>

        <section className="mt-3 grid gap-2">
          <div className="panel-title">Why Waiting / Reservations</div>
          {inspectors.whyWaiting.length === 0 ? <div className="empty-state">No robots are currently waiting or blocked.</div> : null}
          {inspectors.whyWaiting.slice(0, 8).map((item) => (
            <div key={item.robotId} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
              <div className="font-semibold">{item.robotId} - {item.state}</div>
              <div>{item.waitingReason ?? "Waiting/block reason unavailable"}</div>
              <div className="text-muted-foreground">task {item.taskId ?? "n/a"} / station {item.stationId ?? "n/a"} / conflict {item.conflictTarget ?? item.activeStationRobotId ?? "n/a"}</div>
            </div>
          ))}
          {inspectors.reservationTimeline.slice(-6).map((item) => (
            <div key={`${item.timeStep}_${item.resourceId}_${item.robotId}_${item.taskId}`} className="rounded border border-border p-2 text-xs">
              <span className="font-semibold">t{item.timeStep}</span> {item.kind ?? "reservation"} {item.resourceId ?? item.robotId ?? item.taskId}
            </div>
          ))}
        </section>

        <section className="mt-3 grid gap-2">
          <div className="panel-title">Simulation / Traffic / Controller Events</div>
          {simulationEvents.length === 0 ? <div className="empty-state">No simulation events captured yet.</div> : null}
          {simulationEvents.map((event) => (
            <div key={event.eventId} className="rounded border border-border bg-slate-50 p-2 text-xs">
              <div className="font-semibold">[{event.category}] {event.message}</div>
              <div className="text-muted-foreground">{event.context?.simulationTimeSec !== undefined ? `${event.context.simulationTimeSec.toFixed(1)}s` : event.timestamp}</div>
            </div>
          ))}
        </section>

        <section className="mt-3 grid gap-2">
          <div className="panel-title">User Actions</div>
          {actions.length === 0 ? <div className="empty-state">Interact with the app to populate the action log.</div> : null}
          {actions.map((event) => (
            <div key={event.eventId} className="rounded border border-border p-2 text-xs">
              {event.message}
            </div>
          ))}
        </section>

        <section className="mt-3 grid gap-2">
          <div className="panel-title">Performance Metrics</div>
          {latestPerformance.length === 0 ? <div className="empty-state">No performance samples yet.</div> : null}
          {latestPerformance.map((sample) => (
            <div key={`${sample.timestamp}_${sample.name}`} className="flex justify-between rounded border border-border p-2 text-xs">
              <span>{sample.name}</span>
              <span className={sample.durationMs > 100 ? "font-semibold text-amber-700" : "font-semibold"}>{sample.durationMs.toFixed(1)} ms</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
