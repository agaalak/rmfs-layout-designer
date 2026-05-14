import { CheckCircle2, ListOrdered, Sparkles } from "lucide-react";
import type { CandidateComparisonState } from "../../store/layoutStore";
import { cn } from "../../utils/cn";

interface GenerateWorkflowPanelProps {
  comparison?: CandidateComparisonState;
  onGenerateModeB: () => void;
  onGenerateHybrid: () => void;
  onApplyCandidate: () => void;
  display?: "desktop" | "drawer";
}

function num(value: number) {
  return value.toFixed(1);
}

export function GenerateWorkflowPanel({
  comparison,
  onGenerateModeB,
  onGenerateHybrid,
  onApplyCandidate,
  display = "desktop"
}: GenerateWorkflowPanelProps) {
  const selected = comparison?.summaries.find((summary) => summary.candidateId === comparison.selectedCandidateId);

  return (
    <aside
      className={cn(
        display === "desktop"
          ? "hidden w-80 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-3 xl:flex"
          : "flex h-full w-full flex-col gap-4 overflow-auto bg-panel p-3"
      )}
      aria-label="Generate panel"
    >
      <div>
        <div className="panel-title">Generate</div>
        <div className="mt-2 text-sm font-semibold">Procedural and hybrid layouts</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Generate alternatives, preview them on the canvas, then explicitly apply one before editing.
        </p>
      </div>

      <section className="grid gap-2">
        <button className="toolbar-button-primary justify-center" onClick={onGenerateModeB}>
          <Sparkles data-icon="inline-start" />
          Generate Mode B Layout
        </button>
        <button className="toolbar-button justify-center" onClick={onGenerateHybrid}>
          Generate Hybrid Layout
        </button>
      </section>

      <section className="rounded-md border border-border bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="size-4 text-teal-700" />
          <div className="text-sm font-semibold">Candidate comparison</div>
        </div>
        {comparison ? (
          <div className="mt-3 grid gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Candidates</span>
              <span className="font-semibold">{comparison.summaries.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Previewing</span>
              <span className="font-semibold">{comparison.selectedCandidateId}</span>
            </div>
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Family</span>
                  <span className="font-semibold">{selected.layoutFamily}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Overall score</span>
                  <span className="font-semibold text-teal-700">{num(selected.overallLayoutScore)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Validation errors</span>
                  <span className={selected.validationErrorCount > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>
                    {selected.validationErrorCount}
                  </span>
                </div>
              </>
            ) : null}
            <button className="toolbar-button-primary mt-2 justify-center" onClick={onApplyCandidate}>
              <CheckCircle2 data-icon="inline-start" />
              Apply Selected Candidate
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-muted-foreground">
            No generated candidates yet. Start with Mode B for alternatives or Hybrid to preserve locked constraints.
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-white p-3 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground">Workflow guardrail</div>
        <p className="mt-1">
          Previewing a candidate shows it on the canvas, but the decision is not final until you apply it. Applied candidates
          become normal editable layouts.
        </p>
      </section>
    </aside>
  );
}
