import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { runAnalytics } from "../src/analytics/runAnalytics";
import { WorkflowRail } from "../src/components/layout/WorkflowRail";
import { LeftToolbox } from "../src/components/layout/LeftToolbox";
import { RightPropertiesPanel } from "../src/components/layout/RightPropertiesPanel";
import { TopToolbar } from "../src/components/layout/TopToolbar";
import { AnalyzeWorkflowPanel } from "../src/components/panels/AnalyzeWorkflowPanel";
import { GenerateWorkflowPanel } from "../src/components/panels/GenerateWorkflowPanel";
import { SimulationPanel } from "../src/components/panels/SimulationPanel";
import { createEmptyLayout, defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { useLayoutStore } from "../src/store/layoutStore";
import { useUiStore } from "../src/store/uiStore";
import { validateLayout } from "../src/validation/validateLayout";

const noop = () => undefined;

function sampleLayout() {
  return generateProceduralLayout({ ...defaultGenerationParams, rows: 16, columns: 24, candidateCount: 3 });
}

describe("workflow UX organization", () => {
  it("renders primary workflow navigation and switches workflow state", () => {
    act(() => useUiStore.getState().setWorkflow("design"));
    render(<WorkflowRail />);
    expect(screen.getByRole("button", { name: /Design workflow/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate workflow/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Analyze workflow/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Simulate workflow, Experimental/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Generate workflow/ }));
    expect(useUiStore.getState().workflow).toBe("generate");
  });

  it("shows contextual toolbar actions for the selected workflow", () => {
    const layout = sampleLayout();
    const analytics = runAnalytics(layout);
    act(() => useUiStore.getState().setWorkflow("generate"));
    const { rerender } = render(
      <TopToolbar
        layout={layout}
        analytics={analytics}
        onNew={noop}
        onGenerate={noop}
        onHybrid={noop}
        onImportExport={noop}
        onAnalyticsSettings={noop}
        onShortcuts={noop}
        onStatus={noop}
        onRunValidation={noop}
        onRunAnalytics={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Generate Mode B" })).toBeTruthy();

    act(() => useUiStore.getState().setWorkflow("analyze"));
    rerender(
      <TopToolbar
        layout={layout}
        analytics={analytics}
        onNew={noop}
        onGenerate={noop}
        onHybrid={noop}
        onImportExport={noop}
        onAnalyticsSettings={noop}
        onShortcuts={noop}
        onStatus={noop}
        onRunValidation={noop}
        onRunAnalytics={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Run validation" })).toBeTruthy();
  });

  it("groups the design toolbox and explains disabled tools", () => {
    act(() => useUiStore.getState().setWorkflow("design"));
    const { rerender } = render(<LeftToolbox />);
    expect(screen.getByText("Navigation")).toBeTruthy();
    expect(screen.getByText("Draw Cells")).toBeTruthy();
    expect(screen.getByText("Place Resources")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add rack / pod" })).toBeTruthy();

    act(() => useUiStore.getState().setWorkflow("simulation"));
    rerender(<LeftToolbox />);
    expect((screen.getByRole("button", { name: "Add rack / pod" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByTitle(/Switch to Design workflow/).length).toBeGreaterThan(0);
  });

  it("renders organized property sections for a selected rack", () => {
    const layout = createEmptyLayout({ rows: 8, columns: 8 });
    act(() => useLayoutStore.getState().setLayout(layout));
    act(() => useLayoutStore.getState().addRack({ row: 2, col: 2 }));
    const current = useLayoutStore.getState().history.present;
    const rack = current.racks[0];
    act(() => useLayoutStore.getState().selectObject({ kind: "rack", id: rack.id }));
    render(<RightPropertiesPanel validation={validateLayout(current)} analytics={runAnalytics(current)} onSelectIssue={noop} />);
    expect(screen.getByRole("tab", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Geometry" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Faces & Bins" })).toBeTruthy();
    expect(screen.getByText("Rack Bin Editor")).toBeTruthy();
  });

  it("renders Analyze tabs and empty candidate state", () => {
    const layout = sampleLayout();
    render(
      <AnalyzeWorkflowPanel
        layout={layout}
        analytics={runAnalytics(layout)}
        validation={validateLayout(layout)}
        onRunValidation={noop}
        onRunAnalytics={noop}
        onSelectIssue={noop}
      />
    );
    expect(screen.getByRole("tab", { name: "Validation" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Performance" })).toBeTruthy();

    render(<GenerateWorkflowPanel onGenerateModeB={noop} onGenerateHybrid={noop} onApplyCandidate={noop} />);
    expect(screen.getByText(/No generated candidates yet/)).toBeTruthy();
  });

  it("restores the active layout when closing an unapplied candidate preview", () => {
    act(() => useLayoutStore.getState().newLayout({ rows: 8, columns: 8 }));
    const baseLayoutId = useLayoutStore.getState().history.present.layoutId;
    act(() => useLayoutStore.getState().generateModeB({ ...defaultGenerationParams, rows: 12, columns: 18, candidateCount: 3 }));
    expect(useLayoutStore.getState().history.present.metadata.candidatePreview).toBe(true);
    act(() => useLayoutStore.getState().closeCandidateComparison());
    expect(useLayoutStore.getState().candidateComparison).toBeUndefined();
    expect(useLayoutStore.getState().history.present.layoutId).toBe(baseLayoutId);
  });

  it("marks simulation as experimental in the dedicated panel", () => {
    const layout = sampleLayout();
    render(<SimulationPanel layout={layout} />);
    expect(screen.getByText("Experimental")).toBeTruthy();
    expect(screen.getByText(/Not full MAPF/)).toBeTruthy();
    expect(screen.getByText("Playback")).toBeTruthy();
    expect(screen.getByText("Event Log")).toBeTruthy();
  });
});
