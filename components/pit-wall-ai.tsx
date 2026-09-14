"use client";

import { Check, Copy, Download, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPitWallEvidence, type PitWallBrief, type PitWallEvidence, type PitWallMode } from "@/lib/pit-wall-ai";
import { buildSnapshotBrief, scopePitWallEvidence } from "@/lib/pit-wall-selection";
import { buildBriefText, type BriefRecord } from "@/lib/pit-wall-export";
import { briefTextParts, formatBriefDate } from "@/lib/pit-wall-presentation";
import type { DashboardData, DriverInsight } from "@/lib/types";
import styles from "./pit-wall-ai.module.css";

const MODES: Array<{ id: PitWallMode; label: string }> = [
  { id: "race-brief", label: "Race brief" },
  { id: "driver-focus", label: "Driver focus" },
  { id: "weekend-outlook", label: "Weekend outlook" },
];
type NimStatus = { enabled: boolean; model: string; requestTimeoutMs: number };

function ReadableText({ value, timeZone }: { value: string; timeZone: string }) {
  return briefTextParts(value, timeZone).map((part, index) => part.dateTime
    ? <time key={index} dateTime={part.dateTime} title={part.dateTime}>{part.text}</time>
    : <span key={index}>{part.text}</span>);
}

function Receipt({ item }: { item: PitWallEvidence }) {
  return <details className={styles.receipt}>
    <summary>View source <span>{item.ref}</span></summary>
    <div><strong>{item.source}</strong><p>{item.context ?? "Context unavailable"}</p><p>{item.fact}</p></div>
  </details>;
}

