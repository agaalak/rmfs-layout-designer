import type { GridCell } from "./grid";

export type DemandClass = "HOT" | "WARM" | "COLD";
export type RackSide = "FRONT" | "BACK" | "LEFT" | "RIGHT";
export type RackFaceId = "A" | "B";
export type CardinalOrientation = 0 | 90 | 180 | 270;

export interface Bin {
  binId: string;
  barcode: string;
  locationId: string;
  faceId: RackFaceId;
  rowIndex: number;
  columnIndex: number;
  widthM: number;
  depthM: number;
  heightM: number;
  maxWeightKg?: number;
  maxQuantity?: number;
  sku?: string;
  quantity?: number;
  reservedQuantity?: number;
  lastUpdatedSimTimeSec?: number;
}

export interface RackFace {
  faceId: RackFaceId;
  localSide: RackSide;
  accessRuleId?: string;
  rows: number;
  columns: number;
  bins: Bin[];
}

export interface Rack {
  id: string;
  rackId: string;
  rackTypeId: string;
  homeCell: GridCell;
  footprintWidthM: number;
  footprintDepthM: number;
  heightM: number;
  currentOrientationDeg: CardinalOrientation;
  allowedOrientationsDeg: CardinalOrientation[];
  faces: RackFace[];
  storageZoneId?: string;
  demandClass?: DemandClass;
  homeStorageLocationId?: string;
  currentStorageLocationId?: string;
  operationalStatus?: "STORED" | "RESERVED" | "BEING_CARRIED" | "AT_STATION" | "RETURNING" | "UNAVAILABLE";
  locked?: boolean;
}
