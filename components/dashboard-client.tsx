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
    ? `${dashboard.nextSession.circuitName} ${dashboard.nextSession.sessionName}`
    : "Awaiting next session";

  return (
    <Panel
      className="signal-sheen relative overflow-hidden p-3 sm:p-4"
      tint="var(--team-accent-soft)"
    >
      <div className="race-stripe pointer-events-none absolute inset-x-3 top-0 h-1 rounded-b-full sm:inset-x-4" />
      <div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-[radial-gradient(circle,var(--team-accent-soft),transparent_68%)] opacity-70" />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)] lg:items-stretch">
        <div className="minimal-card team-tint relative overflow-hidden rounded-[20px] px-4 py-3.5 sm:rounded-[24px] sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e10600] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_10px_22px_rgba(225,6,0,0.2)]">
              <Sparkles size={13} />
              Race control
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${scheduleTone.className}`}
            >
              {scheduleTone.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white/72 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--team-accent)] pulse-dot" />
              {freshness}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <div className="eyebrow">Next session</div>
              <h1 className="section-title mt-1 truncate text-[1.65rem] font-semibold sm:text-[2.35rem] lg:text-[2.65rem]">
                {nextEvent}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[var(--muted)] sm:text-[13px]">
                {dashboard.nextSession ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <Flag size={13} />
                      {dashboard.nextSession.location}, {dashboard.nextSession.countryName}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 size={13} />
                      {formatSessionDate(dashboard.nextSession.dateStart)}
                    </span>
                  </>
                ) : (
                  <span>Schedule feed is standing by for the next published weekend.</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:min-w-[280px]">
              {countdownParts.length ? (
                countdownParts.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[15px] border border-black/8 bg-white/78 px-2.5 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                  >
                    <div className="telemetry-text text-xl font-semibold leading-none text-[var(--foreground)] sm:text-2xl">
                      {String(value).padStart(2, "0")}
                    </div>
                    <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      {label}
                    </div>
                  </div>
                ))
              ) : (
                <div
                  className="col-span-4 rounded-[15px] border border-black/8 bg-white/72 px-3 py-3 text-xs text-[var(--muted)]"
                >
                  Countdown appears when timing is available.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="minimal-card rounded-[20px] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow">Selected driver</div>
                <div className="section-title mt-1 truncate text-lg font-semibold">
                  {selectedDriver?.fullName ?? "Pick from timing"}
                </div>
                <div className="truncate text-xs text-[var(--muted)]">
                  {selectedDriver
                    ? `${selectedDriver.teamName} | ${selectedDriver.points} pts`
                    : "Driver rail controls the accent and telemetry focus."}
                </div>
              </div>
              <div
                className="telemetry-text rounded-[14px] px-3 py-2 text-sm font-semibold"
                style={{
                  background: selectedDriver
                    ? rgba(selectedDriver.teamColor, 0.13)
                    : "rgba(17,21,29,0.06)",
                  color: selectedDriver ? `#${selectedDriver.teamColor}` : "var(--foreground)",
                }}
              >
                {selectedDriver?.abbreviation ?? "--"}
              </div>
            </div>
          </div>

          <div className="minimal-card rounded-[20px] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="eyebrow">Weekend stack</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Local / track sync stays compact.
                </div>
              </div>
              <FunBadge label="30s refresh" tone="dark" />
            </div>

            <div className="mt-3 grid gap-2">
              {sessionStack.length ? (
                sessionStack.map((session) => (
                  <div
                    key={session.sessionKey}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-black/6 bg-white/70 px-3 py-2"
                  >
                    <span className="truncate text-[13px] font-semibold text-[var(--foreground)]">
                      {session.sessionName}
                    </span>
                    <span className="telemetry-text text-[11px] text-[var(--muted)]">
                      {formatTrackDate(session.dateStart, session.gmtOffset)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-[14px] border border-black/6 bg-white/70 px-3 py-2 text-xs text-[var(--muted)]">
                  Upcoming sessions will appear here.
                </div>
              )}
            </div>
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
  layoutKey,
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
  layoutKey: string;
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
  const layout = getTrackLayout(layoutKey, circuitName);
  const activeSample =
    telemetrySamples[clampIndex(scrubIndex, Math.max(1, telemetrySamples.length) - 1)] ?? null;
  const phaseTone = activeSample ? getPhaseTone(activeSample.phase) : null;
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
  }, [layout.path, scrubProgress]);

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
  }, [cars, layout.path]);

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
                  current event
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
                Sync on
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
                Top gear
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
            className="h-[206px] w-full sm:h-[238px]"
            role="img"
            aria-label={`${circuitName} broadcast-style circuit map`}
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
                  className="group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[15px] border px-2.5 py-2 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    borderColor: active
                      ? rgba(driver.teamColor, 0.38)
                      : "rgba(20,24,31,0.08)",
                    background: active
                      ? `linear-gradient(90deg, ${rgba(driver.teamColor, 0.18)}, rgba(255,255,255,0.84))`
                      : "rgba(255,255,255,0.7)",
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
                        : "rgba(17,21,29,0.08)",
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
          layoutKey={data.trackMap.layoutKey}
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
