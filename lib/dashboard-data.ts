import {
  DashboardData,
  DriverInsight,
  FantasyEntry,
  SessionSummary,
  TelemetryInsights,
  TelemetrySample,
  TrackCar,
} from "./types";

type OpenF1Session = {
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  country_name: string;
  country_code: string | null;
  location: string;
  gmt_offset: string;
  is_cancelled: boolean;
  year: number;
};

type OpenF1Driver = {
  driver_number: number;
  team_name: string;
  team_colour: string;
  headshot_url: string | null;
  full_name: string;
  first_name: string;
  last_name: string;
  name_acronym: string;
};

type OpenF1Lap = {
  driver_number: number;
  lap_number: number;
  date_start: string;
  lap_duration?: number;
  duration_sector_1?: number;
  duration_sector_2?: number;
  duration_sector_3?: number;
};

type OpenF1CarData = {
  date: string;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
};

type OpenF1Position = {
  date: string;
  driver_number: number;
  position: number;
};

type SeasonStandingRow = {
  positionText: string;
  positionNumber: number | null;
  points: number;
  championshipWon: boolean;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    abbreviation: string;
    permanentNumber: string | null;
    totalRaceWins: number;
    totalPodiums: number;
    totalPolePositions: number;
    totalPoints: number;
  };
};

const OPEN_F1_BASE =
  process.env.OPENF1_API_BASE_URL?.replace(/\/$/, "") ?? "https://api.openf1.org/v1";
const GRAPHQL_ENDPOINT =
  process.env.F1_GRAPHQL_ENDPOINT ?? "https://f1-graphql.davideladisa.it/graphql";
const REQUEST_TIMEOUT_MS = 8_000;
const DRIVER_FALLBACK_IMAGE = "https://media.formula1.com/d_driver_fallback_image.png";

function normalizeTeamColor(value: string | null | undefined) {
  const normalized = (value ?? "").replace("#", "").trim();
  return /^[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : "E10600";
}

function resolveHeadshotUrl(value: string | null | undefined) {
  if (!value) {
    return DRIVER_FALLBACK_IMAGE;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : DRIVER_FALLBACK_IMAGE;
  } catch {
    return DRIVER_FALLBACK_IMAGE;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PolePositionHQ/1.0",
    },
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchGraphQL<T>(query: string): Promise<T> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "PolePositionHQ/1.0",
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  if (!payload.data) {
    throw new Error("GraphQL request returned no data");
  }

  return payload.data;
}

function mapSession(session: OpenF1Session): SessionSummary {
  return {
    meetingKey: session.meeting_key,
    sessionKey: session.session_key,
    sessionName: session.session_name,
    sessionType: session.session_type,
    dateStart: session.date_start,
    dateEnd: session.date_end,
    circuitName: session.circuit_short_name,
    countryName: session.country_name,
    countryCode: session.country_code,
    location: session.location,
    gmtOffset: session.gmt_offset,
    isCancelled: session.is_cancelled,
  };
}

function mean(values: Array<number | undefined>): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function median(values: Array<number | undefined>): number | null {
  const filtered = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!filtered.length) {
    return null;
  }

  const middle = Math.floor(filtered.length / 2);
  if (filtered.length % 2 === 0) {
    return (filtered[middle - 1] + filtered[middle]) / 2;
  }

  return filtered[middle];
}

function formatGap(position: number): string {
  if (position === 1) {
    return "Leader";
  }

  return `P+${position - 1}`;
}

function sampleSeries(values: number[], size: number): number[] {
  if (values.length <= size) {
    return values;
  }

  return Array.from({ length: size }, (_, index) => {
    const sourceIndex = Math.floor((index / (size - 1)) * (values.length - 1));
    return values[sourceIndex];
  });
}

