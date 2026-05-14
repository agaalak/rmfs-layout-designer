import type { RmfsOrder } from "../../models/order";
import type { OrderAssignmentStrategy } from "../../models/simulation";

const priorityWeight: Record<RmfsOrder["priority"], number> = {
  EXPEDITE: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};

export function selectNextOrder(orders: RmfsOrder[], strategy: OrderAssignmentStrategy): RmfsOrder | undefined {
  const candidates = orders.filter((order) => order.status === "PENDING" || order.status === "RELEASED");
  if (strategy === "priority_first") return [...candidates].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority] || a.createdAtSec - b.createdAtSec)[0];
  if (strategy === "earliest_due_time") return [...candidates].sort((a, b) => (a.dueTimeSec ?? Number.MAX_SAFE_INTEGER) - (b.dueTimeSec ?? Number.MAX_SAFE_INTEGER))[0];
  return [...candidates].sort((a, b) => a.createdAtSec - b.createdAtSec)[0];
}

