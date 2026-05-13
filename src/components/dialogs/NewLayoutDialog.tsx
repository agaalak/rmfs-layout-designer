import { useState } from "react";
import { defaultGenerationParams } from "../../generators/proceduralGenerator";
import { useLayoutStore } from "../../store/layoutStore";
import { DialogShell } from "./DialogShell";

interface NewLayoutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewLayoutDialog({ open, onClose }: NewLayoutDialogProps) {
  const newLayout = useLayoutStore((state) => state.newLayout);
  const [rows, setRows] = useState(defaultGenerationParams.rows);
  const [columns, setColumns] = useState(defaultGenerationParams.columns);
  const [cellWidthM, setCellWidthM] = useState(defaultGenerationParams.cellWidthM);
  const [cellDepthM, setCellDepthM] = useState(defaultGenerationParams.cellDepthM);
  return (
    <DialogShell title="New Manual Layout" open={open} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="field-label">Rows</span>
          <input className="field-input" type="number" value={rows} onChange={(event) => setRows(Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Columns</span>
          <input className="field-input" type="number" value={columns} onChange={(event) => setColumns(Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Cell width m</span>
          <input className="field-input" type="number" step="0.1" value={cellWidthM} onChange={(event) => setCellWidthM(Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="field-label">Cell depth m</span>
          <input className="field-input" type="number" step="0.1" value={cellDepthM} onChange={(event) => setCellDepthM(Number(event.target.value))} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="toolbar-button" onClick={onClose}>Cancel</button>
        <button
          className="toolbar-button"
          onClick={() => {
            newLayout({ rows, columns, cellWidthM, cellDepthM });
            onClose();
          }}
        >
          Create empty Mode A layout
        </button>
      </div>
    </DialogShell>
  );
}
