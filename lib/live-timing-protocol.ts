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
  type?: string;
  receivedAt?: string;
  sampleIndex?: number;
  trackPosition?: number;
  latencyMs?: number;
  raceControl?: DashboardData["raceControl"];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJsonPayload(payload: string): unknown {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  return JSON.parse(trimmed);
}

export function parseLiveTimingPayload(payload: string): LiveTimingFrame | null {
  const parsed = parseJsonPayload(payload) as TimingEnvelope | null;
  const envelope = asRecord(parsed);

  if (!envelope) {
    return null;
  }

  if (typeof envelope.type === "string") {
    return {
      type: envelope.type as LiveTimingFrame["type"],
      receivedAt:
        typeof envelope.receivedAt === "string"
          ? envelope.receivedAt
          : new Date().toISOString(),
      sampleIndex: numberOrUndefined(envelope.sampleIndex),
      trackPosition: numberOrUndefined(envelope.trackPosition),
      latencyMs: numberOrUndefined(envelope.latencyMs),
      raceControl: envelope.raceControl as DashboardData["raceControl"] | undefined,
    };
  }

  const updates = asRecord(envelope.R);
  const timingData = asRecord(updates?.TimingData);
  const carData = asRecord(updates?.CarData);
  const raceControl = asRecord(updates?.RaceControlMessages);

  if (timingData || carData || raceControl) {
    return {
      type: raceControl ? "race-control" : "telemetry",
      receivedAt: new Date().toISOString(),
      sampleIndex: numberOrUndefined(timingData?.SampleIndex ?? carData?.SampleIndex),
      trackPosition: numberOrUndefined(carData?.TrackPosition),
    };
  }

  const hubMessages = Array.isArray(envelope.M) ? envelope.M : [];
  const invocation = hubMessages.find((message) => message.H === "Streaming");
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
