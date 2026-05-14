import { create } from "zustand";
import {
  DEBUG_LOG_LIMIT,
  capDebugList,
  makeDebugEventId,
  type DebugContextSnapshot,
  type DebugEvent,
  type DebugEventCategory,
  type DebugSeverity,
  type PerformanceDebugSample
} from "./debugEvents";

interface DebugState {
  panelOpen: boolean;
  verbose: boolean;
  events: DebugEvent[];
  performanceSamples: PerformanceDebugSample[];
  invariantViolationCount: number;
  setPanelOpen: (panelOpen: boolean) => void;
  togglePanel: () => void;
  enableVerboseMode: () => void;
  disableVerboseMode: () => void;
  addEvent: (event: Omit<DebugEvent, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }) => void;
  recordAction: (actionType: string, message: string, details?: Record<string, unknown>, context?: DebugContextSnapshot) => void;
  recordError: (message: string, source?: string, stack?: string, details?: Record<string, unknown>, context?: DebugContextSnapshot) => void;
  recordPerformance: (name: string, durationMs: number, details?: Record<string, unknown>) => void;
  clearDiagnostics: () => void;
}

function categoryFromSource(source?: string): DebugEventCategory {
  if (!source) return "runtime";
  if (source.includes("console")) return "console";
  if (source.includes("react")) return "react";
  return "runtime";
}

export const useDebugStore = create<DebugState>((set) => ({
  panelOpen: false,
  verbose: typeof window !== "undefined" && import.meta.env.DEV,
  events: [],
  performanceSamples: [],
  invariantViolationCount: 0,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  enableVerboseMode: () => set({ verbose: true }),
  disableVerboseMode: () => set({ verbose: false }),
  addEvent: (event) =>
    set((state) => ({
      events: capDebugList([
        ...state.events,
        {
          eventId: event.eventId ?? makeDebugEventId(event.category),
          timestamp: event.timestamp ?? new Date().toISOString(),
          ...event
        }
      ]),
      invariantViolationCount: event.category === "invariant" && event.severity === "error" ? state.invariantViolationCount + 1 : state.invariantViolationCount
    })),
  recordAction: (actionType, message, details, context) =>
    set((state) => ({
      events: capDebugList([
        ...state.events,
        {
          eventId: makeDebugEventId("action"),
          timestamp: new Date().toISOString(),
          category: "user_action",
          severity: "info",
          actionType,
          message,
          details,
          context
        }
      ])
    })),
  recordError: (message, source, stack, details, context) =>
    set((state) => ({
      events: capDebugList([
        ...state.events,
        {
          eventId: makeDebugEventId("error"),
          timestamp: new Date().toISOString(),
          category: categoryFromSource(source),
          severity: "error",
          message,
          source,
          stack,
          details,
          context
        }
      ])
    })),
  recordPerformance: (name, durationMs, details) =>
    set((state) => ({
      performanceSamples: capDebugList([...state.performanceSamples, { name, durationMs, timestamp: new Date().toISOString(), details }], DEBUG_LOG_LIMIT),
      events:
        durationMs > 50 || state.verbose
          ? capDebugList([
              ...state.events,
              {
                eventId: makeDebugEventId("perf"),
                timestamp: new Date().toISOString(),
                category: "performance",
                severity: durationMs > 100 ? "warning" : "info",
                message: `${name} took ${durationMs.toFixed(1)} ms`,
                details
              }
            ])
          : state.events
    })),
  clearDiagnostics: () => set({ events: [], performanceSamples: [], invariantViolationCount: 0 })
}));

export function recordDebugEvent(event: Omit<DebugEvent, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }) {
  useDebugStore.getState().addEvent(event);
}

export function recordDebugError(message: string, source?: string, stack?: string, details?: Record<string, unknown>, context?: DebugContextSnapshot) {
  useDebugStore.getState().recordError(message, source, stack, details, context);
}

export function recordDebugAction(actionType: string, message: string, details?: Record<string, unknown>, context?: DebugContextSnapshot) {
  useDebugStore.getState().recordAction(actionType, message, details, context);
}

export function recordDebugPerformance(name: string, durationMs: number, details?: Record<string, unknown>) {
  useDebugStore.getState().recordPerformance(name, durationMs, details);
}

export function severityForConsole(method: "warn" | "error"): DebugSeverity {
  return method === "error" ? "error" : "warning";
}
