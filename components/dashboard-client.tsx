"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Flag,
  Gauge,
  Map as MapIcon,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { DashboardData, DriverInsight, SessionSummary } from "@/lib/types";

function rgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatSessionDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(new Date(date));
}

function formatTrackDate(date: string, gmtOffset: string) {
  const utcDate = new Date(date);
  const sign = gmtOffset.startsWith("-") ? -1 : 1;
  const [rawHours, rawMinutes] = gmtOffset
    .replace("-", "")
    .replace("+", "")
    .split(":")
    .map(Number);
  const offsetMinutes = sign * (rawHours * 60 + rawMinutes);
  const trackTime = new Date(utcDate.getTime() + offsetMinutes * 60_000);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(trackTime);
}

function useCountdown(target: string | null, initialNow: number) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [initialNow]);

  if (!target) {
    return null;
  }

  const distance = Math.max(0, new Date(target).getTime() - now);
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  const seconds = Math.floor((distance % 60_000) / 1_000);

  return { days, hours, minutes, seconds };
}

function useRelativeTime(timestamp: number, initialNow: number) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [initialNow]);

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));

  if (seconds < 10) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function useVisibilityRefresh(refetch: () => Promise<unknown>) {
  useEffect(() => {
    let timer: number | null = null;

    const run = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refetch();
      }
    };

    const start = () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }

      if (document.visibilityState === "visible") {
        timer = window.setInterval(run, 30_000);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
      }
      start();
    };

    const handleOnline = () => run();

    start();
    window.addEventListener("focus", handleOnline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
      window.removeEventListener("focus", handleOnline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refetch]);
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

function buildThemeStyle(accent: string): CSSProperties {
  return {
    ["--team-accent" as string]: `#${accent}`,
    ["--team-accent-soft" as string]: rgba(accent, 0.14),
    ["--team-accent-wash" as string]: rgba(accent, 0.06),
  };
}

function Panel({
  className,
  children,
  tint,
}: {
  className?: string;
  children: ReactNode;
  tint?: string;
}) {
  return (
    <section
      className={`glass-panel rounded-[22px] p-3.5 sm:rounded-[28px] sm:p-5 ${className ?? ""}`}
      style={tint ? { ["--team-tint" as string]: tint } : undefined}
    >
      {children}
    </section>
  );
}

function FunBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "accent" | "dark";
}) {
  const className =
    tone === "accent"
      ? "bg-[var(--team-accent-soft)] text-[var(--team-accent)] border-[rgba(225,6,0,0.16)]"
      : tone === "dark"
        ? "bg-[rgba(17,21,29,0.08)] text-[var(--foreground)] border-[rgba(17,21,29,0.1)]"
        : "bg-white/76 text-[var(--muted)] border-[rgba(17,21,29,0.08)]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${className}`}
    >
      {label}
    </span>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="glass-pill rounded-[18px] px-4 py-3"
      style={
        accent
          ? {
              background: `linear-gradient(180deg, ${rgba(accent, 0.12)}, rgba(255,255,255,0.04))`,
              borderColor: rgba(accent, 0.24),
            }
          : undefined
      }
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
      <div className="telemetry-text mt-1 text-base font-semibold text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-pill flex items-center justify-between rounded-[18px] px-4 py-3">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        {icon}
        <span className="text-xs uppercase tracking-[0.16em]">{label}</span>
      </div>
      <span className="text-sm font-medium text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function Sparkline({
  values,
  stroke,
  fill,
  dots,
  height = 160,
}: {
  values: number[];
  stroke: string;
  fill?: string;
  dots?: { color: string; index: number }[];
  height?: number;
}) {
  if (!values.length) {
    return <div className="h-full rounded-[18px] bg-black/3" />;
  }

  const width = 560;
  const padding = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const toPoint = (value: number, index: number) => {
    const x =
      padding +
      (index / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((value - min) / range) * (height - padding * 2);
    return { x, y };
  };

  const points = values.map((value, index) => toPoint(value, index));
  const areaPoints = [
    `${padding},${height - padding}`,
    ...points.map((point) => `${point.x},${point.y}`),
    `${width - padding},${height - padding}`,
  ].join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {fill ? <polygon points={areaPoints} fill={fill} /> : null}
      <polyline
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dots?.map((dot) => {
        const point = points[dot.index];
        if (!point) {
          return null;
        }

        return (
          <g key={`${dot.index}-${dot.color}`}>
            <circle cx={point.x} cy={point.y} r="6" fill="white" opacity="0.92" />
            <circle cx={point.x} cy={point.y} r="3.8" fill={dot.color} />
          </g>
        );
      })}
    </svg>
  );
}