function buildSentiment(position: number, points: number, avgLap: number | null) {
  const pressure = Math.max(0, 100 - position * 7);
  const paceBonus = avgLap ? Math.max(0, 100 - avgLap * 0.75) : 38;
  const score = Math.min(
    99,
    Math.round(pressure * 0.45 + points * 0.12 + paceBonus * 0.43),
  );
  const delta = Math.max(-9, Math.min(9, Math.round((28 - position) / 3)));

  if (score >= 74) {
    return { score, delta, label: "Bullish" };
  }

  if (score >= 58) {
    return { score, delta, label: "Steady" };
  }

  return { score, delta, label: "Volatile" };
}

function computeDriverInsights(
  standings: SeasonStandingRow[],
  openDrivers: OpenF1Driver[],
  laps: OpenF1Lap[],
): DriverInsight[] {
  const driverLookup = new Map(
    openDrivers.map((driver) => [String(driver.driver_number), driver]),
  );

  return standings.map((standing) => {
    const permanentNumber = standing.driver.permanentNumber ?? "0";
    const openDriver = driverLookup.get(permanentNumber);
    const driverLaps = laps
      .filter(
        (lap) =>
          String(lap.driver_number) === permanentNumber &&
          typeof lap.lap_duration === "number",
      )
      .sort((a, b) => a.lap_number - b.lap_number);

    const paceSeries = sampleSeries(
      driverLaps
        .slice(-8)
        .map((lap) => Number((lap.lap_duration ?? 0).toFixed(3))),
      8,
    );

    const avgLap = mean(driverLaps.map((lap) => lap.lap_duration));
    const sentiment = buildSentiment(
      standing.positionNumber ?? 20,
      standing.points,
      avgLap,
    );

    return {
      id: standing.driver.id,
      fullName: openDriver?.full_name ?? standing.driver.fullName,
      firstName: openDriver?.first_name ?? standing.driver.firstName,
      lastName: openDriver?.last_name ?? standing.driver.lastName,
      abbreviation: openDriver?.name_acronym ?? standing.driver.abbreviation,
      permanentNumber,
      standingPosition: standing.positionNumber ?? 99,
      standingText: standing.positionText,
      points: standing.points,
      championshipWon: standing.championshipWon,
      teamName: openDriver?.team_name ?? "Scuderia Feed",
      teamColor: normalizeTeamColor(openDriver?.team_colour),
      headshotUrl: resolveHeadshotUrl(openDriver?.headshot_url),
      totalRaceWins: standing.driver.totalRaceWins,
      totalPodiums: standing.driver.totalPodiums,
      totalPolePositions: standing.driver.totalPolePositions,
      totalPoints: standing.driver.totalPoints,
      paceSeries,
      avgLap,
      sectorAverages: {
        sector1: median(driverLaps.map((lap) => lap.duration_sector_1)),
        sector2: median(driverLaps.map((lap) => lap.duration_sector_2)),
        sector3: median(driverLaps.map((lap) => lap.duration_sector_3)),
      },
      sentiment,
    };
  });
}

async function fetchSeasonStandings(year: number) {
  const query = `
    query SeasonStandings {
      findManySeasonDriverStanding(
        where: { year: { equals: ${year} } }
        orderBy: [{ positionDisplayOrder: asc }]
        take: 24
      ) {
        positionText
        positionNumber
        points
        championshipWon
        driver {
          id
          firstName
          lastName
          fullName
          abbreviation
          permanentNumber
          totalRaceWins
          totalPodiums
          totalPolePositions
          totalPoints
        }
      }
    }
  `;

  const data = await fetchGraphQL<{
    findManySeasonDriverStanding: SeasonStandingRow[];
  }>(query);

  return data.findManySeasonDriverStanding;
}

