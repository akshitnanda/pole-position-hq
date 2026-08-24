"use client";

type InteractionName =
  | "tab_change"
  | "driver_select"
  | "telemetry_scrub"
  | "telemetry_playback"
  | "telemetry_replay_speed"
  | "fantasy_builder"
  | "share_driver_card"
  | "voice_driver_select"
  | "theme_change"
  | "visual_theme_change";

const ANALYTICS_KEY = "pphq-analytics/v1";

type InteractionEvent = {
  name: InteractionName;
  at: string;
  detail?: string;
};

function readEvents(): InteractionEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ANALYTICS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(-80) : [];
  } catch {
    return [];
  }
}

export function logDashboardInteraction(name: InteractionName, detail?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const events = readEvents();
  events.push({ name, detail, at: new Date().toISOString() });

  try {
    window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    // Local interaction logs are best-effort and contain no user identity.
  }
}

export function markDashboardInteractive() {
  if (typeof window === "undefined" || !("performance" in window)) {
    return;
  }

  const markName = "pphq:interactive";
  window.performance.mark(markName);

  const navigation = window.performance.getEntriesByType("navigation")[0];
  if (navigation) {
    window.performance.measure("pphq:tti", {
      start: navigation.startTime,
      end: markName,
    });
  }
}

export function markWebSocketLag(latencyMs: number) {
  if (typeof window === "undefined" || !("performance" in window)) {
    return;
  }

  window.performance.mark(`pphq:stream-lag:${Math.round(latencyMs)}`);
}
