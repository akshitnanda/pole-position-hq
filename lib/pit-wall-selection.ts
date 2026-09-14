import type { PitWallBrief, PitWallEvidence, PitWallMode } from "./pit-wall-ai";

const TITLES: Record<PitWallMode, string> = {
  "race-brief": "Race briefing",
  "driver-focus": "Driver briefing",
  "weekend-outlook": "Weekend briefing",
};

// Model output controls ordering only. All displayed content comes from the ledger.
export function assemblePitWallBrief(
  selection: unknown,
  evidence: PitWallEvidence[],
  mode: PitWallMode,
  model: string,
  snapshotGeneratedAt: string,
  selectionMethod: PitWallBrief["selectionMethod"] = "nim",
): PitWallBrief | null {
  if (!selection || typeof selection !== "object") return null;
  const refs = (selection as Record<string, unknown>).priorityRefs;
  if (!Array.isArray(refs)) return null;

  const byRef = new Map(evidence.map((item) => [item.ref, item]));
  const selected: PitWallEvidence[] = [];
  const seen = new Set<string>();
  for (const ref of refs.slice(0, 24)) {
    if (typeof ref !== "string" || seen.has(ref)) continue;
    const item = byRef.get(ref);
    if (!item || item.kind === "source") continue;
    selected.push(item);
    seen.add(ref);
    if (selected.length === 3) break;
  }
  if (!selected.length) return null;

  return {
    selectionMethod,
    headline: `${TITLES[mode]}: ${selected[0].label}`,
    readout: `${selected.length} evidence ${selected.length === 1 ? "record" : "records"} selected ${selectionMethod === "nim" ? "by NVIDIA NIM" : "by fixed snapshot rules"}. Each card retains its own event context and source wording.`,
    findings: selected.map((item) => ({
      label: item.label,
      insight: item.fact,
      context: item.context ?? "Context unavailable",
      evidenceRefs: [item.ref],
    })),
    watchNext: evidence
      .filter((item) => item.ref === "SESSION-NEXT" && item.kind === "session")
      .map((item) => item.fact),
    caveat: `${selectionMethod === "nim" ? "AI selects the reading order." : "Snapshot order uses fixed rules, not AI."} Facts reproduce the supplied dashboard snapshot; source accuracy and freshness still depend on the upstream feeds.`,
    model,
    generatedAt: selectionMethod === "snapshot" ? snapshotGeneratedAt : new Date().toISOString(),
    snapshotGeneratedAt,
  };
}

const MODE_KINDS: Record<PitWallMode, PitWallEvidence["kind"][]> = {
  "race-brief": ["session", "timing", "weather", "strategy", "driver", "upgrade", "news"],
  "driver-focus": ["driver", "strategy", "timing", "session", "weather"],
  "weekend-outlook": ["session", "weather", "upgrade", "news"],
};

export function scopePitWallEvidence(evidence: PitWallEvidence[], mode: PitWallMode) {
  const driver = evidence.find((item) => item.kind === "driver");
  const eligible = mode === "driver-focus" && driver
    ? evidence.filter((item) => item.kind !== "timing" || item.label === `${driver.label} timing`)
    : evidence;
  const sources = evidence.filter((item) => item.kind === "source").slice(0, 1);
  return [...MODE_KINDS[mode].flatMap((kind) => eligible.filter((item) => item.kind === kind))
    .slice(0, 18 - sources.length), ...sources];
}

export function buildSnapshotBrief(evidence: PitWallEvidence[], mode: PitWallMode, snapshotGeneratedAt: string) {
  // Lead with different evidence categories before filling remaining slots.
  const scoped = scopePitWallEvidence(evidence, mode);
  const leads = MODE_KINDS[mode].flatMap((kind) => scoped.find((item) => item.kind === kind) ?? []);
  return assemblePitWallBrief({ priorityRefs: [...leads, ...scoped].map((item) => item.ref) },
    scoped, mode, "Snapshot rules (no AI)", snapshotGeneratedAt, "snapshot");
}
