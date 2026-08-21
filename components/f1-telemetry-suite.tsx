"use client";

import mapboxgl from "mapbox-gl";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Gauge,
  Maximize2,
  Mic,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Volume2,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import type { DashboardData, TelemetrySample } from "@/lib/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

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

type ReplayFrame = {
  at: number;
  index: number;
};

type CircuitNode = {
  x: number;
  y: number;
  c1?: [number, number];
  c2?: [number, number];
};

type TrackPoint = {
  x: number;
  y: number;
  sample: TelemetrySample;
};

export type F1TelemetrySuiteProps = {
  circuitName: string;
  comparison: DashboardData["telemetryComparison"];
  debugMode: boolean;
  scrubIndex: number;
  onScrub: (index: number) => void;
};

const EMPTY_TELEMETRY_SAMPLES: TelemetrySample[] = [];

const MONTREAL_NODES: CircuitNode[] = [
  { x: 84, y: 232 },
  { x: 98, y: 150, c1: [72, 210], c2: [82, 170] },
  { x: 188, y: 98, c1: [120, 112], c2: [150, 94] },
  { x: 298, y: 104, c1: [230, 98], c2: [260, 112] },
  { x: 434, y: 88, c1: [344, 96], c2: [390, 76] },
  { x: 512, y: 152, c1: [486, 84], c2: [530, 112] },
  { x: 470, y: 238, c1: [542, 196], c2: [516, 230] },
  { x: 360, y: 270, c1: [430, 270], c2: [398, 278] },
  { x: 252, y: 228, c1: [308, 262], c2: [294, 214] },
  { x: 148, y: 262, c1: [214, 238], c2: [176, 278] },
  { x: 84, y: 232, c1: [112, 260], c2: [78, 266] },
];

const MONTREAL_CORNERS = [
  { id: 1, label: "T1 Senna S", x: 108, y: 184 },
  { id: 6, label: "T6", x: 286, y: 104 },
  { id: 10, label: "T10 Hairpin", x: 506, y: 178 },
  { id: 14, label: "T14 Wall", x: 382, y: 268 },
];

const MONTREAL_SECTORS = [
  { label: "S1", x: 172, y: 96, progress: 0.22, color: "#00a76f", fill: 84 },
  { label: "S2", x: 470, y: 128, progress: 0.52, color: "#d5a125", fill: 72 },
  { label: "S3", x: 304, y: 274, progress: 0.82, color: "#8f49ff", fill: 93 },
];

function rgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function formatLapTime(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function nodesToPath(nodes: CircuitNode[]) {
  const [first, ...rest] = nodes;
  if (!first) {
    return "";
  }

  return [
    `M${first.x} ${first.y}`,
    ...rest.map((node) =>
      node.c1 && node.c2
        ? `C${node.c1[0]} ${node.c1[1]} ${node.c2[0]} ${node.c2[1]} ${node.x} ${node.y}`
        : `L${node.x} ${node.y}`,
    ),
  ].join(" ");
}

function pathPointAtProgress(path: SVGPathElement | null, progress: number) {
  if (!path) {
    return null;
  }

  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }

  const point = path.getPointAtLength(length * clampUnit(progress));
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : null;
}

function predictNextLapTime(samples: TelemetrySample[]) {
  const tail = samples.slice(-3);
  const last = tail.at(-1);
  if (!last || last.elapsed <= 0) {
    return null;
  }

  const avgThrottle =
    tail.reduce((sum, sample) => sum + sample.throttle, 0) / Math.max(1, tail.length) / 100;
  const avgBrake =
    tail.reduce((sum, sample) => sum + sample.brake, 0) / Math.max(1, tail.length) / 100;
  const completion = Math.max(0.08, Math.min(0.98, last.trackPosition || 0.72));
  const remainingRatio = (1 - completion) / completion;

  return last.elapsed + last.elapsed * remainingRatio * (1 - avgThrottle * 0.04 + avgBrake * 0.09);
}

