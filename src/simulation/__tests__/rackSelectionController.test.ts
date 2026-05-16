import { describe, expect, it } from "vitest";
import { createEmptyLayout } from "../../generators/proceduralGenerator";
import type { WarehouseLayout } from "../../models/layout";
import type { Rack } from "../../models/rack";
import type { RackRuntimeState, SimulationInventoryBin } from "../../models/simulation";
import { selectRackForOrderLine } from "../controllers/rackSelectionController";

function rack(id: string, row: number, col: number): Rack {
  return {
    id,
    rackId: id,
    rackTypeId: "rack",
    homeCell: { row, col },
    homeStorageLocationId: `storage_${id}`,
    currentStorageLocationId: `storage_${id}`,
    footprintWidthM: 1,
    footprintDepthM: 1,
    heightM: 1.8,
    currentOrientationDeg: 0,
    allowedOrientationsDeg: [0, 90, 180, 270],
    faces: [
      {
        faceId: "A",
        localSide: "FRONT",
        rows: 1,
        columns: 1,
        bins: []
      }
    ]
  };
}

function serviceCellLayout(): { layout: WarehouseLayout; inventory: SimulationInventoryBin[]; rackStates: Record<string, RackRuntimeState> } {
  const layout = createEmptyLayout({ rows: 3, columns: 6, cellWidthM: 1, cellDepthM: 1 });
  const near = rack("rack_near_service", 1, 2);
  const far = rack("rack_far_service", 1, 4);
  layout.cells = [
    { row: 0, col: 0, cellType: "ROAD", allowedDirections: ["east"] },
    { row: 0, col: 1, cellType: "ROAD", allowedDirections: ["east", "west"] },
    { row: 0, col: 2, cellType: "ROAD", allowedDirections: ["east", "west", "south"] },
    { row: 0, col: 3, cellType: "ROAD", allowedDirections: ["east", "west"] },
    { row: 0, col: 4, cellType: "ROAD", allowedDirections: ["west", "south"] },
    { row: 1, col: 2, cellType: "RACK_STORAGE", allowedDirections: ["north"] },
    { row: 1, col: 4, cellType: "RACK_STORAGE", allowedDirections: ["north"] }
  ];
  layout.racks = [far, near];
  layout.storageLocations = [far, near].map((item) => ({
    storageLocationId: `storage_${item.id}`,
    cells: [item.homeCell],
    podServiceCell: item.homeCell,
    allowedRackTypes: ["rack"],
    defaultRackOrientationDeg: 0,
    approachWaypointIds: [],
    currentlyStoredRackId: item.id,
    status: "OCCUPIED"
  }));
  const inventory: SimulationInventoryBin[] = [far, near].map((item) => ({
    rackId: item.id,
    faceId: "A",
    binId: `bin_${item.id}`,
    barcode: `bin_${item.id}`,
    locationId: `bin_${item.id}`,
    sku: "SKU-A",
    quantity: 10,
    reservedQuantity: 0
  }));
  const rackStates = Object.fromEntries(
    [far, near].map((item) => [
      item.id,
      {
        rackId: item.id,
        operationalStatus: "STORED" as const,
        homeStorageLocationId: `storage_${item.id}`,
        currentStorageLocationId: `storage_${item.id}`,
        currentCell: item.homeCell,
        currentOrientationDeg: 0 as const
      }
    ])
  );
  return { layout, inventory, rackStates };
}

describe("rack selection controller", () => {
  it("scores nearest rack by pod service cell route, not rack approach nodes", () => {
    const { layout, inventory, rackStates } = serviceCellLayout();
    const selected = selectRackForOrderLine(
      layout,
      inventory,
      rackStates,
      { lineId: "line_1", sku: "SKU-A", quantity: 1, fulfilledQuantity: 0, status: "PENDING" },
      "nearest_rack_with_sku",
      { row: 0, col: 0 }
    );
    expect(selected.rack?.id).toBe("rack_near_service");
  });
});
