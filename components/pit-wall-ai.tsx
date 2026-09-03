"use client";

import { BrainCircuit, CheckCircle2, Gauge, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildPitWallEvidence,
  type PitWallBrief,
  type PitWallMode,
} from "@/lib/pit-wall-ai";
import type { DashboardData, DriverInsight } from "@/lib/types";

const MODES: Array<{ id: PitWallMode; label: string; detail: string }> = [
  { id: "race-brief", label: "Race brief", detail: "Priority read" },
  { id: "driver-focus", label: "Driver focus", detail: "Selected driver" },
  { id: "weekend-outlook", label: "Weekend outlook", detail: "Schedule + weather" },
];

type NimStatus = {
  enabled: boolean;
  model: string;
  provider: string;
  deployment: string;
};

type ErrorPayload = {
  message?: string;
};

function shortModelName(model: string) {
  return model.split("/").pop()?.replace(/-/g, " ") ?? model;
}

export function PitWallAiPanel({
  dashboard,
  selectedDriver,
}: {
  dashboard: DashboardData;
  selectedDriver: DriverInsight | null;
}) {
  const [mode, setMode] = useState<PitWallMode>("race-brief");
  const [status, setStatus] = useState<NimStatus | null>(null);
  const [brief, setBrief] = useState<PitWallBrief | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evidence = useMemo(
    () => buildPitWallEvidence(dashboard, selectedDriver),
    [dashboard, selectedDriver],
  );
  const evidenceByRef = useMemo(
    () => new Map(evidence.map((item) => [item.ref, item])),
    [evidence],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai-brief", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("NIM status is unavailable.");
        }
        return (await response.json()) as NimStatus;
      })
      .then(setStatus)
      .catch((reason: unknown) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setError("NIM status is unavailable.");
        }
      });

    return () => controller.abort();
  }, []);

  const generateBrief = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          snapshotGeneratedAt: dashboard.generatedAt,
          evidence,
        }),
      });
      const payload = (await response.json()) as PitWallBrief | ErrorPayload;

      if (!response.ok) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "Pit Wall AI could not build this brief.",
        );
      }

      setBrief(payload as PitWallBrief);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Pit Wall AI could not build this brief.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="glass-panel carbon-accent relative overflow-hidden rounded-[14px] p-3.5 sm:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--team-accent)] via-[#76b900] to-transparent" />
      <div className="relative grid gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Pit Wall AI</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#76b900]/25 bg-[#76b900]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4f7d00]">
              <Sparkles size={11} /> NVIDIA NIM
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${status?.enabled ? "border-[#00a76f]/20 bg-[#00a76f]/10 text-[#007a55]" : "border-black/8 bg-black/5 text-[var(--muted)]"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status?.enabled ? "bg-[#00a76f]" : "bg-[var(--muted)]"}`} />
              {status?.enabled ? "Ready" : status ? "Setup needed" : "Checking"}
            </span>
          </div>

          <h2 className="section-title mt-3 max-w-xl text-[1.7rem] font-semibold sm:text-[2.2rem]">
            Turn the current snapshot into a decision brief.
          </h2>
          <p className="section-copy mt-3 max-w-xl text-sm">
            On-demand synthesis grounded only in the dashboard&apos;s evidence ledger. Every AI finding keeps its source references attached.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {MODES.map((option) => {
              const selected = option.id === mode;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMode(option.id)}
                  className={`flex items-center justify-between rounded-[14px] border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--team-accent)] ${selected ? "border-[var(--team-accent)] bg-[var(--team-accent-wash)]" : "border-black/8 bg-white/45 hover:border-[var(--team-accent)]"}`}
                >
                  <span>
                    <span className="block text-xs font-semibold text-[var(--foreground)]">{option.label}</span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">{option.detail}</span>
                  </span>
                  {selected ? <CheckCircle2 size={15} className="text-[var(--team-accent)]" /> : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void generateBrief()}
            disabled={isLoading || status?.enabled !== true}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--foreground)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--background)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--team-accent)]"
          >
            {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : <BrainCircuit size={15} />}
            {isLoading
              ? "Building brief"
              : status?.enabled
                ? "Generate pit wall brief"
                : error
                  ? "NIM unavailable"
                  : status
                    ? "Configure NIM to generate"
                    : "Checking NIM"}
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <span>{evidence.length} evidence records</span>
            <span>Server-side key</span>
            <span>No model claims stored</span>
          </div>
        </div>

        <div className="minimal-card min-h-[330px] rounded-[20px] p-4 sm:rounded-[22px] sm:p-5">
          {brief ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/8 pb-4">
                <div className="min-w-0">
                  <div className="eyebrow">Generated readout</div>
                  <h3 className="section-title mt-2 text-xl font-semibold sm:text-[1.65rem]">{brief.headline}</h3>
                </div>
                <span className="telemetry-text rounded-full bg-black/5 px-2.5 py-1 text-[10px] text-[var(--muted)]">
                  {shortModelName(brief.model)}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--foreground)]">{brief.readout}</p>
              <div className="mt-4 grid gap-2.5">
                {brief.findings.map((finding, index) => (
                  <div key={`${finding.label}-${index}`} className="rounded-[14px] border border-black/7 bg-white/55 p-3">
                    <div className="flex items-center gap-2">
                      <span className="telemetry-text text-[10px] font-semibold text-[var(--team-accent)]">0{index + 1}</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--foreground)]">{finding.label}</span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-[var(--muted)]">{finding.insight}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {finding.evidenceRefs.map((ref) => {
                        const item = evidenceByRef.get(ref);
                        return (
                          <span
                            key={`${finding.label}-${ref}`}
                            title={item ? `${item.source}: ${item.fact}` : ref}
                            className="rounded-full border border-[#76b900]/20 bg-[#76b900]/8 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#4f7d00]"
                          >
                            {ref}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {brief.watchNext.length ? (
                <div className="mt-4 border-t border-black/8 pt-4">
                  <div className="eyebrow">Watch next</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {brief.watchNext.map((item) => (
                      <span key={item} className="rounded-full bg-black/5 px-3 py-1.5 text-[11px] text-[var(--foreground)]">{item}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {error ? (
                <div role="alert" className="mt-4 rounded-[14px] border border-[#e10600]/18 bg-[#e10600]/8 px-3 py-2.5 text-xs leading-5 text-[#a60000]">
                  {error} The previous successful brief remains visible.
                </div>
              ) : null}
              <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">{brief.caveat}</p>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-between gap-6">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[var(--team-accent-wash)] text-[var(--team-accent)]">
                    <Gauge size={18} />
                  </span>
                  <span className="telemetry-text text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">On demand / no cache</span>
                </div>
                <div className="section-title mt-6 text-xl font-semibold">A brief with receipts, not vibes.</div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  NIM receives a compact snapshot of schedule, weather, timing, standings, strategy, and sourced coverage. Unsupported citations are rejected before the result reaches this panel.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-[14px] border border-black/7 bg-white/55 p-3">
                  <BrainCircuit size={15} className="text-[var(--team-accent)]" />
                  <div className="mt-3 text-xs font-semibold">Synthesize</div>
                  <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">Compress the noisy snapshot.</div>
                </div>
                <div className="rounded-[14px] border border-black/7 bg-white/55 p-3">
                  <ShieldCheck size={15} className="text-[#00a76f]" />
                  <div className="mt-3 text-xs font-semibold">Ground</div>
                  <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">Require valid evidence refs.</div>
                </div>
                <div className="rounded-[14px] border border-black/7 bg-white/55 p-3">
                  <Sparkles size={15} className="text-[#76b900]" />
                  <div className="mt-3 text-xs font-semibold">Focus</div>
                  <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">Surface what changes the read.</div>
                </div>
              </div>
              {error ? (
                <div role="alert" className="rounded-[14px] border border-[#e10600]/18 bg-[#e10600]/8 px-3 py-2.5 text-xs leading-5 text-[#a60000]">
                  {error}
                </div>
              ) : status?.enabled === false ? (
                <div className="rounded-[14px] border border-black/8 bg-black/4 px-3 py-2.5 text-xs leading-5 text-[var(--muted)]">
                  Add <code className="telemetry-text text-[var(--foreground)]">NVIDIA_API_KEY</code> on the server, or point <code className="telemetry-text text-[var(--foreground)]">NVIDIA_NIM_BASE_URL</code> at a self-hosted NIM.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
