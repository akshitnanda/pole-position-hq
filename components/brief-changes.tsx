import type { PitWallEvidence } from "@/lib/pit-wall-ai";
import { compareBriefEvidence } from "@/lib/brief-checkpoints";
import { formatBriefDate } from "@/lib/pit-wall-presentation";
import styles from "./pit-wall-ai.module.css";

function EvidenceVersion({ label, item }: { label: string; item?: PitWallEvidence }) {
  return <div className={styles.version}>
    <strong>{label}</strong>
    {item ? <><p>{item.fact}</p><small>{item.context ?? "Context unavailable"}</small><small>Source: {item.source} · {item.ref}</small></>
      : <p>Not present in this scoped evidence ledger.</p>}
  </div>;
}

export function BriefChanges({ before, after, savedAt, currentAt }: {
  before: PitWallEvidence[]; after: PitWallEvidence[]; savedAt: string; currentAt: string;
}) {
  const changes = compareBriefEvidence(before, after);
  return <details className={styles.changes}>
    <summary>Changes since checkpoint <span>{changes.length ? `${changes.length} changed records` : "No evidence changes"}</span></summary>
    <p className={styles.changeNote}>Exact source-record comparison, not AI analysis. Added or absent records can reflect feed availability or ledger limits, not a change on track. Context changes may refer to a different event.</p>
    <div className={styles.changeDates}><span>Saved snapshot: {formatBriefDate(savedAt)}</span><span>Current snapshot: {formatBriefDate(currentAt)}</span></div>
    {changes.length ? <div className={styles.changeList}>{changes.map((change, index) => <article key={index}>
      <header><h3>{(change.after ?? change.before)!.label}</h3><span>{change.type === "removed" ? "Absent now" : change.type === "added" ? "Added" : "Updated"}</span></header>
      <div className={styles.versions}><EvidenceVersion label="Saved" item={change.before} /><EvidenceVersion label="Current" item={change.after} /></div>
    </article>)}</div> : <p className={styles.changeNote}>The scoped facts, context and sources match. Snapshot timestamps, record order and reference numbers alone do not count as evidence changes.</p>}
  </details>;
}
