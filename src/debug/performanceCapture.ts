import { recordDebugPerformance } from "./debugStore";

export function measureDebugPerformance<T>(name: string, fn: () => T, details?: Record<string, unknown>): T {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return fn();
  } finally {
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordDebugPerformance(name, end - start, details);
  }
}

export function recordPerformanceSample(name: string, durationMs: number, details?: Record<string, unknown>) {
  recordDebugPerformance(name, durationMs, details);
}
