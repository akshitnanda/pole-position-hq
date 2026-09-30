import type { PitWallBrief, PitWallEvidence, PitWallMode } from "./pit-wall-ai";

export type BriefRecord = {
  brief: PitWallBrief;
  evidence: PitWallEvidence[];
};

export function buildBriefFilename(mode: PitWallMode, record: BriefRecord) {
  const name = mode === "weekend-outlook" ? "weekend" : record.evidence.find((item) => item.kind === "driver")?.label ?? "field";
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "field";
  const date = new Date(record.brief.snapshotGeneratedAt);
  const stamp = Number.isNaN(date.getTime()) ? "undated" : date.toISOString().replace(/[:.]/g, "-");
  return `pit-wall-${mode}-${slug}-${stamp}.txt`;
}

export function buildBriefText(mode: PitWallMode, record: BriefRecord) {
  const evidenceByRef = new Map(record.evidence.map((item) => [item.ref, item]));
  const citedRefs = new Set(record.brief.findings.flatMap((finding) => finding.evidenceRefs));
  if (record.brief.watchNext.length && evidenceByRef.has("SESSION-NEXT")) {
    citedRefs.add("SESSION-NEXT");
  }
  const lines = [
    `PIT WALL AI / ${mode.replace(/-/g, " ").toUpperCase()}`,
    record.brief.headline,
    "",
    record.brief.readout,
    "",
    ...record.brief.findings.flatMap((finding, index) => [
      `${index + 1}. ${finding.label}`,
      `Context: ${finding.context ?? "Context unavailable"}`,
      finding.insight,
      `Evidence: ${finding.evidenceRefs.join(", ")}`,
      "",
    ]),
  ];
  if (record.brief.watchNext.length) {
    lines.push("NEXT SCHEDULED SESSION", ...record.brief.watchNext.map((item) => `- ${item}`), "");
  }
  lines.push(
    "EVIDENCE RECEIPTS",
    ...Array.from(citedRefs).flatMap((ref) => {
      const item = evidenceByRef.get(ref);
      return item
        ? [`[${ref}] ${item.label}`, `Context: ${item.context ?? "Context unavailable"}`, item.fact, `Source: ${item.source}`, ""]
        : [];
    }),
    `Caveat: ${record.brief.caveat}`,
    `Generated: ${record.brief.generatedAt}`,
    `Dashboard snapshot: ${record.brief.snapshotGeneratedAt}`,
    `Selection: ${record.brief.selectionMethod === "snapshot" ? "Fixed snapshot rules (no AI)" : "NVIDIA NIM"}`,
    `Model: ${record.brief.model}`,
  );
  return lines.join("\n").trim();
}
