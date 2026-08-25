"use client";

import Image from "next/image";
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  ArrowUp,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Flag,
  Gauge,
  Headphones,
  Map as MapIcon,
  MessageCircle,
  Minus,
  Newspaper,
  Palette,
  Pause,
  Play,
  Share2,
  Mic,
  Radio,
  RefreshCw,
  SunMoon,
  TrendingUp,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { DashboardData, DriverInsight, FantasyEntry, SessionSummary } from "@/lib/types";
import {
  logDashboardInteraction,
  markDashboardInteractive,
} from "@/lib/analytics";
import { loadLatestDashboardSnapshot, saveDashboardSnapshot } from "@/lib/offline-cache";
import { useAppDispatch, useAppSelector } from "@/lib/store";
import { dashboardApi, useGetDashboardQuery } from "@/lib/store/dashboard-api";
import {
  cycleThemeMode,
  hydratePreferences,
  setActiveTab as setActiveTabAction,
  setScrubIndex,
  setSelectedDriverId,
  setSessionAlertLeadMinutes,
  setTelemetryPlaying,
  setTelemetryReplaySpeed,
  setVisualTheme,
  toggleWatchlist,
  type SessionAlertLeadMinutes,
  type TelemetryReplaySpeed,
} from "@/lib/store/ui-slice";
import { F1TelemetrySuite } from "@/components/f1-telemetry-suite";

const DASHBOARD_PREFS_KEY = "pphq-dashboard-prefs/v1";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--team-accent)] focus-visible:ring-offset-2";
const TELEMETRY_REPLAY_SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;
const SESSION_ALERT_LEAD_TIMES = [0, 5, 15, 30] as const;
type DashboardTab = "live" | "analysis" | "weekend" | "season";

function normalizeTelemetryReplaySpeed(value: unknown): TelemetryReplaySpeed {
  return TELEMETRY_REPLAY_SPEEDS.includes(value as TelemetryReplaySpeed)
    ? (value as TelemetryReplaySpeed)
    : 1;
}

function normalizeSessionAlertLeadMinutes(value: unknown): SessionAlertLeadMinutes {
  return SESSION_ALERT_LEAD_TIMES.includes(value as SessionAlertLeadMinutes)
    ? (value as SessionAlertLeadMinutes)
    : 0;
}

type VisualThemeOption = {
  id: string;
  label: string;
  accent: string;
  detail: string;
};

const DASHBOARD_TABS: Array<{
  id: DashboardTab;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "live",
    label: "Live",
    description: "Timing and race control",
    icon: Radio,
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "Telemetry and intelligence",
    icon: Wrench,
  },
  {
    id: "weekend",
    label: "Weekend",
    description: "Schedule and newsroom",
    icon: CalendarDays,
  },
  {
    id: "season",
    label: "Season",
    description: "Standings and fantasy",
    icon: Trophy,
  },
];

const LEGACY_TAB_MAP: Record<string, DashboardTab> = {
  live: "live",
  overview: "live",
  timing: "live",
  analysis: "analysis",
  telemetry: "analysis",
  "race-intel": "analysis",
  weekend: "weekend",
  newsroom: "weekend",
  season: "season",
  stats: "season",
  fantasy: "season",
};

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
    const run = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refetch();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    const handleOnline = () => run();

    window.addEventListener("focus", handleOnline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleOnline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refetch]);
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const frame = window.requestAnimationFrame(() => {
      setIsOnline(navigator.onLine);
    });

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

function buildThemeStyle(accent: string): CSSProperties {
  const normalized = accent.replace("#", "").padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return {
    ["--team-accent" as string]: `#${normalized}`,
    ["--team-accent-soft" as string]: rgba(normalized, 0.14),
    ["--team-accent-wash" as string]: rgba(normalized, 0.07),
    ["--theme-on-accent" as string]: luminance > 0.62 ? "#101114" : "#ffffff",
  };
}

