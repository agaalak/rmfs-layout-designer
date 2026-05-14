import type {
  ChargingStrategy,
  OrderAssignmentStrategy,
  RackSelectionStrategy,
  RackStorageStrategy,
  RobotAssignmentStrategy,
  StationAssignmentStrategy
} from "../../models/simulation";

export type ControllerStage = "order_assignment" | "rack_selection" | "station_assignment" | "robot_assignment" | "rack_storage" | "charging";

export interface ControllerStrategyDefinition {
  stage: ControllerStage;
  name: string;
  label: string;
  description: string;
  metricsImpacted: string[];
  limitations: string;
}

export interface ControllerDecisionTrace {
  controller: ControllerStage;
  strategy: string;
  candidateCount: number;
  selectedCandidateId?: string;
  reason: string;
  score?: number;
}

export const controllerRegistry: ControllerStrategyDefinition[] = [
  { stage: "order_assignment", name: "FIFO", label: "FIFO", description: "Release pending orders in creation order.", metricsImpacted: ["order cycle time", "throughput"], limitations: "Does not consider due dates beyond queue order." },
  { stage: "order_assignment", name: "priority_first", label: "Priority first", description: "Release higher-priority orders before lower-priority work.", metricsImpacted: ["lateness", "expedite cycle time"], limitations: "Can starve low-priority orders without aging." },
  { stage: "order_assignment", name: "earliest_due_time", label: "Earliest due time", description: "Prefer orders with the earliest due time.", metricsImpacted: ["due time adherence"], limitations: "Current demo orders do not always include due times." },
  { stage: "rack_selection", name: "nearest_rack_with_sku", label: "Nearest rack with SKU", description: "Select the first reachable rack with available SKU inventory.", metricsImpacted: ["empty travel", "order cycle time"], limitations: "Current implementation approximates nearest by available inventory order and simple distances." },
  { stage: "rack_selection", name: "most_inventory_for_sku", label: "Most inventory", description: "Prefer racks with more available units of the requested SKU.", metricsImpacted: ["short picks", "rack touches"], limitations: "Does not optimize future SKU co-location." },
  { stage: "rack_selection", name: "hot_warm_cold_weighted", label: "Hot/warm/cold weighted", description: "Bias selection toward higher-demand rack classes.", metricsImpacted: ["hot SKU throughput"], limitations: "Demand classes are synthetic in demo data." },
  { stage: "rack_selection", name: "manual", label: "Manual", description: "Use the manually selected rack when possible.", metricsImpacted: ["debuggability"], limitations: "Not suitable for automated experiments." },
  { stage: "station_assignment", name: "nearest_compatible_station", label: "Nearest compatible", description: "Choose a compatible station near the rack.", metricsImpacted: ["loaded travel", "station balance"], limitations: "May overload one station when all nearby racks share the same best station." },
  { stage: "station_assignment", name: "shortest_queue", label: "Shortest queue", description: "Choose a compatible station with the shortest queue.", metricsImpacted: ["queue time", "station utilization"], limitations: "Queue prediction is simple and not rolling-horizon." },
  { stage: "station_assignment", name: "station_type_match", label: "Station type match", description: "Choose stations matching the task kind first.", metricsImpacted: ["service feasibility"], limitations: "Falls back to basic compatibility." },
  { stage: "robot_assignment", name: "nearest_idle_robot", label: "Nearest idle", description: "Assign the available robot closest to the pickup target.", metricsImpacted: ["empty travel", "robot utilization"], limitations: "Does not consider future congestion." },
  { stage: "robot_assignment", name: "first_available_robot", label: "First available", description: "Assign the first idle/parked/charging robot available.", metricsImpacted: ["debuggability"], limitations: "Can be suboptimal when spawn order is not spatially meaningful." },
  { stage: "rack_storage", name: "return_home", label: "Return home", description: "Return racks to their original storage location.", metricsImpacted: ["storage stability", "return travel"], limitations: "No active re-slotting benefit." },
  { stage: "rack_storage", name: "nearest_available_storage", label: "Nearest available", description: "Return racks to the nearest compatible empty location.", metricsImpacted: ["loaded return travel"], limitations: "May slowly drift hot racks away from stations." },
  { stage: "rack_storage", name: "keep_hot_near_station", label: "Keep hot near station", description: "Prefer station-near storage for HOT racks.", metricsImpacted: ["future hot SKU travel"], limitations: "Uses static demand class rather than learned demand." },
  { stage: "charging", name: "none", label: "None", description: "Do not dispatch robots to chargers automatically.", metricsImpacted: ["simplicity"], limitations: "Battery drain is not modeled yet." },
  { stage: "charging", name: "low_battery_to_nearest_charger", label: "Low battery to nearest charger", description: "Reserve nearest charger for low-battery robots.", metricsImpacted: ["robot availability"], limitations: "Battery drain and charger queueing remain simplified." }
];

export function getControllerStrategies(stage: ControllerStage) {
  return controllerRegistry.filter((item) => item.stage === stage);
}

export function getControllerStrategyDescription(strategy: OrderAssignmentStrategy | RackSelectionStrategy | StationAssignmentStrategy | RobotAssignmentStrategy | RackStorageStrategy | ChargingStrategy) {
  return controllerRegistry.find((item) => item.name === strategy)?.description ?? "No strategy description registered.";
}

export function makeControllerDecisionTrace(trace: ControllerDecisionTrace): ControllerDecisionTrace {
  return trace;
}
