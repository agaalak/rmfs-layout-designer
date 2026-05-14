import type { RmfsOrder } from "../models/order";
import type { SimulationInventoryBin } from "../models/simulation";
import {
  defaultSimulationConfig,
  type ChargingStrategy,
  type DeadlockRecoveryPolicy,
  type OrderAssignmentStrategy,
  type RackSelectionStrategy,
  type RackStorageStrategy,
  type RobotAssignmentStrategy,
  type SimulationConfig,
  type SimulationEvent,
  type SimulationMetrics,
  type StationAssignmentStrategy,
  type TaskGenerationMode
} from "../models/simulation";

export function exportSimulationConfigJson(config: SimulationConfig): string {
  return JSON.stringify({ simulationConfig: config, exportedAt: new Date().toISOString() }, null, 2);
}

const taskModes: TaskGenerationMode[] = ["manual", "random_nearest", "weighted_hot_warm_cold"];
const strategyOptions = {
  orderAssignmentStrategy: ["FIFO", "priority_first", "earliest_due_time"] as OrderAssignmentStrategy[],
  rackSelectionStrategy: ["nearest_rack_with_sku", "most_inventory_for_sku", "hot_warm_cold_weighted", "manual"] as RackSelectionStrategy[],
  stationAssignmentStrategy: ["nearest_compatible_station", "shortest_queue", "station_type_match"] as StationAssignmentStrategy[],
  robotAssignmentStrategy: ["nearest_idle_robot", "first_available_robot"] as RobotAssignmentStrategy[],
  rackStorageStrategy: ["return_home", "nearest_available_storage", "keep_hot_near_station"] as RackStorageStrategy[],
  chargingStrategy: ["none", "low_battery_to_nearest_charger"] as ChargingStrategy[]
};
const deadlockRecoveryPolicies: DeadlockRecoveryPolicy[] = ["wait", "replan", "priority_escalation", "fail_low_priority"];

export function importSimulationConfigJson(text: string): { config?: SimulationConfig; errors: string[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { errors: [`Invalid simulation config JSON: ${error instanceof Error ? error.message : "parse failed"}`], warnings: [] };
  }

  const candidate =
    parsed && typeof parsed === "object" && "simulationConfig" in parsed
      ? (parsed as { simulationConfig?: unknown }).simulationConfig
      : parsed;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { errors: ["Simulation config must be a JSON object or an object with a simulationConfig field."], warnings: [] };
  }

  const raw = candidate as Partial<Record<keyof SimulationConfig, unknown>>;
  const config: SimulationConfig = { ...defaultSimulationConfig };
  const errors: string[] = [];
  const warnings: string[] = [];
  const numericKeys: Array<keyof SimulationConfig> = [
    "robotCount",
    "unloadedSpeedMps",
    "loadedSpeedMps",
    "accelerationMps2",
    "decelerationMps2",
    "rotationSpeedDegPerSec",
    "liftTimeSec",
    "dropTimeSec",
    "stationServiceTimeSec",
    "taskCount",
    "reservationTimeStepSec",
    "maxWaitBeforeReplanSec",
    "maxReplanAttempts",
    "maxBlockedTimeSec",
    "loadedRobotPriorityBoost",
    "reservationHorizonSec"
  ];
  const booleanKeys: Array<keyof SimulationConfig> = [
    "showPaths",
    "showReservations",
    "showRobotLabels",
    "collisionCheckingEnabled",
    "priorityAgingEnabled",
    "deadlockDetectionEnabled",
    "showLoadedEnvelope"
  ];

  for (const key of numericKeys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(`${key} must be a non-negative number.`);
    } else {
      (config[key] as number) = value;
    }
  }

  for (const key of booleanKeys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      errors.push(`${key} must be true or false.`);
    } else {
      (config[key] as boolean) = value;
    }
  }

  if (raw.taskGenerationMode !== undefined) {
    if (typeof raw.taskGenerationMode === "string" && taskModes.includes(raw.taskGenerationMode as TaskGenerationMode)) {
      config.taskGenerationMode = raw.taskGenerationMode as TaskGenerationMode;
    } else {
      errors.push(`taskGenerationMode must be one of ${taskModes.join(", ")}.`);
    }
  }

  for (const [key, options] of Object.entries(strategyOptions) as Array<[keyof typeof strategyOptions, string[]]>) {
    const value = raw[key as keyof SimulationConfig];
    if (value === undefined) continue;
    if (typeof value === "string" && options.includes(value)) {
      (config as unknown as Record<string, string>)[key] = value;
    } else {
      errors.push(`${key} must be one of ${options.join(", ")}.`);
    }
  }

  if (raw.deadlockRecoveryPolicy !== undefined) {
    if (typeof raw.deadlockRecoveryPolicy === "string" && deadlockRecoveryPolicies.includes(raw.deadlockRecoveryPolicy as DeadlockRecoveryPolicy)) {
      config.deadlockRecoveryPolicy = raw.deadlockRecoveryPolicy as DeadlockRecoveryPolicy;
    } else {
      errors.push(`deadlockRecoveryPolicy must be one of ${deadlockRecoveryPolicies.join(", ")}.`);
    }
  }

  const knownKeys = new Set([...numericKeys, ...booleanKeys, "taskGenerationMode", "deadlockRecoveryPolicy", ...Object.keys(strategyOptions)]);
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key as keyof SimulationConfig)) warnings.push(`Ignored unknown simulation config field: ${key}.`);
  }

  return errors.length > 0 ? { errors, warnings } : { config, errors, warnings };
}

export function exportSimulationEventLogCsv(events: SimulationEvent[]): string {
  const headers = ["eventId", "timeSec", "severity", "entityType", "entityId", "robotId", "taskId", "message"];
  const rows = events.map((event) =>
    [event.eventId ?? "", event.timeSec.toFixed(2), event.severity, event.entityType ?? "", event.entityId ?? "", event.robotId ?? "", event.taskId ?? "", event.message]
      .map((value) => JSON.stringify(value))
      .join(",")
  );
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

export function exportSimulationMetricsCsv(metrics: SimulationMetrics): string {
  const headers = Object.keys(metrics) as Array<keyof SimulationMetrics>;
  return `${headers.join(",")}\n${headers.map((key) => JSON.stringify(metrics[key])).join(",")}\n`;
}

export function exportOrdersCsv(orders: RmfsOrder[]): string {
  const headers = ["orderId", "priority", "status", "lineId", "sku", "quantity", "fulfilledQuantity", "assignedRackId", "assignedBinId", "failureReason"];
  const rows = orders.flatMap((order) =>
    order.orderLines.map((line) =>
      [
        order.orderId,
        order.priority,
        order.status,
        line.lineId,
        line.sku,
        line.quantity,
        line.fulfilledQuantity,
        line.assignedRackId ?? "",
        line.assignedBinId ?? "",
        order.failureReason ?? ""
      ].map((value) => JSON.stringify(value)).join(",")
    )
  );
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

export function exportInventoryCsv(inventory: SimulationInventoryBin[]): string {
  const headers = ["rackId", "faceId", "binId", "barcode", "locationId", "sku", "quantity", "reservedQuantity", "maxQuantity"];
  const rows = inventory.map((bin) =>
    [bin.rackId, bin.faceId, bin.binId, bin.barcode, bin.locationId, bin.sku ?? "", bin.quantity, bin.reservedQuantity, bin.maxQuantity ?? ""]
      .map((value) => JSON.stringify(value))
      .join(",")
  );
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}
