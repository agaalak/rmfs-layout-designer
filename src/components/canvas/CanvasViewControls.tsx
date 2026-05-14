import { Eye, Flame, Grid3X3, LocateFixed, RefreshCcw, Route, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { useUiStore } from "../../store/uiStore";

interface CanvasViewControlsProps {
  zoomPercent: string;
  onFit: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

function ViewButton({
  label,
  active,
  children,
  onClick
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "icon-button border-teal-500 bg-teal-50 text-teal-800" : "icon-button bg-white/95"}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CanvasViewControls({ zoomPercent, onFit, onReset, onZoomIn, onZoomOut }: CanvasViewControlsProps) {
  const {
    showGrid,
    showLabels,
    showDirectionArrows,
    showHeatmap,
    toggleGrid,
    toggleLabels,
    toggleDirectionArrows,
    toggleHeatmap
  } = useUiStore();

  return (
    <div
      data-testid="canvas-view-controls"
      className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-md border border-border bg-white/90 p-1 shadow-panel backdrop-blur"
      aria-label="Canvas view controls"
    >
      <ViewButton label="Fit to screen" onClick={onFit}><LocateFixed /></ViewButton>
      <ViewButton label="Reset view" onClick={onReset}><RefreshCcw /></ViewButton>
      <ViewButton label="Zoom out" onClick={onZoomOut}><ZoomOut /></ViewButton>
      <span data-testid="canvas-zoom-percent" className="min-w-12 px-1 text-center text-xs font-semibold text-slate-700">{zoomPercent}</span>
      <ViewButton label="Zoom in" onClick={onZoomIn}><ZoomIn /></ViewButton>
      <span className="mx-1 h-6 w-px bg-border" />
      <ViewButton label="Toggle grid" active={showGrid} onClick={toggleGrid}><Grid3X3 /></ViewButton>
      <ViewButton label="Toggle labels" active={showLabels} onClick={toggleLabels}><Eye /></ViewButton>
      <ViewButton label="Toggle direction arrows" active={showDirectionArrows} onClick={toggleDirectionArrows}><Route /></ViewButton>
      <ViewButton label="Toggle heatmap" active={showHeatmap} onClick={toggleHeatmap}><Flame /></ViewButton>
    </div>
  );
}
