import type { GenerationParams, WarehouseLayout } from "../models/layout";
import { generateProceduralLayout } from "./proceduralGenerator";

export function generateDenseCrossAisleLayout(params: GenerationParams): WarehouseLayout {
  return generateProceduralLayout({ ...params, layoutFamily: "dense_with_cross_aisles" });
}