async function fetchFantasyBoard(
  standings: DriverInsight[],
): Promise<DashboardData["fantasy"]> {
  const configuredBase = process.env.F1_FANTASY_API_BASE_URL;
  const bases = [
    configuredBase,
    "https://fantasy-api.formula1.com/partner_games/f1",
  ].filter(Boolean) as string[];

  for (const base of bases) {
    for (const endpoint of ["players", "drivers", "market", "leaderboard"]) {
      try {
        const response = await fetch(`${base}/${endpoint}`, {
          headers: {
            accept: "application/json",
            "user-agent": "PolePositionHQ/1.0",
          },
          next: { revalidate: 180 },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as unknown;

        if (!Array.isArray(payload)) {
          continue;
        }

        const normalized = payload
          .filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === "object" && entry !== null,
          )
          .slice(0, 6)
          .map((entry, index) => ({
            driverId: String(
              entry.id ?? entry.driver_id ?? entry.player_id ?? `official-${index}`,
            ),
            label: String(
              entry.name ??
                entry.player_name ??
                entry.driver_name ??
                `Official ${index + 1}`,
            ),
            teamName: String(entry.team_name ?? entry.team ?? "Fantasy Grid"),
            valueScore: Number(entry.value ?? entry.value_score ?? entry.points ?? 0),
            price: Number(entry.price ?? entry.current_price ?? 0),
            trend: Number(entry.price_trend ?? entry.trend ?? 0),
            points: Number(entry.points ?? entry.total_points ?? 0),
          }));

        if (normalized.length) {
          return {
            source: "official",
            note: "Official fantasy feed live",
            topValue: normalized,
            priceRisers: normalized
              .slice()
              .sort((a, b) => b.trend - a.trend)
              .slice(0, 4),
          };
        }
      } catch {
        continue;
      }
    }
  }

  const board = standings.map<FantasyEntry>((driver, index) => {
    const price = Number(
      (6 + driver.standingPosition * 0.55 + driver.totalPodiums * 0.08).toFixed(1),
    );
    const valueScore = Number((driver.points / Math.max(price, 1)).toFixed(2));
    const trend = Number(((driver.sentiment.delta + 10 - index) * 0.12).toFixed(2));

    return {
      driverId: driver.id,
      label: driver.fullName,
      teamName: driver.teamName,
      valueScore,
      price,
      trend,
      points: driver.points,
    };
  });

  return {
    source: "fallback",
    note:
      "Official F1 Fantasy endpoints were unreachable during generation, so this widget uses standings-driven market heuristics until a working fantasy base URL is configured.",
    topValue: board
      .slice()
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, 4),
    priceRisers: board
      .slice()
      .sort((a, b) => b.trend - a.trend)
      .slice(0, 4),
  };
}

function buildTrackCars(
  positions: OpenF1Position[],
  insights: DriverInsight[],
): TrackCar[] {
  const latestByDriver = new Map<number, OpenF1Position>();

  positions.forEach((entry) => {
    const existing = latestByDriver.get(entry.driver_number);
    if (!existing || existing.date < entry.date) {
      latestByDriver.set(entry.driver_number, entry);
    }
  });

  const byNumber = new Map(
    insights.map((driver) => [driver.permanentNumber, driver]),
  );

  return Array.from(latestByDriver.values())
    .sort((a, b) => a.position - b.position)
    .slice(0, 20)
    .map((entry) => {
      const driver = byNumber.get(String(entry.driver_number));

      return {
        driverId: driver?.id ?? `driver-${entry.driver_number}`,
        abbreviation: driver?.abbreviation ?? String(entry.driver_number),
        teamColor: normalizeTeamColor(driver?.teamColor ?? "FFFFFF"),
        position: entry.position,
        gapLabel: formatGap(entry.position),
      };
    });
}

function buildTelemetrySamples(carData: OpenF1CarData[]): TelemetrySample[] {
  if (!carData.length) {
    return [];
  }

  const sampled = sampleSeries(
    carData.map((_, index) => index),
    42,
  ).map((index) => carData[index]);

  const start = new Date(sampled[0].date).getTime();

  return sampled.map((point, index) => ({
    index,
    speed: point.speed,
    throttle: point.throttle,
    brake: point.brake,
    gear: point.n_gear,
    elapsed: Number(
      (((new Date(point.date).getTime() - start) / 1000) || 0).toFixed(1),
    ),
    deltaSpeed:
      index === 0
        ? 0
        : point.speed - sampled[Math.max(0, index - 1)].speed,
    trackPosition:
      sampled.length > 1 ? index / (sampled.length - 1) : 0,
    phase:
      point.brake >= 18
        ? "brake"
        : point.throttle >= 72
          ? "push"
          : "coast",
  }));
}