function useReplayBuffer(scrubIndex: number, onScrub: (index: number) => void) {
  const framesRef = useRef<ReplayFrame[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    const now = performance.now();
    framesRef.current = [
      ...framesRef.current.filter((frame) => now - frame.at <= 30_000),
      { at: now, index: scrubIndex },
    ].slice(-360);
    setFrameCount(framesRef.current.length);
  }, [scrubIndex]);

  const replay = useCallback(() => {
    const frames = framesRef.current.slice();
    if (!frames.length || isReplaying) {
      return;
    }

    setIsReplaying(true);
    navigator.vibrate?.(18);
    let cursor = 0;
    const timer = window.setInterval(() => {
      const frame = frames[cursor];
      if (!frame) {
        window.clearInterval(timer);
        setIsReplaying(false);
        return;
      }

      onScrub(frame.index);
      cursor += 1;
    }, 200);
  }, [isReplaying, onScrub]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        replay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [replay]);

  return { replay, isReplaying, frameCount };
}

function Speedometer({ speed, accent }: { speed: number; accent: string }) {
  const rawSpeed = useMotionValue(speed);
  const springSpeed = useSpring(rawSpeed, { stiffness: 180, damping: 18 });
  const needleRotation = useTransform(springSpeed, [0, 360], [-124, 124]);

  useEffect(() => {
    rawSpeed.set(speed);
  }, [rawSpeed, speed]);

  return (
    <div className="relative aspect-square min-h-[168px] rounded-[24px] border border-white/10 bg-black/30 p-4">
      <svg viewBox="0 0 220 220" className="h-full w-full">
        <path
          d="M38 146 A78 78 0 0 1 182 146"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M38 146 A78 78 0 0 1 182 146"
          fill="none"
          stroke={`#${accent}`}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0, Math.min(190, speed * 0.5))} 220`}
        />
        <motion.line
          x1="110"
          y1="146"
          x2="110"
          y2="68"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          style={{ rotate: needleRotation, transformOrigin: "110px 146px" }}
        />
        <circle cx="110" cy="146" r="10" fill="#fff" />
      </svg>
      <div className="absolute inset-x-0 bottom-7 text-center">
        <div className="telemetry-text text-3xl font-semibold text-white">{speed}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">km/h</div>
      </div>
    </div>
  );
}

function MapboxTelemetryLayer({
  circuitName,
  token,
  focusCorner,
  zoom,
}: {
  circuitName: string;
  token: string | undefined;
  focusCorner: number | null;
  zoom: number;
}) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.5228, 45.5001],
      zoom: 12,
      attributionControl: false,
      interactive: true,
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const corner = MONTREAL_CORNERS.find((item) => item.id === focusCorner);
    mapRef.current?.easeTo({
      center: corner ? [-73.5228 + (corner.x - 280) / 6000, 45.5001 - (corner.y - 160) / 6000] : [-73.5228, 45.5001],
      zoom: corner ? 15 : 12 + zoom * 0.8,
      duration: 550,
    });
  }, [focusCorner, zoom]);

  return (
    <div className="relative h-[220px] overflow-hidden rounded-[22px] border border-white/10 bg-black/40">
      <div ref={containerRef} className="absolute inset-0" />
      {!token ? (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_20%,rgba(225,6,0,0.26),rgba(10,12,16,0.96)_58%)] p-6 text-center text-sm text-white/72">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Mapbox GL</div>
            <div className="mt-2 font-semibold text-white">{circuitName}</div>
            <div className="mt-1 text-xs">Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the geospatial layer.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function F1TelemetrySuite({
  circuitName,
  comparison,
  debugMode,
  scrubIndex,
  onScrub,
}: F1TelemetrySuiteProps) {
  const trackPath = useMemo(() => nodesToPath(MONTREAL_NODES), []);
  const pathRef = useRef<SVGPathElement | null>(null);
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  const voiceRef = useRef<SpeechRecognitionLike | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [zoom, setZoom] = useState(0);
  const [focusCorner, setFocusCorner] = useState<number | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const primaryTrace = comparison.traces[0] ?? null;
  const compareTrace = comparison.traces[1] ?? null;
  const samples = primaryTrace?.samples ?? EMPTY_TELEMETRY_SAMPLES;
  const activeIndex = clampIndex(scrubIndex, Math.max(1, samples.length));
  const activeSample = samples[activeIndex] ?? samples.at(-1) ?? null;
  const activeProgress = activeSample
    ? clampUnit(activeSample.trackPosition, activeIndex / Math.max(1, samples.length - 1))
    : 0;
  const activePoint = trackPoints[activeIndex] ?? null;
  const compareIndex = compareTrace?.samples.length
    ? clampIndex(
        Math.round(
          (activeIndex / Math.max(1, samples.length - 1)) *
            Math.max(0, compareTrace.samples.length - 1),
        ),
        compareTrace.samples.length,
      )
    : 0;
  const compareSample = compareTrace?.samples[compareIndex] ?? null;
  const accent = primaryTrace?.teamColor ?? "E10600";
  const predictedLap = useMemo(() => predictNextLapTime(samples), [samples]);
  const replay = useReplayBuffer(activeIndex, onScrub);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    const path = pathRef.current;
    if (!path || !samples.length) {
      setTrackPoints([]);
      return;
    }

    setTrackPoints(
      samples.flatMap((sample, index) => {
        const point = pathPointAtProgress(
          path,
          sample.trackPosition || index / Math.max(1, samples.length - 1),
        );
        return point ? [{ ...point, sample }] : [];
      }),
    );
  }, [samples, trackPath]);

  const chartData = useMemo<ChartData<"line">>(() => {
    const labels = samples.map((sample) => `${Math.round(sample.trackPosition * 100)}%`);

    return {
      labels,
      datasets: [
        {
          label: `${primaryTrace?.abbreviation ?? "Primary"} speed`,
          data: samples.map((sample) => sample.speed),
          borderColor: `#${accent}`,
          backgroundColor: rgba(accent, 0.16),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.32,
          fill: true,
          yAxisID: "speed",
        },
        {
          label: `${primaryTrace?.abbreviation ?? "Primary"} throttle`,
          data: samples.map((sample) => sample.throttle),
          borderColor: "#00a76f",
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.24,
          yAxisID: "percent",
        },
        {
          label: `${primaryTrace?.abbreviation ?? "Primary"} brake`,
          data: samples.map((sample) => sample.brake),
          borderColor: "#e10600",
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.24,
          yAxisID: "percent",
        },
        ...(compareTrace
          ? [
              {
                label: `${compareTrace.abbreviation} speed`,
                data: samples.map((sample) => {
                  const comparisonIndex = clampIndex(
                    Math.round(
                      sample.trackPosition * Math.max(0, compareTrace.samples.length - 1),
                    ),
                    compareTrace.samples.length,
                  );
                  return compareTrace.samples[comparisonIndex]?.speed ?? 0;
                }),
                borderColor: `#${compareTrace.teamColor}`,
                borderDash: [6, 5],
                borderWidth: 1.8,
                pointRadius: 0,
                tension: 0.3,
                yAxisID: "speed",
              },
            ]
          : []),
      ],
    };
  }, [accent, compareTrace, primaryTrace?.abbreviation, samples]);

  const chartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      animation: false,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: "rgba(255,255,255,0.68)",
            boxWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              const sample = samples[index];
              return sample
                ? [`Gear ${sample.gear}`, `Elapsed ${sample.elapsed.toFixed(1)}s`]
                : [];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.42)", maxTicksLimit: 6 },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        speed: {
          position: "left",
          ticks: { color: "rgba(255,255,255,0.48)" },
          grid: { color: "rgba(255,255,255,0.08)" },
        },
        percent: {
          position: "right",
          min: 0,
          max: 100,
          ticks: { color: "rgba(255,255,255,0.42)" },
          grid: { drawOnChartArea: false },
        },
      },
      onHover: (_event, elements) => {
        const index = elements[0]?.index;
        if (typeof index === "number") {
          onScrub(index);
        }
      },
    }),
    [onScrub, samples],
  );

  const startVoice = () => {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceTranscript("Voice commands unavailable in this browser.");
      return;
    }

    voiceRef.current?.stop();
    const recognition = new Recognition();
    voiceRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const command = event.results[0]?.[0]?.transcript ?? "";
      const normalized = command.toLowerCase();
      setVoiceTranscript(command);

      const turnMatch = normalized.match(/turn\s+(\d+)/);
      if (turnMatch) {
        setFocusCorner(Number(turnMatch[1]));
        setZoom(2);
      }

      if (normalized.includes("replay")) {
        replay.replay();
      }

    };
    recognition.onerror = () => {
      setIsVoiceListening(false);
    };
    recognition.onend = () => {
      setIsVoiceListening(false);
    };
    setIsVoiceListening(true);
    recognition.start();
  };

  const handlePinch = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      pinchDistanceRef.current = null;
      return;
    }

    const [first, second] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    const previous = pinchDistanceRef.current ?? distance;
    pinchDistanceRef.current = distance;
    setZoom((current) => Math.max(0, Math.min(4, current + (distance - previous) / 120)));
  };

  return (
    <section
      className="f1-suite grid min-w-0 gap-4 rounded-[28px] border border-white/10 bg-[rgba(0,0,0,0.6)] p-4 text-white shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-[12px] sm:p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]"
      style={
        {
          ["--suite-accent" as string]: `#${accent}`,
        }
      }
    >
      <div className="grid min-w-0 gap-4">
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Speedometer speed={activeSample?.speed ?? 0} accent={accent} />
          <div className="rounded-[24px] border border-white/10 bg-black/30 p-4 backdrop-blur-[12px] transition hover:border-[var(--suite-accent)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Chart.js trace</div>
                <h3 className="mt-1 font-[var(--font-display)] text-[clamp(1.1rem,2vw,1.65rem)] font-semibold">
                  Speed / throttle / brake
                </h3>
              </div>
              <motion.div
                key={`${activeSample?.index ?? 0}-${activeSample?.deltaSpeed ?? 0}`}
                initial={{ scale: 0.92 }}
                animate={{ scale: 1 }}
                className={`telemetry-text rounded-full px-3 py-1 text-xs font-semibold ${
                  (activeSample?.deltaSpeed ?? 0) >= 0
                    ? "bg-[#00a76f]/15 text-[#00d68f]"
                    : "bg-[#e10600]/15 text-[#ff6b63]"
                }`}
              >
                {(activeSample?.deltaSpeed ?? 0) >= 0 ? "+" : ""}
                {(activeSample?.deltaSpeed ?? 0).toFixed(0)} km/h
              </motion.div>
            </div>
            <div className="h-[280px]">
              <Line ref={chartRef} data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        <div
          className="rounded-[24px] border border-white/10 bg-black/30 p-4 backdrop-blur-[12px] transition hover:border-[var(--suite-accent)]"
          onTouchMove={handlePinch}
          onTouchEnd={() => {
            pinchDistanceRef.current = null;
          }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{circuitName} circuit map</div>
              <h3 className="mt-1 font-[var(--font-display)] text-[clamp(1.15rem,2vw,1.75rem)] font-semibold">
                Sector heat + live trail
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(4, value + 1))}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"
                aria-label="Zoom track map"
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                onClick={replay.replay}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"
                aria-label="Replay telemetry"
              >
                {replay.isReplaying ? <Pause size={15} /> : <RotateCcw size={15} />}
              </button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <svg
              viewBox="0 0 560 320"
              className="h-[320px] w-full touch-none rounded-[20px] bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_62%)]"
              role="img"
              aria-label={`${circuitName} SVG circuit map`}
            >
              <defs>
                <linearGradient id="sector-gradient" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#00a76f" />
                  <stop offset="54%" stopColor="#d5a125" />
                  <stop offset="100%" stopColor="#8f49ff" />
                </linearGradient>
                <filter id="glow-dot" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g transform={`translate(280 160) scale(${1 + zoom * 0.08}) translate(-280 -160)`}>
                <path
                  d="M96 244 C154 236 212 254 274 242"
                  fill="none"
                  stroke="rgba(255,255,255,0.42)"
                  strokeWidth="3"
                  strokeDasharray="8 8"
                />
                <path
                  ref={pathRef}
                  d={trackPath}
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="28"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={trackPath}
                  fill="none"
                  stroke="url(#sector-gradient)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {trackPoints.map((point, index) => (
                  <circle
                    key={`${point.sample.index}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={point.sample.brake > 35 ? 5 : 3}
                    fill={
                      point.sample.brake > 35
                        ? "rgba(225,6,0,0.52)"
                        : point.sample.throttle > 82
                          ? "rgba(0,167,111,0.42)"
                          : "rgba(213,161,37,0.32)"
                    }
                  />
                ))}
                {MONTREAL_CORNERS.map((corner) => (
                  <motion.g
                    key={corner.id}
                    transform={`translate(${corner.x}, ${corner.y})`}
                    initial={{ opacity: 0.36 }}
                    animate={{ opacity: zoom > 0.8 || focusCorner === corner.id ? 1 : 0.36 }}
                  >
                    <circle r="9" fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.28)" />
                    <text x="14" y="4" fill="white" fontSize="10" fontWeight="700">
                      {corner.label}
                    </text>
                  </motion.g>
                ))}
                {MONTREAL_SECTORS.map((sector) => (
                  <g key={sector.label} transform={`translate(${sector.x}, ${sector.y})`}>
                    <circle r="18" fill="rgba(0,0,0,0.72)" stroke={sector.color} />
                    <circle
                      r="18"
                      fill="none"
                      stroke={sector.color}
                      strokeWidth="5"
                      strokeDasharray={`${sector.fill} 100`}
                      pathLength="100"
                      transform="rotate(-90)"
                    />
                    <text y="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="800">
                      {sector.label}
                    </text>
                  </g>
                ))}
                {activePoint ? (
                  <motion.g
                    animate={{ x: activePoint.x, y: activePoint.y }}
                    transition={{ type: "spring", stiffness: 180, damping: 20 }}
                    filter="url(#glow-dot)"
                  >
                    <circle r="20" fill={rgba(accent, 0.2)} />
                    <circle r="8" fill={`#${accent}`} stroke="white" strokeWidth="1.5" />
                  </motion.g>
                ) : null}
                <circle
                  cx={84 + activeProgress * 392}
                  cy="302"
                  r="5"
                  fill={`#${accent}`}
                />
              </g>
            </svg>
            <MapboxTelemetryLayer
              circuitName={circuitName}
              token={mapboxToken}
              focusCorner={focusCorner}
              zoom={zoom}
            />
          </div>
        </div>
      </div>

      <aside className="grid min-w-0 content-start gap-4">
        <div className="rounded-[24px] border border-white/10 bg-black/30 p-4 backdrop-blur-[12px] transition hover:border-[var(--suite-accent)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Observed comparison</div>
              <h3 className="mt-1 font-[var(--font-display)] text-[clamp(1.1rem,2vw,1.55rem)] font-semibold">
                Fastest lap vs fastest lap
              </h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/55">
              {comparison.status === "cached" ? "OpenF1 replay" : "Unavailable"}
            </span>
          </div>
          <div className="grid gap-2">
            {[primaryTrace, compareTrace].map((trace, index) =>
              trace ? (
                <div
                  key={trace.driverId}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-white/10 bg-white/8 p-3"
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full telemetry-text text-xs font-semibold"
                    style={{ background: rgba(trace.teamColor, 0.2), color: `#${trace.teamColor}` }}
                  >
                    {trace.abbreviation}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{trace.driverLabel}</span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em] text-white/45">
                      Lap {trace.lapNumber} · {trace.samples.length} samples
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="telemetry-text block text-sm font-semibold text-white">{formatLapTime(trace.lapTime)}</span>
                    <span className="mt-0.5 block text-[9px] uppercase tracking-[0.12em] text-white/42">
                      {index === 0 ? "Reference" : "Compare"}
                    </span>
                  </span>
                </div>
              ) : null,
            )}
          </div>
          <div className="mt-3 rounded-[18px] border border-white/10 bg-white/8 p-3 text-xs leading-5 text-white/58">
            {comparison.note}
          </div>
          {primaryTrace && compareTrace ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[16px] bg-white/8 p-3">
                <div className="text-[9px] uppercase tracking-[0.14em] text-white/42">Lap delta</div>
                <div className="telemetry-text mt-1 text-lg font-semibold text-white">
                  {compareTrace.lapTime - primaryTrace.lapTime >= 0 ? "+" : ""}
                  {(compareTrace.lapTime - primaryTrace.lapTime).toFixed(3)}s
                </div>
              </div>
              <div className="rounded-[16px] bg-white/8 p-3">
                <div className="text-[9px] uppercase tracking-[0.14em] text-white/42">At cursor</div>
                <div className="telemetry-text mt-1 text-lg font-semibold text-white">
                  {activeSample && compareSample
                    ? `${activeSample.speed - compareSample.speed >= 0 ? "+" : ""}${activeSample.speed - compareSample.speed} km/h`
                    : "--"}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {debugMode ? <div className="rounded-[24px] border border-white/10 bg-black/30 p-4 backdrop-blur-[12px] transition hover:border-[var(--suite-accent)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Reactive systems</div>
              <h3 className="mt-1 font-[var(--font-display)] text-[clamp(1.1rem,2vw,1.55rem)] font-semibold">
                G-force, tires, replay
              </h3>
            </div>
            <Zap className="text-[var(--suite-accent)]" size={18} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] bg-white/8 p-3">
              <Gauge size={16} className="text-white/55" />
              <div className="telemetry-text mt-3 text-xl font-semibold">
                {activeSample ? ((activeSample.throttle - activeSample.brake) / 52).toFixed(1) : "--"}g
              </div>
              <div className="text-xs text-white/45">Longitudinal</div>
            </div>
            <div className="rounded-[18px] bg-white/8 p-3">
              <Radio size={16} className="text-white/55" />
              <div className="telemetry-text mt-3 text-xl font-semibold">
                {formatLapTime(predictedLap)}
              </div>
              <div className="text-xs text-white/45">Predicted lap</div>
            </div>
            <div className="rounded-[18px] bg-white/8 p-3">
              <RotateCcw size={16} className="text-white/55" />
              <div className="telemetry-text mt-3 text-xl font-semibold">
                {replay.frameCount}
              </div>
              <div className="text-xs text-white/45">Replay frames</div>
            </div>
            {["FL", "FR", "RL", "RR"].map((tire, index) => {
              const wear = Math.max(8, 100 - activeIndex * (1.4 + index * 0.2));
              return (
                <div key={tire} className="rounded-[18px] bg-white/8 p-3">
                  <div
                    className="grid aspect-square place-items-center rounded-full"
                    style={{
                      background: `conic-gradient(#00a76f ${wear}%, rgba(255,255,255,0.12) 0)`,
                    }}
                  >
                    <span className="grid h-[72%] w-[72%] place-items-center rounded-full bg-[#10151f] telemetry-text text-sm font-semibold">
                      {tire}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div> : null}

        {debugMode ? <div className="rounded-[24px] border border-white/10 bg-black/30 p-4 backdrop-blur-[12px] transition hover:border-[var(--suite-accent)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Voice control</div>
              <div className="mt-1 text-sm font-semibold">Map and replay</div>
            </div>
            <button
              type="button"
              onClick={startVoice}
              className="grid h-10 w-10 place-items-center rounded-full bg-[var(--suite-accent)] text-white"
              aria-label="Start F1 telemetry voice control"
            >
              {isVoiceListening ? <Volume2 size={16} /> : <Mic size={16} />}
            </button>
          </div>
          <div className="mt-3 text-xs leading-5 text-white/58">
            {voiceTranscript || "Commands: zoom to turn 6, show replay."}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setFocusCorner(6)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs">
              Turn 6
            </button>
            <button type="button" onClick={replay.replay} className="rounded-full bg-white/10 px-3 py-1.5 text-xs">
              {replay.isReplaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
          </div>
        </div> : null}
      </aside>
    </section>
  );
}
