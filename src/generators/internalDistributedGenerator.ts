import type { GenerationParams, WarehouseLayout } from "../models/layout";
import { generateProceduralLayout } from "./proceduralGenerator";

export function generateInternalDistributedLayout(params: GenerationParams): WarehouseLayout {
  return generateProceduralLayout({ ...params, layoutFamily: "internal_distributed" });
}
