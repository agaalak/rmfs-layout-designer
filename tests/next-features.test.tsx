import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyboardShortcutsDialog } from "../src/components/dialogs/KeyboardShortcutsDialog";
import {
  defaultGenerationParams,
  generateProceduralCandidates,
  generateProceduralLayout,
  sortCandidateSummaries,
  summarizeCandidates
} from "../src/generators/proceduralGenerator";
import { exportLayoutJson } from "../src/importExport/exportLayout";
import { importLayoutJson, parseLayoutJson } from "../src/importExport/importLayout";
import { runAnalytics } from "../src/analytics/runAnalytics";
import { validateLayout } from "../src/validation/validateLayout";
import { rackFootprintCells, rackOccupiedCells } from "../src/utils/rackFootprint";
import { makeBinRecords, rackBinsFromCsv, rackBinsToCsv, regenerateRackBins } from "../src/utils/rackBins";
import { cellKey } from "../src/utils/gridMath";
import { validateConnectivity } from "../src/graph/connectivity";
import { useLayoutStore } from "../src/store/layoutStore";

describe("next feature pass", () => {
  it("generates candidate metadata and sorts ranking", () => {
    const candidates = generateProceduralCandidates({ ...defaultGenerationParams, rows: 18, columns: 28, candidateCount: 3 });
    const summaries = summarizeCandidates(candidates);
    expect(candidates).toHaveLength(3);
    expect(summaries).toHaveLength(3);
    expect(summaries[0].candidateId).toContain("candidate_");
    const ranked = sortCandidateSummaries(summaries, "overallLayoutScore");
    expect(ranked[0].overallLayoutScore).toBeGreaterThanOrEqual(ranked[ranked.length - 1].overallLayoutScore);
  });

  it("applies the selected candidate to the active layout", () => {
    const store = useLayoutStore.getState();
    store.generateModeB({ ...defaultGenerationParams, rows: 16, columns: 24, candidateCount: 3 });
    const comparison = useLayoutStore.getState().candidateComparison!;
    expect(comparison.summaries).toHaveLength(3);
    const last = comparison.summaries[2].candidateId;
    useLayoutStore.getState().selectCandidatePreview(last);
    expect(useLayoutStore.getState().candidateComparison?.selectedCandidateId).toBe(last);
    useLayoutStore.getState().applySelectedCandidate();
    expect(useLayoutStore.getState().candidateComparison).toBeUndefined();
    expect(useLayoutStore.getState().history.present.metadata.appliedCandidateId).toBe(last);
  });

  it("regenerates rack bins, validates duplicates, and roundtrips bin CSV", () => {
    const bins = makeBinRecords("rack_001", "A", 4, 3);
    expect(bins).toHaveLength(12);
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 16, columns: 24 });
    const rack = layout.racks[0];
    rack.faces[0].rows = 4;
    rack.faces[0].columns = 3;
    const regenerated = regenerateRackBins(rack);
    expect(regenerated.faces[0].bins).toHaveLength(12);
    regenerated.faces[0].bins[0].barcode = "DUPLICATE";
    regenerated.faces[0].bins[1].barcode = "DUPLICATE";
    regenerated.faces[0].bins[1].locationId = regenerated.faces[0].bins[0].locationId;
    regenerated.faces[0].bins[1].quantity = -1;
    layout.racks[0] = regenerated;
    const issues = validateLayout(layout).issues.map((issue) => issue.message).join("\n");
    expect(issues).toContain("duplicate barcode");
    expect(issues).toContain("duplicate locationId");
    expect(issues).toContain("negative quantity");

    const csv = rackBinsToCsv(regenerated);
    const imported = rackBinsFromCsv(regenerated, csv);
    expect(imported.faces[0].bins.length).toBe(regenerated.faces[0].bins.length);
  });

  it("creates a connected true Flying-V layout with diagonal road cells", () => {
    const layout = generateProceduralLayout({
      ...defaultGenerationParams,
      rows: 28,
      columns: 42,
      candidateCount: 1,
      layoutFamily: "true_flying_v"
    });
    const roads = layout.cells.filter((cell) => cell.cellType === "ROAD");
    const diagonalRoads = roads.filter((cell) => cell.row > 2 && cell.row < layout.grid.rows - 3 && cell.col > 2 && cell.col < layout.grid.columns - 3 && cell.row !== Math.floor(layout.grid.rows / 2) && cell.col !== Math.floor(layout.grid.columns / 2));
    expect(diagonalRoads.length).toBeGreaterThan(10);
    const connectivity = validateConnectivity(layout);
    expect(connectivity.unreachableRacks.size).toBe(0);
    expect(connectivity.unreachableChargers.size).toBe(0);
    expect(connectivity.unreachableParking.size).toBe(0);
  });

  it("computes and validates multi-cell rack footprints", () => {
    const layout = generateProceduralLayout({
      ...defaultGenerationParams,
      rows: 18,
      columns: 28,
      rackFootprintWidthM: 2,
      rackFootprintDepthM: 1,
      rackFillRatio: 0.2
    });
    const rack = layout.racks[0];
    expect(rackFootprintCells(rack, layout.grid)).toEqual({ rows: 1, columns: 2 });
    expect(rackOccupiedCells(rack, layout.grid)).toHaveLength(2);
    expect(validateLayout(layout).issues.some((issue) => issue.id.startsWith("rack_footprint"))).toBe(false);
    const roundtrip = importLayoutJson(exportLayoutJson(layout));
    expect(rackFootprintCells(roundtrip.racks[0], roundtrip.grid)).toEqual({ rows: 1, columns: 2 });

    const overlap = structuredClone(layout);
    overlap.racks[1].homeCell = overlap.racks[0].homeCell;
    expect(validateLayout(overlap).issues.some((issue) => issue.message.includes("Object overlap"))).toBe(true);
  });

  it("imports invalid JSON safely and migrates older layouts", () => {
    const invalid = parseLayoutJson("{not valid");
    expect(invalid.ok).toBe(false);
    expect(invalid.errors[0]).toContain("Invalid JSON");

    const oldLayout = generateProceduralLayout({ ...defaultGenerationParams, rows: 12, columns: 18 });
    const oldJson = JSON.parse(exportLayoutJson(oldLayout));
    delete oldJson.layoutSchemaVersion;
    const migrated = parseLayoutJson(JSON.stringify(oldJson));
    expect(migrated.ok).toBe(true);
    expect(migrated.warnings[0]).toContain("Older layout");
    expect(migrated.layout?.layoutSchemaVersion).toBe("0.3.1");
  });

  it("tracks unsaved changes and renders keyboard shortcut help", () => {
    useLayoutStore.getState().newLayout({ rows: 8, columns: 8 });
    const before = useLayoutStore.getState().history.past.length;
    useLayoutStore.getState().drawCell({ row: 1, col: 1 }, "ROAD");
    expect(useLayoutStore.getState().history.past.length).toBeGreaterThan(before);

    render(<KeyboardShortcutsDialog open onClose={() => undefined} />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeTruthy();
    expect(screen.getByText("Delete selected object")).toBeTruthy();
  });

  it("keeps analytics non-negative for generated candidates", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 16, columns: 24, layoutFamily: "true_flying_v" });
    const analytics = runAnalytics(layout);
    expect(analytics.scoring.overallLayoutScore).toBeGreaterThanOrEqual(0);
    expect(new Set(layout.cells.map(cellKey)).size).toBe(layout.cells.length);
  });
});
