import { create } from "zustand";
import type { WarehouseLayout } from "../models/layout";
import {
  defaultSimulationConfig,
  emptySimulationMetrics,
  type SimulationConfig,
  type SimulationState
} from "../models/simulation";
import type { SimulationTask } from "../models/task";
import {
  createTaskForRackStation,
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
  completedTasks: [],
  failedTasks: [],
  reservationTable: createReservationTable(defaultSimulationConfig.reservationTimeStepSec),
  stationQueues: [],
  eventLog: [],
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
      const tasks = generateSimulationTasks(layout, current.config, current.state.simTimeSec);
      return {
        state: {
          ...current.state,
          tasks: [...current.state.tasks, ...tasks],
          eventLog: [
            ...current.state.eventLog,
            ...tasks.map((task) => ({
              timeSec: current.state.simTimeSec,
              severity: "info" as const,
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
          eventLog: [
            ...current.state.eventLog,
            { timeSec: current.state.simTimeSec, severity: "info" as const, taskId: task.taskId, message: `Manual task ${task.taskId} created.` }
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
