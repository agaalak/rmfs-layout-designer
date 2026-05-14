import type { Workflow, EditorTool } from "../store/uiStore";

export const DEBUG_LOG_LIMIT = 300;

export type DebugEventCategory =
  | "console"
  | "runtime"
  | "react"
  | "simulation"
  | "traffic"
  | "validation"
  | "performance"
  | "user_action"
  | "invariant"
  | "controller"
  | "diagnostics";

export type DebugSeverity = "info" | "warning" | "error";

export interface DebugContextSnapshot {
  workflow?: Workflow;
  selectedObjectId?: string;
  selectedCell?: string;
  layoutId?: string;
  simulationTimeSec?: number;
  activeRobotId?: string;
  activeTaskId?: string;
  activeTool?: EditorTool;
}

export interface DebugEvent {
  eventId: string;
  timestamp: string;
  category: DebugEventCategory;
  severity: DebugSeverity;
  message: string;
  source?: string;
  stack?: string;
  context?: DebugContextSnapshot;
  details?: Record<string, unknown>;
}

export interface DebugActionEvent extends DebugEvent {
  category: "user_action";
  actionType: string;
}

export interface PerformanceDebugSample {
  name: string;
  durationMs: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export function makeDebugEventId(prefix = "debug") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function capDebugList<T>(items: T[], limit = DEBUG_LOG_LIMIT) {
  return items.length > limit ? items.slice(items.length - limit) : items;
}
