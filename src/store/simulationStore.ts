import { create } from "zustand";
import type { WarehouseLayout } from "../models/layout";
import {
  defaultSimulationConfig,
  emptySimulationMetrics,
  emptyTrafficDiagnostics,
  type SimulationConfig,
  type SimulationState
} from "../models/simulation";
import type { SimulationTask } from "../models/task";
import {
  createTaskForRackStation,
  generateOperationalSimulationWork,
  generateSimulationTasks,
  initializeSimulation,
  resetSimulation,
  stepSimulation,
  validateSimulationStart
} from "../simulation/simulationEngine";
import { createReservationTable } from "../simulation/reservationTable";

interface SimulationStoreState {
  config: SimulationConfig;
  state: SimulationState;
  manualRackId?: string;
  manualStationId?: string;
  setConfig: (patch: Partial<SimulationConfig>) => void;
  initialize: (layout: WarehouseLayout) => string[];
  generateTasks: (layout: WarehouseLayout) => void;
  createManualTask: (layout: WarehouseLayout, rackId?: string, stationId?: string) => void;
  play: () => void;
  pause: () => void;
  step: (layout: WarehouseLayout, deltaTimeSec?: number) => void;
  reset: () => void;
  setSpeedMultiplier: (speedMultiplier: number) => void;
  setManualRack: (rackId: string) => void;
  setManualStation: (stationId: string) => void;
}

const initialState: SimulationState = {
  simTimeSec: 0,
  isRunning: false,
  speedMultiplier: 1,
  robots: [],
  tasks: [],
  operationalTasks: [],
  orders: [],
  completedOrders: [],
  failedOrders: [],
  inventory: [],
  rackStates: {},
  storageLocationStates: {},
  stationStates: {},
  storageLocations: [],
  completedTasks: [],
  failedTasks: [],
  reservationTable: createReservationTable(defaultSimulationConfig.reservationTimeStepSec),
  stationQueues: [],
  eventLog: [],
  trafficDiagnostics: structuredClone(emptyTrafficDiagnostics),
  metrics: emptySimulationMetrics,
  initialized: false
};

export const useSimulationStore = create<SimulationStoreState>((set, get) => ({
  config: defaultSimulationConfig,
  state: initialState,
  manualRackId: undefined,
  manualStationId: undefined,
  setConfig: (patch) =>
    set((current) => ({
      config: { ...current.config, ...patch }
    })),
  initialize: (layout) => {
    const errors = validateSimulationStart(layout);
    if (errors.length > 0) {
      set((current) => ({
        state: {
          ...current.state,
          isRunning: false,
          eventLog: [
            ...current.state.eventLog,
            ...errors.map((message) => ({ timeSec: current.state.simTimeSec, severity: "error" as const, message }))
          ].slice(-500)
        }
      }));
      return errors;
    }
    set((current) => ({
      state: initializeSimulation(layout, current.config)
    }));
    return [];
  },
  generateTasks: (layout) =>
    set((current) => {
      const work = current.state.initialized ? generateOperationalSimulationWork(layout, current.state, current.config) : undefined;
      const tasks = work?.tasks ?? generateSimulationTasks(layout, current.config, current.state.simTimeSec);
      return {
        state: {
          ...current.state,
          orders: [...current.state.orders, ...(work?.orders.filter((order) => order.status !== "FAILED") ?? [])],
          failedOrders: [...current.state.failedOrders, ...(work?.failedOrders ?? [])],
          operationalTasks: [...current.state.operationalTasks, ...(work?.operationalTasks ?? tasks.map((task) => ({ operationalTaskId: task.operationalTaskId ?? `op_${task.taskId}`, orderLineIds: task.orderLineIds ?? [], taskKind: "MOVE_RACK_TO_STATION" as const, rackId: task.rackId, stationId: task.stationId ?? "", status: "PLANNED" as const, timestamps: { plannedAtSec: current.state.simTimeSec } })))],
          inventory: work?.inventory ?? current.state.inventory,
          rackStates: work?.rackStates ?? current.state.rackStates,
          storageLocationStates: work?.storageLocationStates ?? current.state.storageLocationStates,
          tasks: [...current.state.tasks, ...tasks],
          eventLog: work?.eventLog ?? [
            ...current.state.eventLog,
            ...tasks.map((task) => ({
              timeSec: current.state.simTimeSec,
              severity: "info" as const,
              entityType: "task" as const,
              taskId: task.taskId,
              message: `Task ${task.taskId} created.`
            }))
          ].slice(-500)
        }
      };
    }),
  createManualTask: (layout, rackId, stationId) =>
    set((current) => {
      const selectedRackId = rackId ?? current.manualRackId ?? layout.racks[0]?.id;
      const selectedStationId = stationId ?? current.manualStationId ?? layout.stations[0]?.id;
      const task = selectedRackId && selectedStationId ? createTaskForRackStation(layout, selectedRackId, selectedStationId, current.state.simTimeSec, 100) : undefined;
      if (!task) {
        return {
          state: {
            ...current.state,
            eventLog: [
              ...current.state.eventLog,
              { timeSec: current.state.simTimeSec, severity: "error" as const, message: "Manual task could not be created for the selected rack/station." }
            ].slice(-500)
          }
        };
      }
      return {
        state: {
          ...current.state,
          tasks: [...current.state.tasks, task as SimulationTask],
          operationalTasks: [
            ...current.state.operationalTasks,
            {
              operationalTaskId: task.operationalTaskId ?? `op_${task.taskId}`,
              orderLineIds: task.orderLineIds ?? [],
              taskKind: "MOVE_RACK_TO_STATION" as const,
              rackId: task.rackId,
              stationId: task.stationId ?? "",
              sourceStorageLocationId: task.sourceStorageLocationId,
              destinationStorageLocationId: task.destinationStorageLocationId,
              status: "PLANNED" as const,
              timestamps: { plannedAtSec: current.state.simTimeSec }
            }
          ],
          eventLog: [
            ...current.state.eventLog,
            { timeSec: current.state.simTimeSec, severity: "info" as const, entityType: "task" as const, taskId: task.taskId, message: `Manual task ${task.taskId} created.` }
          ].slice(-500)
        }
      };
    }),
  play: () => set((current) => ({ state: { ...current.state, isRunning: true } })),
  pause: () => set((current) => ({ state: { ...current.state, isRunning: false } })),
  step: (layout, deltaTimeSec = 0.25) =>
    set((current) => ({
      state: stepSimulation(layout, current.state, current.config, deltaTimeSec * current.state.speedMultiplier)
    })),
  reset: () => set((current) => ({ state: resetSimulation(current.config) })),
  setSpeedMultiplier: (speedMultiplier) => set((current) => ({ state: { ...current.state, speedMultiplier } })),
  setManualRack: (manualRackId) => set({ manualRackId }),
  setManualStation: (manualStationId) => set({ manualStationId })
}));
