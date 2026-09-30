"use client";

import { ArrowUpRight, Bookmark, Download, Search } from "lucide-react";
import { useState } from "react";
import type { BriefLibraryEntry } from "@/lib/brief-checkpoints";
import { formatBriefDate } from "@/lib/pit-wall-presentation";
import styles from "./brief-library.module.css";

export function BriefLibrary({ entries, activeKey, onOpen, onExport, onExportAll }: {
  entries: BriefLibraryEntry[]; activeKey: string;
  onOpen: (entry: BriefLibraryEntry) => void; onExport: (entry: BriefLibraryEntry) => void;
  onExportAll: () => void;
}) {
  const [query, setQuery] = useState("");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = entries.filter((entry) => {
    const text = `${entry.label} ${entry.season} ${entry.record.brief.selectionMethod === "nim" ? "NVIDIA ordered" : "Snapshot order"}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  return <details className={styles.library}>
    <summary><Bookmark size={14} /> Saved briefs <span>{entries.length} in this tab</span></summary>
    <div className={styles.body}>
      <p>Return to a checkpoint with its original driver, mode and evidence. Newest snapshots first. Reloading the page clears this library.</p>
      {entries.length > 0 ? <>
        <div className={styles.pack}>
          <button type="button" onClick={onExportAll}><Download size={14} /> Export all briefs ({entries.length})</button>
          <span>One text pack, including briefs outside this search. Offline reading only.</span>
        </div>
        <label className={styles.search}><Search size={15} /><input aria-label="Search saved briefs" placeholder="Find a driver or briefing mode…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className={styles.results} role="status">{results.length} of {entries.length} saved briefs</div>
        <ul className={styles.list}>{results.map((entry) => <li key={entry.key}>
          <div className={styles.description}><strong>{entry.label}</strong>
            <span>{entry.record.brief.selectionMethod === "nim" ? "NVIDIA ordered" : "Snapshot order · no AI"} · {entry.season}</span>
            <time dateTime={entry.record.brief.snapshotGeneratedAt}>{formatBriefDate(entry.record.brief.snapshotGeneratedAt)}</time>
            {entry.unavailableReason && <span className={styles.warning}>{entry.unavailableReason}</span>}
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => onOpen(entry)} disabled={Boolean(entry.unavailableReason) || entry.key === activeKey} aria-label={`Open saved ${entry.label}`}>
              {entry.key === activeKey ? "Viewing" : "Open"}<ArrowUpRight size={14} />
            </button>
            <button type="button" onClick={() => onExport(entry)} aria-label={`Export saved ${entry.label}`}><Download size={14} /><span>Export</span></button>
          </div>
        </li>)}</ul>
        {!results.length && <div className={styles.empty}>No matching saved briefs. <button type="button" onClick={() => setQuery("")}>Clear search</button></div>}
      </> : <div className={styles.empty}>Choose <strong>Keep brief</strong> above to save your first checkpoint. NVIDIA-ordered results are kept automatically.</div>}
    </div>
  </details>;
}
