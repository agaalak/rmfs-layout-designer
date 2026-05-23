import type { GridCell } from "./grid";

export type DirectedLinkTraversalMode = "NORMAL" | "SERVICE_ONLY" | "STORAGE_ONLY" | "LOADED_ONLY" | "UNLOADED_ONLY";

export interface DirectedNeighborLink {
  linkId: string;
  fromCell: GridCell;
  toCell: GridCell;
  enabled: boolean;
  traversalMode: DirectedLinkTraversalMode;
  travelCostMultiplier?: number;
  locked?: boolean;
}

export type GraphNodeKind = "ROAD" | "STATION_SERVICE" | "POD_SERVICE" | "CHARGER" | "PARKING" | "QUEUE_PREPOINT" | "TRANSIT";

export interface GraphNode {
  nodeId: string;
  cell: GridCell;
  walkable: boolean;
  allowRotation?: boolean;
  supportedOrientationsDeg?: number[];
  nodeKind: GraphNodeKind;
}
