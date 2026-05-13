import type { ValidationResult } from "../../validation/validateLayout";

interface ValidationPanelProps {
  validation: ValidationResult;
  onSelectIssue?: (issue: ValidationResult["issues"][number]) => void;
}

export function ValidationPanel({ validation, onSelectIssue }: ValidationPanelProps) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="panel-title">Validation</div>
      <div className="mt-2 max-h-40 overflow-auto rounded-md border border-border">
        {validation.issues.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">No validation issues.</div>
        ) : (
          validation.issues.slice(0, 40).map((issue) => (
            <button
              key={issue.id}
              className="block w-full border-b border-border p-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
              onClick={() => onSelectIssue?.(issue)}
            >
              <div className={issue.severity === "error" ? "font-semibold text-red-600" : "font-semibold text-amber-700"}>
                {issue.severity.toUpperCase()}
              </div>
              <div>{issue.message}</div>
              {issue.cell ? <div className="mt-1 text-[11px] text-muted-foreground">row {issue.cell.row}, col {issue.cell.col}</div> : null}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