function buildTelemetryInsights(samples: TelemetrySample[]): TelemetryInsights | null {
  if (!samples.length) {
    return null;
  }

  const speeds = samples.map((sample) => sample.speed);
  const throttles = samples.map((sample) => sample.throttle);
  const brakes = samples.map((sample) => sample.brake);

  let gearChanges = 0;
  let brakeEvents = 0;

  samples.forEach((sample, index) => {
    if (index > 0 && sample.gear !== samples[index - 1].gear) {
      gearChanges += 1;
    }

    if (
      sample.brake >= 20 &&
      (index === 0 || samples[index - 1].brake < 20)
    ) {
      brakeEvents += 1;
    }
  });

  const avgSpeed = mean(speeds) ?? 0;
  const avgThrottle = mean(throttles) ?? 0;
  const avgBrake = mean(brakes) ?? 0;
  const fullThrottlePct =
    (samples.filter((sample) => sample.throttle >= 95).length / samples.length) * 100;
  const brakeZonePct =
    (samples.filter((sample) => sample.brake >= 20).length / samples.length) * 100;
  const topGearPct =
    (samples.filter((sample) => sample.gear >= 7).length / samples.length) * 100;
  const commitmentScore = Math.round(
    Math.min(
      99,
      Math.max(
        28,
        avgThrottle * 0.48 +
          avgSpeed * 0.19 -
          avgBrake * 0.16 +
          fullThrottlePct * 0.22,
      ),
    ),
  );

  return {
    peakSpeed: Math.max(...speeds),
    minSpeed: Math.min(...speeds),
    avgSpeed: Number(avgSpeed.toFixed(1)),
    avgThrottle: Number(avgThrottle.toFixed(1)),
    avgBrake: Number(avgBrake.toFixed(1)),
    fullThrottlePct: Number(fullThrottlePct.toFixed(1)),
    brakeZonePct: Number(brakeZonePct.toFixed(1)),
    topGearPct: Number(topGearPct.toFixed(1)),
    gearChanges,
    brakeEvents,
    commitmentScore,
    attackBalance: Number((avgThrottle - avgBrake).toFixed(1)),
  };
}

function buildTrackLayoutKey(circuitName: string | null | undefined) {
  const normalized = (circuitName ?? "").toLowerCase();
  const aliases: Array<[string, string]> = [
    ["bahrain", "bahrain"],
    ["jeddah", "jeddah"],
    ["saudi", "jeddah"],
    ["albert park", "melbourne"],
    ["melbourne", "melbourne"],
    ["suzuka", "suzuka"],
    ["shanghai", "shanghai"],
    ["miami", "miami"],
    ["imola", "imola"],
    ["monaco", "monaco"],
    ["catalunya", "barcelona"],
    ["barcelona", "barcelona"],
    ["gilles villeneuve", "montreal"],
    ["montreal", "montreal"],
    ["red bull ring", "red-bull-ring"],
    ["silverstone", "silverstone"],
    ["hungaroring", "hungaroring"],
    ["spa", "spa"],
    ["zandvoort", "zandvoort"],
    ["monza", "monza"],
    ["baku", "baku"],
    ["marina bay", "singapore"],
    ["singapore", "singapore"],
    ["americas", "austin"],
    ["austin", "austin"],
    ["mexico", "mexico-city"],
    ["interlagos", "interlagos"],
    ["sao paulo", "interlagos"],
    ["las vegas", "las-vegas"],
    ["lusail", "lusail"],
    ["yas marina", "yas-marina"],
    ["abu dhabi", "yas-marina"],
  ];

  return aliases.find(([alias]) => normalized.includes(alias))?.[1] ?? "fallback";
}

async function fetchOpenDrivers(sessionKey: number | "latest") {
  return fetchJson<OpenF1Driver[]>(
    `${OPEN_F1_BASE}/drivers?session_key=${sessionKey}`,
  );
}

