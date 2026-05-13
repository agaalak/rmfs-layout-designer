import { DialogShell } from "./DialogShell";

export function KeyboardShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <DialogShell title="Keyboard Shortcuts" open={open} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          ["Delete / Backspace", "Delete selected object"],
          ["R", "Rotate selected rack or station"],
          ["Ctrl + C", "Copy selected rack"],
          ["Ctrl + V", "Paste copied rack"],
          ["Ctrl + Z", "Undo"],
          ["Ctrl + Y", "Redo"],
          ["Shift + Click", "Add or remove object from selection"],
          ["Drag empty canvas", "Rectangle select in select mode"]
        ].map(([keys, action]) => (
          <div key={keys} className="rounded-md border border-border bg-slate-50 p-2">
            <div className="font-semibold text-slate-800">{keys}</div>
            <div className="text-xs text-muted-foreground">{action}</div>
          </div>
        ))}
      </div>
    </DialogShell>
  );
}