function TelemetryPlot({
  samples,
  accent,
  activeIndex,
}: {
  samples: DashboardData["telemetrySamples"];
  accent: string;
  activeIndex: number;
}) {
  if (!samples.length) {
    return <div className="h-full rounded-[18px] bg-black/3" />;
  }

  const width = 620;
  const height = 240;
  const padding = 14;

  const buildPoints = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);

    return values.map((value, index) => {
      const x =
        padding +
        (index / Math.max(1, values.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((value - min) / range) * (height - padding * 2);
      return { x, y };
    });
  };

  const speed = buildPoints(samples.map((sample) => sample.speed));
  const throttle = buildPoints(samples.map((sample) => sample.throttle));
  const brake = buildPoints(samples.map((sample) => sample.brake));
  const activePoint = speed[Math.min(activeIndex, speed.length - 1)];
  const segmentWidth = (width - padding * 2) / Math.max(1, samples.length - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      {samples.map((sample, index) => {
        const tone = getPhaseTone(sample.phase);
        const x = padding + index * segmentWidth - segmentWidth / 2;

        return (
          <rect
            key={`phase-${sample.index}`}
            x={Math.max(padding, x)}
            y={height - 20}
            width={Math.max(4, segmentWidth)}
            height="8"
            rx="4"
            fill={tone.wash}
          />
        );
      })}
      <line
        x1={activePoint.x}
        x2={activePoint.x}
        y1={10}
        y2={height - 10}
        stroke="rgba(17,21,29,0.12)"
        strokeDasharray="4 4"
      />
      <polyline
        points={speed.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={rgba(accent, 0.96)}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={throttle.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke="rgba(225, 6, 0, 0.82)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={brake.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke="rgba(18, 21, 29, 0.42)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={activePoint.x} cy={activePoint.y} r="5.5" fill={`#${accent}`} />
      <circle cx={activePoint.x} cy={activePoint.y} r="10" fill={rgba(accent, 0.14)} />
    </svg>
  );
}

function getLapTone(value: number, best: number) {
  if (value <= best + 0.02) {
    return { label: "Session best", color: "#8f49ff" };
  }

  if (value <= best + 0.28) {
    return { label: "Personal green", color: "#00a76f" };
  }

  return { label: "Off pace", color: "#d5a125" };
}

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, index));
}

