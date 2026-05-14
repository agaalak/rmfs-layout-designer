import type { WarehouseLayout } from "../models/layout";
import type { RmfsOrder, RmfsOrderLine } from "../models/order";
import type { SimulationInventoryBin } from "../models/simulation";

export function inventoryFromLayout(layout: WarehouseLayout): SimulationInventoryBin[] {
  return layout.racks.flatMap((rack) =>
    rack.faces.flatMap((face) =>
      face.bins.map((bin) => ({
        rackId: rack.id,
        faceId: face.faceId,
        binId: bin.binId,
        barcode: bin.barcode,
        locationId: bin.locationId,
        sku: bin.sku,
        quantity: bin.quantity ?? 0,
        reservedQuantity: bin.reservedQuantity ?? 0,
        maxQuantity: bin.maxQuantity,
        lastUpdatedSimTimeSec: bin.lastUpdatedSimTimeSec
      }))
    )
  );
}

export function availableSkuSummary(inventory: SimulationInventoryBin[]) {
  const summary = new Map<string, { sku: string; quantity: number; reservedQuantity: number; rackCount: number }>();
  for (const bin of inventory) {
    if (!bin.sku) continue;
    const existing = summary.get(bin.sku) ?? { sku: bin.sku, quantity: 0, reservedQuantity: 0, rackCount: 0 };
    existing.quantity += bin.quantity;
    existing.reservedQuantity += bin.reservedQuantity;
    existing.rackCount += 1;
    summary.set(bin.sku, existing);
  }
  return [...summary.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

export function reserveInventory(inventory: SimulationInventoryBin[], binId: string, quantity: number): SimulationInventoryBin[] {
  return inventory.map((bin) => (bin.binId === binId ? { ...bin, reservedQuantity: bin.reservedQuantity + quantity } : bin));
}

export function pickInventory(inventory: SimulationInventoryBin[], binId: string, quantity: number, simTimeSec: number): SimulationInventoryBin[] {
  return inventory.map((bin) =>
    bin.binId === binId
      ? {
          ...bin,
          quantity: Math.max(0, bin.quantity - quantity),
          reservedQuantity: Math.max(0, bin.reservedQuantity - quantity),
          lastUpdatedSimTimeSec: simTimeSec
        }
      : bin
  );
}

export function replenishInventory(inventory: SimulationInventoryBin[], rackId: string, sku: string, quantity: number, simTimeSec: number): SimulationInventoryBin[] {
  const target = inventory.find((bin) => bin.rackId === rackId && (!bin.sku || bin.sku === sku));
  if (!target) return inventory;
  return inventory.map((bin) =>
    bin.binId === target.binId
      ? {
          ...bin,
          sku,
          quantity: Math.min(bin.maxQuantity ?? Number.MAX_SAFE_INTEGER, bin.quantity + quantity),
          lastUpdatedSimTimeSec: simTimeSec
        }
      : bin
  );
}

export function applyPickToOrder(order: RmfsOrder, lineIds: string[], picked: Array<{ lineId?: string; quantity: number; binId: string; rackId: string }>, simTimeSec: number): RmfsOrder {
  const lines = order.orderLines.map((line): RmfsOrderLine => {
    if (!lineIds.includes(line.lineId)) return line;
    const pick = picked.find((item) => item.lineId === line.lineId);
    const fulfilledQuantity = Math.min(line.quantity, line.fulfilledQuantity + (pick?.quantity ?? 0));
    return {
      ...line,
      fulfilledQuantity,
      assignedBinId: pick?.binId ?? line.assignedBinId,
      assignedRackId: pick?.rackId ?? line.assignedRackId,
      status: fulfilledQuantity >= line.quantity ? "PICKED" : "SHORT"
    };
  });
  const completed = lines.every((line) => line.status === "PICKED");
  return { ...order, orderLines: lines, status: completed ? "COMPLETED" : "IN_PROGRESS", completedAtSec: completed ? simTimeSec : order.completedAtSec };
}

