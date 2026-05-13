import { defaultSimulationConfig, type SimulationConfig, type SimulationEvent, type SimulationMetrics, type TaskGenerationMode } from "../models/simulation";

export function exportSimulationConfigJson(config: SimulationConfig): string {
  return JSON.stringify({ simulationConfig: config, exportedAt: new Date().toISOString() }, null, 2);
}

const taskModes: TaskGenerationMode[] = ["manual", "random_nearest", "weighted_hot_warm_cold"];

export function importSimulationConfigJson(text: string): { config?: SimulationConfig; errors: string[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { errors: [`Invalid simulation config JSON: ${error instanceof Error ? error.message : "parse failed"}`], warnings: [] };
  }

  const candidate =
    parsed && typeof parsed === "object" && "simulationConfig" in parsed
      ? (parsed as { simulationConfig?: unknown }).simulationConfig
      : parsed;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { errors: ["Simulation config must be a JSON object or an object with a simulationConfig field."], warnings: [] };
  }

  const raw = candidate as Partial<Record<keyof SimulationConfig, unknown>>;
  const config: SimulationConfig = { ...defaultSimulationConfig };
  const errors: string[] = [];
  const warnings: string[] = [];
  const numericKeys: Array<keyof SimulationConfig> = [
    "robotCount",
    "unloadedSpeedMps",
    "loadedSpeedMps",
    "accelerationMps2",
    "decelerationMps2",
    "rotationSpeedDegPerSec",
    "liftTimeSec",
    "dropTimeSec",
    "stationServiceTimeSec",
    "taskCount",
    "reservationTimeStepSec"
  ];
  const booleanKeys: Array<keyof SimulationConfig> = ["showPaths", "showReservations", "showRobotLabels", "collisionCheckingEnabled"];

  for (const key of numericKeys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      errors.push(`${key} must be a non-negative number.`);
    } else {
      (config[key] as number) = value;
    }
  }

  for (const key of booleanKeys) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      errors.push(`${key} must be true or false.`);
    } else {
      (config[key] as boolean) = value;
    }
  }

  if (raw.taskGenerationMode !== undefined) {
    if (typeof raw.taskGenerationMode === "string" && taskModes.includes(raw.taskGenerationMode as TaskGenerationMode)) {
      config.taskGenerationMode = raw.taskGenerationMode as TaskGenerationMode;
    } else {
      errors.push(`taskGenerationMode must be one of ${taskModes.join(", ")}.`);
    }
  }

  const knownKeys = new Set([...numericKeys, ...booleanKeys, "taskGenerationMode"]);
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key as keyof SimulationConfig)) warnings.push(`Ignored unknown simulation config field: ${key}.`);
  }

  return errors.length > 0 ? { errors, warnings } : { config, errors, warnings };
}

export function exportSimulationEventLogCsv(events: SimulationEvent[]): string {
  const headers = ["timeSec", "severity", "robotId", "taskId", "message"];
  const rows = events.map((event) =>
    [event.timeSec.toFixed(2), event.severity, event.robotId ?? "", event.taskId ?? "", event.message]
      .map((value) => JSON.stringify(value))
      .join(",")
  );
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

export function exportSimulationMetricsCsv(metrics: SimulationMetrics): string {
  const headers = Object.keys(metrics) as Array<keyof SimulationMetrics>;
  return `${headers.join(",")}\n${headers.map((key) => JSON.stringify(metrics[key])).join(",")}\n`;
}
