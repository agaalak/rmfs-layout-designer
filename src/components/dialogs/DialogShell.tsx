import type { ReactNode } from "react";

interface DialogShellProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function DialogShell({ title, open, onClose, children }: DialogShellProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="max-h-[86vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            X
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
