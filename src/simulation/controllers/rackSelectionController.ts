import type { WarehouseLayout } from "../../models/layout";
import type { RmfsOrderLine } from "../../models/order";
import type { Rack } from "../../models/rack";
import type { RackRuntimeState, RackSelectionStrategy, SimulationInventoryBin } from "../../models/simulation";
import { buildRoadGraph, rackApproachNodes } from "../../graph/graphBuilder";
import { shortestPathBetweenSets } from "../../graph/shortestPath";
import { cellKey } from "../../utils/gridMath";

function availableQuantity(bin: SimulationInventoryBin) {
  return Math.max(0, bin.quantity - bin.reservedQuantity);
}

function hotWeight(rack: Rack) {
  if (rack.demandClass === "HOT") return 0;
  if (rack.demandClass === "WARM") return 1;
  return 2;
}

export function rackInventoryForSku(inventory: SimulationInventoryBin[], sku: string) {
  return inventory.filter((bin) => bin.sku === sku && availableQuantity(bin) > 0);
}

export function selectRackForOrderLine(
  layout: WarehouseLayout,
  inventory: SimulationInventoryBin[],
  rackStates: Record<string, RackRuntimeState>,
  line: RmfsOrderLine,
  strategy: RackSelectionStrategy,
  startCell?: { row: number; col: number }
): { rack?: Rack; bin?: SimulationInventoryBin; reason?: string } {
  const bins = rackInventoryForSku(inventory, line.sku).filter((bin) => availableQuantity(bin) >= line.quantity);
  const candidates = bins
    .map((bin) => ({ bin, rack: layout.racks.find((rack) => rack.id === bin.rackId) }))
    .filter((item): item is { bin: SimulationInventoryBin; rack: Rack } => Boolean(item.rack))
    .filter(({ rack }) => {
      const state = rackStates[rack.id];
      return !state || ["STORED"].includes(state.operationalStatus);
    });

  if (candidates.length === 0) return { reason: `No available rack inventory for SKU ${line.sku}.` };

  if (strategy === "most_inventory_for_sku") {
    const best = [...candidates].sort((a, b) => availableQuantity(b.bin) - availableQuantity(a.bin))[0];
    return { rack: best.rack, bin: best.bin };
  }

  if (strategy === "hot_warm_cold_weighted") {
    const best = [...candidates].sort((a, b) => hotWeight(a.rack) - hotWeight(b.rack) || availableQuantity(b.bin) - availableQuantity(a.bin))[0];
    return { rack: best.rack, bin: best.bin };
  }

  if (startCell) {
    const graph = buildRoadGraph(layout);
    const best = [...candidates]
      .map((candidate) => ({
        ...candidate,
        distance: shortestPathBetweenSets(graph, [cellKey(startCell)], rackApproachNodes(layout, candidate.rack, graph))?.distance ?? Number.MAX_SAFE_INTEGER
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    return { rack: best.rack, bin: best.bin };
  }

  return { rack: candidates[0].rack, bin: candidates[0].bin };
}