function ThemePicker({
  options,
  value,
  onChange,
}: {
  options: VisualThemeOption[];
  value: string;
  onChange: (themeId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const active = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`utility-button inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] ${FOCUS_RING}`}
      >
        <Palette size={14} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: `#${active.accent}` }} />
        <span className="hidden sm:inline">{active.label}</span>
        <ChevronDown size={12} className={`hidden transition sm:block ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div className="theme-menu absolute right-0 top-[calc(100%+8px)] z-50 w-[min(330px,calc(100vw-24px))] border border-[var(--line)] bg-[var(--panel-strong)] p-2 shadow-[0_20px_55px_rgba(0,0,0,0.18)] backdrop-blur-xl" role="listbox" aria-label="Dashboard color theme">
          <div className="px-2 pb-2 pt-1">
            <div className="eyebrow">Color theme</div>
            <div className="mt-1 text-xs text-[var(--muted)]">F1 neutral or a current team palette</div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {options.map((option) => {
              const selected = option.id === active.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                  }}
                  className={`theme-option flex items-center gap-2.5 border px-2.5 py-2.5 text-left ${selected ? "border-[var(--team-accent)] bg-[var(--team-accent-wash)]" : "border-transparent hover:border-[var(--line)] hover:bg-[var(--surface)]"}`}
                >
                  <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: `#${option.accent}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[var(--foreground)]">{option.label}</span>
                    <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.13em] text-[var(--muted)]">{option.detail}</span>
                  </span>
                  {selected ? <Check size={13} className="shrink-0 text-[var(--team-accent)]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
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
      className={`glass-panel rounded-[14px] p-3.5 sm:p-5 ${className ?? ""}`}
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

function DriverAvatar({
  driver,
  className,
  sizes,
  style,
}: {
  driver: DriverInsight;
  className: string;
  sizes: string;
  style?: CSSProperties;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(driver.headshotUrl) && failedUrl !== driver.headshotUrl;

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-[var(--surface-strong)] ${className}`}
      style={{
        background: `linear-gradient(145deg, ${rgba(driver.teamColor, 0.22)}, var(--surface-strong))`,
        ...style,
      }}
    >
      {showImage ? (
        <Image
          src={driver.headshotUrl as string}
          alt={driver.fullName}
          fill
          className="object-cover"
          sizes={sizes}
          onError={() => setFailedUrl(driver.headshotUrl)}
        />
      ) : (
        <span
          className="telemetry-text text-sm font-semibold tracking-[0.08em]"
          style={{ color: `#${driver.teamColor}` }}
          aria-label={`${driver.fullName} headshot unavailable`}
        >
          {driver.abbreviation}
        </span>
      )}
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
  const padding = { top: 14, right: 42, bottom: 28, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const speeds = samples.map((sample) => sample.speed);
  const speedMin = Math.max(0, Math.floor((Math.min(...speeds) - 10) / 20) * 20);
  const speedMax = Math.ceil((Math.max(...speeds) + 10) / 20) * 20;

  const buildPoints = (values: number[], min: number, max: number) => {
    const range = Math.max(1, max - min);

    return values.map((value, index) => {
      const x =
        padding.left +
        (index / Math.max(1, values.length - 1)) * plotWidth;
      const y =
        padding.top + plotHeight - ((value - min) / range) * plotHeight;
      return { x, y };
    });
  };

  const speed = buildPoints(speeds, speedMin, speedMax);
  const throttle = buildPoints(samples.map((sample) => sample.throttle), 0, 100);
  const brake = buildPoints(samples.map((sample) => sample.brake), 0, 100);
  const activePoint = speed[Math.min(activeIndex, speed.length - 1)];
  const segmentWidth = plotWidth / Math.max(1, samples.length - 1);
  const yTicks = [0, 0.5, 1];
  const xTicks = [0, 0.5, 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      role="img"
      aria-label="Telemetry trace with speed in kilometers per hour and throttle and brake in percent across lap distance"
    >
      <title>Speed, throttle, and brake across normalized lap distance</title>
      {yTicks.map((ratio) => {
        const y = padding.top + plotHeight - ratio * plotHeight;
        const speedValue = Math.round(speedMin + ratio * (speedMax - speedMin));
        const percentValue = Math.round(ratio * 100);
        return (
          <g key={`y-${ratio}`}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(17,21,29,0.08)" />
            <text x={padding.left - 7} y={y + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{speedValue}</text>
            <text x={width - padding.right + 7} y={y + 3} fontSize="9" fill="var(--muted)">{percentValue}%</text>
          </g>
        );
      })}
      {xTicks.map((ratio) => (
        <text
          key={`x-${ratio}`}
          x={padding.left + ratio * plotWidth}
          y={height - 6}
          textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
          fontSize="9"
          fill="var(--muted)"
        >
          {Math.round(ratio * 100)}% lap
        </text>
      ))}
      <text x={padding.left} y={10} fontSize="8" fill="var(--muted)">km/h</text>
      {samples.map((sample, index) => {
        const tone = getPhaseTone(sample.phase);
        const x = padding.left + index * segmentWidth - segmentWidth / 2;

        return (
          <rect
            key={`phase-${sample.index}`}
            x={Math.max(padding.left, x)}
            y={height - padding.bottom + 5}
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
        y1={padding.top}
        y2={height - padding.bottom}
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
        stroke="var(--muted)"
        opacity="0.78"
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
  const safeLength = Number.isFinite(length) ? Math.max(1, Math.floor(length)) : 1;
  const safeIndex = Number.isFinite(index) ? index : 0;

  return Math.round(Math.max(0, Math.min(safeLength - 1, safeIndex)));
}

function clampUnit(value: number, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function getPathPointAtProgress(path: SVGPathElement, progress: number) {
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }

  const distance = length * clampUnit(progress);
  if (!Number.isFinite(distance)) {
    return null;
  }

  const point = path.getPointAtLength(distance);
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : null;
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
    return { label: "Snapshot", className: "text-[#3976c3] bg-[#3976c3]/10 border-[#3976c3]/25" };
  }

  if (status === "simulated") {
    return { label: "Simulation", className: "text-[#a86400] bg-[#d98b00]/12 border-[#d98b00]/25" };
  }

  if (status === "fallback") {
    return { label: "Fallback", className: "text-[#c46f00] bg-[#c46f00]/10 border-[#c46f00]/20" };
  }

  return { label: "Empty", className: "text-[var(--muted)] bg-black/5 border-black/10" };
}

function normalizeDashboardTab(value: unknown): DashboardTab | null {
  return typeof value === "string" ? LEGACY_TAB_MAP[value] ?? null : null;
}

function formatLapTime(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatDelta(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  if (Math.abs(value) < 0.001) {
    return "+0.000";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatActivityTime(value: string | null) {
  if (!value) {
    return "monitoring";
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "monitoring";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

function getCategoryTone(category: DashboardData["activity"]["items"][number]["category"]) {
  if (category === "upgrade") {
    return { label: "Upgrade", className: "bg-[#8f49ff]/10 text-[#6d36c9] border-[#8f49ff]/20" };
  }

  if (category === "timing") {
    return { label: "Timing", className: "bg-[#0066cc]/10 text-[#0056ad] border-[#0066cc]/20" };
  }

  if (category === "strategy") {
    return { label: "Strategy", className: "bg-[#00a76f]/10 text-[#007a55] border-[#00a76f]/20" };
  }

  if (category === "breaking") {
    return { label: "Breaking", className: "bg-[#e10600]/10 text-[#c40000] border-[#e10600]/20" };
  }

  if (category === "business") {
    return { label: "Business", className: "bg-[#d5a125]/12 text-[#8c6500] border-[#d5a125]/24" };
  }

  return { label: "Community", className: "bg-black/5 text-[var(--muted)] border-black/10" };
}

function getImpactTone(impact: DashboardData["raceIntelligence"]["upgradeSignals"][number]["impact"]) {
  if (impact === "high") {
    return "bg-[#e10600]/10 text-[#c40000] border-[#e10600]/20";
  }

  if (impact === "medium") {
    return "bg-[#d5a125]/12 text-[#8c6500] border-[#d5a125]/24";
  }

  return "bg-black/5 text-[var(--muted)] border-black/10";
}

type TelemetryWorkerMetrics = {
  fastestIndex: number;
  fastestElapsed: number;
  maxDelta: number;
  brakeEvents: number;
  avgAcceleration: number;
  projectedNextSpeed: number;
  sampledAt: number;
} | null;

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

function useTelemetryWorker(samples: DashboardData["telemetrySamples"]) {
  const [metrics, setMetrics] = useState<TelemetryWorkerMetrics>(null);

  useEffect(() => {
    if (!samples.length || typeof Worker === "undefined") {
      const frame = window.requestAnimationFrame(() => setMetrics(null));
      return () => window.cancelAnimationFrame(frame);
    }

    const worker = new Worker("/telemetry-worker.js");
    worker.onmessage = (event: MessageEvent<TelemetryWorkerMetrics>) => {
      setMetrics(event.data);
    };
    worker.postMessage({ samples });

    return () => worker.terminate();
  }, [samples]);

  return metrics;
}

function buildCalendarLinks(session: SessionSummary) {
  const start = new Date(session.dateStart);
  const end = new Date(session.dateEnd);
  const title = encodeURIComponent(`F1 ${session.sessionName} - ${session.circuitName}`);
  const details = encodeURIComponent(`${session.location}, ${session.countryName}`);
  const dates = `${start.toISOString().replace(/[-:]/g, "").replace(".000", "")}/${end
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".000", "")}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${dates.split("/")[0]}`,
    `DTEND:${dates.split("/")[1]}`,
    `SUMMARY:F1 ${session.sessionName} - ${session.circuitName}`,
    `LOCATION:${session.location}, ${session.countryName}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`,
    apple: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
  };
}

function predictNextLapTime(samples: DashboardData["telemetrySamples"]) {
  const tail = samples.slice(-3);
  if (tail.length < 2) {
    return null;
  }

  const last = tail.at(-1);
  if (!last || last.elapsed <= 0) {
    return null;
  }

  const avgSpeed = Math.max(
    1,
    tail.reduce((sum, sample) => sum + sample.speed, 0) / tail.length,
  );
  const avgThrottle =
    tail.reduce((sum, sample) => sum + sample.throttle, 0) / tail.length / 100;
  const avgBrake = tail.reduce((sum, sample) => sum + sample.brake, 0) / tail.length / 100;
  const momentum =
    (tail[tail.length - 1].speed - tail[0].speed) / Math.max(1, tail.length - 1);
  const completion = Math.max(0.05, Math.min(0.98, last.trackPosition || 0.72));
  const remainingRatio = (1 - completion) / completion;
  const paceBias = 1 - avgThrottle * 0.045 + avgBrake * 0.075 - momentum / avgSpeed * 0.18;

  return Math.max(last.elapsed, last.elapsed + last.elapsed * remainingRatio * paceBias);
}

function findDriverFromVoice(transcript: string, drivers: DriverInsight[]) {
  const normalized = transcript.toLowerCase();

  return drivers.find((driver) => {
    const aliases = [
      driver.fullName,
      driver.firstName,
      driver.lastName,
      driver.abbreviation,
      driver.teamName,
    ].map((value) => value.toLowerCase());

    return aliases.some((alias) => alias && normalized.includes(alias));
  });
}

async function shareDriverCard(
  driver: DriverInsight,
  predictedLap: number | null,
  activeSample: DashboardData["telemetrySamples"][number] | null,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const accent = `#${driver.teamColor}`;
  const gradient = context.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, "#10151f");
  gradient.addColorStop(0.58, "#181f2b");
  gradient.addColorStop(1, accent);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 630);

  context.fillStyle = "rgba(255,255,255,0.08)";
  context.fillRect(72, 72, 1056, 486);
  context.fillStyle = accent;
  context.fillRect(72, 72, 16, 486);

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = "28px Arial";
  context.fillText("POLE POSITION HQ DRIVER CARD", 116, 132);
  context.fillStyle = "#ffffff";
  context.font = "700 76px Arial";
  context.fillText(driver.fullName, 116, 230);
  context.font = "700 38px Arial";
  context.fillText(`${driver.teamName} | ${driver.abbreviation}`, 116, 286);

  const stats = [
    ["Position", `P${driver.standingPosition}`],
    ["Points", String(driver.points)],
    ["Speed", activeSample ? `${activeSample.speed} km/h` : "--"],
    ["Predicted lap", predictedLap ? formatLapTime(predictedLap) : "--"],
  ];

  stats.forEach(([label, value], index) => {
    const x = 116 + index * 252;
    context.fillStyle = "rgba(255,255,255,0.64)";
    context.font = "24px Arial";
    context.fillText(label, x, 410);
    context.fillStyle = "#ffffff";
    context.font = "700 38px Arial";
    context.fillText(value, x, 462);
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 0.92),
  );
  if (!blob) {
    return;
  }

  const file = new File([blob], `${driver.abbreviation.toLowerCase()}-driver-card.png`, {
    type: "image/png",
  });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: `${driver.fullName} driver card` });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

class WidgetBoundary extends Component<
  { children: ReactNode; label: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} widget failed`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Widget offline</div>
              <div className="section-title mt-2 text-lg font-semibold">
                {this.props.label} could not render
              </div>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className={`glass-pill rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${FOCUS_RING}`}
            >
              Retry
            </button>
          </div>
        </Panel>
      );
    }

    return this.props.children;
  }
}

function BriefingAction({
  icon,
  eyebrow,
  title,
  meta,
  accent,
  onClick,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  meta: string;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`minimal-card group grid min-h-[132px] grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-[18px] p-3 text-left transition hover:-translate-y-0.5 sm:min-h-[144px] sm:p-4 ${FOCUS_RING}`}
      style={
        accent
          ? {
              background: `linear-gradient(135deg, ${rgba(accent, 0.13)}, rgba(255,255,255,0.72) 62%)`,
              borderColor: rgba(accent, 0.24),
            }
          : undefined
      }
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-[14px] border border-black/6 bg-white/76 text-[var(--foreground)]"
        style={accent ? { color: `#${accent}` } : undefined}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="eyebrow block">{eyebrow}</span>
        <span className="mt-2 line-clamp-2 block text-sm font-semibold leading-5 text-[var(--foreground)] sm:text-[15px]">
          {title}
        </span>
        <span className="mt-2 block truncate text-xs text-[var(--muted)]">{meta}</span>
      </span>
      <span className="rounded-full border border-black/6 bg-white/78 p-2 text-[var(--muted)] transition group-hover:text-[var(--foreground)]">
        <ArrowUpRight size={14} />
      </span>
    </button>
  );
}

function BriefingPanel({
  dashboard,
  selectedDriver,
  onNavigate,
}: {
  dashboard: DashboardData;
  selectedDriver: DriverInsight | null;
  onNavigate: (tab: DashboardTab) => void;
}) {
  const topActivity = dashboard.activity.items[0] ?? null;
  const topUpgrade = dashboard.raceIntelligence.upgradeSignals[0] ?? null;
  const topDelta = dashboard.raceIntelligence.timingDeltas.find(
    (delta) => delta.deltaToBest !== null,
  );
  const sourceCount = dashboard.activity.sourcePulse.filter(
    (source) => source.status === "live" || source.status === "cached",
  ).length;

  return (
    <Panel className="p-3 sm:p-4" tint="var(--team-accent-wash)">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <div className="eyebrow">Command brief</div>
          <div className="section-title mt-1 text-lg font-semibold sm:text-2xl">
            Priority stack
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <span className="glass-pill telemetry-text rounded-full px-2.5 py-1.5 text-center text-[10px] font-semibold text-[var(--foreground)]">
            {dashboard.activity.items.length} signals
          </span>
          <span className="glass-pill telemetry-text rounded-full px-2.5 py-1.5 text-center text-[10px] font-semibold text-[var(--foreground)]">
            {sourceCount} feeds
          </span>
          <span className="glass-pill telemetry-text rounded-full px-2.5 py-1.5 text-center text-[10px] font-semibold text-[var(--foreground)]">
            {dashboard.raceIntelligence.timingDeltas.length} deltas
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 md:grid-cols-3">
        <BriefingAction
          icon={<Newspaper size={16} />}
          eyebrow="News pulse"
          title={topActivity?.title ?? "Activity feeds are standing by"}
          meta={topActivity ? `${topActivity.sourceLabel} / ${topActivity.signalScore} signal` : "No readable feed item yet"}
          onClick={() => onNavigate("weekend")}
        />
        <BriefingAction
          icon={<Wrench size={16} />}
          eyebrow="Upgrade watch"
          title={topUpgrade ? `${topUpgrade.teamName}: ${topUpgrade.package}` : "No sourced upgrade signal"}
          meta={topUpgrade ? `${topUpgrade.impact} impact / ${topUpgrade.confidence}% confidence` : "Editorial evidence required"}
          accent={topUpgrade?.teamColor}
          onClick={() => onNavigate("analysis")}
        />
        <BriefingAction
          icon={<Gauge size={16} />}
          eyebrow="Timing read"
          title={
            topDelta
              ? `${topDelta.driverLabel} ${formatDelta(topDelta.deltaToBest)} through ${topDelta.sectorFocus}`
              : selectedDriver
                ? `${selectedDriver.abbreviation} pace profile`
                : "Timing deltas pending"
          }
          meta={topDelta ? topDelta.note : "Select a driver for a deeper read"}
          accent={topDelta?.teamColor ?? selectedDriver?.teamColor}
          onClick={() => onNavigate("live")}
        />
      </div>
    </Panel>
  );
}

function buildConstructorStandings(drivers: DriverInsight[]) {
  const teams = new Map<
    string,
    {
      teamName: string;
      teamColor: string;
      points: number;
      drivers: string[];
    }
  >();

  drivers.forEach((driver) => {
    const current = teams.get(driver.teamName) ?? {
      teamName: driver.teamName,
      teamColor: driver.teamColor,
      points: 0,
      drivers: [],
    };

    current.points += driver.points;
    current.drivers.push(driver.abbreviation);
    teams.set(driver.teamName, current);
  });

  return Array.from(teams.values()).sort((a, b) => b.points - a.points);
}

type TrackLayoutMarker = {
  label: string;
  x: number;
  y: number;
};

type TrackLayout = {
  name: string;
  path: string;
  start: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  sectors: TrackLayoutMarker[];
  corners: TrackLayoutMarker[];
  drs: TrackLayoutMarker[];
};

const FALLBACK_TRACK_LAYOUT: TrackLayout = {
  name: "Broadcast circuit",
  path: "M58 186 C76 88 216 66 274 114 S454 184 500 118 S494 38 390 58 S212 236 292 270 S470 274 486 218 S328 138 248 180 S76 280 58 186",
  start: { x1: 66, y1: 177, x2: 66, y2: 207 },
  sectors: [
    { label: "S1", x: 140, y: 60 },
    { label: "S2", x: 476, y: 150 },
    { label: "S3", x: 228, y: 286 },
  ],
  corners: [
    { label: "T1", x: 104, y: 116 },
    { label: "T4", x: 254, y: 86 },
    { label: "T7", x: 452, y: 96 },
    { label: "T11", x: 342, y: 254 },
    { label: "T14", x: 154, y: 224 },
  ],
  drs: [
    { label: "DRS", x: 384, y: 62 },
    { label: "DRS", x: 392, y: 274 },
  ],
};

const TRACK_LAYOUTS: Record<string, TrackLayout> = {
  bahrain: {
    name: "Bahrain International",
    path: "M78 200 C86 116 152 70 230 80 C288 88 300 142 258 166 C214 192 216 244 282 262 C370 286 486 248 498 174 C510 98 438 54 366 84 C320 104 340 154 390 146 C442 138 456 194 398 214 C310 244 176 276 116 246 C88 232 74 218 78 200",
    start: { x1: 92, y1: 190, x2: 92, y2: 220 },
    sectors: [
      { label: "S1", x: 206, y: 62 },
      { label: "S2", x: 458, y: 132 },
      { label: "S3", x: 226, y: 278 },
    ],
    corners: [
      { label: "T1", x: 116, y: 120 },
      { label: "T4", x: 286, y: 152 },
      { label: "T10", x: 344, y: 214 },
      { label: "T14", x: 468, y: 204 },
    ],
    drs: [
      { label: "DRS", x: 142, y: 82 },
      { label: "DRS", x: 430, y: 246 },
    ],
  },
  jeddah: {
    name: "Jeddah Corniche",
    path: "M82 270 C132 240 166 206 190 154 C218 92 268 54 332 60 C400 66 454 112 492 182 C510 216 494 246 456 250 C400 256 360 226 318 178 C280 134 240 128 210 174 C182 218 150 262 96 286",
    start: { x1: 94, y1: 256, x2: 118, y2: 278 },
    sectors: [
      { label: "S1", x: 190, y: 126 },
      { label: "S2", x: 410, y: 88 },
      { label: "S3", x: 402, y: 258 },
    ],
    corners: [
      { label: "T1", x: 104, y: 248 },
      { label: "T13", x: 330, y: 58 },
      { label: "T22", x: 486, y: 198 },
      { label: "T27", x: 346, y: 214 },
    ],
    drs: [
      { label: "DRS", x: 258, y: 68 },
      { label: "DRS", x: 446, y: 158 },
    ],
  },
  melbourne: {
    name: "Albert Park",
    path: "M76 210 C74 128 154 74 250 78 C344 82 420 58 484 112 C526 148 510 222 442 244 C356 274 266 252 202 282 C144 310 74 278 76 210",
    start: { x1: 84, y1: 196, x2: 84, y2: 226 },
    sectors: [
      { label: "S1", x: 174, y: 72 },
      { label: "S2", x: 484, y: 142 },
      { label: "S3", x: 224, y: 292 },
    ],
    corners: [
      { label: "T1", x: 96, y: 164 },
      { label: "T3", x: 210, y: 78 },
      { label: "T9", x: 462, y: 94 },
      { label: "T11", x: 476, y: 230 },
      { label: "T14", x: 146, y: 276 },
    ],
    drs: [
      { label: "DRS", x: 312, y: 70 },
      { label: "DRS", x: 360, y: 260 },
    ],
  },
  suzuka: {
    name: "Suzuka",
    path: "M70 210 C102 132 182 96 260 112 C334 128 386 76 458 78 C514 80 522 132 476 160 C426 192 350 176 302 214 C250 254 296 292 374 274 C444 258 492 282 484 300 C474 320 382 318 306 294 C202 260 120 278 82 244 C68 232 64 222 70 210 M294 206 C270 170 290 138 330 130",
    start: { x1: 86, y1: 196, x2: 86, y2: 226 },
    sectors: [
      { label: "S1", x: 188, y: 90 },
      { label: "S2", x: 456, y: 120 },
      { label: "S3", x: 336, y: 292 },
    ],
    corners: [
      { label: "T1", x: 94, y: 176 },
      { label: "S", x: 246, y: 112 },
      { label: "130R", x: 462, y: 276 },
      { label: "T16", x: 300, y: 294 },
    ],
    drs: [{ label: "DRS", x: 400, y: 82 }],
  },
  shanghai: {
    name: "Shanghai",
    path: "M98 108 C132 52 246 52 276 120 C306 188 228 206 190 166 C154 128 202 86 248 114 C300 146 330 216 398 222 C470 228 512 184 494 128 C478 78 412 66 356 96 C308 122 320 180 374 178 C430 176 448 232 388 262 C300 306 124 280 86 206 C68 172 74 144 98 108",
    start: { x1: 110, y1: 102, x2: 82, y2: 116 },
    sectors: [
      { label: "S1", x: 236, y: 72 },
      { label: "S2", x: 484, y: 154 },
      { label: "S3", x: 208, y: 288 },
    ],
    corners: [
      { label: "T1", x: 146, y: 82 },
      { label: "T6", x: 260, y: 194 },
      { label: "T11", x: 378, y: 178 },
      { label: "T14", x: 480, y: 116 },
    ],
    drs: [
      { label: "DRS", x: 412, y: 220 },
      { label: "DRS", x: 178, y: 276 },
    ],
  },
  miami: {
    name: "Miami International",
    path: "M74 208 C78 126 156 80 250 84 C340 88 394 118 438 86 C488 50 532 92 500 146 C474 192 408 188 378 224 C346 260 398 294 470 270 C510 258 520 288 474 304 C386 332 282 294 220 256 C174 228 114 264 84 238 C74 230 72 218 74 208",
    start: { x1: 88, y1: 198, x2: 88, y2: 228 },
    sectors: [
      { label: "S1", x: 196, y: 80 },
      { label: "S2", x: 486, y: 116 },
      { label: "S3", x: 330, y: 292 },
    ],
    corners: [
      { label: "T1", x: 102, y: 166 },
      { label: "T8", x: 412, y: 102 },
      { label: "T11", x: 388, y: 220 },
      { label: "T17", x: 476, y: 270 },
    ],
    drs: [
      { label: "DRS", x: 304, y: 88 },
      { label: "DRS", x: 426, y: 298 },
    ],
  },
  monaco: {
    name: "Monaco",
    path: "M96 220 C92 150 136 92 206 92 C252 92 274 126 246 158 C218 188 252 218 314 204 C392 186 480 160 500 212 C518 260 442 288 364 268 C300 252 242 272 184 286 C126 300 96 262 96 220",
    start: { x1: 106, y1: 208, x2: 106, y2: 238 },
    sectors: [
      { label: "S1", x: 176, y: 86 },
      { label: "S2", x: 390, y: 178 },
      { label: "S3", x: 236, y: 286 },
    ],
    corners: [
      { label: "T1", x: 112, y: 178 },
      { label: "CAS", x: 232, y: 112 },
      { label: "TAB", x: 474, y: 218 },
      { label: "RSC", x: 172, y: 286 },
    ],
    drs: [{ label: "DRS", x: 396, y: 268 }],
  },
  montreal: {
    name: "Gilles Villeneuve",
    path: "M86 228 C96 146 174 96 266 102 C354 108 444 74 492 132 C536 186 488 260 392 268 C314 274 266 224 194 248 C122 272 78 260 86 228",
    start: { x1: 98, y1: 218, x2: 98, y2: 248 },
    sectors: [
      { label: "S1", x: 174, y: 96 },
      { label: "S2", x: 468, y: 122 },
      { label: "S3", x: 302, y: 274 },
    ],
    corners: [
      { label: "T1", x: 110, y: 184 },
      { label: "T6", x: 286, y: 102 },
      { label: "T10", x: 498, y: 190 },
      { label: "T14", x: 384, y: 268 },
    ],
    drs: [
      { label: "DRS", x: 372, y: 94 },
      { label: "DRS", x: 208, y: 262 },
    ],
  },
  silverstone: {
    name: "Silverstone",
    path: "M70 196 C80 112 170 74 262 92 C332 106 380 74 458 84 C520 92 526 154 470 178 C412 204 374 168 322 204 C270 240 302 286 392 284 C454 282 496 300 474 316 C430 348 292 306 214 270 C154 244 62 260 70 196",
    start: { x1: 84, y1: 184, x2: 84, y2: 214 },
    sectors: [
      { label: "S1", x: 208, y: 76 },
      { label: "S2", x: 450, y: 154 },
      { label: "S3", x: 294, y: 294 },
    ],
    corners: [
      { label: "T1", x: 94, y: 154 },
      { label: "COP", x: 454, y: 88 },
      { label: "MAG", x: 334, y: 202 },
      { label: "STO", x: 448, y: 284 },
    ],
    drs: [
      { label: "DRS", x: 318, y: 90 },
      { label: "DRS", x: 374, y: 286 },
    ],
  },
  spa: {
    name: "Spa-Francorchamps",
    path: "M82 236 C76 178 112 126 168 112 C222 98 260 54 332 64 C404 74 460 126 478 198 C494 262 432 306 354 280 C296 262 248 284 184 296 C126 306 88 276 82 236",
    start: { x1: 94, y1: 224, x2: 94, y2: 254 },
    sectors: [
      { label: "S1", x: 196, y: 92 },
      { label: "S2", x: 456, y: 176 },
      { label: "S3", x: 222, y: 300 },
    ],
    corners: [
      { label: "T1", x: 100, y: 194 },
      { label: "ER", x: 190, y: 108 },
      { label: "BL", x: 474, y: 210 },
      { label: "BS", x: 170, y: 296 },
    ],
    drs: [
      { label: "DRS", x: 282, y: 66 },
      { label: "DRS", x: 380, y: 286 },
    ],
  },
  monza: {
    name: "Monza",
    path: "M92 236 C86 166 128 100 204 92 C282 84 334 132 396 100 C454 70 514 110 504 174 C494 240 420 282 332 272 C242 262 106 304 92 236",
    start: { x1: 104, y1: 224, x2: 104, y2: 254 },
    sectors: [
      { label: "S1", x: 196, y: 82 },
      { label: "S2", x: 484, y: 154 },
      { label: "S3", x: 280, y: 286 },
    ],
    corners: [
      { label: "T1", x: 118, y: 172 },
      { label: "LES", x: 314, y: 116 },
      { label: "ASC", x: 486, y: 200 },
      { label: "PAR", x: 346, y: 272 },
    ],
    drs: [
      { label: "DRS", x: 286, y: 94 },
      { label: "DRS", x: 182, y: 290 },
    ],
  },
  singapore: {
    name: "Marina Bay",
    path: "M86 232 L86 116 C86 82 114 62 146 72 L252 106 C284 116 306 96 328 74 L388 112 L352 174 L482 174 L506 226 L438 272 L310 244 L246 292 L148 270 C110 262 86 244 86 232",
    start: { x1: 94, y1: 212, x2: 94, y2: 242 },
    sectors: [
      { label: "S1", x: 150, y: 66 },
      { label: "S2", x: 446, y: 166 },
      { label: "S3", x: 252, y: 294 },
    ],
    corners: [
      { label: "T1", x: 86, y: 118 },
      { label: "T7", x: 328, y: 76 },
      { label: "T14", x: 498, y: 224 },
      { label: "T19", x: 246, y: 292 },
    ],
    drs: [
      { label: "DRS", x: 226, y: 98 },
      { label: "DRS", x: 424, y: 176 },
    ],
  },
  austin: {
    name: "Circuit of the Americas",
    path: "M74 220 C82 134 156 82 254 82 C328 82 374 114 430 90 C490 64 528 112 500 168 C472 224 388 206 346 246 C306 284 206 294 136 264 C92 246 72 232 74 220",
    start: { x1: 88, y1: 208, x2: 88, y2: 238 },
    sectors: [
      { label: "S1", x: 196, y: 74 },
      { label: "S2", x: 482, y: 130 },
      { label: "S3", x: 260, y: 288 },
    ],
    corners: [
      { label: "T1", x: 104, y: 154 },
      { label: "ESS", x: 300, y: 92 },
      { label: "T12", x: 484, y: 170 },
      { label: "T19", x: 156, y: 266 },
    ],
    drs: [
      { label: "DRS", x: 350, y: 88 },
      { label: "DRS", x: 392, y: 226 },
    ],
  },
  "las-vegas": {
    name: "Las Vegas Strip",
    path: "M70 226 L112 86 L468 86 C510 86 528 118 500 150 L388 278 L132 278 C84 278 58 256 70 226",
    start: { x1: 82, y1: 214, x2: 102, y2: 236 },
    sectors: [
      { label: "S1", x: 146, y: 82 },
      { label: "S2", x: 486, y: 112 },
      { label: "S3", x: 282, y: 286 },
    ],
    corners: [
      { label: "T1", x: 84, y: 210 },
      { label: "T5", x: 116, y: 86 },
      { label: "T12", x: 500, y: 148 },
      { label: "T17", x: 134, y: 278 },
    ],
    drs: [
      { label: "DRS", x: 302, y: 82 },
      { label: "DRS", x: 400, y: 280 },
    ],
  },
  "yas-marina": {
    name: "Yas Marina",
    path: "M86 214 C90 138 158 88 242 96 C324 104 388 80 462 108 C512 128 522 190 474 220 C426 250 366 222 330 254 C288 290 198 288 132 258 C100 244 84 230 86 214",
    start: { x1: 98, y1: 202, x2: 98, y2: 232 },
    sectors: [
      { label: "S1", x: 190, y: 92 },
      { label: "S2", x: 470, y: 136 },
      { label: "S3", x: 260, y: 290 },
    ],
    corners: [
      { label: "T1", x: 104, y: 174 },
      { label: "T5", x: 298, y: 102 },
      { label: "T9", x: 482, y: 212 },
      { label: "T16", x: 188, y: 272 },
    ],
    drs: [
      { label: "DRS", x: 376, y: 96 },
      { label: "DRS", x: 404, y: 236 },
    ],
  },
};

function getTrackLayout(layoutKey: string | undefined, circuitName: string): TrackLayout {
  const key = layoutKey && TRACK_LAYOUTS[layoutKey] ? layoutKey : "fallback";
  const layout = TRACK_LAYOUTS[key] ?? FALLBACK_TRACK_LAYOUT;

  if (layout === FALLBACK_TRACK_LAYOUT && circuitName !== "Live Circuit") {
    return { ...layout, name: circuitName };
  }

  return layout;
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
  const countdownParts = countdown
    ? [
        ["D", countdown.days],
        ["H", countdown.hours],
        ["M", countdown.minutes],
        ["S", countdown.seconds],
      ]
    : [];
  const nextEvent = dashboard.nextSession
    ? dashboard.nextSession.circuitName
    : "Awaiting next session";

  return (
    <Panel className="race-hero relative overflow-hidden !p-0" tint="var(--team-accent-soft)">
      <div className="race-hero__rail" />
      <div className="grid lg:grid-cols-[minmax(0,1.48fr)_minmax(300px,0.52fr)]">
        <div className="race-hero__primary px-5 py-5 sm:px-7 sm:py-7 lg:px-9 lg:py-8">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="eyebrow text-[var(--foreground)]">Next session</span>
            <span className={`status-label ${scheduleTone.className}`}>{scheduleTone.label}</span>
            <span className="status-label">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--team-accent)]" />
              Updated {freshness}
            </span>
          </div>

          <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--team-accent)]">
                {dashboard.nextSession?.sessionName ?? "Schedule pending"}
              </div>
              <h1 className="race-title mt-2 text-[clamp(2.25rem,5vw,5.4rem)] font-semibold leading-[0.86] tracking-[-0.055em]">
                {nextEvent}
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[var(--muted)]">
                {dashboard.nextSession ? (
                  <>
                    <span className="inline-flex items-center gap-2"><Flag size={14} />{dashboard.nextSession.location}, {dashboard.nextSession.countryName}</span>
                    <span className="inline-flex items-center gap-2"><Clock3 size={14} />{formatSessionDate(dashboard.nextSession.dateStart)}</span>
                  </>
                ) : <span>Standing by for the next published weekend.</span>}
              </div>
            </div>

            <div className="min-w-0 sm:min-w-[270px]">
              <div className="eyebrow mb-2">Time to session</div>
              <div className="countdown-grid grid grid-cols-4">
                {countdownParts.length ? countdownParts.map(([label, value]) => (
                  <div key={label} className="countdown-cell">
                    <div className="telemetry-text text-[clamp(1.45rem,3vw,2.25rem)] font-semibold leading-none">{String(value).padStart(2, "0")}</div>
                    <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{label}</div>
                  </div>
                )) : <div className="col-span-4 py-3 text-xs text-[var(--muted)]">Timing pending</div>}
              </div>
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between gap-4 border-t border-[var(--line)] pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="h-8 w-1 shrink-0 rounded-full bg-[var(--team-accent)]" />
              <div className="min-w-0">
                <div className="eyebrow">Driver focus</div>
                <div className="mt-1 truncate text-sm font-semibold">
                  {selectedDriver?.fullName ?? "Select a driver"}
                  <span className="ml-2 font-normal text-[var(--muted)]">{selectedDriver ? `${selectedDriver.teamName} · ${selectedDriver.points} pts` : ""}</span>
                </div>
              </div>
            </div>
            <span className="telemetry-text text-lg font-bold" style={{ color: selectedDriver ? `#${selectedDriver.teamColor}` : undefined }}>{selectedDriver?.abbreviation ?? "--"}</span>
          </div>
        </div>

        <aside className="race-hero__schedule px-5 py-5 sm:px-7 lg:px-6 lg:py-8">
          <div className="flex items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
            <div><div className="eyebrow">Weekend schedule</div><div className="mt-1 text-sm font-semibold">Track time</div></div>
            <span className="telemetry-text text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Local</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {sessionStack.length ? sessionStack.map((session, index) => (
              <div key={session.sessionKey} className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 py-4">
                <span className="telemetry-text text-[10px] text-[var(--muted)]">0{index + 1}</span>
                <span className="truncate text-[13px] font-semibold">{session.sessionName}</span>
                <span className="telemetry-text text-[11px] text-[var(--muted)]">{formatTrackDate(session.dateStart, session.gmtOffset)}</span>
              </div>
            )) : <div className="py-4 text-xs text-[var(--muted)]">Upcoming sessions will appear here.</div>}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
            <span>Auto refresh</span><span className="telemetry-text text-[var(--foreground)]">30 SEC</span>
          </div>
        </aside>
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
            <DriverAvatar
              driver={driver}
              className="h-18 w-18 rounded-[18px] border border-black/8 sm:h-20 sm:w-20 sm:rounded-[20px]"
              sizes="80px"
              style={{ boxShadow: `0 14px 28px ${rgba(accent, 0.12)}` }}
            />
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
  debugMode,
  driverLabel,
  insights,
  isPlaying,
  isReplay,
  onTogglePlayback,
  onReplaySpeedChange,
  replaySpeed,
  sourceMeta,
  samples,
  session,
  scrubIndex,
  workerMetrics,
  onScrub,
}: {
  accent: string;
  debugMode: boolean;
  driverLabel: string | null;
  insights: DashboardData["telemetryInsights"];
  isPlaying: boolean;
  isReplay: boolean;
  onTogglePlayback: () => void;
  onReplaySpeedChange: (speed: TelemetryReplaySpeed) => void;
  replaySpeed: TelemetryReplaySpeed;
  sourceMeta: DashboardData["sources"]["telemetry"];
  samples: DashboardData["telemetrySamples"];
  session: SessionSummary | null;
  scrubIndex: number;
  workerMetrics: TelemetryWorkerMetrics;
  onScrub: (index: number | null) => void;
}) {
  const activeIndex = clampIndex(scrubIndex, Math.max(1, samples.length));
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
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!samples.length) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onScrub(clampIndex(activeIndex - 1, samples.length));
    }

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onScrub(clampIndex(activeIndex + 1, samples.length));
    }

    if (event.key === "Home") {
      event.preventDefault();
      onScrub(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      onScrub(samples.length - 1);
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
            {driverLabel
              ? `${driverLabel} ${sourceMeta.status === "live" ? "live trace" : "lap replay"}`
              : "Telemetry pending"}
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
          <button
            type="button"
            onClick={onTogglePlayback}
            aria-keyshortcuts="Space"
            className={`glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)] ${FOCUS_RING}`}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          {isReplay ? (
            <div
              className="glass-pill inline-flex items-center gap-1 rounded-full p-1"
              role="group"
              aria-label="Telemetry replay speed"
            >
              {TELEMETRY_REPLAY_SPEEDS.map((speed) => {
                const active = speed === replaySpeed;
                return (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => onReplaySpeedChange(speed)}
                    aria-pressed={active}
                    className={`rounded-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${FOCUS_RING}`}
                    style={{
                      color: active ? "var(--theme-on-accent)" : "var(--muted)",
                      background: active ? "var(--team-accent)" : "transparent",
                    }}
                  >
                    {speed}x
                  </button>
                );
              })}
            </div>
          ) : null}
          {debugMode ? (
            <>
              <FunBadge label="Telemetry hero" tone="dark" />
              <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                <Radio size={14} />
                /car_data
              </div>
            </>
          ) : null}
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
          value={workerMetrics ? `${workerMetrics.brakeEvents}` : insights ? `${insights.brakeEvents}` : "--"}
        />
      </div>

      <div className={`mt-4 grid gap-4 ${debugMode ? "lg:grid-cols-[minmax(0,1fr)_180px]" : "grid-cols-1"}`}>
        <div
          ref={chartRef}
          className={`minimal-card telemetry-scrubber signal-sheen rounded-[22px] p-4 select-none sm:cursor-crosshair ${FOCUS_RING}`}
          onPointerMove={handlePointer}
          onPointerEnter={handlePointer}
          onPointerLeave={() => onScrub(null)}
          onTouchMove={handleTouch}
          onTouchStart={handleTouch}
          onTouchEnd={() => onScrub(null)}
          onKeyDown={handleKeyDown}
          role="slider"
          tabIndex={samples.length ? 0 : -1}
          aria-label="Telemetry trace scrubber"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, samples.length - 1)}
          aria-valuenow={activeIndex}
          aria-valuetext={
            activeSample
              ? `${activeSample.elapsed.toFixed(1)} seconds, ${activeSample.speed} kilometers per hour`
              : "No telemetry sample"
          }
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: rgba(accent, 0.95) }}
                />
                Speed (km/h)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#e10600]" />
                Throttle (%)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--muted)]" />
                Brake (%)
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]/80 sm:ml-auto">
              {debugMode ? "drag or hover to sync the map" : "drag or hover to inspect the lap"}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
            <span>{sourceMeta.note}</span>
            {isReplay ? (
              <span className="telemetry-text uppercase tracking-[0.12em]">
                {isPlaying ? "Playing" : "Paused"} / {replaySpeed}x / Loop
              </span>
            ) : null}
          </div>
          <div className={`mb-3 grid gap-2 ${debugMode ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
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
            {debugMode ? (
              <div className="glass-pill rounded-[16px] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  Worker delta
                </div>
                <div className="telemetry-text mt-1 text-sm font-semibold text-[var(--foreground)]">
                  {workerMetrics ? formatDeltaSpeed(workerMetrics.maxDelta) : "--"}
                </div>
              </div>
            ) : null}
          </div>
          <div className="h-[240px] sm:h-[290px]">
            <TelemetryPlot
              samples={samples}
              accent={accent}
              activeIndex={activeIndex}
            />
          </div>
        </div>

        {debugMode ? <div className="minimal-card rounded-[22px] p-4">
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
        </div> : null}
      </div>
    </Panel>
  );
}

function AdvancedTelemetryPanel({
  activeSample,
  drivers,
  selectedDriver,
  samples,
  workerMetrics,
  onSelectDriver,
}: {
  activeSample: DashboardData["telemetrySamples"][number] | null;
  drivers: DriverInsight[];
  selectedDriver: DriverInsight | null;
  samples: DashboardData["telemetrySamples"];
  workerMetrics: TelemetryWorkerMetrics;
  onSelectDriver: (driverId: string) => void;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "unsupported">(
    "idle",
  );
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const predictedLap = useMemo(() => predictNextLapTime(samples), [samples]);
  const predictionConfidence = useMemo(() => {
    if (!samples.length || !workerMetrics) {
      return 0;
    }

    const stableAcceleration = Math.max(
      0,
      1 - Math.abs(workerMetrics.avgAcceleration) / 18,
    );
    return Math.round(Math.min(96, 52 + stableAcceleration * 34 + samples.length / 12));
  }, [samples.length, workerMetrics]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const startVoiceCommand = () => {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceState("unsupported");
      setVoiceTranscript("Speech recognition is not available in this browser.");
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[0]?.[0]?.transcript ?? "";
      const matchedDriver = findDriverFromVoice(result, drivers);
      setVoiceTranscript(result || "No command heard.");
      if (matchedDriver) {
        onSelectDriver(matchedDriver.id);
        logDashboardInteraction("voice_driver_select", matchedDriver.abbreviation);
      }
    };
    recognition.onerror = () => {
      setVoiceState("idle");
      setVoiceTranscript("Voice command was interrupted.");
    };
    recognition.onend = () => setVoiceState("idle");
    setVoiceState("listening");
    recognition.start();
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Next level</div>
            <FunBadge label="Local AI" tone="accent" />
          </div>
          <div className="section-title mt-2 text-base font-semibold sm:text-xl">
            Prediction suite
          </div>
        </div>
        {selectedDriver ? (
          <button
            type="button"
            onClick={() => {
              void shareDriverCard(selectedDriver, predictedLap, activeSample);
              logDashboardInteraction("share_driver_card", selectedDriver.abbreviation);
            }}
            className={`glass-pill inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)] ${FOCUS_RING}`}
          >
            <Share2 size={14} />
            Driver card
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="minimal-card rounded-[18px] p-4">
          <div className="eyebrow">Lap predictor</div>
          <div className="telemetry-text mt-2 text-2xl font-semibold text-[var(--foreground)]">
            {predictedLap ? formatLapTime(predictedLap) : "--"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Last-3 sample window with throttle, brake, and track progress weighted in.
          </div>
        </div>

        <div className="minimal-card rounded-[18px] p-4">
          <div className="eyebrow">Model confidence</div>
          <div className="telemetry-text mt-2 text-2xl font-semibold text-[var(--foreground)]">
            {predictionConfidence ? `${predictionConfidence}%` : "--"}
          </div>
          <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Worker signal: {workerMetrics ? `${workerMetrics.projectedNextSpeed.toFixed(0)} km/h next sample` : "waiting for samples"}.
          </div>
        </div>

        <div className="minimal-card rounded-[18px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow">Voice command</div>
              <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                Show driver trace
              </div>
            </div>
            <button
              type="button"
              onClick={startVoiceCommand}
              className={`grid h-10 w-10 place-items-center rounded-full bg-[var(--team-accent)] text-white ${FOCUS_RING}`}
              aria-label="Start voice command"
            >
              <Mic size={16} />
            </button>
          </div>
          <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {voiceState === "listening"
              ? "Listening..."
              : voiceTranscript || "Awaiting garage command."}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function LiveActionDock({
  circuitName,
  layoutKey,
  cars,
  selectedDriver,
  insights,
  liveTiming,
  telemetrySamples,
  teamRadio,
  scrubIndex,
  drivers,
  selectedDriverId,
  onSelect,
  onScrub,
}: {
  circuitName: string;
  layoutKey: string;
  cars: DashboardData["trackMap"]["cars"];
  selectedDriver: DriverInsight | null;
  insights: DashboardData["telemetryInsights"];
  liveTiming: DashboardData["liveTiming"];
  telemetrySamples: DashboardData["telemetrySamples"];
  teamRadio: DashboardData["teamRadio"];
  scrubIndex: number;
  drivers: DriverInsight[];
  selectedDriverId: string;
  onSelect: (driverId: string) => void;
  onScrub: (index: number) => void;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const selectedDriverRadioClips = selectedDriver
    ? teamRadio.clips.filter(
        (clip) =>
          clip.driverId === selectedDriver.id ||
          clip.driverNumber === selectedDriver.sessionDriverNumber,
      )
    : [];
  const layout = getTrackLayout(layoutKey, circuitName);
  const activeSample =
    telemetrySamples[clampIndex(scrubIndex, Math.max(1, telemetrySamples.length))] ?? null;
  const phaseTone = activeSample ? getPhaseTone(activeSample.phase) : null;
  const scrubProgress =
    telemetrySamples.length > 1
      ? clampUnit(
          clampIndex(scrubIndex, telemetrySamples.length) /
            Math.max(1, telemetrySamples.length - 1),
        )
      : 0;
  const [scrubPoint, setScrubPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) {
      setScrubPoint(null);
      return;
    }

    const point = getPathPointAtProgress(path, 0.08 + scrubProgress * 0.84);
    setScrubPoint(point);
  }, [layout.path, scrubProgress]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || !cars.length) {
      setPositions({});
      return;
    }

    const nextPositions: Record<string, { x: number; y: number }> = {};

    cars.forEach((car, index) => {
      const progress =
        Number.isFinite(car.trackProgress)
          ? 0.08 + clampUnit(car.trackProgress) * 0.84
          : ((cars.length - index) / (cars.length + 1)) * 0.84 + 0.08;
      const point = getPathPointAtProgress(path, progress);
      if (point) {
        nextPositions[car.driverId] = point;
      }
    });

    setPositions(nextPositions);
  }, [cars, layout.path]);

  const handleMapPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!telemetrySamples.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if (!Number.isFinite(ratio)) {
      return;
    }

    onScrub(clampIndex(Math.round(ratio * (telemetrySamples.length - 1)), telemetrySamples.length));
  };

  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <Panel
        className="overflow-hidden p-3 sm:p-4"
        tint={selectedDriver ? rgba(selectedDriver.teamColor, 0.08) : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="eyebrow">Live action</div>
              <span className="inline-flex items-center rounded-full bg-[#e10600] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                Pinned
              </span>
            </div>
            <div className="section-title mt-1 text-lg font-semibold sm:text-xl">
              Circuit view + timing tower
            </div>
          </div>
          <MapIcon size={16} className="text-[var(--muted)]" />
        </div>

        <div className="broadcast-map signal-sheen mt-3 rounded-[22px] p-3.5 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#e10600] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                  Track map
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/48">
                  {liveTiming.connection === "websocket" ? "current event" : "session replay"}
                </span>
              </div>
              <div className="mt-2 text-base font-semibold text-white">{circuitName}</div>
              <div className="text-[12px] text-white/55">
                {layout.name} layout, scrub synced to telemetry
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {phaseTone ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]"
                  style={{
                    borderColor: phaseTone.color,
                    background: "rgba(255,255,255,0.08)",
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
              <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {liveTiming.connection === "websocket" ? "Live" : liveTiming.connection === "eventsource" ? "Replay" : "Offline"}
              </span>
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-[14px] border border-white/10 bg-white/[0.07] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/46">
                Peak
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-white">
                {insights ? `${insights.peakSpeed}` : "--"}
              </div>
            </div>
            <div className="rounded-[14px] border border-white/10 bg-white/[0.07] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/46">
                High-gear time
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-white">
                {insights ? `${insights.topGearPct.toFixed(0)}%` : "--"}
              </div>
            </div>
            <div className="rounded-[14px] border border-white/10 bg-white/[0.07] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/46">
                Gear shifts
              </div>
              <div className="telemetry-text mt-1 text-sm font-semibold text-white">
                {insights ? `${insights.gearChanges}` : "--"}
              </div>
            </div>
          </div>
          <svg
            viewBox="0 0 560 320"
            className="h-[206px] w-full cursor-crosshair sm:h-[238px]"
            role="img"
            aria-label={`${circuitName} broadcast-style circuit map`}
            onPointerMove={handleMapPointer}
          >
            <defs>
              <linearGradient id="trackStroke" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
                <stop offset="50%" stopColor="rgba(255,255,255,0.78)" />
                <stop offset="100%" stopColor="rgba(225,6,0,0.86)" />
              </linearGradient>
              <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0.9 0 0.2 0 0 0.05 0 0 0.2 0 0.04 0 0 0 0.45 0"
                />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect x="18" y="18" width="524" height="284" rx="24" fill="rgba(255,255,255,0.035)" />
            <path
              d="M42 260 L130 68 L512 68"
              fill="none"
              stroke="rgba(225,6,0,0.18)"
              strokeWidth="1.5"
              strokeDasharray="7 9"
            />
            <path
              d="M54 282 L512 282"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              strokeDasharray="4 8"
            />
            <path
              ref={pathRef}
              d={layout.path}
              fill="none"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={layout.path}
              fill="none"
              stroke="url(#trackStroke)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#trackGlow)"
            />
            <line
              x1={layout.start.x1}
              y1={layout.start.y1}
              x2={layout.start.x2}
              y2={layout.start.y2}
              stroke="#e10600"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1={layout.start.x1 + 8}
              y1={layout.start.y1}
              x2={layout.start.x2 + 8}
              y2={layout.start.y2}
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {layout.drs.map((zone) => (
              <g key={`${zone.label}-${zone.x}-${zone.y}`} transform={`translate(${zone.x}, ${zone.y})`}>
                <rect x="-18" y="-8" width="36" height="16" rx="6" fill="rgba(225,6,0,0.94)" />
                <text
                  textAnchor="middle"
                  y="4"
                  className="telemetry-text"
                  fill="white"
                  fontSize="8"
                  fontWeight="700"
                >
                  {zone.label}
                </text>
              </g>
            ))}
            {layout.sectors.map((sector) => (
              <g key={sector.label} transform={`translate(${sector.x}, ${sector.y})`}>
                <circle r="13" fill="rgba(255,255,255,0.94)" stroke="rgba(225,6,0,0.45)" />
                <text
                  textAnchor="middle"
                  y="4"
                  className="telemetry-text"
                  fill="rgba(17,21,29,0.92)"
                  fontSize="10"
                  fontWeight="700"
                >
                  {sector.label}
                </text>
              </g>
            ))}
            {layout.corners.map((corner) => (
              <g key={corner.label} transform={`translate(${corner.x}, ${corner.y})`}>
                <circle r="9" fill="rgba(3,7,18,0.92)" stroke="rgba(255,255,255,0.22)" />
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
                  <circle r="7" fill={`#${car.teamColor}`} stroke="white" strokeWidth="1.5" />
                  <text
                    y="-17"
                    textAnchor="middle"
                    className="telemetry-text"
                    fill="rgba(255,255,255,0.84)"
                    fontSize="10"
                    fontWeight="700"
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
                  fill="white"
                  fontSize="11"
                  fontWeight="700"
                >
                  {selectedDriver.abbreviation}
                </text>
              </g>
            ) : null}
          </svg>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-white/56">
            <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1">
              start / finish
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1">
              sector split calls
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1">
              drs windows
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="eyebrow">Timing tower</div>
            <div className="section-title mt-2 text-lg font-semibold">Driver rail</div>
          </div>
          <Users size={16} className="text-[var(--muted)]" />
        </div>

        {selectedDriver ? (
          <div className="minimal-card mt-3 grid grid-cols-[54px_minmax(0,1fr)] items-center gap-3 rounded-[18px] p-3">
            <DriverAvatar
              driver={selectedDriver}
              className="h-[54px] w-[54px] rounded-full border border-black/6"
              sizes="54px"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {selectedDriver.fullName}
                </div>
                <span
                  className="telemetry-text rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: rgba(selectedDriver.teamColor, 0.12),
                    color: `#${selectedDriver.teamColor}`,
                  }}
                >
                  {selectedDriver.abbreviation}
                </span>
              </div>
              <div className="mt-1 flex items-start gap-2 text-xs text-[var(--muted)]">
                <Headphones size={14} className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">
                  {selectedDriverRadioClips.length
                    ? `${selectedDriverRadioClips.length} official ${teamRadio.session?.circuitName ?? "session"} archive ${selectedDriverRadioClips.length === 1 ? "clip" : "clips"} in Team Radio.`
                    : `No official radio clip released for this driver in the ${teamRadio.session?.circuitName ?? "session"} archive.`}
                </span>
              </div>
            </div>
          </div>
        ) : null}

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
                aria-pressed={active}
                aria-label={`Select ${driver.fullName}, position ${driver.standingPosition}`}
                className={`text-left ${FOCUS_RING}`}
              >
                <div
                  className="group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[15px] border px-2.5 py-2 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    borderColor: active
                      ? rgba(driver.teamColor, 0.38)
                      : "var(--line)",
                    background: active
                      ? `linear-gradient(90deg, ${rgba(driver.teamColor, 0.18)}, var(--surface-strong))`
                      : "var(--surface)",
                    boxShadow: active
                      ? `0 12px 22px ${rgba(driver.teamColor, 0.12)}`
                      : "0 8px 16px rgba(17,21,29,0.035)",
                  }}
                >
                  <span
                    className="h-8 w-1.5 rounded-full"
                    style={{
                      background: active
                        ? `linear-gradient(180deg, #${driver.teamColor}, ${rgba(driver.teamColor, 0.2)})`
                        : "var(--line)",
                    }}
                  />
                  <div className="flex w-8 flex-col items-center justify-center">
                    <div
                      className={`telemetry-text text-[13px] font-semibold ${
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
                      <span className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        top
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-tight text-[var(--foreground)] sm:text-sm">
                      {driver.fullName}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11px] text-[var(--muted)]">
                        {driver.teamName}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-[var(--muted)]/40" />
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {driver.points} pts
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="telemetry-text rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
                      style={{
                        background: rgba(driver.teamColor, 0.12),
                        color: `#${driver.teamColor}`,
                      }}
                    >
                      {driver.abbreviation}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
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
  const allEntries = useMemo(() => {
    const byId = new Map<string, FantasyEntry>();
    [...fantasy.topValue, ...fantasy.priceRisers].forEach((entry) => {
      byId.set(entry.driverId, entry);
    });
    return Array.from(byId.values());
  }, [fantasy.priceRisers, fantasy.topValue]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const selectedEntries = allEntries.filter((entry) => teamIds.includes(entry.driverId));
  const spent = selectedEntries.reduce((sum, entry) => sum + entry.price, 0);
  const projected = selectedEntries.reduce((sum, entry) => sum + entry.points, 0);
  const budgetLeft = 50 - spent;

  const addToTeam = (driverId: string) => {
    setTeamIds((current) => {
      if (current.includes(driverId) || current.length >= 5) {
        return current;
      }

      const entry = allEntries.find((item) => item.driverId === driverId);
      if (!entry || spent + entry.price > 50) {
        return current;
      }

      logDashboardInteraction("fantasy_builder", entry.label);
      return [...current, driverId];
    });
  };

  const removeFromTeam = (driverId: string) => {
    setTeamIds((current) => current.filter((id) => id !== driverId));
  };

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
    <Panel className={fantasy.source === "fallback" ? "simulation-panel" : undefined}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Fantasy hub</div>
            <FunBadge
              label={fantasy.source === "official" ? "Official game" : "Simulation"}
              tone={fantasy.source === "official" ? "accent" : "dark"}
            />
          </div>
          <div className="section-title mt-2 text-base font-semibold sm:text-xl">
            {fantasy.source === "official" ? "Value picks and risers" : "Fantasy sandbox"}
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            {fantasy.note}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setBuilderOpen((open) => !open)}
          className={`glass-pill rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)] ${FOCUS_RING}`}
        >
          Build your team
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${feedTone.className}`}
        >
          {feedTone.label}
        </span>
        {sourceMeta.note !== fantasy.note ? (
          <span className="text-xs text-[var(--muted)]">{sourceMeta.note}</span>
        ) : null}
      </div>

      {builderOpen ? (
        <div className="minimal-card mt-4 rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="eyebrow">Builder</div>
              <div className="section-title mt-2 text-base font-semibold">
                5-driver cap / $50M budget
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right">
              <StatChip label="Drivers" value={`${teamIds.length}/5`} />
              <StatChip label="Budget" value={`$${budgetLeft.toFixed(1)}M`} />
              <StatChip label="Proj." value={`${projected}`} />
            </div>
          </div>
          <div
            className="mt-4 grid min-h-[108px] gap-2 rounded-[16px] border border-dashed border-black/12 bg-white/58 p-3 sm:grid-cols-5"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addToTeam(event.dataTransfer.getData("text/plain"));
            }}
          >
            {Array.from({ length: 5 }).map((_, index) => {
              const entry = selectedEntries[index];
              return entry ? (
                <button
                  key={entry.driverId}
                  type="button"
                  onClick={() => removeFromTeam(entry.driverId)}
                  className={`rounded-[14px] border border-black/6 bg-white px-3 py-2 text-left ${FOCUS_RING}`}
                >
                  <div className="truncate text-sm font-semibold">{entry.label}</div>
                  <div className="telemetry-text mt-1 text-xs text-[var(--muted)]">
                    ${entry.price.toFixed(1)}M / {entry.points} pts
                  </div>
                </button>
              ) : (
                <div
                  key={`slot-${index}`}
                  className="grid min-h-[74px] place-items-center rounded-[14px] border border-black/6 bg-white/60 text-xs uppercase tracking-[0.14em] text-[var(--muted)]"
                >
                  Slot {index + 1}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {allEntries.map((entry) => {
              const disabled =
                teamIds.includes(entry.driverId) ||
                teamIds.length >= 5 ||
                spent + entry.price > 50;
              return (
                <button
                  key={`builder-${entry.driverId}`}
                  type="button"
                  draggable={!disabled}
                  disabled={disabled}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", entry.driverId)}
                  onClick={() => addToTeam(entry.driverId)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                    disabled
                      ? "border-black/6 bg-black/5 text-[var(--muted)] opacity-60"
                      : "border-black/8 bg-white/78 text-[var(--foreground)] hover:-translate-y-0.5"
                  } ${FOCUS_RING}`}
                >
                  {entry.label} / ${entry.price.toFixed(1)}M
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3.5 sm:gap-4 xl:grid-cols-2">
        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div className="section-title text-sm font-semibold">
              {fantasy.source === "official" ? "Top value" : "Estimated value"}
            </div>
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
                    aria-pressed={watchlist.has(entry.driverId)}
                    aria-label={`${watchlist.has(entry.driverId) ? "Remove" : "Add"} ${entry.label} from watchlist`}
                    className={`min-w-[88px] rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ${
                      watchlist.has(entry.driverId)
                        ? "bg-[var(--team-accent-soft)] text-[var(--team-accent)]"
                        : "bg-[rgba(17,21,29,0.08)] text-[var(--foreground)]"
                    } ${FOCUS_RING}`}
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
            <div className="section-title text-sm font-semibold">
              {fantasy.source === "official" ? "Price risers" : "Modeled movers"}
            </div>
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
                    <div className="text-xs text-[var(--muted)]">
                      {fantasy.source === "official" ? "market delta" : "model score"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleWatch(entry.driverId)}
                    aria-pressed={watchlist.has(entry.driverId)}
                    aria-label={`${watchlist.has(entry.driverId) ? "Remove" : "Add"} ${entry.label} from watchlist`}
                    className={`min-w-[88px] rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ${
                      watchlist.has(entry.driverId)
                        ? "bg-[var(--team-accent-soft)] text-[var(--team-accent)]"
                        : "bg-[rgba(17,21,29,0.08)] text-[var(--foreground)]"
                    } ${FOCUS_RING}`}
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

