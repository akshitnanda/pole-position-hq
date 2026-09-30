import type { PitWallEvidence, PitWallMode } from "./pit-wall-ai";
import type { BriefRecord } from "./pit-wall-export";
import type { DriverInsight } from "./types";

export type BriefCheckpoints = Record<string, BriefRecord | undefined>;

export const BRIEF_MODE_LABELS: Record<PitWallMode, string> = {
  "race-brief": "Race brief", "driver-focus": "Driver focus", "weekend-outlook": "Weekend outlook",
};

export type BriefLibraryEntry = {
  key: string; mode: PitWallMode; driverId: string | null; season: number;
  label: string; unavailableReason: string | null; record: BriefRecord;
};

export function listBriefCheckpoints(records: BriefCheckpoints, drivers: DriverInsight[], season: number): BriefLibraryEntry[] {
  const entries: BriefLibraryEntry[] = [];
  for (const [key, record] of Object.entries(records)) {
    if (!record) continue;
    let scope: unknown;
    try { scope = JSON.parse(key); } catch { continue; }
    if (!Array.isArray(scope) || scope.length !== 3) continue;
    const [savedSeason, mode, driverId] = scope;
    if (!Number.isInteger(savedSeason) || typeof mode !== "string" || !Object.hasOwn(BRIEF_MODE_LABELS, mode)
      || (driverId !== null && typeof driverId !== "string")) continue;
    const typedMode = mode as PitWallMode;
    if (key !== briefCheckpointKey(typedMode, driverId, savedSeason)) continue;
    const driver = drivers.find((item) => item.id === driverId);
    // Name comes from the frozen ledger when possible, not a newer standings record.
    const name = record.evidence.find((item) => item.kind === "driver")?.label ?? driver?.fullName ?? "No driver";
    const unavailableReason = savedSeason !== season ? `Saved in the ${savedSeason} season; export remains available.`
      : typedMode !== "weekend-outlook" && (!driverId || !driver) ? "Driver is not in the current standings; export remains available." : null;
    entries.push({ key, mode: typedMode, driverId, season: savedSeason, record, unavailableReason,
      label: typedMode === "weekend-outlook" ? BRIEF_MODE_LABELS[typedMode] : `${BRIEF_MODE_LABELS[typedMode]} · ${name}` });
  }
  return entries.sort((a, b) => {
    const time = (entry: BriefLibraryEntry) => Date.parse(entry.record.brief.snapshotGeneratedAt) || 0;
    return time(b) - time(a) || a.label.localeCompare(b.label);
  });
}

export function briefCheckpointKey(mode: PitWallMode, driverId: string | null, season: number) {
  // Race briefs include the selected driver's strategy; weekend outlook does not.
  return JSON.stringify([season, mode, mode === "weekend-outlook" ? null : driverId]);
}

export function updateBriefCheckpoint(records: BriefCheckpoints, key: string, record?: BriefRecord): BriefCheckpoints {
  const next = { ...records };
  if (record) next[key] = structuredClone(record);
  else delete next[key];
  return next;
}

export type EvidenceChange = {
  type: "updated" | "added" | "removed";
  before?: PitWallEvidence;
  after?: PitWallEvidence;
};

function identity(item: PitWallEvidence) { return JSON.stringify([item.kind, item.label]); }
function content(item: PitWallEvidence) { return JSON.stringify([item.fact, item.context ?? "", item.source]); }

export function compareBriefEvidence(before: PitWallEvidence[], after: PitWallEvidence[]): EvidenceChange[] {
  // Positional refs (TIMING-1, NEWS-1) can move or be reused. Never use them as identity.
  const keys = new Set([...before, ...after].map(identity));
  const changes: EvidenceChange[] = [];
  for (const key of keys) {
    const previous = before.filter((item) => identity(item) === key);
    const current = after.filter((item) => identity(item) === key);
    if (previous.length === 1 && current.length === 1) {
      if (content(previous[0]) !== content(current[0])) changes.push({ type: "updated", before: previous[0], after: current[0] });
      continue;
    }
    // Duplicate/truncated labels are ambiguous: cancel exact matches, do not guess pairings.
    const remaining = [...current];
    for (const item of previous) {
      const match = remaining.findIndex((candidate) => content(candidate) === content(item));
      if (match >= 0) remaining.splice(match, 1);
      else changes.push({ type: "removed", before: item });
    }
    changes.push(...remaining.map((item): EvidenceChange => ({ type: "added", after: item })));
  }
  return changes;
}
