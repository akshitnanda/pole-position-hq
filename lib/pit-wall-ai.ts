import type { DashboardData, DriverInsight } from "@/lib/types";

export const PIT_WALL_MODES = ["race-brief", "driver-focus", "weekend-outlook"] as const;

export type PitWallMode = (typeof PIT_WALL_MODES)[number];

export type PitWallEvidence = {
  ref: string;
  kind: "session" | "weather" | "timing" | "strategy" | "driver" | "upgrade" | "news" | "source";
  label: string;
  fact: string;
  source: string;
};

export type PitWallBrief = {
  headline: string;
  readout: string;
  findings: Array<{
    label: string;
    insight: string;
    evidenceRefs: string[];
  }>;
  watchNext: string[];
  caveat: string;
  model: string;
  generatedAt: string;
  snapshotGeneratedAt: string;
};

function clean(value: unknown, maxLength = 360) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatLap(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "unavailable";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function evidence(
  ref: string,
  kind: PitWallEvidence["kind"],
  label: string,
  fact: string,
  source: string,
): PitWallEvidence {
  return {
    ref,
    kind,
    label: clean(label, 80),
    fact: clean(fact),
    source: clean(source, 120),
  };
}

export function buildPitWallEvidence(
  data: DashboardData,
  selectedDriver: DriverInsight | null,
): PitWallEvidence[] {
  const ledger: PitWallEvidence[] = [];

  if (data.nextSession) {
    ledger.push(
      evidence(
        "SESSION-NEXT",
        "session",
        "Next session",
        `${data.nextSession.sessionName} at ${data.nextSession.circuitName}, ${data.nextSession.location}; starts ${formatSessionTime(data.nextSession.dateStart)}.`,
        data.sources.schedule.source,
      ),
    );
  }

  data.weekendWeather.slice(0, 5).forEach((weather, index) => {
    ledger.push(
      evidence(
        `WEATHER-${index + 1}`,
        "weather",
        weather.label,
        `${weather.temperatureC.toFixed(1)} C, ${weather.rainChance}% precipitation probability; ${weather.summary}.`,
        data.sources.weather.source,
      ),
    );
  });

  data.timingTower.entries.slice(0, 6).forEach((entry, index) => {
    ledger.push(
      evidence(
        `TIMING-${index + 1}`,
        "timing",
        `${entry.abbreviation} timing`,
        `P${entry.position}; best lap ${formatLap(entry.bestLap)}; last lap ${formatLap(entry.lastLap)}; gap ${entry.gapToLeader ?? "unavailable"}; compound ${entry.compound ?? "unavailable"}; status ${entry.raceStatus}.`,
        `${data.sources.telemetry.source} / ${data.timingTower.status} snapshot`,
      ),
    );
  });

  if (selectedDriver) {
    ledger.push(
      evidence(
        `DRIVER-${selectedDriver.abbreviation}`,
        "driver",
        selectedDriver.fullName,
        `P${selectedDriver.standingPosition} in the championship with ${selectedDriver.points} points for ${selectedDriver.teamName}; archived average lap ${formatLap(selectedDriver.avgLap)}.`,
        "F1 standings and OpenF1 archived lap data",
      ),
    );

    const strategy = data.strategy.drivers.find(
      (driver) => driver.driverId === selectedDriver.id,
    );
    if (strategy) {
      const stints = strategy.stints
        .slice(0, 5)
        .map(
          (stint) =>
            `${stint.compound ?? "unknown"} laps ${stint.lapStart}-${stint.lapEnd ?? "end"}`,
        )
        .join(", ");
      const outcomes = strategy.pitOutcomes
        .slice(0, 4)
        .map((outcome) => `lap ${outcome.lapNumber}: ${outcome.signal}`)
        .join(", ");

      ledger.push(
        evidence(
          `STRATEGY-${selectedDriver.abbreviation}`,
          "strategy",
          `${selectedDriver.abbreviation} strategy replay`,
          `Final P${strategy.finalPosition}; stints: ${stints || "unavailable"}; observed post-stop labels: ${outcomes || "unavailable"}. Labels are directional, not causal proof.`,
          `${data.sources.telemetry.source} / archived stint and pit sequence`,
        ),
      );
    }
  }

  data.raceIntelligence.upgradeSignals.slice(0, 3).forEach((signal, index) => {
    ledger.push(
      evidence(
        `UPGRADE-${index + 1}`,
        "upgrade",
        `${signal.teamName} ${signal.package}`,
        `${signal.evidence} Coverage: ${signal.mentionCount} mention${signal.mentionCount === 1 ? "" : "s"} across ${signal.sourceCount} source${signal.sourceCount === 1 ? "" : "s"}; ${signal.evidenceLevel} evidence.`,
        "Sourced editorial activity",
      ),
    );
  });

  data.activity.items.slice(0, 5).forEach((item, index) => {
    ledger.push(
      evidence(
        `NEWS-${index + 1}`,
        "news",
        item.title,
        `${item.summary || item.title} Category: ${item.category}; published ${item.publishedAt ?? "time unavailable"}.`,
        item.sourceLabel,
      ),
    );
  });

  const readableSources = Object.values(data.sources)
    .filter((source) => source.status !== "empty")
    .map((source) => `${source.label}: ${source.status}`)
    .join(", ");
  ledger.push(
    evidence(
      "SOURCE-STATUS",
      "source",
      "Snapshot provenance",
      readableSources || "No active source status is available.",
      "Pole Position HQ source registry",
    ),
  );

  return ledger.slice(0, 24);
}