async function fetchSessions(year: number) {
  return fetchJson<OpenF1Session[]>(`${OPEN_F1_BASE}/sessions?year=${year}`);
}

function buildFallbackDriverInsights(openDrivers: OpenF1Driver[]): DriverInsight[] {
  return openDrivers.slice(0, 24).map((driver, index) => ({
    id: `fallback-${driver.driver_number}`,
    fullName: driver.full_name,
    firstName: driver.first_name,
    lastName: driver.last_name,
    abbreviation: driver.name_acronym,
    permanentNumber: String(driver.driver_number),
    standingPosition: index + 1,
    standingText: String(index + 1),
    points: 0,
    championshipWon: false,
    teamName: driver.team_name,
    teamColor: normalizeTeamColor(driver.team_colour),
    headshotUrl: resolveHeadshotUrl(driver.headshot_url),
    totalRaceWins: 0,
    totalPodiums: 0,
    totalPolePositions: 0,
    totalPoints: 0,
    paceSeries: [],
    avgLap: null,
    sectorAverages: {
      sector1: null,
      sector2: null,
      sector3: null,
    },
    sentiment: {
      score: 50,
      label: "Steady",
      delta: 0,
    },
  }));
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const season = now.getUTCFullYear();
  const generatedAt = new Date().toISOString();

  const [currentSessionsResult, previousSessionsResult] = await Promise.allSettled([
    fetchSessions(season),
    fetchSessions(season - 1),
  ]);
  const currentSessions =
    currentSessionsResult.status === "fulfilled" ? currentSessionsResult.value : [];
  const previousSessions =
    previousSessionsResult.status === "fulfilled" ? previousSessionsResult.value : [];

  const futureSessions = currentSessions
    .filter((session) => !session.is_cancelled && new Date(session.date_start) > now)
    .sort(
      (a, b) =>
        new Date(a.date_start).getTime() - new Date(b.date_start).getTime(),
    );

  const nextSession = futureSessions[0] ?? null;
  const nextMeetingSessions = nextSession
    ? futureSessions
        .filter((session) => session.meeting_key === nextSession.meeting_key)
        .slice(0, 5)
    : [];

  const recentRaceSession =
    currentSessions
      .filter(
        (session) =>
          session.session_name === "Race" &&
          !session.is_cancelled &&
          new Date(session.date_start) < now,
      )
      .sort(
        (a, b) =>
          new Date(b.date_start).getTime() - new Date(a.date_start).getTime(),
      )[0] ??
    previousSessions
      .filter(
        (session) => session.session_name === "Race" && !session.is_cancelled,
      )
      .sort(
        (a, b) =>
          new Date(b.date_start).getTime() - new Date(a.date_start).getTime(),
      )[0] ??
    null;

  const [standingsRowsResult, fallbackDriversResult] = await Promise.allSettled([
    fetchSeasonStandings(season),
    fetchOpenDrivers("latest"),
  ]);
  const standingsRows =
    standingsRowsResult.status === "fulfilled" ? standingsRowsResult.value : [];
  const fallbackDrivers =
    fallbackDriversResult.status === "fulfilled" ? fallbackDriversResult.value : [];

  const telemetrySession = recentRaceSession ? mapSession(recentRaceSession) : null;

  const [lapsResult, positionsResult] = recentRaceSession
    ? await Promise.allSettled([
        fetchJson<OpenF1Lap[]>(
          `${OPEN_F1_BASE}/laps?session_key=${recentRaceSession.session_key}`,
        ),
        fetchJson<OpenF1Position[]>(
          `${OPEN_F1_BASE}/position?session_key=${recentRaceSession.session_key}`,
        ),
      ])
    : [
        { status: "fulfilled", value: [] } as PromiseFulfilledResult<OpenF1Lap[]>,
        { status: "fulfilled", value: [] } as PromiseFulfilledResult<OpenF1Position[]>,
      ];
  const laps = lapsResult.status === "fulfilled" ? lapsResult.value : [];
  const positions =
    positionsResult.status === "fulfilled" ? positionsResult.value : [];

  const driverInsights = standingsRows.length
    ? computeDriverInsights(standingsRows, fallbackDrivers, laps)
    : buildFallbackDriverInsights(fallbackDrivers);
  const telemetryDriver = driverInsights[0];

  let telemetrySamples: TelemetrySample[] = [];

  if (recentRaceSession && telemetryDriver) {
    const telemetryLaps = laps
      .filter(
        (lap) =>
          String(lap.driver_number) === telemetryDriver.permanentNumber &&
          typeof lap.lap_duration === "number" &&
          typeof lap.date_start === "string",
      )
      .sort(
        (a, b) =>
          (a.lap_duration ?? Number.POSITIVE_INFINITY) -
          (b.lap_duration ?? Number.POSITIVE_INFINITY),
      );

    const fastestLap = telemetryLaps[0];

    if (fastestLap?.lap_duration) {
      const startMs = new Date(fastestLap.date_start).getTime();
      const endMs = startMs + fastestLap.lap_duration * 1000;
      try {
        const carData = await fetchJson<OpenF1CarData[]>(
          `${OPEN_F1_BASE}/car_data?session_key=${
            recentRaceSession.session_key
          }&driver_number=${
            telemetryDriver.permanentNumber
          }&date>=${encodeURIComponent(
            new Date(startMs).toISOString(),
          )}&date<${encodeURIComponent(new Date(endMs).toISOString())}`,
        );

        telemetrySamples = buildTelemetrySamples(carData);
      } catch {
        telemetrySamples = [];
      }
    }
  }

  const telemetryInsights = buildTelemetryInsights(telemetrySamples);
  const fantasy = await fetchFantasyBoard(driverInsights);
  const trackCars = buildTrackCars(positions, driverInsights);
  const mapCircuitName =
    nextSession?.circuit_short_name ?? telemetrySession?.circuitName ?? "Live Circuit";

  return {
    generatedAt,
    season,
    nextSession: nextSession ? mapSession(nextSession) : null,
    nextSessions: nextMeetingSessions.map(mapSession),
    telemetrySession,
    telemetryDriverId: telemetryDriver?.id ?? null,
    telemetryDriverLabel: telemetryDriver?.fullName ?? null,
    telemetrySamples,
    telemetryInsights,
    standings: driverInsights,
    trackMap: {
      circuitName: mapCircuitName,
      layoutKey: buildTrackLayoutKey(mapCircuitName),
      cars: trackCars,
    },
    sources: {
      schedule: {
        label: "Schedule",
        source: "OpenF1 + F1 GraphQL",
        status:
          currentSessionsResult.status === "fulfilled" || previousSessionsResult.status === "fulfilled"
            ? nextSession
              ? "cached"
              : "empty"
            : "fallback",
        updatedAt:
          currentSessionsResult.status === "fulfilled" || previousSessionsResult.status === "fulfilled"
            ? generatedAt
            : null,
        note: nextSession
          ? "Server snapshot refreshed on a short interval for stable public demos."
          : currentSessions.length || previousSessions.length
            ? "No upcoming session is currently published in the active season feed."
            : "Schedule feeds were unavailable, so the product is rendering without session timing context.",
      },
      telemetry: {
        label: "Telemetry",
        source: "OpenF1 /car_data",
        status: telemetrySamples.length ? "cached" : "fallback",
        updatedAt: telemetrySamples.length ? generatedAt : null,
        note: telemetrySamples.length
          ? "Fastest-lap telemetry is sampled server-side and scrubbed client-side."
          : "Live telemetry was unavailable for this build, so the UI falls back to structure-only states.",
      },
      fantasy: {
        label: "Fantasy",
        source:
          fantasy.source === "official"
            ? "Official F1 Fantasy API"
            : "Standings-derived fallback model",
        status: fantasy.source === "official" ? "live" : "fallback",
        updatedAt: generatedAt,
        note: fantasy.note,
      },
    },
    fantasy,
  };
}
