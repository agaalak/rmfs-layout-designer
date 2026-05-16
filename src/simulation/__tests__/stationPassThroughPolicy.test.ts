import { describe, expect, it } from "vitest";
import { createEmptyLayout } from "../../generators/proceduralGenerator";
import { buildRoadGraph } from "../../graph/graphBuilder";
import { findPathToStationQueue, findShortestPath } from "../pathPlanner";

describe("station pass-through policy", () => {
  it("blocks station cells for generic routing while keeping assigned station service reachable", () => {
    const layout = createEmptyLayout({ rows: 1, columns: 3, cellWidthM: 1, cellDepthM: 1 });
    layout.cells = [
      { row: 0, col: 0, cellType: "ROAD", allowedDirections: ["east"] },
      { row: 0, col: 1, cellType: "STATION", allowedDirections: ["east", "west"] },
      { row: 0, col: 2, cellType: "ROAD", allowedDirections: ["west"] }
    ];
    layout.stations = [
      {
        id: "station",
        stationId: "pick_001",
        stationType: "PICK",
        cell: { row: 0, col: 1 },
        serviceSide: "WEST",
        acceptedRackFaces: ["A"],
        requiredRackOrientationDeg: 0,
        targetServiceTimeSec: 30,
        capacity: 1,
        queueLaneIds: []
      }
    ];

    expect(buildRoadGraph(layout, { stationMode: "blocked" }).nodes.has("0:1")).toBe(false);
    expect(findShortestPath(layout, { row: 0, col: 0 }, { row: 0, col: 2 })).toHaveLength(0);
    expect(findPathToStationQueue(layout, { row: 0, col: 2 }, layout.stations[0]).map((cell) => `${cell.row}:${cell.col}`)).toEqual(["0:2", "0:1"]);
  });
});
