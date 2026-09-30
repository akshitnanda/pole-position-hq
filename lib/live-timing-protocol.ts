import type { DashboardData } from "./types";

export type LiveTimingConnection = "websocket" | "eventsource" | "offline";

export type LiveTimingFrame = {
  type: "snapshot" | "telemetry" | "race-control" | "heartbeat";
  receivedAt: string;
  sampleIndex?: number;
  trackPosition?: number;
  latencyMs?: number;
  raceControl?: DashboardData["raceControl"];
};

type TimingEnvelope = {
  R?: Record<string, unknown>;
  M?: Array<{ H?: string; A?: unknown[] }>;
  A?: unknown[];
  H?: string;
  I?: string;
  type?: string;
  receivedAt?: string;
  sampleIndex?: number;
  trackPosition?: number;
  latencyMs?: number;
  raceControl?: DashboardData["raceControl"];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrUndefined(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseJsonPayload(payload: string): unknown {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  try { return JSON.parse(trimmed); } catch { return null; }
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberOrUndefined(value);
    if (typeof parsed === "number") {
      return parsed;
    }
  }

  return undefined;
}

function parseRaceControlMessages(value: unknown): DashboardData["raceControl"] | undefined {
  const record = asRecord(value);
  const messages = asRecord(record?.Messages);
  const messageRows = messages
    ? Object.entries(messages)
        .map(([id, row]) => ({ id, row: asRecord(row) }))
        .filter((entry): entry is { id: string; row: Record<string, unknown> } => Boolean(entry.row))
    : [];

  if (!messageRows.length) {
    return undefined;
  }

  const latest = messageRows.at(-1)?.row;
  const rawMessage = String(latest?.Message ?? latest?.message ?? "Race control update");
  const lower = rawMessage.toLowerCase();
  const flag = lower.includes("red")
    ? "Red"
    : lower.includes("safety car")
      ? "SC"
      : lower.includes("vsc")
        ? "VSC"
        : lower.includes("yellow")
          ? "Yellow"
          : "Green";

  return {
    flag,
    message: rawMessage,
    countdownEndsAt: null,
    events: messageRows.slice(-8).reverse().map(({ id, row }) => ({
      id: `ltp-${id}`,
      timestamp:
        typeof row.Utc === "string" || typeof row.Time === "string"
          ? String(row.Utc ?? row.Time)
          : new Date().toISOString(),
      type: flag === "Green" ? "system" : "flag",
      message: String(row.Message ?? row.message ?? "Race control update"),
      driverId: typeof row.RacingNumber === "string" ? row.RacingNumber : null,
    })),
  };
}

function validateRaceControl(value: unknown): DashboardData["raceControl"] | undefined {
  const record = asRecord(value);
  if (!record || !["Idle", "Green", "Yellow", "Red", "VSC", "SC"].includes(String(record.flag))
    || typeof record.message !== "string" || !Array.isArray(record.events)
    || !(record.countdownEndsAt === null || typeof record.countdownEndsAt === "string")) return undefined;
  const validEvents = record.events.every((event) => {
    const row = asRecord(event);
    return row && typeof row.id === "string" && typeof row.timestamp === "string"
      && typeof row.message === "string" && ["flag", "pit", "incident", "overtake", "system"].includes(String(row.type))
      && (row.driverId == null || typeof row.driverId === "string");
  });
  return validEvents ? record as DashboardData["raceControl"] : undefined;
}

export function parseLiveTimingPayload(payload: string): LiveTimingFrame | null {
  const parsed = parseJsonPayload(payload) as TimingEnvelope | null;
  const envelope = asRecord(parsed);

  if (!envelope) {
    return null;
  }

  if (typeof envelope.type === "string") {
    if (!["snapshot", "telemetry", "race-control", "heartbeat"].includes(envelope.type)) return null;
    const sampleIndex = numberOrUndefined(envelope.sampleIndex);
    const trackPosition = numberOrUndefined(envelope.trackPosition);
    const raceControl = validateRaceControl(envelope.raceControl);
    if (envelope.type !== "heartbeat" && sampleIndex === undefined && trackPosition === undefined && !raceControl) return null;
    return {
      type: envelope.type as LiveTimingFrame["type"],
      receivedAt:
        typeof envelope.receivedAt === "string"
          ? envelope.receivedAt
          : new Date().toISOString(),
      sampleIndex,
      trackPosition,
      latencyMs: numberOrUndefined(envelope.latencyMs),
      raceControl,
    };
  }

  const updates = asRecord(envelope.R);
  const invocationArgs = Array.isArray(envelope.A) ? envelope.A : [];
  const invocationPayload = asRecord(invocationArgs[0]);
  const signalRUpdates = updates ?? invocationPayload;
  const timingData = asRecord(signalRUpdates?.TimingData);
  const carData = asRecord(signalRUpdates?.CarData);
  const raceControl = asRecord(signalRUpdates?.RaceControlMessages);

  if (signalRUpdates?.Heartbeat) {
    return {
      type: "heartbeat",
      receivedAt: new Date().toISOString(),
    };
  }

  if (timingData || carData || raceControl) {
    const entries = asRecord(carData?.Entries);
    const firstEntry = entries ? asRecord(Object.values(entries)[0]) : null;
    const cars = asRecord(firstEntry?.Cars);
    const firstCar = cars ? asRecord(Object.values(cars)[0]) : null;
    const channels = asRecord(firstCar?.Channels);

    return {
      type: raceControl ? "race-control" : "telemetry",
      receivedAt: new Date().toISOString(),
      sampleIndex: pickNumber(
        timingData?.SampleIndex,
        carData?.SampleIndex,
      ),
      trackPosition: pickNumber(
        carData?.TrackPosition,
        channels?.Position,
        channels?.["0"],
        firstCar?.TrackPosition,
      ),
      raceControl: parseRaceControlMessages(raceControl),
    };
  }

  const hubMessages = Array.isArray(envelope.M) ? envelope.M : [];
  const invocation = hubMessages.find(
    (message) => asRecord(message)?.H === "Streaming" || asRecord(message)?.H === "streaming",
  );
  const args = Array.isArray(invocation?.A) ? invocation.A : [];
  const firstArg = asRecord(args[0]);

  if (firstArg) {
    return {
      type: "telemetry",
      receivedAt: new Date().toISOString(),
      sampleIndex: numberOrUndefined(firstArg.SampleIndex ?? firstArg.sampleIndex),
      trackPosition: numberOrUndefined(firstArg.TrackPosition ?? firstArg.trackPosition),
    };
  }

  return null;
}

export function encodeLiveTimingFrame(frame: LiveTimingFrame) {
  return JSON.stringify(frame);
}
