import { describe, expect, it } from "vitest";
import { buildRoadGraph } from "../src/graph/graphBuilder";
import { createEmptyLayout, defaultGenerationParams, generateProceduralLayout } from "../src/generators/proceduralGenerator";
import { validateConnectivity } from "../src/graph/connectivity";

describe("traffic graph", () => {
  it("finds reachable racks in generated layouts", () => {
    const layout = generateProceduralLayout({ ...defaultGenerationParams, rows: 18, columns: 24 });
    const result = validateConnectivity(layout);
    expect(result.reachableRacks.size).toBeGreaterThan(0);
  });

  it("honors one-way directions from the selected source cell", () => {
    const layout = {
      ...createEmptyLayout({ rows: 1, columns: 2 }),
      cells: [
        { row: 0, col: 0, cellType: "ROAD" as const, allowedDirections: ["east" as const] },
        { row: 0, col: 1, cellType: "ROAD" as const, allowedDirections: [] }
      ]
    };

    const graph = buildRoadGraph(layout);

    expect(graph.adjacency.get("0:0")?.some((edge) => edge.to === "0:1")).toBe(true);
    expect(graph.adjacency.get("0:1")?.some((edge) => edge.to === "0:0")).toBe(false);
  });
});
