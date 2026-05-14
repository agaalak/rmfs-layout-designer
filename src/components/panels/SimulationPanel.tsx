import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";
import type { WarehouseLayout } from "../../models/layout";
import type { SimulationConfig, SimulationEventSeverity, TaskGenerationMode } from "../../models/simulation";
import { downloadTextFile } from "../../importExport/exportLayout";
import { exportSimulationConfigJson, exportSimulationEventLogCsv, exportSimulationMetricsCsv, importSimulationConfigJson } from "../../importExport/exportSimulation";
import { useSimulationStore } from "../../store/simulationStore";
import { cn } from "../../utils/cn";

function number(event: ChangeEvent<HTMLInputElement>) {
  return Number(event.target.value);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function SimulationPanel({ layout, display = "desktop" }: { layout: WarehouseLayout; display?: "desktop" | "drawer" }) {
  const {
    config,
    state,
    manualRackId,
    manualStationId,
    setConfig,
    initialize,
    generateTasks,
    createManualTask,
    play,
    pause,
    step,
    reset,
    setSpeedMultiplier,
    setManualRack,
    setManualStation
  } = useSimulationStore();
  const [severityFilter, setSeverityFilter] = useState<SimulationEventSeverity | "all">("all");
  const [eventQuery, setEventQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const set = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => setConfig({ [key]: value } as Partial<SimulationConfig>);
  const importConfig = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importSimulationConfigJson(String(reader.result ?? ""));
      if (result.config) {
        setConfig(result.config);
        setImportMessage(result.warnings.length > 0 ? `Imported with warnings: ${result.warnings.join(" ")}` : "Simulation config imported.");
      } else {
        setImportMessage(result.errors.join(" "));
      }
    };
    reader.onerror = () => setImportMessage("Could not read simulation config file.");
    reader.readAsText(file);
  };
  const filteredEvents = state.eventLog
    .filter((event) => severityFilter === "all" || event.severity === severityFilter)
    .filter((event) => !eventQuery || event.robotId?.includes(eventQuery) || event.taskId?.includes(eventQuery) || event.message.toLowerCase().includes(eventQuery.toLowerCase()))
    .slice(-120);

  return (
    <aside
      className={cn(
        display === "desktop"
          ? "hidden w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-3 xl:flex"
          : "flex h-full w-full flex-col gap-4 overflow-auto bg-panel p-3"
      )}
      aria-label="Simulation panel"
    >
      <div>
        <div className="flex items-center gap-2">
          <div className="panel-title">Simulation</div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Experimental</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">2D time-based playback over the current road graph. Not full MAPF or final traffic control.</div>
      </div>

      <section className="grid gap-2">
        <div className="panel-title">Playback</div>
        <div className="grid grid-cols-4 gap-2">
          <button className="toolbar-button justify-center" onClick={() => initialize(layout)}>Initialize</button>
          <button className="toolbar-button justify-center" onClick={() => generateTasks(layout)} disabled={!state.initialized}>Generate tasks</button>
          <button className="toolbar-button justify-center" onClick={state.isRunning ? pause : play} disabled={!state.initialized}>{state.isRunning ? "Pause" : "Play"}</button>
          <button className="toolbar-button justify-center" onClick={() => step(layout, 1)} disabled={!state.initialized}>Step</button>
          <button className="toolbar-button justify-center" onClick={() => (state.tasks.length > 0 ? window.confirm("Reset active simulation state?") && reset() : reset())}>Reset</button>
          <select className="field-input col-span-3 h-9" value={state.speedMultiplier} onChange={(event) => setSpeedMultiplier(Number(event.target.value))}>
            {[0.25, 0.5, 1, 2, 5, 10].map((value) => <option key={value} value={value}>{value}x speed</option>)}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 rounded-md border border-border bg-slate-50 p-2 text-xs">
        <div className="col-span-2 panel-title">Metrics</div>
        <div><span className="text-muted-foreground">Time</span><div className="font-semibold">{state.simTimeSec.toFixed(1)}s</div></div>
        <div><span className="text-muted-foreground">State</span><div className="font-semibold">{state.isRunning ? "Running" : "Paused"}</div></div>
        <div><span className="text-muted-foreground">Robots</span><div className="font-semibold">{state.metrics.activeRobotCount}</div></div>
        <div><span className="text-muted-foreground">Active tasks</span><div className="font-semibold">{state.metrics.activeTaskCount}</div></div>
        <div><span className="text-muted-foreground">Completed</span><div className="font-semibold">{state.metrics.completedTaskCount}</div></div>
        <div><span className="text-muted-foreground">Failed</span><div className="font-semibold">{state.metrics.failedTaskCount}</div></div>
        <div><span className="text-muted-foreground">Blocked</span><div className="font-semibold">{state.metrics.blockedRobotCount}</div></div>
        <div><span className="text-muted-foreground">Throughput</span><div className="font-semibold">{state.metrics.estimatedThroughputPerHour.toFixed(1)}/hr</div></div>
        <div><span className="text-muted-foreground">Cycle</span><div className="font-semibold">{state.metrics.averageTaskCycleTimeSec.toFixed(1)}s</div></div>
        <div><span className="text-muted-foreground">Robot util</span><div className="font-semibold">{(state.metrics.averageRobotUtilization * 100).toFixed(0)}%</div></div>
        <div><span className="text-muted-foreground">Station util</span><div className="font-semibold">{(state.metrics.stationUtilization * 100).toFixed(0)}%</div></div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="col-span-2 panel-title">Setup</div>
        <Field label="Robot count"><input className="field-input" type="number" value={config.robotCount} onChange={(event) => set("robotCount", number(event))} /></Field>
        <Field label="Task count"><input className="field-input" type="number" value={config.taskCount} onChange={(event) => set("taskCount", number(event))} /></Field>
        <Field label="Unloaded m/s"><input className="field-input" type="number" step="0.1" value={config.unloadedSpeedMps} onChange={(event) => set("unloadedSpeedMps", number(event))} /></Field>
        <Field label="Loaded m/s"><input className="field-input" type="number" step="0.1" value={config.loadedSpeedMps} onChange={(event) => set("loadedSpeedMps", number(event))} /></Field>
        <Field label="Acceleration"><input className="field-input" type="number" step="0.1" value={config.accelerationMps2} onChange={(event) => set("accelerationMps2", number(event))} /></Field>
        <Field label="Deceleration"><input className="field-input" type="number" step="0.1" value={config.decelerationMps2} onChange={(event) => set("decelerationMps2", number(event))} /></Field>
        <Field label="Rotation deg/s"><input className="field-input" type="number" value={config.rotationSpeedDegPerSec} onChange={(event) => set("rotationSpeedDegPerSec", number(event))} /></Field>
        <Field label="Reservation step"><input className="field-input" type="number" step="0.5" value={config.reservationTimeStepSec} onChange={(event) => set("reservationTimeStepSec", number(event))} /></Field>
        <Field label="Lift sec"><input className="field-input" type="number" value={config.liftTimeSec} onChange={(event) => set("liftTimeSec", number(event))} /></Field>
        <Field label="Drop sec"><input className="field-input" type="number" value={config.dropTimeSec} onChange={(event) => set("dropTimeSec", number(event))} /></Field>
        <Field label="Service sec"><input className="field-input" type="number" value={config.stationServiceTimeSec} onChange={(event) => set("stationServiceTimeSec", number(event))} /></Field>
        <Field label="Task mode">
          <select className="field-input" value={config.taskGenerationMode} onChange={(event) => set("taskGenerationMode", event.target.value as TaskGenerationMode)}>
            <option value="manual">Manual selected rack/station</option>
            <option value="random_nearest">Random rack to nearest station</option>
            <option value="weighted_hot_warm_cold">Weighted hot/warm/cold</option>
          </select>
        </Field>
      </section>

      <section className="grid grid-cols-2 gap-2 rounded-md border border-border bg-white p-2">
        <div className="col-span-2 panel-title">Tasks</div>
        <Field label="Manual rack">
          <select className="field-input" value={manualRackId ?? layout.racks[0]?.id ?? ""} onChange={(event) => setManualRack(event.target.value)}>
            {layout.racks.slice(0, 250).map((rack) => <option key={rack.id} value={rack.id}>{rack.rackId}</option>)}
          </select>
        </Field>
        <Field label="Manual station">
          <select className="field-input" value={manualStationId ?? layout.stations[0]?.id ?? ""} onChange={(event) => setManualStation(event.target.value)}>
            {layout.stations.map((station) => <option key={station.id} value={station.id}>{station.stationId}</option>)}
          </select>
        </Field>
        <button className="toolbar-button col-span-2 justify-center" onClick={() => createManualTask(layout)} disabled={!state.initialized}>Create Task</button>
      </section>

      <section className="grid grid-cols-2 gap-2 text-xs">
        <div className="col-span-2 panel-title">Visual Options</div>
        {[
          ["showPaths", "Show paths"],
          ["showReservations", "Show reservations"],
          ["showRobotLabels", "Show robot labels"],
          ["collisionCheckingEnabled", "Collision checking"]
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2">
            <input type="checkbox" checked={Boolean(config[key as keyof SimulationConfig])} onChange={(event) => set(key as keyof SimulationConfig, event.target.checked as never)} />
            {label}
          </label>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="col-span-2 panel-title">Exports</div>
        <label className="toolbar-button cursor-pointer justify-center">
          Import config
          <input className="hidden" type="file" accept="application/json,.json" onChange={importConfig} />
        </label>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile("simulation_config.json", exportSimulationConfigJson(config), "application/json")}>Export config</button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile("simulation_metrics.csv", exportSimulationMetricsCsv(state.metrics), "text/csv")}>Export metrics CSV</button>
        <button className="toolbar-button col-span-2 justify-center" onClick={() => downloadTextFile("simulation_event_log.csv", exportSimulationEventLogCsv(state.eventLog), "text/csv")}>Export event log CSV</button>
        {importMessage ? <div className="col-span-2 rounded-md border border-border bg-white px-2 py-1 text-xs text-muted-foreground">{importMessage}</div> : null}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="panel-title">Event Log</div>
          <select className="field-input h-8 w-28" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as SimulationEventSeverity | "all")}>
            {(["all", "info", "warning", "error"] as Array<SimulationEventSeverity | "all">).map((severity) => <option key={severity} value={severity}>{severity}</option>)}
          </select>
        </div>
        <input className="field-input mb-2 h-8" placeholder="Filter robot, task, or message" value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} />
        <div className="max-h-72 overflow-auto rounded-md border border-border bg-slate-950 p-2 font-mono text-[11px] text-slate-100">
          {filteredEvents.length === 0 ? <div className="text-slate-400">No simulation events yet.</div> : null}
          {filteredEvents.map((event, index) => (
            <div key={`${event.timeSec}_${index}`} className={event.severity === "error" ? "text-red-300" : event.severity === "warning" ? "text-amber-300" : "text-slate-100"}>
              [{event.timeSec.toFixed(1)}] {event.robotId ? `${event.robotId} ` : ""}{event.taskId ? `${event.taskId} ` : ""}{event.message}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
