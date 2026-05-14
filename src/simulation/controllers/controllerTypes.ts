import type {
  ChargingStrategy,
  OrderAssignmentStrategy,
  RackSelectionStrategy,
  RackStorageStrategy,
  RobotAssignmentStrategy,
  StationAssignmentStrategy
} from "../../models/simulation";

export interface ControllerStrategyConfig {
  orderAssignmentStrategy: OrderAssignmentStrategy;
  rackSelectionStrategy: RackSelectionStrategy;
  stationAssignmentStrategy: StationAssignmentStrategy;
  robotAssignmentStrategy: RobotAssignmentStrategy;
  rackStorageStrategy: RackStorageStrategy;
  chargingStrategy: ChargingStrategy;
}

export const controllerStrategyDescriptions: Record<keyof ControllerStrategyConfig, Record<string, string>> = {
  orderAssignmentStrategy: {
    FIFO: "Release the oldest pending order first.",
    priority_first: "Release expedite/high-priority orders before normal work.",
    earliest_due_time: "Release the order with the earliest due time first."
  },
  rackSelectionStrategy: {
    nearest_rack_with_sku: "Choose the closest available rack that has inventory for the SKU.",
    most_inventory_for_sku: "Choose the available rack with the largest quantity for the SKU.",
    hot_warm_cold_weighted: "Prefer hot racks when several racks can fulfill the SKU.",
    manual: "Use the manually selected rack when possible."
  },
  stationAssignmentStrategy: {
    nearest_compatible_station: "Choose the compatible station with the shortest current path.",
    shortest_queue: "Choose the compatible station with the shortest queue.",
    station_type_match: "Choose a station matching the operational task type first."
  },
  robotAssignmentStrategy: {
    nearest_idle_robot: "Choose the idle robot closest to the rack approach.",
    first_available_robot: "Choose the first idle robot."
  },
  rackStorageStrategy: {
    return_home: "Return racks to their home storage location.",
    nearest_available_storage: "Return racks to the nearest compatible empty storage location.",
    keep_hot_near_station: "Prefer station-near storage for hot racks and farther storage for cold racks."
  },
  chargingStrategy: {
    none: "Do not assign robots to chargers automatically.",
    low_battery_to_nearest_charger: "Send low-battery idle robots to the nearest charger."
  }
};

