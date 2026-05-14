import React from "react";
import { recordDebugError } from "../../debug/debugStore";

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    recordDebugError(error.message, "react.errorBoundary", error.stack, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <section className="max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-xl">
          <div className="text-lg font-semibold text-red-700">The RMFS designer hit a render error.</div>
          <p className="mt-2 text-sm text-slate-700">
            The error was captured in the Debug / QA diagnostics panel. Reload the app after exporting diagnostics if you need to continue.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-red-50 p-3 text-xs text-red-900">{this.state.message}</pre>
          <button className="toolbar-button-primary mt-4" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </section>
      </div>
    );
  }
}