function RaceControlPanel({
  raceControl,
  initialNow,
}: {
  raceControl: DashboardData["raceControl"];
  initialNow: number;
}) {
  const countdown = useCountdown(raceControl.countdownEndsAt, initialNow);
  const flagTone: Record<DashboardData["raceControl"]["flag"], string> = {
    Idle: "bg-[#697386]",
    Green: "bg-[#00a76f]",
    Yellow: "bg-[#d5a125]",
    Red: "bg-[#e10600]",
    VSC: "bg-[#0066cc]",
    SC: "bg-[#11151d]",
  };

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Race control</div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white ${flagTone[raceControl.flag]}`}
            >
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" />
              {raceControl.flag}
            </span>
          </div>
          <div className="section-title mt-2 text-base font-semibold sm:text-xl">
            {raceControl.message}
          </div>
        </div>
        <div className="glass-pill rounded-full px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
          {countdown
            ? `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`
            : "live monitor"}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {raceControl.events.length ? raceControl.events.map((event) => (
          <div
            key={event.id}
            className="grid gap-3 rounded-[14px] border border-black/6 bg-white/70 px-3 py-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="telemetry-text text-xs text-[var(--muted)]">
              {formatActivityTime(event.timestamp)}
            </span>
            <span className="text-sm font-medium text-[var(--foreground)]">
              {event.message}
            </span>
            <span className="rounded-full border border-black/6 bg-white/78 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {event.type}
            </span>
          </div>
        )) : (
          <div className="rounded-[14px] border border-dashed border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--muted)]">
            Verified FIA race-control messages will appear here when a live upstream feed is available. News headlines are intentionally kept out of this channel.
          </div>
        )}
      </div>
    </Panel>
  );
}

function TeamRadioPanel({
  radio,
  sourceMeta,
}: {
  radio: DashboardData["teamRadio"];
  sourceMeta: DashboardData["sources"]["teamRadio"];
}) {
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [failedClipId, setFailedClipId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceTone = getFeedTone(sourceMeta.status);
  const visibleClips = expanded ? radio.clips : radio.clips.slice(0, 3);
  const hiddenClipCount = Math.max(radio.clips.length - visibleClips.length, 0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggleClip = async (clip: DashboardData["teamRadio"]["clips"][number]) => {
    if (activeClipId === clip.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setActiveClipId(null);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(clip.recordingUrl);
    audio.preload = "none";
    audio.onended = () => {
      audioRef.current = null;
      setActiveClipId(null);
    };
    audio.onerror = () => {
      audioRef.current = null;
      setActiveClipId(null);
      setFailedClipId(clip.id);
    };
    audioRef.current = audio;
    setActiveClipId(clip.id);
    setFailedClipId(null);
    logDashboardInteraction("team_radio_play", clip.driverId ?? clip.driverNumber);

    try {
      await audio.play();
    } catch {
      audioRef.current = null;
      setActiveClipId(null);
      setFailedClipId(clip.id);
    }
  };

  return (
    <Panel tint="var(--team-accent-wash)">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Team radio</div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${sourceTone.className}`}
            >
              {sourceTone.label}
            </span>
          </div>
          <div className="section-title mt-2 text-base font-semibold sm:text-xl">
            {radio.session
              ? `${radio.session.circuitName} radio archive`
              : "Radio archive unavailable"}
          </div>
          <div className="section-copy mt-1 text-[13px]">
            {radio.session
              ? `${radio.session.sessionName} / officially released clips only`
              : "A session key is required before audio can be loaded."}
          </div>
        </div>
        <Headphones size={18} className="mt-1 shrink-0 text-[var(--muted)]" />
      </div>

      {radio.clips.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {visibleClips.map((clip) => {
            const playing = activeClipId === clip.id;
            const failed = failedClipId === clip.id;
            return (
              <button
                key={clip.id}
                type="button"
                onClick={() => void toggleClip(clip)}
                aria-label={`${playing ? "Pause" : "Play"} ${clip.driverLabel} team radio`}
                aria-pressed={playing}
                className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left transition hover:-translate-y-px ${FOCUS_RING}`}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{
                    color: `#${clip.teamColor}`,
                    background: rgba(clip.teamColor, 0.14),
                  }}
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                    {clip.driverLabel}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    {clip.abbreviation} / {formatTrackDate(clip.recordedAt, radio.session?.gmtOffset ?? "+00:00")}
                  </span>
                </span>
                <span className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${failed ? "text-[#c51b17]" : "text-[var(--muted)]"}`}>
                  {failed ? "Unavailable" : playing ? "Playing" : "Clip"}
                </span>
              </button>
            );
          })}

          {radio.clips.length > 3 ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                if (expanded && activeClipId && !radio.clips.slice(0, 3).some((clip) => clip.id === activeClipId)) {
                  audioRef.current?.pause();
                  audioRef.current = null;
                  setActiveClipId(null);
                }
                setExpanded((current) => !current);
              }}
              className={`flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] transition hover:border-[var(--team-accent)] hover:text-[var(--foreground)] md:col-span-3 ${FOCUS_RING}`}
            >
              {expanded ? "Show fewer" : `Show ${hiddenClipCount} more`}
              <ChevronDown
                size={13}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-[14px] border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5">
          <div className="text-sm font-semibold text-[var(--foreground)]">
            No released radio for this session
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {radio.note}
          </div>
        </div>
      )}

      {radio.clips.length ? (
        <div className="mt-3 border-t border-[var(--line)] pt-3 text-xs leading-5 text-[var(--muted)]">
          {radio.note}
        </div>
      ) : null}
    </Panel>
  );
}

function DashboardTabs({
  activeTab,
  onChange,
}: {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}) {
  return (
    <div className="dashboard-tabs sticky top-2 z-30 border border-[var(--line)] bg-[var(--panel-strong)] p-1.5 shadow-[0_14px_34px_rgba(17,21,29,0.08)] backdrop-blur-xl">
      <div
        className="grid grid-cols-4 gap-0.5"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {DASHBOARD_TABS.map((tab, index) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-keyshortcuts={String(index + 1)}
              onClick={() => onChange(tab.id)}
              title={`${tab.label}: ${tab.description} (shortcut ${index + 1})`}
              className={`group flex min-w-0 items-center justify-center gap-1.5 px-2 py-2.5 text-left transition sm:gap-2 sm:px-3 ${FOCUS_RING} ${
                active
                  ? "bg-[var(--team-accent)] text-[var(--theme-on-accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className={`telemetry-text hidden text-[9px] sm:inline ${active ? "opacity-60" : "opacity-45"}`}>{index + 1}</span>
              <Icon size={14} aria-hidden="true" />
              <span className="truncate text-xs font-semibold">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatTimingGap(value: number | string | null, leader = false) {
  if (leader) {
    return "LEADER";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `+${value.toFixed(3)}`;
  }

  if (typeof value === "string" && value.trim()) {
    return value.startsWith("+") ? value : `+${value}`;
  }

  return "--";
}

function getSectorTone(
  state: DashboardData["timingTower"]["entries"][number]["sectorStates"]["sector1"],
) {
  if (state === "overall-best") {
    return "border-[#9b51e0]/30 bg-[#9b51e0]/14 text-[#9b51e0]";
  }
  if (state === "personal-best") {
    return "border-[#00a76f]/30 bg-[#00a76f]/12 text-[#00a76f]";
  }
  if (state === "slower") {
    return "border-[#d5a125]/25 bg-[#d5a125]/10 text-[#9b7416]";
  }
  return "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]";
}

function getCompoundTone(compound: string | null) {
  switch (compound?.toUpperCase()) {
    case "SOFT":
      return { label: "S", color: "#e10600", background: "rgba(225,6,0,0.12)" };
    case "MEDIUM":
      return { label: "M", color: "#a87800", background: "rgba(213,161,37,0.16)" };
    case "HARD":
      return { label: "H", color: "var(--foreground)", background: "var(--surface-strong)" };
    case "INTERMEDIATE":
      return { label: "I", color: "#008f60", background: "rgba(0,167,111,0.13)" };
    case "WET":
      return { label: "W", color: "#3976c3", background: "rgba(57,118,195,0.13)" };
    default:
      return { label: "?", color: "var(--muted)", background: "var(--surface)" };
  }
}

function PositionChange({ value }: { value: number | null }) {
  if (value === null || value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] text-[var(--muted)]">
        <Minus size={9} /> 0
      </span>
    );
  }

  const gained = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-semibold ${gained ? "text-[#00a76f]" : "text-[#c51b17]"}`}
      title={`${Math.abs(value)} position${Math.abs(value) === 1 ? "" : "s"} ${gained ? "gained" : "lost"} since the first recorded race position`}
    >
      {gained ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
      {Math.abs(value)}
    </span>
  );
}

function SectorCell({
  label,
  value,
  state,
}: {
  label: string;
  value: number | null;
  state: DashboardData["timingTower"]["entries"][number]["sectorStates"]["sector1"];
}) {
  return (
    <span
      className={`telemetry-text inline-flex min-w-0 flex-col rounded-[8px] border px-1.5 py-1 ${getSectorTone(state)}`}
      title={`${label}: ${state.replace("-", " ")}`}
    >
      <span className="text-[8px] font-semibold uppercase tracking-[0.1em] opacity-65">{label}</span>
      <span className="mt-0.5 text-[10px] font-semibold">
        {value === null ? "--" : value.toFixed(3)}
      </span>
    </span>
  );
}

function TimingBoardPanel({
  timing,
  selectedDriverId,
  onSelect,
}: {
  timing: DashboardData["timingTower"];
  selectedDriverId: string;
  onSelect: (driverId: string) => void;
}) {
  const leader = timing.entries[0] ?? null;
  const classifiedCount = timing.entries.filter(
    (entry) => entry.raceStatus === "classified",
  ).length;
  const lapNumber = Math.max(
    0,
    ...timing.entries.map((entry) => entry.latestLapNumber ?? 0),
  );
  const sourceTone = getFeedTone(timing.status);

  if (!timing.entries.length) {
    return (
      <Panel>
        <div className="eyebrow">Race timing</div>
        <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
          Timing unavailable
        </div>
        <div className="mt-4 rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--muted)]">
          {timing.note}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Race timing</div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${sourceTone.className}`}>
              {sourceTone.label}
            </span>
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Session replay
            </span>
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            {timing.session
              ? `${timing.session.circuitName} ${timing.session.sessionName}`
              : "Full field order"}
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            {timing.note}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatChip label="Lap" value={lapNumber ? `${lapNumber}` : "--"} />
          <StatChip label="Leader" value={leader?.abbreviation ?? "--"} accent={leader?.teamColor} />
          <StatChip label="Classified" value={`${classifiedCount}`} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--line)] py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        <span>Sector:</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#9b51e0]" /> Overall best</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#00a76f]" /> Personal best</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d5a125]" /> Slower</span>
        <span className="ml-auto">Position change uses first recorded race position</span>
      </div>

      <div className="mt-3 grid gap-2 md:hidden">
        {timing.entries.map((entry) => {
          const active = selectedDriverId === entry.driverId;
          const compound = getCompoundTone(entry.compound);

          return (
            <button
              key={entry.driverId}
              type="button"
              onClick={() => onSelect(entry.driverId)}
              aria-pressed={active}
              className={`rounded-[14px] border p-3 text-left transition ${FOCUS_RING}`}
              style={{
                borderColor: active ? rgba(entry.teamColor, 0.42) : "var(--line)",
                background: active
                  ? `linear-gradient(90deg, ${rgba(entry.teamColor, 0.15)}, var(--surface-strong))`
                  : "var(--surface)",
              }}
            >
              <span className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5">
                <span className="flex flex-col">
                  <span className="telemetry-text text-base font-semibold text-[var(--foreground)]">P{entry.position}</span>
                  <PositionChange value={entry.positionChange} />
                </span>
                <span className="min-w-0 border-l-2 pl-2.5" style={{ borderColor: `#${entry.teamColor}` }}>
                  <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{entry.abbreviation} · {entry.fullName}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">{entry.teamName}</span>
                </span>
                <span className="text-right">
                  <span className="telemetry-text block text-sm font-semibold text-[var(--foreground)]">{entry.raceStatus === "classified" ? formatTimingGap(entry.gapToLeader, entry.position === 1) : entry.raceStatus.toUpperCase()}</span>
                  <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">Gap</span>
                </span>
              </span>
              <span className="mt-3 grid grid-cols-4 gap-1.5 border-t border-[var(--line)] pt-2.5">
                <span><span className="eyebrow block text-[8px]">Interval</span><span className="telemetry-text mt-1 block text-[11px] font-semibold">{entry.raceStatus === "classified" ? formatTimingGap(entry.interval) : "--"}</span></span>
                <span><span className="eyebrow block text-[8px]">Last</span><span className="telemetry-text mt-1 block text-[11px] font-semibold">{formatLapTime(entry.lastLap)}</span></span>
                <span><span className="eyebrow block text-[8px]">Tyre</span><span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full" style={{ color: compound.color, background: compound.background }}>{compound.label}</span>{entry.tyreAge === null ? "--" : `L${entry.tyreAge}`}</span></span>
                <span><span className="eyebrow block text-[8px]">Pit</span><span className="telemetry-text mt-1 block text-[11px] font-semibold">{entry.pitStops} stop{entry.pitStops === 1 ? "" : "s"}</span></span>
              </span>
              <span className="mt-2 grid grid-cols-3 gap-1.5">
                <SectorCell label="S1" value={entry.sectors.sector1} state={entry.sectorStates.sector1} />
                <SectorCell label="S2" value={entry.sectors.sector2} state={entry.sectorStates.sector2} />
                <SectorCell label="S3" value={entry.sectors.sector3} state={entry.sectorStates.sector3} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 hidden overflow-x-auto hide-scrollbar md:block">
        <div className="min-w-[1180px]">
          <div className="grid grid-cols-[62px_minmax(170px,1.25fr)_92px_92px_102px_102px_72px_72px_72px_106px_86px] gap-2 px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>Pos</span><span>Driver</span><span>Gap</span><span>Interval</span><span>Last lap</span><span>Best lap</span><span>S1</span><span>S2</span><span>S3</span><span>Tyre</span><span>Pit</span>
          </div>
          <div className="grid gap-1.5">
            {timing.entries.map((entry) => {
              const active = selectedDriverId === entry.driverId;
              const compound = getCompoundTone(entry.compound);

              return (
                <button
                  key={entry.driverId}
                  type="button"
                  onClick={() => onSelect(entry.driverId)}
                  aria-pressed={active}
                  className={`grid grid-cols-[62px_minmax(170px,1.25fr)_92px_92px_102px_102px_72px_72px_72px_106px_86px] items-center gap-2 rounded-[12px] border px-3 py-2 text-left transition hover:-translate-y-px ${FOCUS_RING}`}
                  style={{
                    borderColor: active ? rgba(entry.teamColor, 0.42) : "var(--line)",
                    background: active
                      ? `linear-gradient(90deg, ${rgba(entry.teamColor, 0.15)}, var(--surface-strong))`
                      : "var(--surface)",
                  }}
                >
                  <span className="flex flex-col">
                    <span className="telemetry-text text-sm font-semibold text-[var(--foreground)]">P{entry.position}</span>
                    <PositionChange value={entry.positionChange} />
                  </span>
                  <span className="min-w-0 border-l-2 pl-2.5" style={{ borderColor: `#${entry.teamColor}` }}>
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{entry.abbreviation} · {entry.fullName}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">#{entry.permanentNumber} · {entry.teamName}</span>
                  </span>
                  <span className="telemetry-text text-xs font-semibold text-[var(--foreground)]">{entry.raceStatus === "classified" ? formatTimingGap(entry.gapToLeader, entry.position === 1) : entry.raceStatus.toUpperCase()}</span>
                  <span className="telemetry-text text-xs text-[var(--muted)]">{entry.raceStatus === "classified" ? formatTimingGap(entry.interval) : "--"}</span>
                  <span className="telemetry-text text-xs text-[var(--foreground)]">{formatLapTime(entry.lastLap)}</span>
                  <span className="telemetry-text text-xs text-[var(--muted)]">{formatLapTime(entry.bestLap)}</span>
                  <SectorCell label="S1" value={entry.sectors.sector1} state={entry.sectorStates.sector1} />
                  <SectorCell label="S2" value={entry.sectors.sector2} state={entry.sectorStates.sector2} />
                  <SectorCell label="S3" value={entry.sectors.sector3} state={entry.sectorStates.sector3} />
                  <span className="inline-flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold" style={{ color: compound.color, background: compound.background }} title={entry.compound ?? "Compound unavailable"}>{compound.label}</span>
                    <span className="telemetry-text text-[11px] text-[var(--foreground)]">{entry.tyreAge === null ? "--" : `${entry.tyreAge}L`}</span>
                  </span>
                  <span className="text-[10px] text-[var(--foreground)]">
                    <span className="telemetry-text block font-semibold">{entry.pitStops} stop{entry.pitStops === 1 ? "" : "s"}</span>
                    <span className="mt-0.5 block text-[9px] text-[var(--muted)]">{entry.lastPitLap === null ? entry.pitStatus : `last L${entry.lastPitLap}`}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function getStrategySignalTone(
  signal: DashboardData["strategy"]["drivers"][number]["pitOutcomes"][number]["signal"],
) {
  if (signal === "undercut" || signal === "overcut" || signal === "gained") {
    return "border-[#00a76f]/25 bg-[#00a76f]/10 text-[#00845a]";
  }
  if (signal === "lost") {
    return "border-[#e10600]/20 bg-[#e10600]/8 text-[#c51b17]";
  }
  return "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]";
}

function TelemetryComparisonPanel({
  comparison,
}: {
  comparison: DashboardData["telemetryComparison"];
}) {
  const [reference, challenger] = comparison.traces;
  const sourceTone = getFeedTone(comparison.status);
  const lapDelta =
    reference && challenger ? challenger.lapTime - reference.lapTime : null;

  return (
    <Panel tint="var(--team-accent-wash)">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Comparison</div>
          <div className="section-title mt-2 text-xl font-semibold">
            Fastest-lap reference
          </div>
          <div className="section-copy mt-1 text-[13px]">
            {comparison.session?.circuitName ?? "Session-matched traces"}
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${sourceTone.className}`}
        >
          {sourceTone.label}
        </span>
      </div>

      <div className="mt-5 grid gap-2.5">
        {comparison.traces.length ? (
          comparison.traces.slice(0, 2).map((trace, index) => {
            const peakSpeed = trace.samples.reduce(
              (peak, sample) => Math.max(peak, sample.speed),
              0,
            );

            return (
              <div
                key={`${trace.driverId}-${trace.lapNumber}`}
                className="minimal-card rounded-[18px] p-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="telemetry-text grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold"
                      style={{
                        background: rgba(trace.teamColor, 0.14),
                        color: `#${trace.teamColor}`,
                      }}
                    >
                      {trace.abbreviation}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                        {trace.driverLabel}
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                        Lap {trace.lapNumber} / {trace.samples.length} samples
                      </span>
                    </span>
                  </div>
                  <span className="text-right">
                    <span className="telemetry-text block text-sm font-semibold text-[var(--foreground)]">
                      {formatLapTime(trace.lapTime)}
                    </span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
                      {index === 0 ? "Reference" : `${peakSpeed} km/h peak`}
                    </span>
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[18px] border border-dashed border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
            No session-matched comparison traces are available.
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="eyebrow">Lap delta</div>
          <div className="telemetry-text mt-2 text-xl font-semibold text-[var(--foreground)]">
            {lapDelta === null ? "--" : `${formatDelta(lapDelta)}s`}
          </div>
        </div>
        <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="eyebrow">Trace depth</div>
          <div className="telemetry-text mt-2 text-xl font-semibold text-[var(--foreground)]">
            {comparison.traces.reduce((sum, trace) => sum + trace.samples.length, 0)}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-3 text-xs leading-5 text-[var(--muted)]">
        {comparison.note}
      </div>
    </Panel>
  );
}

function StrategyPanel({
  strategy,
  selectedDriverId,
  onSelect,
}: {
  strategy: DashboardData["strategy"];
  selectedDriverId: string;
  onSelect: (driverId: string) => void;
}) {
  const [showFullField, setShowFullField] = useState(false);
  const driversWithStints = strategy.drivers.filter((driver) => driver.stints.length);
  const visibleDrivers = showFullField
    ? driversWithStints
    : driversWithStints.slice(0, 6);
  const totalStops = strategy.drivers.reduce(
    (sum, driver) => sum + driver.pitOutcomes.length,
    0,
  );
  const sourceTone = getFeedTone(strategy.status);
  const totalLaps = Math.max(strategy.totalLaps, 1);

  if (!driversWithStints.length) {
    return (
      <Panel>
        <div className="eyebrow">Strategy</div>
        <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
          Stint replay unavailable
        </div>
        <div className="mt-4 rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--muted)]">
          {strategy.note}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Strategy</div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${sourceTone.className}`}>
              {sourceTone.label}
            </span>
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Session replay
            </span>
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            {strategy.session
              ? `${strategy.session.circuitName} stint map`
              : "Tyre and pit sequence"}
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            See when the race changed: compound sequence, stop timing, and the first observable position response.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatChip label="Race laps" value={`${strategy.totalLaps || "--"}`} />
          <StatChip label="Strategies" value={`${driversWithStints.length}`} />
          <StatChip label="Stops" value={`${totalStops}`} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--line)] py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {[
          ["SOFT", "Soft"],
          ["MEDIUM", "Medium"],
          ["HARD", "Hard"],
          ["INTERMEDIATE", "Intermediate"],
          ["WET", "Wet"],
        ].map(([compound, label]) => {
          const tone = getCompoundTone(compound);
          return (
            <span key={compound} className="inline-flex items-center gap-1.5">
              <span
                className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold"
                style={{ color: tone.color, background: tone.background }}
              >
                {tone.label}
              </span>
              {label}
            </span>
          );
        })}
        <span className="ml-auto">Pit markers sit on the lap timeline</span>
      </div>

      <div className="mt-4 min-w-0 max-w-full overflow-x-auto hide-scrollbar">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[58px_150px_minmax(500px,1fr)_138px] items-center gap-3 px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>Finish</span>
            <span>Driver</span>
            <span className="flex justify-between"><span>Lap 1</span><span>Lap {strategy.totalLaps}</span></span>
            <span>Stop read</span>
          </div>
          <div className="grid gap-1.5">
            {visibleDrivers.map((driver) => {
              const active = driver.driverId === selectedDriverId;
              const signal =
                driver.pitOutcomes.find(
                  (outcome) => outcome.signal === "undercut" || outcome.signal === "overcut",
                ) ??
                driver.pitOutcomes.find(
                  (outcome) => outcome.positionDelta !== null && outcome.positionDelta !== 0,
                ) ??
                driver.pitOutcomes.at(-1) ??
                null;
              const signalLabel = signal
                ? `${signal.signal === "unavailable" ? "No read" : signal.signal}${
                    signal.positionDelta
                      ? ` ${signal.positionDelta > 0 ? "+" : ""}${signal.positionDelta}`
                      : ""
                  }`
                : "No stop";

              return (
                <button
                  key={driver.driverId}
                  type="button"
                  onClick={() => onSelect(driver.driverId)}
                  aria-pressed={active}
                  className={`grid grid-cols-[58px_150px_minmax(500px,1fr)_138px] items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition hover:-translate-y-px ${FOCUS_RING}`}
                  style={{
                    borderColor: active ? rgba(driver.teamColor, 0.42) : "var(--line)",
                    background: active
                      ? `linear-gradient(90deg, ${rgba(driver.teamColor, 0.14)}, var(--surface-strong))`
                      : "var(--surface)",
                  }}
                >
                  <span className="telemetry-text text-sm font-semibold text-[var(--foreground)]">
                    P{driver.finalPosition}
                  </span>
                  <span className="min-w-0 border-l-2 pl-2.5" style={{ borderColor: `#${driver.teamColor}` }}>
                    <span className="block text-sm font-semibold text-[var(--foreground)]">{driver.abbreviation}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">{driver.fullName}</span>
                  </span>
                  <span className="relative block h-8 overflow-hidden rounded-[9px] border border-[var(--line)] bg-[var(--surface-strong)]">
                    {driver.stints.map((stint) => {
                      const tone = getCompoundTone(stint.compound);
                      const lapEnd = stint.lapEnd ?? strategy.totalLaps;
                      const left = ((stint.lapStart - 1) / totalLaps) * 100;
                      const width = (Math.max(1, lapEnd - stint.lapStart + 1) / totalLaps) * 100;
                      return (
                        <span
                          key={`${driver.driverId}-${stint.stintNumber}`}
                          className="absolute inset-y-1 flex items-center overflow-hidden rounded-[6px] border px-1.5 text-[9px] font-semibold"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            color: tone.color,
                            background: tone.background,
                            borderColor: rgba(driver.teamColor, 0.16),
                          }}
                          title={`${stint.compound ?? "Unknown compound"}, laps ${stint.lapStart}-${lapEnd}`}
                        >
                          {tone.label} {stint.lapStart}-{lapEnd}
                        </span>
                      );
                    })}
                    {driver.pitOutcomes.map((outcome, index) => (
                      <span
                        key={`${driver.driverId}-pit-${outcome.lapNumber}-${index}`}
                        className="absolute inset-y-0 z-10 w-px bg-[var(--foreground)]/55"
                        style={{ left: `${(outcome.lapNumber / totalLaps) * 100}%` }}
                        title={`Pit lap ${outcome.lapNumber}: ${outcome.signal}`}
                      />
                    ))}
                  </span>
                  <span
                    className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${getStrategySignalTone(signal?.signal ?? "unavailable")}`}
                    title={signal ? `Position before: ${signal.positionBefore ?? "--"}; after: ${signal.positionAfter ?? "--"}` : "No pit event recorded"}
                  >
                    {signalLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          Showing {visibleDrivers.length} of {driversWithStints.length} classified drivers
        </div>
        {driversWithStints.length > 6 ? (
          <button
            type="button"
            onClick={() => setShowFullField((current) => !current)}
            aria-expanded={showFullField}
            className={`glass-pill rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)] ${FOCUS_RING}`}
          >
            {showFullField ? "Show top 6" : `Show full field (${driversWithStints.length})`}
          </button>
        ) : null}
      </div>

      <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[10px] leading-4 text-[var(--muted)]">
        Method: position immediately before a stop is compared with the first recorded position within four minutes after it. Undercut or overcut labels also compare that stop lap with the median lap for the field&apos;s equivalent stop. This is a directional replay signal, not proof that pit timing alone caused the gain.
      </div>
    </Panel>
  );
}

function StatsPanel({
  drivers,
}: {
  drivers: DriverInsight[];
}) {
  const constructors = buildConstructorStandings(drivers);
  const topDrivers = drivers.slice(0, 6);
  const podiumLeader = drivers
    .slice()
    .sort((a, b) => b.totalPodiums - a.totalPodiums)[0] ?? null;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Stats</div>
            <FunBadge label="Championship lens" tone="accent" />
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            Standings and form
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            Season constructor points and separately labeled driver career context.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatChip label="Teams" value={`${constructors.length}`} />
          <StatChip label="Top podiums" value={podiumLeader?.abbreviation ?? "--"} accent={podiumLeader?.teamColor} />
          <StatChip label="Season field" value={`${drivers.length}`} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow">Constructors</div>
              <div className="section-title mt-2 text-base font-semibold">Team table</div>
            </div>
            <Trophy size={16} className="text-[var(--muted)]" />
          </div>
          <div className="grid gap-2">
            {constructors.map((team, index) => (
              <div
                key={team.teamName}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-black/6 bg-white/70 px-3 py-3"
              >
                <span className="telemetry-text w-8 text-sm font-semibold">P{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: `#${team.teamColor}` }}
                    />
                    <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {team.teamName}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {team.drivers.join(" / ")} · season points only
                  </div>
                </div>
                <span className="telemetry-text text-sm font-semibold">{team.points} pts</span>
              </div>
            ))}
          </div>
        </div>

        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow">Driver form</div>
              <div className="section-title mt-2 text-base font-semibold">Top six pace traces</div>
            </div>
            <Activity size={16} className="text-[var(--muted)]" />
          </div>
          <div className="grid gap-3">
            {topDrivers.map((driver) => (
              <div
                key={driver.id}
                className="grid gap-3 rounded-[14px] border border-black/6 bg-white/70 p-3 sm:grid-cols-[180px_minmax(0,1fr)_90px] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {driver.fullName}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{driver.teamName}</div>
                </div>
                <div className="h-14">
                  <Sparkline
                    values={driver.paceSeries}
                    stroke={rgba(driver.teamColor, 0.95)}
                    fill={rgba(driver.teamColor, 0.08)}
                    height={70}
                  />
                </div>
                <div className="text-right">
                  <div className="telemetry-text text-sm font-semibold">
                    {driver.sentiment.score}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    pulse
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function NewsroomPanel({
  activity,
}: {
  activity: DashboardData["activity"];
}) {
  const leadItem = activity.items[0] ?? null;
  const secondaryItems = activity.items.slice(1, 7);
  const liveSources = activity.sourcePulse.filter((source) => source.status === "live").length;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Newsroom</div>
            <FunBadge label={`${activity.items.length} signals`} tone="accent" />
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            Activity around the paddock
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            Motorsport.com, The Race, Reddit, and X folded into one source-aware activity board.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatChip label="Sources" value={`${activity.sourcePulse.length}`} />
          <StatChip label="Live" value={`${liveSources}`} />
          <StatChip label="Top signal" value={leadItem ? `${leadItem.signalScore}` : "--"} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(300px,0.54fr)]">
        <div className="grid gap-3">
          {leadItem ? (
            <a
              href={leadItem.url}
              target="_blank"
              rel="noreferrer"
              className={`minimal-card group relative min-h-[260px] overflow-hidden rounded-[20px] p-4 transition hover:-translate-y-0.5 sm:rounded-[22px] sm:p-5 ${FOCUS_RING}`}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[var(--team-accent)]" />
              <div className="absolute right-3 top-3 flex items-center gap-2">
                <span className="telemetry-text rounded-full border border-white/60 bg-white/82 px-2.5 py-1 text-[10px] font-semibold text-[var(--foreground)] shadow-sm">
                  {leadItem.signalScore}
                </span>
                <span className="rounded-full border border-white/60 bg-white/82 p-2 shadow-sm">
                  <ArrowUpRight size={14} />
                </span>
              </div>
              <div className="pr-20">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getCategoryTone(leadItem.category).className}`}>
                    {getCategoryTone(leadItem.category).label}
                  </span>
                  <span className="rounded-full border border-black/8 bg-white/72 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {leadItem.sourceLabel}
                  </span>
                </div>
                <div className="section-title mt-5 text-[1.65rem] font-semibold leading-[1.02] sm:text-[2.25rem]">
                  {leadItem.title}
                </div>
                <div className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                  {leadItem.summary || "Source activity is being monitored for more context."}
                </div>
              </div>
              <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center justify-between gap-2 border-t border-black/8 pt-3 text-xs text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={13} />
                  {formatActivityTime(leadItem.publishedAt)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MessageCircle size={13} />
                  {leadItem.engagementLabel}
                </span>
              </div>
            </a>
          ) : (
            <div className="minimal-card rounded-[20px] p-5 text-sm text-[var(--muted)] sm:rounded-[22px]">
              Activity feeds are standing by.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {secondaryItems.map((item) => {
              const tone = getCategoryTone(item.category);

              return (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`minimal-card group relative overflow-hidden rounded-[18px] p-4 transition hover:-translate-y-0.5 ${FOCUS_RING}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.className}`}>
                        {tone.label}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {item.sourceLabel}
                      </span>
                    </div>
                    <span className="telemetry-text rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold">
                      {item.signalScore}
                    </span>
                  </div>
                  <div className="mt-3 line-clamp-3 text-sm font-semibold leading-5 text-[var(--foreground)]">
                    {item.title}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={`${item.id}-${tag}`}
                        className="rounded-full border border-black/6 bg-white/70 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 content-start">
          <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="eyebrow">Source pulse</div>
                <div className="section-title mt-2 text-base font-semibold">Feed health</div>
              </div>
              <Newspaper size={16} className="text-[var(--muted)]" />
            </div>
            <div className="grid gap-2">
              {activity.sourcePulse.map((source) => {
                const tone = getFeedTone(source.status);

                return (
                  <div
                    key={source.source}
                    className="rounded-[14px] border border-black/6 bg-white/70 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[var(--foreground)]">
                        {source.label}
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tone.className}`}>
                        {source.count}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {tone.label} / {source.note ?? "Monitoring"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function RaceIntelPanel({
  intel,
}: {
  intel: DashboardData["raceIntelligence"];
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Race Intel</div>
            <FunBadge label={intel.raceLabel} tone="accent" />
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            {intel.headline}
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            Verified upgrade mentions stay separate from timing-derived pace so evidence and inference never blur.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatChip label="Upgrades" value={`${intel.upgradeSignals.length}`} />
          <StatChip label="Timing" value={`${intel.timingDeltas.length}`} />
          <StatChip
            label="Confidence"
            value={intel.upgradeSignals[0] ? `${intel.upgradeSignals[0].confidence}%` : "--"}
            accent={intel.upgradeSignals[0]?.teamColor}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,0.55fr)_minmax(0,1.45fr)]">
        <div className="grid gap-3">
          {intel.upgradeSignals.length ? intel.upgradeSignals.map((signal) => (
            <div
              key={signal.id}
              className="minimal-card team-tint relative overflow-hidden rounded-[20px] p-4 sm:rounded-[22px]"
              style={{ ["--team-tint" as string]: rgba(signal.teamColor, 0.1) }}
            >
              <div className="absolute right-3 top-3 flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getImpactTone(signal.impact)}`}>
                  {signal.impact}
                </span>
                <span
                  className="telemetry-text rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: rgba(signal.teamColor, 0.13), color: `#${signal.teamColor}` }}
                >
                  {signal.confidence}%
                </span>
              </div>
              <div className="pr-24">
                <div className="flex items-center gap-2">
                  <span className="rounded-[12px] bg-white/72 p-2">
                    <Wrench size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {signal.teamName}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{signal.package}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm leading-6 text-[var(--muted)]">
                  {signal.evidence}
                </div>
              </div>
            </div>
          )) : (
            <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
              <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-black/5 text-[var(--muted)]">
                <Wrench size={17} />
              </span>
              <div className="eyebrow mt-5">Upgrade evidence</div>
              <div className="section-title mt-2 text-base font-semibold">
                No sourced package signal
              </div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                This area activates only when an external editorial item names a team and an upgrade or package. Timing data alone does not create an upgrade claim.
              </div>
            </div>
          )}
        </div>

        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow">Timing deltas</div>
              <div className="section-title mt-2 text-base font-semibold">Race-specific read</div>
            </div>
            <Gauge size={16} className="text-[var(--muted)]" />
          </div>
          <div className="grid gap-2">
            {intel.timingDeltas.map((delta, index) => (
              <div
                key={delta.driverId}
                className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-black/6 bg-white/70 px-3 py-3"
              >
                <span
                  className="telemetry-text rounded-full px-2.5 py-1 text-center text-[11px] font-semibold"
                  style={{ background: rgba(delta.teamColor, 0.12), color: `#${delta.teamColor}` }}
                >
                  {delta.driverLabel}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="telemetry-text text-sm font-semibold text-[var(--foreground)]">
                      {formatDelta(delta.deltaToBest)}
                    </span>
                    <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                      {delta.sectorFocus}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-[var(--muted)]">
                    {delta.note} / avg {formatLapTime(delta.avgLap)}
                  </div>
                </div>
                <span className="telemetry-text text-xs text-[var(--muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function WeekendInfoPanel({
  dashboard,
  alertLeadMinutes,
  notificationPermission,
  onAlertLeadChange,
}: {
  dashboard: DashboardData;
  alertLeadMinutes: SessionAlertLeadMinutes;
  notificationPermission: "default" | "granted" | "denied" | "unsupported";
  onAlertLeadChange: (leadMinutes: SessionAlertLeadMinutes) => void;
}) {
  const feeds = [
    dashboard.sources.schedule,
    dashboard.sources.telemetry,
    dashboard.sources.fantasy,
    dashboard.sources.activity,
    dashboard.sources.raceIntel,
    dashboard.sources.teamRadio ?? {
      label: "Team radio",
      source: "OpenF1 /team_radio",
      status: "empty" as const,
      updatedAt: null,
      note: "Refresh to check official radio coverage for the archived session.",
    },
  ];
  const nextSession = dashboard.nextSession;
  const reminderArmed =
    alertLeadMinutes > 0 && notificationPermission === "granted";

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Weekend</div>
            <FunBadge label="Info desk" tone="accent" />
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            Event context
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            Session schedule, track timing, source health, and circuit metadata in one quieter reference view.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatChip label="Season" value={`${dashboard.season}`} />
          <StatChip label="Sessions" value={`${dashboard.nextSessions.length}`} />
          <StatChip
            label="Circuit"
            value={nextSession?.circuitName ?? dashboard.trackMap.circuitName}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="eyebrow">Schedule</div>
              <div className="section-title mt-2 text-base font-semibold">
                {nextSession ? `${nextSession.circuitName} weekend` : "Awaiting published weekend"}
              </div>
            </div>
            <Flag size={16} className="text-[var(--muted)]" />
          </div>
          <div className="grid gap-2">
            {dashboard.nextSessions.length ? (
              dashboard.nextSessions.map((session, index) => {
                const weather = dashboard.weekendWeather.find(
                  (item) => item.sessionKey === session.sessionKey,
                );
                const links = buildCalendarLinks(session);

                return (
                  <div
                    key={session.sessionKey}
                    className="grid gap-3 rounded-[14px] border border-black/6 bg-white/70 px-3 py-3 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <span className="telemetry-text text-sm font-semibold text-[var(--foreground)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {session.sessionName}
                      </div>
                      <div className="truncate text-xs text-[var(--muted)]">
                        {session.location}, {session.countryName}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                        <span>
                          {weather
                            ? `${weather.temperatureC}C / ${weather.rainChance}% rain / ${weather.summary}`
                            : "Weather source unavailable"}
                        </span>
                        <a href={links.google} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          Google
                        </a>
                        <a href={links.apple} className="underline underline-offset-2">
                          Apple
                        </a>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="telemetry-text text-sm font-semibold">
                        {formatTrackDate(session.dateStart, session.gmtOffset)}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {formatSessionDate(session.dateStart)}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[14px] border border-black/6 bg-white/70 px-3 py-3 text-sm text-[var(--muted)]">
                No upcoming sessions are published in the current feed snapshot.
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow">Session reminder</div>
                <div className="section-title mt-2 text-base font-semibold">
                  {notificationPermission === "denied"
                    ? "Reminder blocked"
                    : reminderArmed
                      ? `${alertLeadMinutes} min before lights on`
                      : "Stay ahead of the session"}
                </div>
              </div>
              {reminderArmed ? (
                <Bell size={16} className="mt-0.5 text-[var(--team-accent)]" />
              ) : (
                <BellOff size={16} className="mt-0.5 text-[var(--muted)]" />
              )}
            </div>

            {nextSession ? (
              <>
                <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Session reminder lead time">
                  {SESSION_ALERT_LEAD_TIMES.map((leadMinutes) => {
                    const selected = leadMinutes
                      ? reminderArmed && alertLeadMinutes === leadMinutes
                      : !reminderArmed;
                    const blocked =
                      leadMinutes > 0 &&
                      (notificationPermission === "denied" ||
                        notificationPermission === "unsupported");

                    return (
                      <button
                        key={leadMinutes}
                        type="button"
                        aria-pressed={selected}
                        disabled={blocked}
                        onClick={() => onAlertLeadChange(leadMinutes)}
                        className={`rounded-[10px] border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          selected
                            ? "border-[var(--team-accent)] bg-[var(--team-accent)] text-[var(--theme-on-accent)]"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        } ${FOCUS_RING}`}
                      >
                        {leadMinutes ? `${leadMinutes}m` : "Off"}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  {notificationPermission === "denied"
                    ? "Browser notifications are blocked for this site. Re-enable them in site settings to arm a reminder."
                    : notificationPermission === "unsupported"
                      ? "This browser does not support local notifications. Use a calendar link for a reliable reminder."
                      : reminderArmed
                        ? `Armed for ${nextSession.sessionName}. Keep this dashboard open; use a calendar link when you will be away.`
                        : "Choose a lead time to request browser permission. Calendar links work when this dashboard is closed."}
                </div>
              </>
            ) : (
              <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
                A reminder can be armed when the schedule feed publishes the next session.
              </div>
            )}
          </div>

          <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
            <div className="eyebrow">Data scope</div>
            <div className="section-title mt-2 text-base font-semibold">
              Session boundaries
            </div>
            <div className="mt-3 grid gap-2">
              <MiniStat
                icon={<Flag size={14} />}
                label="Next weekend"
                value={nextSession?.circuitName ?? "Awaiting schedule"}
              />
              <MiniStat
                icon={<MapIcon size={14} />}
                label="Replay archive"
                value={dashboard.trackMap.circuitName}
              />
              <MiniStat
                icon={<Radio size={14} />}
                label="Telemetry"
                value={dashboard.telemetrySamples.length ? `${dashboard.telemetrySamples.length} samples` : "--"}
              />
            </div>
          </div>

          <div className="minimal-card rounded-[20px] p-4 sm:rounded-[22px]">
            <div className="eyebrow">Source health</div>
            <div className="mt-3 grid gap-2">
              {feeds.map((feed) => {
                const tone = getFeedTone(feed.status);

                return (
                  <div
                    key={feed.label}
                    className="rounded-[14px] border border-black/6 bg-white/70 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[var(--foreground)]">
                        {feed.label}
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tone.className}`}
                      >
                        {tone.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{feed.source}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function WatchlistPanel({
  drivers,
  watchlist,
  onToggleWatch,
}: {
  drivers: DriverInsight[];
  watchlist: Set<string>;
  onToggleWatch: (driverId: string) => void;
}) {
  const watchedDrivers = drivers.filter((driver) => watchlist.has(driver.id));

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow">Fantasy watchlist</div>
            <FunBadge label={`${watchedDrivers.length} saved`} tone="accent" />
          </div>
          <div className="section-title mt-2 text-xl font-semibold sm:text-[1.8rem]">
            Shortlist board
          </div>
          <div className="section-copy mt-1 text-[13px] sm:text-sm">
            Drivers added from value and riser cards are now promoted into a proper workspace.
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {watchedDrivers.length ? (
          watchedDrivers.map((driver) => (
            <div
              key={driver.id}
              className="minimal-card team-tint rounded-[20px] p-4 sm:rounded-[22px]"
              style={{ ["--team-tint" as string]: rgba(driver.teamColor, 0.1) }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {driver.fullName}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{driver.teamName}</div>
                </div>
                <span
                  className="telemetry-text rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    background: rgba(driver.teamColor, 0.12),
                    color: `#${driver.teamColor}`,
                  }}
                >
                  {driver.abbreviation}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatChip label="Pts" value={`${driver.points}`} accent={driver.teamColor} />
                <StatChip label="Pulse" value={`${driver.sentiment.score}`} />
                <StatChip label="Avg" value={formatLapTime(driver.avgLap)} />
              </div>
              <button
                type="button"
                onClick={() => onToggleWatch(driver.id)}
                className={`mt-4 rounded-full bg-[rgba(17,21,29,0.08)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)] ${FOCUS_RING}`}
              >
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="minimal-card rounded-[20px] p-5 text-sm text-[var(--muted)] sm:rounded-[22px] md:col-span-2 xl:col-span-3">
            Add drivers from the value or riser lists below to build a shortlist.
          </div>
        )}
      </div>
    </Panel>
  );
}

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const dispatch = useAppDispatch();
  const query = useGetDashboardQuery();
  const [offlineData, setOfflineData] = useState<DashboardData | null>(null);
  const data = query.data ?? offlineData ?? initialData;
  const timingTower: DashboardData["timingTower"] = data.timingTower ?? {
    session: data.telemetrySession,
    status: "empty",
    updatedAt: null,
    note: "Refresh to load the session-scoped timing model introduced in this version.",
    entries: [],
  };
  const strategy: DashboardData["strategy"] = data.strategy ?? {
    session: data.telemetrySession,
    status: "empty",
    updatedAt: null,
    note: "Refresh to load the session-scoped strategy replay introduced in this version.",
    totalLaps: 0,
    drivers: [],
  };
  const telemetryComparison: DashboardData["telemetryComparison"] =
    data.telemetryComparison ?? {
      session: data.telemetrySession,
      status: "empty",
      updatedAt: null,
      note: "Refresh to load two session-matched telemetry traces.",
      traces: [],
    };
  const teamRadio: DashboardData["teamRadio"] = data.teamRadio ?? {
    session: data.telemetrySession,
    status: "empty",
    updatedAt: null,
    note: "Refresh to check whether F1 released official radio clips for this session.",
    clips: [],
  };
  const teamRadioSource: DashboardData["sources"]["teamRadio"] =
    data.sources.teamRadio ?? {
      label: "Team radio",
      source: "OpenF1 /team_radio",
      status: "empty",
      updatedAt: null,
      note: teamRadio.note,
    };
  const refetch = () => query.refetch().unwrap();
  const isFetching = query.isFetching;
  const error = query.error;

  useEffect(() => {
    dispatch(
      dashboardApi.util.upsertQueryData("getDashboard", undefined, initialData),
    );
    void saveDashboardSnapshot(initialData);
  }, [dispatch, initialData]);

  useEffect(() => {
    void loadLatestDashboardSnapshot().then((snapshot) => {
      if (snapshot) {
        setOfflineData(snapshot);
      }
    });
  }, []);

  useVisibilityRefresh(refetch);
  const isOnline = useOnlineStatus();
  const ui = useAppSelector((state) => state.dashboardUi);
  const telemetryWorkerMetrics = useTelemetryWorker(data.telemetrySamples);

  const snapshotNow = useMemo(
    () => new Date(data.generatedAt).getTime(),
    [data.generatedAt],
  );
  const freshness = useRelativeTime(snapshotNow, snapshotNow);
  const selectedDriverId = ui.selectedDriverId;
  const watchlist = useMemo(() => new Set(ui.watchlist), [ui.watchlist]);
  const scrubIndex = ui.scrubIndex;
  const activeTab = normalizeDashboardTab(ui.activeTab) ?? "live";
  const isTelemetryPlaying = ui.isTelemetryPlaying;
  const telemetryReplaySpeed = normalizeTelemetryReplaySpeed(
    ui.telemetryReplaySpeed,
  );
  const sessionAlertLeadMinutes = normalizeSessionAlertLeadMinutes(
    ui.sessionAlertLeadMinutes,
  );
  const [hasMounted, setHasMounted] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");
  const scrubFrameRef = useRef<number | null>(null);
  const lastPlayFrameRef = useRef<number | null>(null);
  const replayElapsedRef = useRef(0);
  const replayIndexRef = useRef(0);
  const deliveredAlertKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHasMounted(true);
      setDebugMode(
        new URLSearchParams(window.location.search).get("debug") === "1",
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const urlTab = normalizeDashboardTab(
        new URLSearchParams(window.location.search).get("view"),
      );
      const rawPrefs = window.localStorage.getItem(DASHBOARD_PREFS_KEY);
      if (!rawPrefs) {
        if (urlTab) {
          dispatch(hydratePreferences({ activeTab: urlTab }));
        }
        setPrefsLoaded(true);
        return;
      }

      try {
        const parsed = JSON.parse(rawPrefs) as {
          activeTab?: string;
          selectedDriverId?: string;
          watchlist?: string[];
          scrubIndex?: number;
          isTelemetryPlaying?: boolean;
          telemetryReplaySpeed?: number;
          sessionAlertLeadMinutes?: number;
          themeMode?: "system" | "light" | "dark";
          visualTheme?: string;
        };

        dispatch(
          hydratePreferences({
            activeTab: urlTab ?? normalizeDashboardTab(parsed.activeTab) ?? "live",
            selectedDriverId:
              parsed.selectedDriverId &&
              data.standings.some((driver) => driver.id === parsed.selectedDriverId)
                ? parsed.selectedDriverId
                : undefined,
            watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : undefined,
            scrubIndex:
              typeof parsed.scrubIndex === "number" ? parsed.scrubIndex : undefined,
            isTelemetryPlaying:
              typeof parsed.isTelemetryPlaying === "boolean"
                ? parsed.isTelemetryPlaying
                : undefined,
            telemetryReplaySpeed: normalizeTelemetryReplaySpeed(
              parsed.telemetryReplaySpeed,
            ),
            sessionAlertLeadMinutes: normalizeSessionAlertLeadMinutes(
              parsed.sessionAlertLeadMinutes,
            ),
            themeMode: parsed.themeMode,
            visualTheme:
              typeof parsed.visualTheme === "string" ? parsed.visualTheme : undefined,
          }),
        );
      } catch {
        window.localStorage.removeItem(DASHBOARD_PREFS_KEY);
        if (urlTab) {
          dispatch(hydratePreferences({ activeTab: urlTab }));
        }
      } finally {
        setPrefsLoaded(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [data.standings, dispatch]);

  useEffect(() => {
    const syncTabFromHistory = () => {
      const tab =
        normalizeDashboardTab(
          new URLSearchParams(window.location.search).get("view"),
        ) ?? "live";
      dispatch(setActiveTabAction(tab));
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", syncTabFromHistory);
    return () => window.removeEventListener("popstate", syncTabFromHistory);
  }, [dispatch]);

  useEffect(() => {
    if (!prefsLoaded) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("view") !== activeTab) {
      url.searchParams.set("view", activeTab);
      window.history.replaceState(
        { ...window.history.state, view: activeTab },
        "",
        url,
      );
    }
  }, [activeTab, prefsLoaded]);

  useEffect(() => {
    if (!selectedDriverId && data.standings[0]?.id) {
      dispatch(setSelectedDriverId(data.standings[0].id));
    }
  }, [data.standings, dispatch, selectedDriverId]);

  useEffect(() => {
    if (!prefsLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(
        DASHBOARD_PREFS_KEY,
        JSON.stringify({
          activeTab,
          selectedDriverId,
          watchlist: ui.watchlist,
          scrubIndex,
          isTelemetryPlaying,
          telemetryReplaySpeed,
          sessionAlertLeadMinutes,
          themeMode: ui.themeMode,
          visualTheme: ui.visualTheme,
        }),
      );
    } catch {
      // Preferences are a convenience; private browsing/storage limits should not affect the dashboard.
    }
  }, [
    activeTab,
    isTelemetryPlaying,
    prefsLoaded,
    sessionAlertLeadMinutes,
    scrubIndex,
    selectedDriverId,
    ui.themeMode,
    ui.visualTheme,
    ui.watchlist,
    telemetryReplaySpeed,
  ]);

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(
        "Notification" in window ? Notification.permission : "unsupported",
      );
    };

    syncNotificationPermission();
    window.addEventListener("focus", syncNotificationPermission);
    return () => window.removeEventListener("focus", syncNotificationPermission);
  }, []);

  useEffect(() => {
    const session = data.nextSession;
    if (
      !prefsLoaded ||
      !session ||
      !sessionAlertLeadMinutes ||
      notificationPermission !== "granted"
    ) {
      return;
    }

    const notifyWhenDue = () => {
      const startsAt = new Date(session.dateStart).getTime();
      const now = Date.now();
      const alertWindowStart = startsAt - sessionAlertLeadMinutes * 60_000;
      if (now < alertWindowStart || now >= startsAt) {
        return;
      }

      const notificationKey = `pphq-session-alert/${session.sessionKey}/${sessionAlertLeadMinutes}`;
      if (deliveredAlertKeysRef.current.has(notificationKey)) {
        return;
      }
      try {
        if (window.localStorage.getItem(notificationKey)) {
          deliveredAlertKeysRef.current.add(notificationKey);
          return;
        }
      } catch {
        // A notification can still be useful when storage is unavailable.
      }

      try {
        const notification = new Notification(
          `F1 ${session.sessionName} starts in ${sessionAlertLeadMinutes} minutes`,
          {
            body: `${session.circuitName} / ${session.location}, ${session.countryName}`,
            tag: notificationKey,
          },
        );
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        deliveredAlertKeysRef.current.add(notificationKey);
        logDashboardInteraction("session_alert_fire", String(session.sessionKey));
      } catch {
        return;
      }

      try {
        window.localStorage.setItem(notificationKey, new Date().toISOString());
      } catch {
        // Notification delivery does not depend on preference storage.
      }
    };

    notifyWhenDue();
    const timer = window.setInterval(notifyWhenDue, 30_000);
    return () => window.clearInterval(timer);
  }, [
    data.nextSession,
    notificationPermission,
    prefsLoaded,
    sessionAlertLeadMinutes,
  ]);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    const root = document.documentElement;
    if (ui.themeMode === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.dataset.theme = ui.themeMode;
    }

    logDashboardInteraction("theme_change", ui.themeMode);
  }, [hasMounted, ui.themeMode]);

  useEffect(() => {
    if (hasMounted) {
      markDashboardInteractive();
    }
  }, [hasMounted]);

  const effectiveSelectedDriverId = useMemo(
    () =>
      data.standings.some((driver) => driver.id === selectedDriverId)
        ? selectedDriverId
        : data.standings[0]?.id ?? "",
    [data.standings, selectedDriverId],
  );
  const effectiveScrubIndex = useMemo(
    () => clampIndex(scrubIndex, Math.max(1, data.telemetrySamples.length)),
    [data.telemetrySamples.length, scrubIndex],
  );
  const selectedDriver = useMemo(
    () =>
      data.standings.find((driver) => driver.id === effectiveSelectedDriverId) ??
      data.standings[0] ??
      null,
    [data.standings, effectiveSelectedDriverId],
  );
  const telemetryDriver = useMemo(
    () =>
      data.standings.find((driver) => driver.id === data.telemetryDriverId) ??
      null,
    [data.standings, data.telemetryDriverId],
  );
  const activeTelemetrySample =
    data.telemetrySamples[effectiveScrubIndex] ?? data.telemetrySamples.at(-1) ?? null;
  const isTelemetryReplay = data.sources.telemetry.status !== "live";

  const visualThemeOptions = useMemo<VisualThemeOption[]>(() => {
    const teams = new Map<string, { accent: string; drivers: string[] }>();
    data.standings.forEach((driver) => {
      const current = teams.get(driver.teamName) ?? {
        accent: driver.teamColor,
        drivers: [],
      };
      if (!current.drivers.includes(driver.abbreviation)) {
        current.drivers.push(driver.abbreviation);
      }
      teams.set(driver.teamName, current);
    });

    return [
      { id: "f1", label: "F1", accent: "E10600", detail: "Championship" },
      ...Array.from(teams.entries()).map(([teamName, team]) => ({
        id: `team:${teamName}`,
        label: teamName,
        accent: team.accent,
        detail: team.drivers.join(" / "),
      })),
    ];
  }, [data.standings]);
  const activeVisualTheme =
    visualThemeOptions.find((theme) => theme.id === ui.visualTheme) ??
    visualThemeOptions[0];
  const accent = activeVisualTheme?.accent ?? "E10600";
  const telemetryAccent = telemetryDriver?.teamColor ?? accent;
  const themeStyle = useMemo(() => buildThemeStyle(accent), [accent]);

  const changeVisualTheme = (themeId: string) => {
    dispatch(setVisualTheme(themeId));
    logDashboardInteraction("visual_theme_change", themeId);
  };

  const selectDriver = (driverId: string) => {
    dispatch(setSelectedDriverId(driverId));
    logDashboardInteraction("driver_select", driverId);
  };

  const setActiveTab = (tab: DashboardTab) => {
    if (tab !== activeTab) {
      dispatch(setActiveTabAction(tab));
      logDashboardInteraction("tab_change", tab);

      const url = new URL(window.location.href);
      url.searchParams.set("view", tab);
      window.history.pushState({ ...window.history.state, view: tab }, "", url);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const scrubTo = (index: number) => {
    const nextIndex = clampIndex(index, Math.max(1, data.telemetrySamples.length));
    if (scrubFrameRef.current !== null) {
      window.cancelAnimationFrame(scrubFrameRef.current);
    }
    scrubFrameRef.current = window.requestAnimationFrame(() => {
      dispatch(setScrubIndex(nextIndex));
    });
    logDashboardInteraction("telemetry_scrub", String(nextIndex));
  };

  const scrubToLive = () => {
    scrubTo(Math.max(0, data.telemetrySamples.length - 1));
  };

  const toggleWatch = (driverId: string) => {
    dispatch(toggleWatchlist(driverId));
  };

  const togglePlayback = () => {
    dispatch(setTelemetryPlaying(!isTelemetryPlaying));
    logDashboardInteraction("telemetry_playback", isTelemetryPlaying ? "pause" : "play");
  };

  const changeTelemetryReplaySpeed = (speed: TelemetryReplaySpeed) => {
    dispatch(setTelemetryReplaySpeed(speed));
    logDashboardInteraction("telemetry_replay_speed", `${speed}x`);
  };

  const changeSessionAlert = async (leadMinutes: SessionAlertLeadMinutes) => {
    if (!leadMinutes) {
      dispatch(setSessionAlertLeadMinutes(0));
      logDashboardInteraction("session_alert_change", "off");
      return;
    }

    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = "denied";
      }
    }

    setNotificationPermission(permission);
    if (permission === "granted") {
      dispatch(setSessionAlertLeadMinutes(leadMinutes));
      logDashboardInteraction("session_alert_change", `${leadMinutes}m`);
    } else {
      dispatch(setSessionAlertLeadMinutes(0));
      logDashboardInteraction("session_alert_change", "blocked");
    }
  };

  useEffect(() => {
    if (
      !isTelemetryPlaying ||
      isTelemetryReplay ||
      data.liveTiming.connection === "offline" ||
      !data.telemetrySamples.length
    ) {
      return;
    }

    dispatch(
      setScrubIndex(
        clampIndex(data.liveTiming.sampleIndex, data.telemetrySamples.length),
      ),
    );
  }, [
    data.liveTiming.connection,
    data.liveTiming.receivedAt,
    data.liveTiming.sampleIndex,
    data.telemetrySamples.length,
    dispatch,
    isTelemetryPlaying,
    isTelemetryReplay,
  ]);

  useEffect(() => {
    if (effectiveScrubIndex === replayIndexRef.current) {
      return;
    }
    const activeSample = data.telemetrySamples[effectiveScrubIndex];
    replayIndexRef.current = effectiveScrubIndex;
    replayElapsedRef.current = activeSample?.elapsed ?? 0;
  }, [data.telemetrySamples, effectiveScrubIndex]);

  useEffect(() => {
    if (
      !isTelemetryPlaying ||
      !isTelemetryReplay ||
      !data.telemetrySamples.length
    ) {
      lastPlayFrameRef.current = null;
      return;
    }

    const samples = data.telemetrySamples;
    const firstElapsed = samples[0]?.elapsed ?? 0;
    const lastElapsed = samples.at(-1)?.elapsed ?? firstElapsed;
    const replayDuration = Math.max(0.001, lastElapsed - firstElapsed);
    const tick = () => {
      const timestamp = performance.now();
      const previous = lastPlayFrameRef.current ?? timestamp;
      const frameDelta = Math.min(1_000, Math.max(0, timestamp - previous));
      lastPlayFrameRef.current = timestamp;

      let nextElapsed =
        replayElapsedRef.current +
        (frameDelta / 1_000) * telemetryReplaySpeed;
      if (nextElapsed > lastElapsed) {
        nextElapsed =
          firstElapsed + ((nextElapsed - firstElapsed) % replayDuration);
      }
      replayElapsedRef.current = nextElapsed;

      let nextIndex = 0;
      for (let index = 1; index < samples.length; index += 1) {
        const sample = samples[index];
        if (!sample || sample.elapsed > nextElapsed) {
          break;
        }
        nextIndex = index;
      }

      if (nextIndex !== replayIndexRef.current) {
        replayIndexRef.current = nextIndex;
        dispatch(setScrubIndex(nextIndex));
      }
    };

    const timer = window.setInterval(tick, 50);
    tick();
    return () => window.clearInterval(timer);
  }, [
    data.telemetrySamples,
    dispatch,
    isTelemetryPlaying,
    isTelemetryReplay,
    telemetryReplaySpeed,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.getAttribute("role") === "slider"
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }

      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const shortcutIndex = Number.parseInt(event.key, 10) - 1;
        const shortcutTab = DASHBOARD_TABS[shortcutIndex];
        if (shortcutTab) {
          event.preventDefault();
          setActiveTab(shortcutTab.id);
          return;
        }
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const currentIndex = data.standings.findIndex(
          (driver) => driver.id === effectiveSelectedDriverId,
        );
        if (currentIndex >= 0) {
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const nextDriver =
            data.standings[
              (currentIndex + direction + data.standings.length) %
                data.standings.length
            ];
          if (nextDriver) {
            selectDriver(nextDriver.id);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <main
      style={themeStyle}
      className="app-shell mx-auto flex min-h-screen max-w-[1540px] flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5 lg:px-8 lg:py-6"
    >
      <header className="app-header flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--team-accent)] text-[11px] font-black tracking-[-0.04em] text-[var(--theme-on-accent)] sm:h-10 sm:w-10">
            P1
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--foreground)] sm:text-sm">
              Pole Position
            </div>
            <div className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)] sm:text-[10px]">
              Race intelligence / {data.season}
            </div>
          </div>
          <div className="hidden h-7 w-px bg-[var(--line)] sm:block" />
          <div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)] sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${data.liveTiming.connection === "offline" ? "bg-[#d5a125]" : "bg-[#00a76f] pulse-dot"}`} />
            {data.liveTiming.connection === "websocket"
              ? "Live upstream"
              : data.liveTiming.connection === "eventsource"
                ? "Replay transport"
                : "Snapshot mode"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ThemePicker
            options={visualThemeOptions}
            value={activeVisualTheme?.id ?? "f1"}
            onChange={changeVisualTheme}
          />
          <button
            type="button"
            onClick={() => dispatch(cycleThemeMode())}
            aria-label="Cycle color mode"
            className={`utility-button inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] ${FOCUS_RING}`}
          >
            <SunMoon size={14} />
            <span className="hidden sm:inline">{ui.themeMode}</span>
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            aria-label="Refresh dashboard data"
            className={`utility-button inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] ${FOCUS_RING}`}
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{isFetching ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {hasMounted && (!isOnline || error) ? (
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

      <DashboardTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "live" ? (
        <div className="grid gap-4 sm:gap-5">
          <div className="order-2 min-w-0 md:order-1">
            <HeaderHero
              dashboard={data}
              selectedDriver={selectedDriver}
              freshness={freshness}
              snapshotNow={snapshotNow}
            />
          </div>

          <div className="order-3 grid min-w-0 gap-4 sm:gap-5 md:order-2">
            <WidgetBoundary label="Race control">
              <RaceControlPanel raceControl={data.raceControl} initialNow={snapshotNow} />
            </WidgetBoundary>
            <WidgetBoundary label="Team radio">
              <TeamRadioPanel radio={teamRadio} sourceMeta={teamRadioSource} />
            </WidgetBoundary>
          </div>

          <div className="order-1 min-w-0 md:order-3">
            <WidgetBoundary label="Live timing">
              <TimingBoardPanel
                timing={timingTower}
                selectedDriverId={effectiveSelectedDriverId}
                onSelect={selectDriver}
              />
            </WidgetBoundary>
          </div>

          <div className="order-4 grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
            <BriefingPanel
              dashboard={data}
              selectedDriver={selectedDriver}
              onNavigate={setActiveTab}
            />
            <WidgetBoundary label="Track map">
              <LiveActionDock
                circuitName={data.trackMap.circuitName}
                layoutKey={data.trackMap.layoutKey}
                cars={data.trackMap.cars}
                selectedDriver={selectedDriver}
                insights={data.telemetryInsights}
                liveTiming={data.liveTiming}
                telemetrySamples={data.telemetrySamples}
                teamRadio={teamRadio}
                scrubIndex={effectiveScrubIndex}
                drivers={data.standings}
                selectedDriverId={effectiveSelectedDriverId}
                onSelect={selectDriver}
                onScrub={scrubTo}
              />
            </WidgetBoundary>
          </div>
        </div>
      ) : null}

      {activeTab === "analysis" ? (
        <div className="grid gap-4 sm:gap-5">
          <WidgetBoundary label="Strategy replay">
            <StrategyPanel
              strategy={strategy}
              selectedDriverId={effectiveSelectedDriverId}
              onSelect={selectDriver}
            />
          </WidgetBoundary>
          <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(320px,0.58fr)]">
            <WidgetBoundary label="Telemetry">
              <TelemetryExperiencePanel
                accent={telemetryAccent}
                debugMode={debugMode}
                driverLabel={data.telemetryDriverLabel}
                insights={data.telemetryInsights}
                isPlaying={isTelemetryPlaying}
                isReplay={isTelemetryReplay}
                onTogglePlayback={togglePlayback}
                onReplaySpeedChange={changeTelemetryReplaySpeed}
                replaySpeed={telemetryReplaySpeed}
                sourceMeta={data.sources.telemetry}
                samples={data.telemetrySamples}
                session={data.telemetrySession}
                scrubIndex={effectiveScrubIndex}
                workerMetrics={telemetryWorkerMetrics}
                onScrub={(index) => (index === null ? scrubToLive() : scrubTo(index))}
              />
            </WidgetBoundary>
            <WidgetBoundary label="Telemetry comparison">
              <TelemetryComparisonPanel comparison={telemetryComparison} />
            </WidgetBoundary>
          </div>
          {debugMode ? (
            <>
              <WidgetBoundary label="F1 telemetry suite">
                <F1TelemetrySuite
                  circuitName={data.trackMap.circuitName}
                  comparison={telemetryComparison}
                  debugMode={debugMode}
                  scrubIndex={effectiveScrubIndex}
                  onScrub={scrubTo}
                />
              </WidgetBoundary>
              <WidgetBoundary label="Advanced telemetry">
                <AdvancedTelemetryPanel
                  activeSample={activeTelemetrySample}
                  drivers={data.standings}
                  selectedDriver={selectedDriver}
                  samples={data.telemetrySamples}
                  workerMetrics={telemetryWorkerMetrics}
                  onSelectDriver={selectDriver}
                />
              </WidgetBoundary>
            </>
          ) : null}
          <RaceIntelPanel intel={data.raceIntelligence} />
          <PerformanceProfilePanel driver={selectedDriver} />
        </div>
      ) : null}

      {activeTab === "weekend" ? (
        <div className="grid gap-4 sm:gap-5">
          <WeekendInfoPanel
            dashboard={data}
            alertLeadMinutes={sessionAlertLeadMinutes}
            notificationPermission={notificationPermission}
            onAlertLeadChange={(leadMinutes) => void changeSessionAlert(leadMinutes)}
          />
          <NewsroomPanel activity={data.activity} />
        </div>
      ) : null}

      {activeTab === "season" ? (
        <div className="grid gap-4 sm:gap-5">
          <StatsPanel drivers={data.standings} />
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            <PerformanceProfilePanel driver={selectedDriver} />
            <WatchlistPanel
              drivers={data.standings}
              watchlist={watchlist}
              onToggleWatch={toggleWatch}
            />
          </div>
          <WidgetBoundary label="Fantasy hub">
            <FantasyActionPanel
              fantasy={data.fantasy}
              sourceMeta={data.sources.fantasy}
              watchlist={watchlist}
              onToggleWatch={toggleWatch}
            />
          </WidgetBoundary>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
        {debugMode ? (
          <span className="rounded-full border border-[#d5a125]/25 bg-[#d5a125]/10 px-3 py-1.5 text-[#8c6500]">
            Engineering debug active
          </span>
        ) : null}
        <span className="glass-pill rounded-full px-3 py-1.5">
          Stable live demo
        </span>
        <span className="glass-pill rounded-full px-3 py-1.5">
          Local prefs saved on this device
        </span>
        <span className="glass-pill rounded-full px-3 py-1.5">
          OpenF1, F1 GraphQL, Motorsport, The Race, Reddit, X-ready
        </span>
      </footer>
    </main>
  );
}
