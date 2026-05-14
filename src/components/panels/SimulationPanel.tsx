import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";
import type { WarehouseLayout } from "../../models/layout";
import type {
  ChargingStrategy,
  OrderAssignmentStrategy,
  RackSelectionStrategy,
  RackStorageStrategy,
  RobotAssignmentStrategy,
  SimulationConfig,
  SimulationEventSeverity,
  StationAssignmentStrategy,
  TaskGenerationMode
} from "../../models/simulation";
import { downloadTextFile } from "../../importExport/exportLayout";
import {
  exportInventoryCsv,
  exportOrdersCsv,
  exportSimulationConfigJson,
  exportSimulationEventLogCsv,
  exportSimulationMetricsCsv,
  importSimulationConfigJson
} from "../../importExport/exportSimulation";
import { availableSkuSummary, inventoryFromLayout } from "../../simulation/inventory";
import { useSimulationStore } from "../../store/simulationStore";
import { useLayoutStore } from "../../store/layoutStore";
import { validateSimulationReadiness } from "../../validation/validateSimulationReadiness";
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
    refreshInventorySnapshot,
    generateOrdersFromInventory,
    clearOrders,
    clearInventorySnapshot,
    createManualTask,
    play,
    pause,
    step,
    reset,
    setSpeedMultiplier,
    setManualRack,
    setManualStation
  } = useSimulationStore();
  const { populateSampleInventory, clearSampleInventory } = useLayoutStore();
  const [severityFilter, setSeverityFilter] = useState<SimulationEventSeverity | "all">("all");
  const [eventQuery, setEventQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const set = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => setConfig({ [key]: value } as Partial<SimulationConfig>);
  const skuSummary = availableSkuSummary(state.inventory);
  const layoutInventory = inventoryFromLayout(layout);
  const layoutSkuSummary = availableSkuSummary(layoutInventory);
  const readiness = validateSimulationReadiness(layout);
  const readinessItems = [
    ["Layout", readiness.categories.layout],
    ["Inventory", readiness.categories.inventory],
    ["Stations", readiness.categories.stations],
    ["Storage", readiness.categories.storage],
    ["Simulation", readiness.categories.simulation]
  ] as const;
  const activeOrders = state.orders.filter((order) => !["COMPLETED", "FAILED"].includes(order.status));
  const allOrders = [...state.orders, ...state.completedOrders, ...state.failedOrders];
  const setStrategy = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => setConfig({ [key]: value } as Partial<SimulationConfig>);
  const activeResourceReservations = Object.values(state.reservationTable.reservedResources).reduce((sum, records) => sum + records.length, 0);
  const activeVertexReservations = Object.values(state.reservationTable.reservedVertices).reduce((sum, records) => sum + records.length, 0);
  const blockedRobots = state.robots.filter((robot) => ["BLOCKED", "ERROR"].includes(robot.state) || robot.waitingReason);
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
    .filter((event) => !eventQuery || event.robotId?.includes(eventQuery) || event.taskId?.includes(eventQuery) || event.entityId?.includes(eventQuery) || event.message.toLowerCase().includes(eventQuery.toLowerCase()))
    .slice(-120);
  const autoFixReadiness = () => {
    populateSampleInventory();
    const fixedLayout = useLayoutStore.getState().history.present;
    refreshInventorySnapshot(fixedLayout);
    generateOrdersFromInventory(fixedLayout);
  };

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

      <section className={cn("grid gap-2 rounded-md border p-2 text-xs", readiness.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
        <div className="flex items-center justify-between gap-2">
          <div className="panel-title">Readiness</div>
          <span className={readiness.ready ? "badge-stable" : "badge-experimental"}>{readiness.ready ? "Ready" : "Needs setup"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {readinessItems.map(([label, messages]) => (
            <div key={label} className="rounded border border-white/60 bg-white/70 p-2">
              <div className="font-semibold">{label}</div>
              <div className={messages.length === 0 ? "text-emerald-700" : "text-amber-800"}>
                {messages.length === 0 ? "Ready" : messages[0]}
              </div>
            </div>
          ))}
        </div>
        {!readiness.ready ? (
          <button className="toolbar-button-primary justify-center" onClick={autoFixReadiness}>
            Auto-fix inventory/orders
          </button>
        ) : null}
        {readiness.categories.inventory.length > 0 ? (
          <div className="text-amber-800">No SKU inventory exists. Populate rack bins or edit bin SKUs/quantities before generating operational tasks.</div>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-2 rounded-md border border-border bg-slate-50 p-2 text-xs">
        <div className="col-span-2 panel-title">Metrics</div>
        <div><span className="text-muted-foreground">Time</span><div className="font-semibold">{state.simTimeSec.toFixed(1)}s</div></div>
        <div><span className="text-muted-foreground">State</span><div className="font-semibold">{state.isRunning ? "Running" : "Paused"}</div></div>
        <div><span className="text-muted-foreground">Robots</span><div className="font-semibold">{state.metrics.activeRobotCount}</div></div>
        <div><span className="text-muted-foreground">Active tasks</span><div className="font-semibold">{state.metrics.activeTaskCount}</div></div>
        <div><span className="text-muted-foreground">Active orders</span><div className="font-semibold">{activeOrders.length}</div></div>
        <div><span className="text-muted-foreground">Done orders</span><div className="font-semibold">{state.completedOrders.length}</div></div>
        <div><span className="text-muted-foreground">Completed</span><div className="font-semibold">{state.metrics.completedTaskCount}</div></div>
        <div><span className="text-muted-foreground">Failed</span><div className="font-semibold">{state.metrics.failedTaskCount}</div></div>
        <div><span className="text-muted-foreground">Blocked</span><div className="font-semibold">{state.metrics.blockedRobotCount}</div></div>
        <div><span className="text-muted-foreground">Throughput</span><div className="font-semibold">{state.metrics.estimatedThroughputPerHour.toFixed(1)}/hr</div></div>
        <div><span className="text-muted-foreground">Cycle</span><div className="font-semibold">{state.metrics.averageTaskCycleTimeSec.toFixed(1)}s</div></div>
        <div><span className="text-muted-foreground">Robot util</span><div className="font-semibold">{(state.metrics.averageRobotUtilization * 100).toFixed(0)}%</div></div>
        <div><span className="text-muted-foreground">Station util</span><div className="font-semibold">{(state.metrics.stationUtilization * 100).toFixed(0)}%</div></div>
      </section>

      <section className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="panel-title">Traffic Control</div>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Diagnostics</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><span className="text-muted-foreground">Conflicts</span><div className="font-semibold">{state.metrics.reservationConflictCount}</div></div>
          <div><span className="text-muted-foreground">Replans</span><div className="font-semibold">{state.metrics.replanCount}</div></div>
          <div><span className="text-muted-foreground">Deadlocks</span><div className="font-semibold">{state.metrics.deadlockCount}</div></div>
          <div><span className="text-muted-foreground">Prevented</span><div className="font-semibold">{state.metrics.runtimeCollisionPreventionCount}</div></div>
          <div><span className="text-muted-foreground">Wait time</span><div className="font-semibold">{state.metrics.totalWaitTimeSec.toFixed(1)}s</div></div>
          <div><span className="text-muted-foreground">Vertex res.</span><div className="font-semibold">{activeVertexReservations}</div></div>
          <div><span className="text-muted-foreground">Resource res.</span><div className="font-semibold">{activeResourceReservations}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Wait before replan (s)"><input className="field-input" type="number" value={config.maxWaitBeforeReplanSec} onChange={(event) => set("maxWaitBeforeReplanSec", number(event))} /></Field>
          <Field label="Max replans"><input className="field-input" type="number" value={config.maxReplanAttempts} onChange={(event) => set("maxReplanAttempts", number(event))} /></Field>
          <Field label="Max blocked (s)"><input className="field-input" type="number" value={config.maxBlockedTimeSec} onChange={(event) => set("maxBlockedTimeSec", number(event))} /></Field>
          <Field label="Reservation horizon (s)"><input className="field-input" type="number" value={config.reservationHorizonSec} onChange={(event) => set("reservationHorizonSec", number(event))} /></Field>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-2 py-2">
          <input type="checkbox" checked={config.deadlockDetectionEnabled} onChange={(event) => set("deadlockDetectionEnabled", event.target.checked)} />
          Deadlock detection
        </label>
        <div className="max-h-24 overflow-auto rounded border border-amber-200 bg-white">
          {state.trafficDiagnostics.lastConflicts.length === 0 && blockedRobots.length === 0 ? (
            <div className="p-2 text-muted-foreground">No traffic conflicts recorded.</div>
          ) : null}
          {blockedRobots.slice(0, 4).map((robot) => (
            <div key={robot.robotId} className="border-b border-border px-2 py-1">
              <span className="font-semibold">{robot.robotId}</span> {robot.waitingReason ?? robot.blockedReason ?? robot.state}
            </div>
          ))}
          {state.trafficDiagnostics.lastConflicts.slice(-4).map((conflict, index) => (
            <div key={`${conflict.timeSec}_${index}`} className="border-b border-border px-2 py-1">
              [{conflict.timeSec.toFixed(1)}] {conflict.robotId ?? conflict.resourceId ?? "resource"} - {conflict.message}
            </div>
          ))}
        </div>
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
        <div className="col-span-2">
          <div className="panel-title">Controllers</div>
          <div className="text-xs text-muted-foreground">Simple RAWSim-O-style decision modules for order, rack, station, robot, storage, and charging choices.</div>
        </div>
        <Field label="Order assignment">
          <select className="field-input" value={config.orderAssignmentStrategy} onChange={(event) => setStrategy("orderAssignmentStrategy", event.target.value as OrderAssignmentStrategy)}>
            <option value="FIFO">FIFO</option>
            <option value="priority_first">Priority first</option>
            <option value="earliest_due_time">Earliest due time</option>
          </select>
        </Field>
        <Field label="Rack selection">
          <select className="field-input" value={config.rackSelectionStrategy} onChange={(event) => setStrategy("rackSelectionStrategy", event.target.value as RackSelectionStrategy)}>
            <option value="nearest_rack_with_sku">Nearest rack with SKU</option>
            <option value="most_inventory_for_sku">Most inventory</option>
            <option value="hot_warm_cold_weighted">Hot/warm/cold weighted</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <Field label="Station assignment">
          <select className="field-input" value={config.stationAssignmentStrategy} onChange={(event) => setStrategy("stationAssignmentStrategy", event.target.value as StationAssignmentStrategy)}>
            <option value="nearest_compatible_station">Nearest compatible</option>
            <option value="shortest_queue">Shortest queue</option>
            <option value="station_type_match">Station type match</option>
          </select>
        </Field>
        <Field label="Robot assignment">
          <select className="field-input" value={config.robotAssignmentStrategy} onChange={(event) => setStrategy("robotAssignmentStrategy", event.target.value as RobotAssignmentStrategy)}>
            <option value="first_available_robot">First available</option>
            <option value="nearest_idle_robot">Nearest idle</option>
          </select>
        </Field>
        <Field label="Rack storage">
          <select className="field-input" value={config.rackStorageStrategy} onChange={(event) => setStrategy("rackStorageStrategy", event.target.value as RackStorageStrategy)}>
            <option value="return_home">Return home</option>
            <option value="nearest_available_storage">Nearest available</option>
            <option value="keep_hot_near_station">Keep hot near station</option>
          </select>
        </Field>
        <Field label="Charging">
          <select className="field-input" value={config.chargingStrategy} onChange={(event) => setStrategy("chargingStrategy", event.target.value as ChargingStrategy)}>
            <option value="none">None</option>
            <option value="low_battery_to_nearest_charger">Low battery to charger</option>
          </select>
        </Field>
      </section>

      <section className="grid gap-2 rounded-md border border-border bg-slate-50 p-2">
        <div className="panel-title">Orders & Inventory</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><span className="text-muted-foreground">Orders</span><div className="font-semibold">{allOrders.length}</div></div>
          <div><span className="text-muted-foreground">SKUs</span><div className="font-semibold">{skuSummary.length || layoutSkuSummary.length}</div></div>
          <div><span className="text-muted-foreground">Storage locs</span><div className="font-semibold">{state.storageLocations.length || layout.storageLocations.length}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="toolbar-button justify-center" onClick={() => { populateSampleInventory(); refreshInventorySnapshot(useLayoutStore.getState().history.present); }}>
            Populate Inventory
          </button>
          <button className="toolbar-button justify-center" onClick={() => generateOrdersFromInventory(layout)}>
            Generate Orders
          </button>
          <button className="toolbar-button justify-center" onClick={() => refreshInventorySnapshot(layout)}>
            Refresh Inventory
          </button>
          <button className="toolbar-button justify-center" onClick={clearOrders}>
            Clear Orders
          </button>
          <button className="toolbar-button justify-center" onClick={() => { clearSampleInventory(); clearInventorySnapshot(); }}>
            Clear Inventory
          </button>
          <button className="toolbar-button-primary justify-center" onClick={autoFixReadiness}>
            Auto-fix Readiness
          </button>
        </div>
        <div className="max-h-28 overflow-auto rounded border border-border bg-white text-xs">
          {allOrders.length === 0 ? <div className="p-2 text-muted-foreground">Generate tasks to create sample orders from available rack inventory.</div> : null}
          {allOrders.slice(-6).map((order) => (
            <div key={order.orderId} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-2 py-1">
              <span>{order.orderId} · {order.orderLines.map((line) => `${line.sku} x${line.quantity}`).join(", ")}</span>
              <span className="font-semibold">{order.status}</span>
            </div>
          ))}
        </div>
        <div className="max-h-28 overflow-auto rounded border border-border bg-white text-xs">
          {skuSummary.slice(0, 8).map((sku) => (
            <div key={sku.sku} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-2 py-1">
              <span>{sku.sku}</span>
              <span>{sku.quantity - sku.reservedQuantity} avail / {sku.reservedQuantity} reserved</span>
            </div>
          ))}
          {skuSummary.length === 0 ? <div className="p-2 text-muted-foreground">No SKU inventory snapshot yet.</div> : null}
        </div>
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
        <div className="col-span-2 max-h-32 overflow-auto rounded border border-border bg-slate-50 text-xs">
          {state.operationalTasks.length === 0 ? <div className="p-2 text-muted-foreground">No operational tasks yet.</div> : null}
          {state.operationalTasks.slice(-8).map((task) => (
            <div key={task.operationalTaskId} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-2 py-1">
              <span>{task.operationalTaskId} · {task.taskKind} · rack {task.rackId}</span>
              <span className="font-semibold">{task.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 text-xs">
        <div className="col-span-2 panel-title">Visual Options</div>
        {[
          ["showPaths", "Show paths"],
          ["showReservations", "Show reservations"],
          ["showLoadedEnvelope", "Show loaded envelope"],
          ["showRobotLabels", "Show robot labels"],
          ["collisionCheckingEnabled", "Collision checking"]
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-2">
            <input type="checkbox" checked={Boolean(config[key as keyof SimulationConfig])} onChange={(event) => set(key as keyof SimulationConfig, event.target.checked as never)} />
            {label}
          </label>
        ))}
      </section>

      <section className="grid gap-2 rounded-md border border-border bg-white p-2">
        <div className="panel-title">Robots & Stations</div>
        <div className="max-h-28 overflow-auto text-xs">
          {state.robots.slice(0, 8).map((robot) => (
            <div key={robot.robotId} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border py-1">
              <span>{robot.robotId} {robot.carryingRackId ? `carrying ${robot.carryingRackId}` : ""}</span>
              <span className="font-semibold">{robot.state}</span>
            </div>
          ))}
          {state.robots.length === 0 ? <div className="text-muted-foreground">Initialize simulation to spawn robots.</div> : null}
        </div>
        <div className="max-h-24 overflow-auto text-xs">
          {state.stationQueues.map((queue) => (
            <div key={queue.stationId} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border py-1">
              <span>{layout.stations.find((station) => station.id === queue.stationId)?.stationId ?? queue.stationId}</span>
              <span>{queue.activeRobotId ? `serving ${queue.activeRobotId}` : "idle"} · q{queue.waitingRobotIds.length}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="col-span-2 panel-title">Exports</div>
        <label className="toolbar-button cursor-pointer justify-center">
          Import config
          <input className="hidden" type="file" accept="application/json,.json" onChange={importConfig} />
        </label>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile("simulation_config.json", exportSimulationConfigJson(config), "application/json")}>Export config</button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile("simulation_metrics.csv", exportSimulationMetricsCsv(state.metrics), "text/csv")}>Export metrics CSV</button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile("simulation_orders.csv", exportOrdersCsv(allOrders), "text/csv")}>Export orders CSV</button>
        <button className="toolbar-button justify-center" onClick={() => downloadTextFile("simulation_inventory.csv", exportInventoryCsv(state.inventory), "text/csv")}>Export inventory CSV</button>
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
              [{event.timeSec.toFixed(1)}] {event.entityType ? `${event.entityType} ` : ""}{event.robotId ? `${event.robotId} ` : ""}{event.taskId ? `${event.taskId} ` : ""}{event.message}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
