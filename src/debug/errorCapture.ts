import type { DebugContextSnapshot } from "./debugEvents";
import { recordDebugError, recordDebugEvent, severityForConsole } from "./debugStore";

let installed = false;

function stringifyConsoleArgs(args: unknown[]) {
  return args
    .map((arg) => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export function installErrorCapture(getContext: () => DebugContextSnapshot = () => ({})) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    recordDebugEvent({
      category: "console",
      severity: severityForConsole("error"),
      message: stringifyConsoleArgs(args),
      source: "console.error",
      context: getContext()
    });
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    recordDebugEvent({
      category: "console",
      severity: severityForConsole("warn"),
      message: stringifyConsoleArgs(args),
      source: "console.warn",
      context: getContext()
    });
    originalWarn(...args);
  };

  window.addEventListener("error", (event) => {
    recordDebugError(event.message, event.filename || "window.error", event.error?.stack, { line: event.lineno, column: event.colno }, getContext());
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : undefined;
    recordDebugError(reason?.message ?? String(event.reason), "unhandledrejection", reason?.stack, undefined, getContext());
  });
}
