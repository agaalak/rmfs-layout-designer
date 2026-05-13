import { useCurrentLayout, useLayoutStore } from "../../store/layoutStore";
import { DialogShell } from "./DialogShell";

interface AnalyticsSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AnalyticsSettingsDialog({ open, onClose }: AnalyticsSettingsDialogProps) {
  const layout = useCurrentLayout();
  const updateLayoutMeta = useLayoutStore((state) => state.updateLayoutMeta);
  const robot = layout.robotAssumptions;
  return (
    <DialogShell title="Analytics Settings" open={open} onClose={onClose}>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["robotCount", "Robot count"],
          ["unloadedSpeedMps", "Unloaded speed"],
          ["loadedSpeedMps", "Loaded speed"],
          ["pickupTimeSec", "Pickup sec"],
          ["dropoffTimeSec", "Dropoff sec"],
          ["rotationTimeSec", "Rotation sec"]
        ].map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="field-label">{label}</span>
            <input
              className="field-input"
              type="number"
              step="0.1"
              value={robot[key as keyof typeof robot] as number}
              onChange={(event) => updateLayoutMeta({ robotAssumptions: { ...robot, [key]: Number(event.target.value) } })}
            />
          </label>
        ))}
      </div>
    </DialogShell>
  );
}
