import type { GenerationParams, WarehouseLayout } from "../models/layout";
import { generateProceduralLayout } from "./proceduralGenerator";

export function generateTraditionalExternalLayout(params: GenerationParams): WarehouseLayout {
  return generateProceduralLayout({ ...params, layoutFamily: "traditional_external" });
}
