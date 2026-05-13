import type { GenerationParams, WarehouseLayout } from "../models/layout";
import { generateProceduralLayout } from "./proceduralGenerator";

export function generateHybridExternalInternalLayout(params: GenerationParams): WarehouseLayout {
  return generateProceduralLayout({ ...params, layoutFamily: "hybrid_external_internal" });
}