function formatDeltaSpeed(value: number) {
  if (Math.abs(value) < 0.5) {
    return "0 km/h";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(0)} km/h`;
}

function getPhaseTone(phase: DashboardData["telemetrySamples"][number]["phase"]) {
  if (phase === "push") {
    return {
      label: "Push",
      color: "#00a76f",
      wash: "rgba(0, 167, 111, 0.12)",
    };
  }

  if (phase === "brake") {
    return {
      label: "Brake",
      color: "#e10600",
      wash: "rgba(225, 6, 0, 0.12)",
    };
  }

  return {
    label: "Coast",
    color: "#d5a125",
    wash: "rgba(213, 161, 37, 0.12)",
  };
}

function getFeedTone(status: DashboardData["sources"]["schedule"]["status"]) {
  if (status === "live") {
    return { label: "Live", className: "text-[#00a76f] bg-[#00a76f]/10 border-[#00a76f]/20" };
  }

  if (status === "cached") {
    return { label: "Cached", className: "text-[#0066cc] bg-[#0066cc]/10 border-[#0066cc]/20" };
  }

  if (status === "fallback") {
    return { label: "Fallback", className: "text-[#c46f00] bg-[#c46f00]/10 border-[#c46f00]/20" };
  }

  return { label: "Empty", className: "text-[var(--muted)] bg-black/5 border-black/10" };
}

function HeaderHero({
  dashboard,
  selectedDriver,
  freshness,
  snapshotNow,
}: {
  dashboard: DashboardData;
  selectedDriver: DriverInsight | null;
  freshness: string;
  snapshotNow: number;
}) {
  const countdown = useCountdown(dashboard.nextSession?.dateStart ?? null, snapshotNow);
  const sessionStack = dashboard.nextSessions.slice(0, 3);
  const scheduleTone = getFeedTone(dashboard.sources.schedule.status);

  return (
    <Panel
      className="signal-sheen relative overflow-hidden"
      tint="var(--team-accent-soft)"
    >
      <div className="race-stripe pointer-events-none absolute inset-x-4 top-0 h-1.5 rounded-b-full sm:inset-x-5" />
      <div className="pointer-events-none absolute right-4 top-4 hidden h-28 w-28 rounded-full bg-[radial-gradient(circle,var(--team-accent-soft),transparent_70%)] sm:block" />
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-[var(--foreground)]">
              <Sparkles size={14} />
              F1 Command Center
            </span>
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--team-accent)] pulse-dot" />
              refreshed {freshness}
            </span>
            <FunBadge label="Pit wall mode" tone="accent" />
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${scheduleTone.className}`}
            >
              {scheduleTone.label} schedule
            </span>
          </div>

          <div className="max-w-4xl">
            <div className="eyebrow">Next session</div>
            <div className="section-title mt-2 max-w-3xl text-[1.95rem] leading-[0.94] font-semibold sm:text-[3.65rem]">
              {dashboard.nextSession
                ? `${dashboard.nextSession.circuitName} ${dashboard.nextSession.sessionName}`
                : "Awaiting the next active session"}
            </div>
            <div className="section-copy mt-3 max-w-2xl text-[13px] sm:text-sm">
              {dashboard.nextSession
                ? `${dashboard.nextSession.location}, ${dashboard.nextSession.countryName}. The live tier stays docked while the performance tier lets you correlate lap pace, throttle, brake, and track position in one pass.`
                : "The dashboard refreshes in the background and will surface the next published session automatically."}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <span className="glass-pill rounded-full px-2.5 py-1">
                {dashboard.sources.schedule.source}
              </span>
              <span className="glass-pill rounded-full px-2.5 py-1">
                {dashboard.sources.telemetry.source}
              </span>
              <span className="glass-pill rounded-full px-2.5 py-1">
                {dashboard.sources.fantasy.source}
              </span>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="minimal-card team-tint rounded-[18px] px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="eyebrow">Driver focus</div>
                <FunBadge label="Hot lap" tone="dark" />
              </div>
              <div className="section-title mt-2 text-[1.1rem] font-semibold sm:text-2xl">
                {selectedDriver ? selectedDriver.fullName : "No driver selected"}
              </div>
              <div className="section-copy mt-1 text-[13px] sm:text-sm">
                {selectedDriver
                  ? `${selectedDriver.teamName} | ${selectedDriver.points} championship points`
                  : "Select a driver in the timing tower"}
              </div>
            </div>

            <div className="minimal-card rounded-[18px] px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="eyebrow">Weekend stack</div>
                <FunBadge label={`${sessionStack.length || 0} sessions`} />
              </div>
              <div className="mt-2 grid gap-2.5">
                {sessionStack.length ? (
                  sessionStack.map((session) => (
                    <div
                      key={session.sessionKey}
                      className="flex items-center justify-between gap-3 text-[13px] sm:text-sm"
                    >
                      <span className="font-medium text-[var(--foreground)]">
                        {session.sessionName}
                      </span>
                      <span className="text-[12px] text-[var(--muted)]">
                        {formatSessionDate(session.dateStart, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="section-copy text-[13px] sm:text-sm">
                    Upcoming session blocks will appear here.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {countdown ? (
              [
                ["Days", countdown.days],
                ["Hours", countdown.hours],
                ["Minutes", countdown.minutes],
                ["Seconds", countdown.seconds],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="minimal-card rounded-[18px] px-3.5 py-3.5 sm:rounded-[20px] sm:px-4 sm:py-4"
                >
                  <div className="telemetry-text text-[1.65rem] leading-none font-semibold tracking-[-0.05em] text-[var(--foreground)] sm:text-3xl">
                    {String(value).padStart(2, "0")}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] sm:text-[11px] sm:tracking-[0.18em]">
                    {label}
                  </div>
                </div>
              ))
            ) : (
              <div className="minimal-card rounded-[20px] px-4 py-4 text-sm text-[var(--muted)] sm:col-span-4">
                Countdown appears when the next session timing is available.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
            <div className="flex items-center justify-between">
              <div>
                <div className="eyebrow">Time sync</div>
                <div className="section-title mt-2 text-base font-semibold sm:text-xl">
                  {dashboard.nextSession ? "Local and circuit time" : "Schedule pending"}
                </div>
              </div>
              <Clock3 size={16} className="text-[var(--muted)]" />
            </div>
            {dashboard.nextSession ? (
              <div className="mt-4 grid gap-3">
                <StatChip
                  label="Your time"
                  value={formatSessionDate(dashboard.nextSession.dateStart)}
                />
                <StatChip
                  label={`Track UTC${dashboard.nextSession.gmtOffset.startsWith("-") ? "" : "+"}${dashboard.nextSession.gmtOffset.slice(0, 5)}`}
                  value={formatTrackDate(
                    dashboard.nextSession.dateStart,
                    dashboard.nextSession.gmtOffset,
                  )}
                  accent={selectedDriver?.teamColor}
                />
              </div>
            ) : (
              <div className="mt-4 text-sm text-[var(--muted)]">
                Circuit conversion will appear here.
              </div>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-1">
            <MiniStat
              icon={<Flag size={14} />}
              label="Leader"
              value={dashboard.standings[0]?.abbreviation ?? "--"}
            />
            <MiniStat
              icon={<Users size={14} />}
              label="Selected"
              value={selectedDriver?.abbreviation ?? "--"}
            />
            <MiniStat
              icon={<RefreshCw size={14} />}
              label="Live"
              value="30s"
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function PerformanceProfilePanel({
  driver,
}: {
  driver: DriverInsight | null;
}) {
  if (!driver) {
    return (
      <Panel className="text-[var(--muted)]">
        Select a driver from the timing tower to inspect their performance profile.
      </Panel>
    );
  }

  const accent = driver.teamColor;
  const bestLap = Math.min(...driver.paceSeries);
  const dots = driver.paceSeries.map((lap, index) => ({
    index,
    color: getLapTone(lap, bestLap).color,
  }));

  return (
    <Panel tint={rgba(accent, 0.1)}>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="minimal-card team-tint rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="flex items-start gap-4">
            <div
              className="relative h-18 w-18 overflow-hidden rounded-[18px] border border-black/8 bg-white sm:h-20 sm:w-20 sm:rounded-[20px]"
              style={{ boxShadow: `0 14px 28px ${rgba(accent, 0.12)}` }}
            >
              <Image
                src={driver.headshotUrl}
                alt={driver.fullName}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em]"
                  style={{
                    color: `#${accent}`,
                    background: rgba(accent, 0.12),
                  }}
                >
                  {driver.abbreviation}
                </div>
                <FunBadge
                  label={driver.sentiment.label}
                  tone={driver.sentiment.label === "Bullish" ? "accent" : "dark"}
                />
              </div>
              <div className="section-title mt-3 text-[1.55rem] leading-[0.98] font-semibold sm:text-[2.2rem]">
                {driver.fullName}
              </div>
              <div className="section-copy mt-1 text-[13px] sm:text-sm">
                #{driver.permanentNumber} | {driver.teamName}
              </div>
            </div>
          </div>

          <div className="accent-divider mt-4" />

          <div className="mt-4 grid gap-2.5 sm:gap-3">
            <StatChip
              label="Championship points"
              value={`${driver.points}`}
              accent={accent}
            />
            <StatChip label="Sentiment pulse" value={`${driver.sentiment.score}`} />
            <StatChip label="Career podiums" value={`${driver.totalPodiums}`} />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="eyebrow">Pace profile</div>
                  <FunBadge label="Sector coded" />
                </div>
                <div className="section-title mt-2 text-base font-semibold sm:text-xl">
                  Recent laps
                </div>
              </div>
              <Activity size={16} className="text-[var(--muted)]" />
            </div>
            <div className="mt-4 h-36 sm:h-44">
              <Sparkline
                values={driver.paceSeries}
                stroke={rgba(accent, 0.95)}
                fill={rgba(accent, 0.1)}
                dots={dots}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#8f49ff]" />
                Session best
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#00a76f]" />
                Personal green
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#d5a125]" />
                Slower
              </span>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
            {[
              { label: "Sector 1", value: driver.sectorAverages.sector1 },
              { label: "Sector 2", value: driver.sectorAverages.sector2 },
              { label: "Sector 3", value: driver.sectorAverages.sector3 },
            ].map(({ label, value }) => (
              <StatChip
                key={label}
                label={label}
                value={typeof value === "number" ? `${value.toFixed(3)}s` : "--"}
              />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TelemetryExperiencePanel({
  accent,
  driverLabel,
  insights,
  sourceMeta,
  samples,
  session,
  scrubIndex,
  onScrub,
}: {
  accent: string;
  driverLabel: string | null;
  insights: DashboardData["telemetryInsights"];
  sourceMeta: DashboardData["sources"]["telemetry"];
  samples: DashboardData["telemetrySamples"];
  session: SessionSummary | null;
  scrubIndex: number;
  onScrub: (index: number | null) => void;
}) {
  const activeIndex = clampIndex(scrubIndex, Math.max(1, samples.length) - 1);
  const activeSample = samples[activeIndex] ?? null;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const phaseTone = activeSample ? getPhaseTone(activeSample.phase) : null;
  const feedTone = getFeedTone(sourceMeta.status);

  const updateScrub = (clientX: number) => {
    if (!chartRef.current || !samples.length) {
      return;
    }

    const rect = chartRef.current.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const nextIndex = clampIndex(
      Math.round(ratio * (samples.length - 1)),
      samples.length,
    );
    onScrub(nextIndex);
  };

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    updateScrub(event.clientX);
  };

  const handleTouch = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (touch) {
      updateScrub(touch.clientX);
    }
  };

  const loadX = activeSample ? (activeSample.throttle - 50) / 50 : 0;
  const loadY = activeSample ? -(activeSample.brake / 100) : 0;

  return (
    <Panel className="xl:col-span-1" tint={rgba(accent, 0.08)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Telemetry</div>
            <FunBadge label="Scrub synced" tone="accent" />
            {phaseTone ? (
              <span
                className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]"
                style={{
                  borderColor: phaseTone.wash,
                  background: phaseTone.wash,
                  color: phaseTone.color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: phaseTone.color }}
                />
                {phaseTone.label}
              </span>
            ) : null}
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            {driverLabel ? `${driverLabel} live trace` : "Telemetry pending"}
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            {session
              ? `${session.circuitName} | ${formatSessionDate(session.dateStart, {
                  month: "short",
                  day: "numeric",
                })}`
              : "OpenF1 fastest-lap trace"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <FunBadge label="Telemetry hero" tone="dark" />
          <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            <Radio size={14} />
            /car_data
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${feedTone.className}`}
          >
            {feedTone.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip
          label="Peak speed"
          value={insights ? `${insights.peakSpeed} km/h` : "--"}
          accent={accent}
        />
        <StatChip
          label="Avg speed"
          value={insights ? `${insights.avgSpeed.toFixed(0)} km/h` : "--"}
        />
        <StatChip
          label="Full throttle"
          value={insights ? `${insights.fullThrottlePct.toFixed(0)}%` : "--"}
        />
        <StatChip
          label="Brake zones"
          value={insights ? `${insights.brakeEvents}` : "--"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div
          ref={chartRef}
          className="minimal-card signal-sheen rounded-[22px] p-4 select-none sm:cursor-crosshair"
          onPointerMove={handlePointer}
          onPointerEnter={handlePointer}
          onPointerLeave={() => onScrub(null)}
          onTouchMove={handleTouch}
          onTouchStart={handleTouch}
          onTouchEnd={() => onScrub(null)}
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: rgba(accent, 0.95) }}
                />
                Speed
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                Throttle
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--track)]/50" />
                Brake
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]/80 sm:ml-auto">
              drag or hover to sync the map
            </span>
          </div>
          <div className="mb-3 text-[11px] text-[var(--muted)]">{sourceMeta.note}</div>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div className="glass-pill rounded-[16px] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Scrub speed
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-[var(--foreground)]">
                {activeSample ? `${activeSample.speed} km/h` : "--"}
              </div>
            </div>
            <div className="glass-pill rounded-[16px] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Delta speed
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-[var(--foreground)]">
                {activeSample ? formatDeltaSpeed(activeSample.deltaSpeed) : "--"}
              </div>
            </div>
            <div className="glass-pill rounded-[16px] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Track phase
              </div>
              <div
                className="telemetry-text mt-1 text-sm font-semibold"
                style={{ color: phaseTone?.color ?? "var(--foreground)" }}
              >
                {phaseTone?.label ?? "--"}
              </div>
            </div>
          </div>
          <div className="h-[240px] sm:h-[290px]">
            <TelemetryPlot
              samples={samples}
              accent={accent}
              activeIndex={activeIndex}
            />
          </div>
        </div>

        <div className="minimal-card rounded-[22px] p-4">
          <div className="eyebrow">Load circle</div>
          <div className="section-title mt-2 text-base font-semibold">Pit wall metrics</div>
          <div className="mt-4 flex justify-center">
            <svg viewBox="0 0 180 180" className="h-36 w-36">
              <circle cx="90" cy="90" r="58" fill="none" stroke="rgba(17,21,29,0.08)" strokeWidth="10" />
              <circle cx="90" cy="90" r="38" fill="none" stroke="rgba(17,21,29,0.05)" strokeWidth="1" />
              <line x1="30" y1="90" x2="150" y2="90" stroke="rgba(17,21,29,0.08)" />
              <line x1="90" y1="30" x2="90" y2="150" stroke="rgba(17,21,29,0.08)" />
              <text x="90" y="22" textAnchor="middle" className="telemetry-text" fontSize="10" fill="rgba(65,74,90,0.86)">
                BRAKE
              </text>
              <text x="90" y="170" textAnchor="middle" className="telemetry-text" fontSize="10" fill="rgba(65,74,90,0.86)">
                THROTTLE
              </text>
              <circle
                cx={90 + loadX * 48}
                cy={90 + loadY * 48}
                r="10"
                fill={`#${accent}`}
              />
              <circle
                cx={90 + loadX * 48}
                cy={90 + loadY * 48}
                r="20"
                fill={rgba(accent, 0.12)}
              />
            </svg>
          </div>
          <div className="mt-3 grid gap-2">
            <MiniStat icon={<Gauge size={14} />} label="Gear" value={activeSample ? `${activeSample.gear}` : "--"} />
            <MiniStat icon={<TrendingUp size={14} />} label="Elapsed" value={activeSample ? `${activeSample.elapsed.toFixed(1)}s` : "--"} />
            <MiniStat
              icon={<Activity size={14} />}
              label="Commit"
              value={insights ? `${insights.commitmentScore}` : "--"}
            />
            <MiniStat
              icon={<Radio size={14} />}
              label="Attack"
              value={
                insights
                  ? `${insights.attackBalance > 0 ? "+" : ""}${insights.attackBalance.toFixed(0)}`
                  : "--"
              }
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function LiveActionDock({
  circuitName,
  cars,
  selectedDriver,
  insights,
  telemetrySamples,
  scrubIndex,
  drivers,
  selectedDriverId,
  onSelect,
}: {
  circuitName: string;
  cars: DashboardData["trackMap"]["cars"];
  selectedDriver: DriverInsight | null;
  insights: DashboardData["telemetryInsights"];
  telemetrySamples: DashboardData["telemetrySamples"];
  scrubIndex: number;
  drivers: DriverInsight[];
  selectedDriverId: string;
  onSelect: (driverId: string) => void;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const activeSample =
    telemetrySamples[clampIndex(scrubIndex, Math.max(1, telemetrySamples.length) - 1)] ?? null;
  const phaseTone = activeSample ? getPhaseTone(activeSample.phase) : null;
  const cornerMarkers = [
    { label: "T1", x: 104, y: 116 },
    { label: "T4", x: 254, y: 86 },
    { label: "T7", x: 452, y: 96 },
    { label: "T11", x: 342, y: 254 },
    { label: "T14", x: 154, y: 224 },
  ];
  const sectorMarkers = [
    { label: "S1", x: 140, y: 60 },
    { label: "S2", x: 476, y: 150 },
    { label: "S3", x: 228, y: 286 },
  ];
  const scrubProgress =
    telemetrySamples.length > 1
      ? clampIndex(scrubIndex, telemetrySamples.length) / (telemetrySamples.length - 1)
      : 0;
  const [scrubPoint, setScrubPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      setScrubPoint(null);
      return;
    }

    const length = path.getTotalLength();
    const point = path.getPointAtLength(length * (0.08 + scrubProgress * 0.84));
    setScrubPoint({ x: point.x, y: point.y });
  }, [scrubProgress]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || !cars.length) {
      return;
    }

    const length = path.getTotalLength();
    const nextPositions: Record<string, { x: number; y: number }> = {};

    cars.forEach((car, index) => {
      const progress = ((cars.length - index) / (cars.length + 1)) * 0.84 + 0.08;
      const point = path.getPointAtLength(length * progress);
      nextPositions[car.driverId] = { x: point.x, y: point.y };
    });

    setPositions(nextPositions);
  }, [cars]);

  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <Panel
        className="overflow-hidden"
        tint={selectedDriver ? rgba(selectedDriver.teamColor, 0.08) : undefined}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="eyebrow">Live action</div>
              <FunBadge label="Pinned tier" tone="accent" />
            </div>
            <div className="section-title mt-2 text-lg font-semibold sm:text-xl">
              Track map + timing tower
            </div>
          </div>
          <MapIcon size={16} className="text-[var(--muted)]" />
        </div>

        <div className="minimal-card signal-sheen mt-4 rounded-[22px] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">{circuitName}</div>
              <div className="text-[12px] text-[var(--muted)]">track synced with telemetry scrub</div>
            </div>
            <div className="flex items-center gap-2">
              {phaseTone ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]"
                  style={{
                    borderColor: phaseTone.wash,
                    background: phaseTone.wash,
                    color: phaseTone.color,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: phaseTone.color }}
                  />
                  {phaseTone.label}
                </span>
              ) : null}
              <FunBadge label="Sync on" tone="dark" />
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="glass-pill rounded-[14px] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Peak
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-[var(--foreground)]">
                {insights ? `${insights.peakSpeed}` : "--"}
              </div>
            </div>
            <div className="glass-pill rounded-[14px] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Top gear
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-[var(--foreground)]">
                {insights ? `${insights.topGearPct.toFixed(0)}%` : "--"}
              </div>
            </div>
            <div className="glass-pill rounded-[14px] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Gear shifts
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-[var(--foreground)]">
                {insights ? `${insights.gearChanges}` : "--"}
              </div>
            </div>
          </div>
          <svg viewBox="0 0 560 320" className="h-[196px] w-full sm:h-[220px]">
            <defs>
              <linearGradient id="trackStroke" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(20,24,31,0.74)" />
                <stop offset="100%" stopColor="rgba(20,24,31,0.18)" />
              </linearGradient>
            </defs>
            <path
              ref={pathRef}
              d="M56 182 C 76 86, 216 66, 270 112 S 454 184, 500 118 S 494 36, 390 58 S 212 236, 290 270 S 470 274, 484 218 S 328 138, 248 180 S 76 280, 56 182"
              fill="none"
              stroke="rgba(20,24,31,0.08)"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M56 182 C 76 86, 216 66, 270 112 S 454 184, 500 118 S 494 36, 390 58 S 212 236, 290 270 S 470 274, 484 218 S 328 138, 248 180 S 76 280, 56 182"
              fill="none"
              stroke="url(#trackStroke)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="66"
              y1="177"
              x2="66"
              y2="206"
              stroke="rgba(17,21,29,0.92)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="74"
              y1="177"
              x2="74"
              y2="206"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {sectorMarkers.map((sector) => (
              <g key={sector.label} transform={`translate(${sector.x}, ${sector.y})`}>
                <circle r="12" fill="rgba(255,255,255,0.92)" stroke="rgba(17,21,29,0.08)" />
                <text
                  textAnchor="middle"
                  y="4"
                  className="telemetry-text"
                  fill="rgba(17,21,29,0.86)"
                  fontSize="10"
                >
                  {sector.label}
                </text>
              </g>
            ))}
            {cornerMarkers.map((corner) => (
              <g key={corner.label} transform={`translate(${corner.x}, ${corner.y})`}>
                <circle r="9" fill="rgba(17,21,29,0.82)" />
                <text
                  textAnchor="middle"
                  y="3"
                  className="telemetry-text"
                  fill="white"
                  fontSize="8"
                >
                  {corner.label}
                </text>
              </g>
            ))}
            {cars.slice(0, 8).map((car) => {
              const point = positions[car.driverId];
              if (!point) {
                return null;
              }

              return (
                <g key={car.driverId} transform={`translate(${point.x}, ${point.y})`}>
                  <circle r="12" fill={rgba(car.teamColor, 0.16)} />
                  <circle r="7" fill={`#${car.teamColor}`} />
                  <text
                    y="-17"
                    textAnchor="middle"
                    className="telemetry-text"
                    fill="rgba(20,24,31,0.84)"
                    fontSize="10"
                  >
                    {car.abbreviation}
                  </text>
                </g>
              );
            })}
            {scrubPoint && selectedDriver ? (
              <g transform={`translate(${scrubPoint.x}, ${scrubPoint.y})`}>
                <circle
                  r="19"
                  fill={phaseTone ? phaseTone.wash : rgba(selectedDriver.teamColor, 0.14)}
                />
                <circle r="10" fill={`#${selectedDriver.teamColor}`} />
                <circle
                  r="27"
                  fill="none"
                  stroke={phaseTone ? phaseTone.color : rgba(selectedDriver.teamColor, 0.22)}
                  strokeWidth="2"
                  className="pulse-ring"
                />
                <text
                  y="-22"
                  textAnchor="middle"
                  className="telemetry-text"
                  fill={`#${selectedDriver.teamColor}`}
                  fontSize="11"
                >
                  {selectedDriver.abbreviation}
                </text>
              </g>
            ) : null}
          </svg>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span className="glass-pill rounded-full px-2.5 py-1">start / finish</span>
            <span className="glass-pill rounded-full px-2.5 py-1">sector split calls</span>
            <span className="glass-pill rounded-full px-2.5 py-1">corner tags</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="eyebrow">Timing tower</div>
            <div className="section-title mt-2 text-lg font-semibold">Driver rail</div>
          </div>
          <Users size={16} className="text-[var(--muted)]" />
        </div>

        <div className="timing-lane mt-4 grid gap-2">
          {drivers.map((driver) => {
            const active = selectedDriverId === driver.id;
            const podiumTone =
              driver.standingPosition === 1
                ? "1"
                : driver.standingPosition === 2
                  ? "2"
                  : driver.standingPosition === 3
                    ? "3"
                    : null;

            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => onSelect(driver.id)}
                className="text-left"
              >
                <div
                  className="group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border px-3 py-3 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    borderColor: active
                      ? rgba(driver.teamColor, 0.3)
                      : "rgba(20,24,31,0.08)",
                    background: active
                      ? `linear-gradient(90deg, ${rgba(driver.teamColor, 0.14)}, rgba(255,255,255,0.76))`
                      : "rgba(255,255,255,0.66)",
                    boxShadow: active
                      ? `0 14px 26px ${rgba(driver.teamColor, 0.12)}`
                      : "0 8px 18px rgba(17,21,29,0.04)",
                  }}
                >
                  <span
                    className="h-10 w-1.5 rounded-full"
                    style={{
                      background: active
                        ? `linear-gradient(180deg, #${driver.teamColor}, ${rgba(driver.teamColor, 0.2)})`
                        : "rgba(17,21,29,0.08)",
                    }}
                  />
                  <div className="flex w-9 flex-col items-center justify-center">
                    <div
                      className={`telemetry-text text-sm font-semibold ${
                        podiumTone === "1"
                          ? "text-[#c78b12]"
                          : podiumTone === "2"
                            ? "text-[#6d7682]"
                            : podiumTone === "3"
                              ? "text-[#a86432]"
                              : "text-[var(--foreground)]"
                      }`}
                    >
                      P{driver.standingPosition}
                    </div>
                    {podiumTone ? (
                      <span className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        podium
                      </span>
                    ) : null}
                  </div>
                  <div className="relative h-10 w-10 overflow-hidden rounded-[13px] border border-black/8 bg-white sm:h-11 sm:w-11 sm:rounded-[14px]">
                    <Image
                      src={driver.headshotUrl}
                      alt={driver.fullName}
                      fill
                      className="object-cover"
                      sizes="44px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[var(--foreground)] sm:text-sm">
                      {driver.fullName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs text-[var(--muted)]">
                        {driver.teamName}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-[var(--muted)]/40" />
                      <span className="text-[11px] text-[var(--muted)]">
                        {driver.points} pts
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]"
                      style={{
                        background: rgba(driver.teamColor, 0.12),
                        color: `#${driver.teamColor}`,
                      }}
                    >
                      {driver.abbreviation}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {driver.sentiment.label}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </aside>
  );
}

function FantasyActionPanel({
  fantasy,
  sourceMeta,
  watchlist,
  onToggleWatch,
}: {
  fantasy: DashboardData["fantasy"];
  sourceMeta: DashboardData["sources"]["fantasy"];
  watchlist: Set<string>;
  onToggleWatch: (driverId: string) => void;
}) {
  const feedTone = getFeedTone(sourceMeta.status);
  const renderTrend = (seed: number) => {
    const base = [0.22, 0.38, 0.31, 0.52, 0.78].map(
      (value, index) => value + seed * 0.04 - index * 0.01,
    );

    return (
      <svg viewBox="0 0 54 20" className="h-5 w-[54px]">
        <polyline
          points={base
            .map((value, index) => `${index * 13.5},${18 - value * 14}`)
            .join(" ")}
          fill="none"
          stroke="rgba(0, 167, 111, 0.85)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Fantasy hub</div>
            <FunBadge label="Market heat" tone="accent" />
          </div>
          <div className="section-title mt-2 text-base font-semibold sm:text-xl">
            Value picks and risers
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            {fantasy.note}
          </div>
        </div>
        <div className="glass-pill hidden rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)] sm:block">
          {fantasy.source}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${feedTone.className}`}
        >
          {feedTone.label}
        </span>
        <span className="text-xs text-[var(--muted)]">{sourceMeta.note}</span>
      </div>

      <div className="mt-4 grid gap-3.5 sm:gap-4 xl:grid-cols-2">
        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div className="section-title text-sm font-semibold">Top value</div>
            <Trophy size={16} className="text-[var(--muted)]" />
          </div>
          <div className="grid gap-2">
            {fantasy.topValue.map((entry) => (
              <div
                key={entry.driverId}
                className="grid gap-3 rounded-[16px] border border-black/6 bg-white/72 px-4 py-3 sm:flex sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--foreground)]">
                    {entry.label}
                  </div>
                  <div className="truncate text-xs text-[var(--muted)]">{entry.teamName}</div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-normal">
                  {renderTrend(entry.valueScore)}
                  <div className="text-right">
                    <div className="telemetry-text text-sm text-[var(--foreground)]">
                      {entry.valueScore.toFixed(2)}x
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      ${entry.price.toFixed(1)}M
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleWatch(entry.driverId)}
                    className={`min-w-[88px] rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ${
                      watchlist.has(entry.driverId)
                        ? "bg-[var(--team-accent-soft)] text-[var(--team-accent)]"
                        : "bg-[rgba(17,21,29,0.08)] text-[var(--foreground)]"
                    }`}
                  >
                    {watchlist.has(entry.driverId) ? "Watching" : "Watch"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div className="section-title text-sm font-semibold">Price risers</div>
            <ArrowUpRight size={16} className="text-[var(--muted)]" />
          </div>
          <div className="grid gap-2">
            {fantasy.priceRisers.map((entry) => (
              <div
                key={entry.driverId}
                className="group grid gap-3 rounded-[16px] border border-black/6 bg-white/72 px-4 py-3 sm:flex sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--foreground)]">
                    {entry.label}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)]">{entry.points} pts</span>
                    <span className="pulse-dot h-2 w-2 rounded-full bg-[#00a76f]" />
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#00a76f]">
                      trending
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-normal">
                  {renderTrend(entry.trend)}
                  <div className="text-right">
                    <div className="telemetry-text text-sm text-[#c51b17]">
                      {entry.trend > 0 ? "+" : ""}
                      {entry.trend.toFixed(2)}M
                    </div>
                    <div className="text-xs text-[var(--muted)]">market delta</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleWatch(entry.driverId)}
                    className={`min-w-[88px] rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ${
                      watchlist.has(entry.driverId)
                        ? "bg-[var(--team-accent-soft)] text-[var(--team-accent)]"
                        : "bg-[rgba(17,21,29,0.08)] text-[var(--foreground)]"
                    }`}
                  >
                    {watchlist.has(entry.driverId) ? "Added" : "Watch"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const { data, refetch, isFetching, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Dashboard refresh failed");
      }

      return (await response.json()) as DashboardData;
    },
    initialData,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useVisibilityRefresh(refetch);
  const isOnline = useOnlineStatus();

  const snapshotNow = useMemo(
    () => new Date(data.generatedAt).getTime(),
    [data.generatedAt],
  );
  const freshness = useRelativeTime(snapshotNow, snapshotNow);
  const [selectedDriverId, setSelectedDriverId] = useState(
    data.standings[0]?.id ?? "",
  );
  const [watchlist, setWatchlist] = useState<Set<string>>(() => new Set());
  const [scrubIndex, setScrubIndex] = useState(
    Math.max(0, data.telemetrySamples.length - 1),
  );

  useEffect(() => {
    const rawPrefs = window.localStorage.getItem("pphq-dashboard-prefs/v1");
    if (!rawPrefs) {
      return;
    }

    try {
      const parsed = JSON.parse(rawPrefs) as {
        selectedDriverId?: string;
        watchlist?: string[];
      };

      const frame = window.requestAnimationFrame(() => {
        if (
          parsed.selectedDriverId &&
          data.standings.some((driver) => driver.id === parsed.selectedDriverId)
        ) {
          setSelectedDriverId(parsed.selectedDriverId);
        }

        if (Array.isArray(parsed.watchlist)) {
          setWatchlist(new Set(parsed.watchlist));
        }
      });

      return () => window.cancelAnimationFrame(frame);
    } catch {
      window.localStorage.removeItem("pphq-dashboard-prefs/v1");
    }
  }, [data.standings]);

  useEffect(() => {
    window.localStorage.setItem(
      "pphq-dashboard-prefs/v1",
      JSON.stringify({
        selectedDriverId,
        watchlist: Array.from(watchlist),
      }),
    );
  }, [selectedDriverId, watchlist]);

  const effectiveSelectedDriverId = useMemo(
    () =>
      data.standings.some((driver) => driver.id === selectedDriverId)
        ? selectedDriverId
        : data.standings[0]?.id ?? "",
    [data.standings, selectedDriverId],
  );
  const effectiveScrubIndex = useMemo(
    () => clampIndex(scrubIndex, Math.max(1, data.telemetrySamples.length) - 1),
    [data.telemetrySamples.length, scrubIndex],
  );
  const selectedDriver = useMemo(
    () =>
      data.standings.find((driver) => driver.id === effectiveSelectedDriverId) ??
      data.standings[0] ??
      null,
    [data.standings, effectiveSelectedDriverId],
  );

  const accent = selectedDriver?.teamColor ?? "E10600";
  const themeStyle = useMemo(() => buildThemeStyle(accent), [accent]);

  const toggleWatch = (driverId: string) => {
    setWatchlist((current) => {
      const next = new Set(current);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  return (
    <main
      style={themeStyle}
      className="mx-auto flex min-h-screen max-w-[1480px] flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:px-8 lg:py-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] sm:text-[11px]">
          <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--team-accent)]" />
          live surface
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] sm:text-xs sm:tracking-[0.18em]"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          {isFetching ? "Refreshing" : "Refresh now"}
        </button>
      </div>

      {!isOnline || error ? (
        <div className="glass-panel rounded-[20px] px-4 py-3 text-sm text-[var(--foreground)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Status</span>
            {!isOnline ? (
              <span className="rounded-full border border-[#c46f00]/20 bg-[#c46f00]/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#c46f00]">
                Offline
              </span>
            ) : null}
            {error ? (
              <span className="rounded-full border border-[#0066cc]/20 bg-[#0066cc]/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#0066cc]">
                Snapshot in use
              </span>
            ) : null}
          </div>
          <div className="mt-2 text-[13px] text-[var(--muted)] sm:text-sm">
            {!isOnline
              ? "You are offline. The dashboard keeps the latest successful snapshot and local preferences visible until connectivity returns."
              : "The latest refresh failed, so the page is holding the last good server snapshot instead of blinking or clearing the UI."}
          </div>
        </div>
      ) : null}

      <HeaderHero
        dashboard={data}
        selectedDriver={selectedDriver}
        freshness={freshness}
        snapshotNow={snapshotNow}
      />

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-4 sm:gap-5">
          <TelemetryExperiencePanel
            accent={accent}
            driverLabel={data.telemetryDriverLabel}
            insights={data.telemetryInsights}
            sourceMeta={data.sources.telemetry}
            samples={data.telemetrySamples}
            session={data.telemetrySession}
            scrubIndex={effectiveScrubIndex}
            onScrub={(index) =>
              setScrubIndex(
                index === null
                  ? Math.max(0, data.telemetrySamples.length - 1)
                  : index,
              )
            }
          />

          <PerformanceProfilePanel driver={selectedDriver} />

          <FantasyActionPanel
            fantasy={data.fantasy}
            sourceMeta={data.sources.fantasy}
            watchlist={watchlist}
            onToggleWatch={toggleWatch}
          />
        </div>

        <LiveActionDock
          circuitName={data.trackMap.circuitName}
          cars={data.trackMap.cars}
          selectedDriver={selectedDriver}
          insights={data.telemetryInsights}
          telemetrySamples={data.telemetrySamples}
          scrubIndex={effectiveScrubIndex}
          drivers={data.standings}
          selectedDriverId={effectiveSelectedDriverId}
          onSelect={setSelectedDriverId}
        />
      </div>

      <footer className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
        <span className="glass-pill rounded-full px-3 py-1.5">
          Stable live demo
        </span>
        <span className="glass-pill rounded-full px-3 py-1.5">
          Local prefs saved on this device
        </span>
        <span className="glass-pill rounded-full px-3 py-1.5">
          OpenF1, F1 GraphQL, Official Fantasy
        </span>
      </footer>
    </main>
  );
}
