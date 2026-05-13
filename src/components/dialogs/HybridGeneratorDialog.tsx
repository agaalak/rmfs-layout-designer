import { useState } from "react";
import type { GenerationParams } from "../../models/layout";
import { defaultGenerationParams } from "../../generators/proceduralGenerator";
import { useCurrentLayout, useLayoutStore } from "../../store/layoutStore";
import { DialogShell } from "./DialogShell";
import { GeneratorFields } from "./ProceduralGeneratorDialog";

interface HybridGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HybridGeneratorDialog({ open, onClose }: HybridGeneratorDialogProps) {
  const layout = useCurrentLayout();
  const generateHybrid = useLayoutStore((state) => state.generateHybrid);
  const stored = useLayoutStore((state) => state.generationParams);
  const [params, setParams] = useState<GenerationParams>({
    ...defaultGenerationParams,
    ...stored,
    rows: layout.grid.rows,
    columns: layout.grid.columns,
    cellWidthM: layout.grid.cellWidthM,
    cellDepthM: layout.grid.cellDepthM
  });
  const set = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => setParams((current) => ({ ...current, [key]: value }));
  return (
    <DialogShell title="Generate Hybrid Layout" open={open} onClose={onClose}>
      <div className="mb-3 rounded-md border border-border bg-slate-50 p-2 text-xs text-muted-foreground">
        Current blocked cells, human zones, docks, roads, fixed stations, chargers, and parking are treated as constraints. The generator fills racks, aisles, queues, rotation zones, and remaining support cells around them.
      </div>
      <GeneratorFields params={params} set={set} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="toolbar-button" onClick={onClose}>Cancel</button>
        <button
          className="toolbar-button"
          onClick={() => {
            generateHybrid(params);
            onClose();
          }}
        >
          Fill hybrid layout
        </button>
      </div>
    </DialogShell>
  );
}
