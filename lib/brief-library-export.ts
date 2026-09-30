import type { BriefLibraryEntry } from "./brief-checkpoints";
import { buildBriefText } from "./pit-wall-export";

export function buildBriefLibraryText(entries: BriefLibraryEntry[]) {
  const lines = ["POLE POSITION / SAVED BRIEFING PACK", `${entries.length} saved checkpoints`, "",
    "Frozen snapshots, not live data. Each briefing retains its own driver, season, timestamp and source receipts.",
    "This text pack is for offline reading; it cannot be imported into the dashboard.", "", "CONTENTS",
    ...entries.map((entry, index) => `${index + 1}. ${entry.label} / ${entry.season} / ${entry.record.brief.snapshotGeneratedAt}`)];
  for (const [index, entry] of entries.entries()) {
    lines.push("", "=".repeat(64), `CHECKPOINT ${index + 1} / ${entry.label}`, `Season: ${entry.season}`,
      `Scope: ${entry.mode}; driver: ${entry.driverId ?? "none"}`,
      ...(entry.unavailableReason ? [`Availability: ${entry.unavailableReason}`] : []), "", buildBriefText(entry.mode, entry.record));
  }
  return lines.join("\n").trim();
}
