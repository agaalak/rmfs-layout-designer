import type { RmfsOrder } from "../models/order";
import type { SimulationInventoryBin } from "../models/simulation";
import { availableSkuSummary } from "./inventory";

const priorities: RmfsOrder["priority"][] = ["NORMAL", "HIGH", "LOW", "EXPEDITE"];

export function generateSampleOrders(inventory: SimulationInventoryBin[], count: number, simTimeSec: number, existingCount = 0): RmfsOrder[] {
  const skus = availableSkuSummary(inventory).filter((item) => item.quantity - item.reservedQuantity > 0);
  if (skus.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const sku = skus[index % skus.length];
    const quantity = Math.max(1, Math.min(2 + (index % 3), sku.quantity - sku.reservedQuantity));
    const orderNumber = existingCount + index + 1;
    return {
      orderId: `order_${String(orderNumber).padStart(4, "0")}`,
      priority: priorities[index % priorities.length],
      status: "PENDING",
      createdAtSec: simTimeSec,
      dueTimeSec: simTimeSec + 1800 + index * 60,
      orderLines: [
        {
          lineId: `line_${String(orderNumber).padStart(4, "0")}_001`,
          sku: sku.sku,
          quantity,
          fulfilledQuantity: 0,
          status: "PENDING"
        }
      ]
    } satisfies RmfsOrder;
  });
}

