import type { ChargingSpot } from "./charging";
import type { GridConfig, LayoutCell, LayoutMode, PhysicalDimensions } from "./grid";
import type { ParkingSpot } from "./parking";
import type { Rack } from "./rack";
import type { RotationZone } from "./rotation";
import type { Station } from "./station";
import type { TrafficRule } from "./traffic";

export interface RobotAssumptions {
  robotCount: number;
  unloadedSpeedMps: number;
  loadedSpeedMps: number;
  pickupTimeSec: number;
  dropoffTimeSec: number;
  stationServiceTimeSec: number;
  rotationTimeSec: number;
}

export interface DemandAssumptions {
  expectedOrdersPerHour: number;
  averageLinesPerOrder: number;
  averageRackVisitsPerOrder: number;
}

export interface ScoringWeights {
  storageDensity: number;
  averageDistance: number;
  p90Distance: number;
  stationBalance: number;
  congestionRisk: number;
  orientationPenalty: number;
  chargingAccess: number;
  parkingAccess: number;
}

export interface WarehouseLayout {
  layoutId: string;
  name: string;
  mode: LayoutMode;
  grid: GridConfig;
  physicalDimensions: PhysicalDimensions;
  cells: LayoutCell[];
  racks: Rack[];
  stations: Station[];
  chargingSpots: ChargingSpot[];
  parkingSpots: ParkingSpot[];
  rotationZones: RotationZone[];
  trafficRules: TrafficRule[];
  robotAssumptions: RobotAssumptions;
  demandAssumptions: DemandAssumptions;
  scoringWeights: ScoringWeights;
  metadata: Record<string, unknown>;
}

export type LayoutObjectKind = "rack" | "station" | "charger" | "parking" | "rotation";

export interface SelectedObjectRef {
  kind: LayoutObjectKind;
  id: string;
}

export interface GenerationParams {
  rows: number;
  columns: number;
  cellWidthM: number;
  cellDepthM: number;
  rackFootprintWidthM: number;
  rackFootprintDepthM: number;
  rackFillRatio: number;
  verticalAisleSpacing: number;
  horizontalCrossAisleSpacing: number;
  stationCount: number;
  stationPlacementStrategy: "external" | "internal-centralized" | "internal-distributed" | "hybrid";
  chargerCount: number;
  chargerSizeCells: 1 | 2;
  parkingSpotCount: number;
  trafficMode: "one_way" | "two_way";
  rotationZoneCount: number;
  candidateCount: number;
  layoutFamily:
    | "traditional_external"
    | "internal_centralized"
    | "internal_distributed"
    | "hybrid_external_internal"
    | "dense_with_cross_aisles"
    | "flying_v_placeholder";
}
