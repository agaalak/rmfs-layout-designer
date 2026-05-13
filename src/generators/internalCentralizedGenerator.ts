import type { GenerationParams, WarehouseLayout } from "../models/layout";
import { generateProceduralLayout } from "./proceduralGenerator";

export function generateInternalCentralizedLayout(params: GenerationParams): WarehouseLayout {
  return generateProceduralLayout({ ...params, layoutFamily: "internal_centralized" });
}
