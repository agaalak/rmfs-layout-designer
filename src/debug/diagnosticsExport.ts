import type { useLayoutStore } from "../store/layoutStore";
import type { useSimulationStore } from "../store/simulationStore";
import type { useUiStore } from "../store/uiStore";
import type { DebugEvent } from "./debugEvents";
import { useDebugStore } from "./debugStore";

export interface DiagnosticsBundle {
  generatedAt: string;
  appVersion: string;
  userAgent?: string;
  location?: string;
  layout: unknown;
  simulation: unknown;
  ui: unknown;
  debug: {
    events: unknown[];
    performanceSamples: unknown[];
    invariantViolationCount: number;
  };
}

export function createDiagnosticsBundle(stores: {
  layout: typeof useLayoutStore;
  simulation: typeof useSimulationStore;
  ui: typeof useUiStore;
}): DiagnosticsBundle {
  const debug = useDebugStore.getState();
  const layoutState = stores.layout.getState();
  const simulationState = stores.simulation.getState();
  const uiState = stores.ui.getState();
  return {
    generatedAt: new Date().toISOString(),
    appVersion: "0.2.0",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    location: typeof window !== "undefined" ? window.location.href : undefined,
    layout: {
      selected: layoutState.selected,
      selectedCell: layoutState.selectedCell,
      present: layoutState.history.present
    },
    simulation: {
      config: simulationState.config,
      state: simulationState.state
    },
    ui: {
      activeTool: uiState.activeTool,
      appMode: uiState.appMode,
      workflow: uiState.workflow,
      zoom: uiState.zoom,
      hoverCell: uiState.hoverCell,
      showGrid: uiState.showGrid,
      showLabels: uiState.showLabels,
      showDirectionArrows: uiState.showDirectionArrows,
      showHeatmap: uiState.showHeatmap
    },
    debug: {
      events: debug.events,
      performanceSamples: debug.performanceSamples,
      invariantViolationCount: debug.invariantViolationCount
    }
  };
}

export function createIssueReport(
  stores: {
    layout: typeof useLayoutStore;
    simulation: typeof useSimulationStore;
    ui: typeof useUiStore;
  },
  fields: {
    title: string;
    description: string;
    expectedBehavior: string;
    actualBehavior: string;
    severity: string;
    category: string;
  }
) {
  const diagnostics = createDiagnosticsBundle(stores);
  const recentDebug = diagnostics.debug.events.slice(-100);
  const simState = stores.simulation.getState().state;
  return {
    ...fields,
    timestamp: diagnostics.generatedAt,
    appVersion: diagnostics.appVersion,
    userAgent: diagnostics.userAgent,
    currentUrl: diagnostics.location,
    recentDebug,
    recentSimulationEvents: simState.eventLog.slice(-100),
    layoutSnapshot: stores.layout.getState().history.present,
    simulationSnapshot: simState,
    note: "Screenshot capture is not embedded in this browser-only JSON export. Include a browser screenshot alongside this report when visual evidence is needed."
  };
}

export function issueReportMarkdown(report: ReturnType<typeof createIssueReport>) {
  return `# ${report.title || "RMFS Layout Designer Issue"}

- Severity: ${report.severity}
- Category: ${report.category}
- Timestamp: ${report.timestamp}
- App version: ${report.appVersion}
- URL: ${report.currentUrl ?? "unknown"}

## Description
${report.description || "_No description provided._"}

## Expected Behavior
${report.expectedBehavior || "_Not provided._"}

## Actual Behavior
${report.actualBehavior || "_Not provided._"}

## Recent Debug Events
${report.recentDebug
  .slice(-20)
  .map((event) => `- ${(event as { timestamp?: string; category?: string; severity?: string; message?: string }).timestamp} [${(event as { category?: string }).category}] ${(event as { message?: string }).message}`)
  .join("\n")}
`;
}

export function installDebugGlobals(stores: {
  layout: typeof useLayoutStore;
  simulation: typeof useSimulationStore;
  ui: typeof useUiStore;
}) {
  if (typeof window === "undefined") return;
  window.__RMFS_DEBUG__ = {
    getCurrentDiagnostics: () => createDiagnosticsBundle(stores),
    getRecentErrors: () => useDebugStore.getState().events.filter((event) => event.severity === "error").slice(-50),
    getRecentActions: () => useDebugStore.getState().events.filter((event) => event.category === "user_action").slice(-100),
    getSimulationSnapshot: () => stores.simulation.getState().state,
    getLayoutSnapshot: () => stores.layout.getState().history.present,
    exportDiagnostics: () => JSON.stringify(createDiagnosticsBundle(stores), null, 2),
    clearDiagnostics: () => useDebugStore.getState().clearDiagnostics(),
    enableVerboseMode: () => useDebugStore.getState().enableVerboseMode(),
    disableVerboseMode: () => useDebugStore.getState().disableVerboseMode()
  };
}

declare global {
  interface Window {
    __RMFS_DEBUG__?: {
      getCurrentDiagnostics: () => DiagnosticsBundle;
      getRecentErrors: () => unknown[];
      getRecentActions: () => unknown[];
      getSimulationSnapshot: () => unknown;
      getLayoutSnapshot: () => unknown;
      exportDiagnostics: () => string;
      clearDiagnostics: () => void;
      enableVerboseMode: () => void;
      disableVerboseMode: () => void;
    };
    __RMFS_DEBUG_RECORD__?: (event: Omit<DebugEvent, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }) => void;
  }
}