export function PitWallAiPanel({ dashboard, selectedDriver, onSelectDriver }: {
  dashboard: DashboardData; selectedDriver: DriverInsight | null; onSelectDriver: (driverId: string) => void;
}) {
  const [mode, setMode] = useState<PitWallMode>("race-brief");
  const [status, setStatus] = useState<NimStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [records, setRecords] = useState<Partial<Record<PitWallMode, BriefRecord>>>({});
  const [loadingMode, setLoadingMode] = useState<PitWallMode | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<PitWallMode, string>>>({});
  const [copyState, setCopyState] = useState("idle");
  const [query, setQuery] = useState("");
  const [{ zone: timeZone, local: localTime }, setTimeDisplay] = useState({ zone: "UTC", local: false });
  const [evidenceKind, setEvidenceKind] = useState("all");
  const request = useRef<AbortController | null>(null);
  const evidence = useMemo(() => buildPitWallEvidence(dashboard, selectedDriver), [dashboard, selectedDriver]);
  const scoped = useMemo(() => scopePitWallEvidence(evidence, mode), [evidence, mode]);
  const snapshot = useMemo(() => buildSnapshotBrief(scoped, mode, dashboard.generatedAt), [scoped, mode, dashboard.generatedAt]);
  const record = records[mode] ?? (snapshot ? { brief: snapshot, evidence: scoped } : null);
  const brief = record?.brief;
  const current = !record || (record.brief.snapshotGeneratedAt === dashboard.generatedAt
    && JSON.stringify(record.evidence) === JSON.stringify(scoped));
  const receipts = record?.evidence ?? scoped;
  const byRef = new Map(receipts.map((item) => [item.ref, item]));
  const visibleEvidence = receipts.filter((item) => (evidenceKind === "all" || item.kind === evidenceKind) &&
    `${item.label} ${item.kind} ${item.fact} ${item.context ?? ""} ${item.source}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/ai-brief", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        const nextStatus = await response.json() as NimStatus;
        if (active) { setStatus(nextStatus); setStatusError(false); }
      }).catch(() => { if (active) setStatusError(true); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); request.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!loadingMode) return;
    const started = Date.now();
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [loadingMode]);

  async function refine() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const requestMode = mode;
    const submittedEvidence = scoped;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); },
      Math.min(status?.requestTimeoutMs ?? 45_000, 45_000) + 5_000);
    setLoadingMode(requestMode);
    setElapsed(0);
    setErrors((previous) => ({ ...previous, [requestMode]: undefined }));
    try {
      const response = await fetch("/api/ai-brief", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ mode: requestMode, snapshotGeneratedAt: dashboard.generatedAt, evidence: submittedEvidence }),
      });
      const payload = await response.json() as PitWallBrief & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "NVIDIA could not refine this brief.");
      if (controller.signal.aborted) return;
      setRecords((previous) => ({ ...previous, [requestMode]: { brief: payload, evidence: submittedEvidence } }));
      setCopyState("idle");
    } catch (reason) {
      const message = controller.signal.aborted
        ? timedOut ? "NVIDIA took too long. Your existing brief is still available." : "Refinement cancelled. Your existing brief is unchanged."
        : `${reason instanceof Error ? reason.message : "NVIDIA is unavailable."} Your existing brief is unchanged.`;
      setErrors((previous) => ({ ...previous, [requestMode]: message }));
    } finally {
      window.clearTimeout(timeout);
      request.current = null;
      setLoadingMode(null);
    }
  }

  async function copyBrief() {
    if (!record) return;
    try { await navigator.clipboard.writeText(buildBriefText(mode, record)); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  }

  function downloadBrief() {
    if (!record) return;
    const url = URL.createObjectURL(new Blob([buildBriefText(mode, record)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pit-wall-${mode}-${record.brief.snapshotGeneratedAt.slice(0, 10)}.txt`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <section className={styles.panel} aria-labelledby="pit-wall-title">
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>Race intelligence / Pit wall</div>
        <h2 id="pit-wall-title">Your next read.</h2>
        <p>Schedule, performance and context. Every fact, with its source.</p>
      </div>
      <div className={styles.actions}>
        <button onClick={() => void copyBrief()} disabled={!record} aria-label="Copy brief">
          {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}
          {copyState === "copied" ? "Copied" : "Copy"}
        </button>
        <button onClick={downloadBrief} disabled={!record}><Download size={15} /> Export</button>
      </div>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.modes} role="group" aria-label="Briefing mode">
        {MODES.map((option) => <button key={option.id} aria-pressed={option.id === mode}
          onClick={() => { setMode(option.id); setQuery(""); setEvidenceKind("all"); setCopyState("idle"); }}>{option.label}</button>)}
      </div>
      <span className={styles.provenance}>{brief?.selectionMethod === "nim" ? "NVIDIA ordered" : "Snapshot order · no AI"}</span>
    </div>
    <div className={styles.contextBar}>
      {mode === "driver-focus" ? <label className={styles.driverPicker}>Following
        <select aria-label="Briefing driver" value={selectedDriver?.id ?? ""} onChange={(event) => onSelectDriver(event.target.value)}>
          {!selectedDriver && <option value="" disabled>Select a driver</option>}
          {dashboard.standings.map((driver) => <option value={driver.id} key={driver.id}>{driver.fullName} · {driver.abbreviation}</option>)}
        </select>
      </label> : <span>Dates shown in {timeZone}</span>}
      <button aria-label="Show briefing dates in local time" aria-pressed={localTime}
        onClick={() => setTimeDisplay({ zone: localTime ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone, local: !localTime })}>
        {localTime ? "Use UTC" : "Use local time"}
      </button>
    </div>
    {mode === "driver-focus" && !scoped.some((item) => item.kind === "timing") && <p className={styles.modeNote}>No timing record for {selectedDriver?.fullName ?? "the selected driver"} in this snapshot. Available standings, strategy and session evidence remain below.</p>}
    {!current && <div className={styles.notice} role="status">The dashboard or selected driver has changed. This saved brief uses an earlier snapshot.
      <button onClick={() => setRecords((previous) => ({ ...previous, [mode]: undefined }))}>Use current snapshot</button>
    </div>}
    <div className={styles.cards} key={`${mode}-${brief?.generatedAt}-${brief?.selectionMethod}`}>
      {brief?.findings.map((finding, index) => {
        const item = byRef.get(finding.evidenceRefs[0]);
        return <article className={styles.card} key={finding.evidenceRefs[0]}>
          <div className={styles.cardTop}><span className={styles.number}>0{index + 1}</span><span>{item?.kind ?? "Evidence"}</span></div>
          <h3>{finding.label}</h3>
          <p className={styles.context}><ReadableText value={finding.context ?? "Context unavailable"} timeZone={timeZone} /></p>
          <p className={styles.fact}><ReadableText value={finding.insight} timeZone={timeZone} /></p>
          {item && <Receipt item={item} />}
        </article>;
      })}
    </div>
    {!brief && <p className={styles.notice}>No usable facts in this snapshot. Check the dashboard data sources and refresh.</p>}
    <div className={styles.refinement}>
      <div><strong><Sparkles size={15} /> A second reading, with NVIDIA</strong>
        <p>AI prioritizes the supplied records. Facts and event context stay unchanged.</p>
        <span>{statusError ? "Provider status unavailable" : status?.enabled ? "NIM configured · availability checked on request" : status ? "NIM not configured · snapshot brief available" : "Checking NIM configuration…"}</span>
      </div>
      {loadingMode ? <div className={styles.loading}>
        <span role="status"><LoaderCircle size={15} className={styles.spinner} /> {MODES.find((item) => item.id === loadingMode)?.label} · {elapsed}s</span>
        <button onClick={() => request.current?.abort()}><X size={14} /> Cancel</button>
      </div> : <button className={styles.primary} disabled={status?.enabled !== true || scoped.length < 2 || !brief} onClick={() => void refine()}>
        <Sparkles size={15} /> {errors[mode] ? "Retry with NVIDIA" : "Prioritize with NVIDIA"}
      </button>}
    </div>
    {errors[mode] && <p className={styles.notice} role="status">{errors[mode]}</p>}
    {copyState === "failed" && <p className={styles.notice} role="status">Clipboard unavailable. Export the brief instead.</p>}
    <details className={styles.explorer} key={`sources-${mode}`}>
      <summary>Explore the evidence <span>{receipts.length} records</span></summary>
      <div className={styles.search}><Search size={16} /><input aria-label="Search briefing evidence" placeholder="Search driver, circuit, weather or source…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className={styles.filters} role="group" aria-label="Evidence category">
        {["all", ...new Set(receipts.map((item) => item.kind))].map((kind) => <button key={kind} aria-pressed={evidenceKind === kind} onClick={() => setEvidenceKind(kind)}>{kind}</button>)}
      </div>
      <p className={styles.resultCount} role="status">{visibleEvidence.length} of {receipts.length} records</p>
      <div className={styles.evidenceList}>{visibleEvidence.map((item) => <div key={item.ref}>
        <span className={styles.eyebrow}>{item.kind}</span><h4>{item.label}</h4><Receipt item={item} />
      </div>)}</div>
      {!visibleEvidence.length && <div className={styles.modeNote}>No matching evidence. <button onClick={() => { setQuery(""); setEvidenceKind("all"); }}>Clear filters</button></div>}
    </details>
    <footer className={styles.footer}>
      <span>Snapshot <time dateTime={brief?.snapshotGeneratedAt ?? dashboard.generatedAt}>{formatBriefDate(brief?.snapshotGeneratedAt ?? dashboard.generatedAt, timeZone)}</time></span>
      <span>Feed accuracy and freshness depend on upstream sources.</span>
    </footer>
  </section>;
}
