import type { DashboardData, DashboardFeedMeta, DataFeedStatus, SessionSummary } from "./types";

export const FEED_STATUS_LABELS: Record<DataFeedStatus, string> = {
  live: "Live", cached: "Cached", fallback: "Fallback", simulated: "Simulated", empty: "Unavailable",
};

// Transport activity is intentionally not an input: replay frames do not refresh sources.
export function summarizeSourceHealth(sources: DashboardData["sources"]) {
  const counts: Record<DataFeedStatus, number> = { live: 0, cached: 0, fallback: 0, simulated: 0, empty: 0 };
  const feeds = Object.entries(sources).map(([id, feed]: [string, DashboardFeedMeta]) => {
    counts[feed.status]++;
    return { id, ...feed };
  });
  const limited = counts.fallback + counts.simulated + counts.empty;
  return { feeds, counts, limited, total: feeds.length,
    summary: feeds.length === 0 ? "No sources reported" : limited > 0
      ? `${limited} of ${feeds.length} feeds limited` : counts.cached > 0
        ? `${counts.cached} of ${feeds.length} feeds cached` : `${counts.live} source ${counts.live === 1 ? "feed" : "feeds"} live` };
}

export function scheduleContext(session: SessionSummary | null, snapshotAt: string) {
  if (!session) return "Schedule unavailable";
  if (session.isCancelled) return "Cancelled session";
  const start = Date.parse(session.dateStart);
  const snapshot = Date.parse(snapshotAt);
  return Number.isFinite(start) && Number.isFinite(snapshot) && start > snapshot
    ? "Next on schedule" : "Schedule reference";
}
