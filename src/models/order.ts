export type OrderPriority = "LOW" | "NORMAL" | "HIGH" | "EXPEDITE";
export type OrderStatus = "PENDING" | "RELEASED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type OrderLineStatus = "PENDING" | "ASSIGNED" | "PICKED" | "SHORT";

export interface RmfsOrderLine {
  lineId: string;
  sku: string;
  quantity: number;
  fulfilledQuantity: number;
  assignedRackId?: string;
  assignedBinId?: string;
  status: OrderLineStatus;
}

export interface RmfsOrder {
  orderId: string;
  priority: OrderPriority;
  status: OrderStatus;
  createdAtSec: number;
  dueTimeSec?: number;
  orderLines: RmfsOrderLine[];
  assignedStationId?: string;
  completedAtSec?: number;
  failureReason?: string;
}

