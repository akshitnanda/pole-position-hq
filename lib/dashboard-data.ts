import {
  ActivityItem,
  ActivitySource,
  DashboardData,
  DriverInsight,
  FantasyEntry,
  SourcePulse,
  StrategyDriver,
  SessionSummary,
  TelemetryInsights,
  TelemetrySample,
  TimingDelta,
  TimingSectorState,
  TimingTowerEntry,
  TrackCar,
  UpgradeSignal,
} from "./types";
import { XMLParser } from "fast-xml-parser";
import { getEndpointConfig } from "./runtime-config";
import {
  canonicalizeConstructorName,
  findDriverMatch,
  formatDriverName,
} from "./data-integrity";

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
  is_pit_out_lap?: boolean;
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

type OpenF1Interval = {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
};

type OpenF1Stint = {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number | null;
  compound: string | null;
  tyre_age_at_start: number | null;
};

type OpenF1Pit = {
  date: string;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
};

type OpenF1SessionResult = {
  driver_number: number;
  position: number | null;
  number_of_laps: number | null;
  gap_to_leader: number | string | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
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

type RedditListing = {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        permalink?: string;
        url?: string;
        selftext?: string;
        created_utc?: number;
        score?: number;
        num_comments?: number;
        link_flair_text?: string | null;
      };
    }>;
  };
};

type XRecentSearch = {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      quote_count?: number;
    };
  }>;
};

let OPEN_F1_BASE =
  process.env.OPENF1_API_BASE_URL?.replace(/\/$/, "") ?? "https://api.openf1.org/v1";
let GRAPHQL_ENDPOINT =
  process.env.F1_GRAPHQL_ENDPOINT ?? "https://f1-graphql.davideladisa.it/graphql";
let FANTASY_API_BASE_URL =
  process.env.F1_FANTASY_API_BASE_URL?.replace(/\/$/, "") ?? null;
const REQUEST_TIMEOUT_MS = 8_000;
const DRIVER_FALLBACK_IMAGE = "https://media.formula1.com/d_driver_fallback_image.png";
const NEWS_REVALIDATE_SECONDS = 180;

const ACTIVITY_FEEDS = [
  {
    source: "motorsport" as const,
    label: "Motorsport.com",
    url: process.env.MOTORSPORT_RSS_URL ?? "https://www.motorsport.com/rss/f1/news/",
  },
  {
    source: "the-race" as const,
    label: "The Race",
    url: process.env.THE_RACE_RSS_URL ?? "https://www.the-race.com/category/formula-1",
  },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

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
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
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
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 400 * (attempt + 1) + (url.length % 173)),
        );
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${url}`);
}

async function fetchArrayOrEmpty<T>(url: string): Promise<T[]> {
  try {
    return await fetchJson<T[]>(url);
  } catch {
    return [];
  }
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

async function fetchText(url: string, revalidate = NEWS_REVALIDATE_SECONDS): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, text/xml, text/html, */*",
      "user-agent": "PolePositionHQ/1.0",
    },
    next: { revalidate },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }

  return response.text();
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function stripMarkup(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: unknown, baseUrl: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return baseUrl;
  }

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function classifyActivity(text: string): ActivityItem["category"] {
  const normalized = text.toLowerCase();

  if (/\b(upgrade|floor|wing|sidepod|package|aero|technical|spec)\b/.test(normalized)) {
    return "upgrade";
  }

  if (/\b(fp1|fp2|fp3|qualifying|sprint|lap|pace|sector|timing|result)\b/.test(normalized)) {
    return "timing";
  }

  if (/\b(strategy|tyre|tire|stint|undercut|overcut|pit)\b/.test(normalized)) {
    return "strategy";
  }

  if (/\b(sponsor|business|deal|commercial|revenue|cost cap|contract)\b/.test(normalized)) {
    return "business";
  }

  if (/\b(breaking|declares|penalty|investigation|disqualified|crash)\b/.test(normalized)) {
    return "breaking";
  }

  return "community";
}

function buildActivityTags(text: string, drivers: DriverInsight[]) {
  const normalized = text.toLowerCase();
  const tags = new Set<string>();

  drivers.forEach((driver) => {
    if (
      normalized.includes(driver.lastName.toLowerCase()) ||
      normalized.includes(driver.teamName.toLowerCase())
    ) {
      tags.add(driver.abbreviation);
    }
  });

  [
    "upgrade",
    "wing",
    "floor",
    "qualifying",
    "sprint",
    "race",
    "penalty",
    "strategy",
    "tyre",
  ].forEach((keyword) => {
    if (normalized.includes(keyword)) {
      tags.add(keyword);
    }
  });

  return Array.from(tags).slice(0, 4);
}

function scoreActivity(
  title: string,
  summary: string,
  publishedAt: string | null,
  engagement = 0,
) {
  const text = `${title} ${summary}`.toLowerCase();
  const recencyHours = publishedAt
    ? Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000)
    : 36;
  const recencyScore = Math.max(0, 46 - recencyHours * 2.4);
  const keywordScore = [
    "breaking",
    "upgrade",
    "floor",
    "qualifying",
    "race",
    "penalty",
    "strategy",
    "disqualified",
  ].reduce((score, keyword) => score + (text.includes(keyword) ? 7 : 0), 0);
  const engagementScore = Math.min(26, Math.log10(Math.max(1, engagement)) * 10);

  return Math.max(12, Math.min(99, Math.round(recencyScore + keywordScore + engagementScore)));
}

function engagementLabel(value: number) {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  if (value > 0) {
    return String(Math.round(value));
  }

  return "scan";
}

function dedupeActivityItems(items: ActivityItem[]) {
  const seen = new Set<string>();

  return items
    .filter((item) => {
      const key = item.url || item.title.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return b.signalScore - a.signalScore || dateB - dateA;
    });
}

function normalizeRssItems(
  payload: string,
  source: Exclude<ActivitySource, "x" | "reddit" | "fallback">,
  sourceLabel: string,
  baseUrl: string,
  drivers: DriverInsight[],
): ActivityItem[] {
  if (!payload.trim().startsWith("<")) {
    return [];
  }

  const parsed = xmlParser.parse(payload) as {
    rss?: { channel?: { item?: unknown | unknown[] } };
    feed?: { entry?: unknown | unknown[] };
  };

  const rssItems = asArray(parsed.rss?.channel?.item as Record<string, unknown> | undefined);
  const atomItems = asArray(parsed.feed?.entry as Record<string, unknown> | undefined);

  return [...rssItems, ...atomItems].slice(0, 8).flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const entry = item as Record<string, unknown>;
    const title = stripMarkup(entry.title);
    if (!title) {
      return [];
    }

    const summary = stripMarkup(entry.description ?? entry.summary ?? entry.content).slice(0, 220);
    const rawLink =
      typeof entry.link === "object" && entry.link !== null
        ? (entry.link as Record<string, unknown>).href
        : entry.link;
    const url = normalizeUrl(rawLink ?? entry.guid, baseUrl);
    const publishedAt = String(entry.pubDate ?? entry.published ?? entry.updated ?? "") || null;
    const normalizedDate = publishedAt ? new Date(publishedAt).toISOString() : null;
    const signalScore = scoreActivity(title, summary, normalizedDate);

    return {
      id: `${source}-${index}-${Buffer.from(url).toString("base64url").slice(0, 8)}`,
      source,
      sourceLabel,
      title,
      url,
      publishedAt: normalizedDate,
      summary,
      category: classifyActivity(`${title} ${summary}`),
      signalScore,
      engagementLabel: engagementLabel(0),
      tags: buildActivityTags(`${title} ${summary}`, drivers),
    };
  });
}

function normalizeTheRaceHtml(payload: string, drivers: DriverInsight[]): ActivityItem[] {
  const matches = Array.from(
    payload.matchAll(/<a[^>]+href="([^"]*\/formula-1\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
  );

  return matches.slice(0, 12).flatMap((match, index) => {
    const title = stripMarkup(match[2]);
    if (!title || title.length < 18 || title.toLowerCase().includes("formula 1")) {
      return [];
    }

    const url = normalizeUrl(match[1], "https://www.the-race.com");
    const summary = title.length > 160 ? title.slice(0, 157) : title;

    return {
      id: `the-race-html-${index}-${Buffer.from(url).toString("base64url").slice(0, 8)}`,
      source: "the-race" as const,
      sourceLabel: "The Race",
      title,
      url,
      publishedAt: null,
      summary,
      category: classifyActivity(title),
      signalScore: scoreActivity(title, summary, null),
      engagementLabel: "scan",
      tags: buildActivityTags(title, drivers),
    };
  });
}

async function fetchEditorialActivity(drivers: DriverInsight[]) {
  const results = await Promise.allSettled(
    ACTIVITY_FEEDS.map(async (feed) => {
      const payload = await fetchText(feed.url);
      const rssItems = normalizeRssItems(
        payload,
        feed.source,
        feed.label,
        feed.url,
        drivers,
      );
      const items =
        rssItems.length || feed.source !== "the-race"
          ? rssItems
          : normalizeTheRaceHtml(payload, drivers);

      return { ...feed, items };
    }),
  );

  const items: ActivityItem[] = [];
  const pulse: SourcePulse[] = [];

  results.forEach((result, index) => {
    const feed = ACTIVITY_FEEDS[index];
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      pulse.push({
        source: feed.source,
        label: feed.label,
        status: result.value.items.length ? "live" : "empty",
        count: result.value.items.length,
        updatedAt: result.value.items.length ? new Date().toISOString() : null,
        note: result.value.items.length
          ? "Editorial feed normalized for the command surface."
          : "Feed responded but did not expose readable F1 activity items.",
      });
      return;
    }

    pulse.push({
      source: feed.source,
      label: feed.label,
      status: "fallback",
      count: 0,
      updatedAt: null,
      note: "Editorial feed was unreachable during this snapshot.",
    });
  });

  return { items, pulse };
}

async function fetchRedditActivity(drivers: DriverInsight[]) {
  try {
    const payload = await fetchJson<RedditListing>(
      "https://www.reddit.com/r/formula1/hot.json?limit=12",
    );
    const posts = payload.data?.children ?? [];
    const items = posts.flatMap<ActivityItem>((child) => {
      const post = child.data;
      if (!post?.id || !post.title) {
        return [];
      }

      const engagement = (post.score ?? 0) + (post.num_comments ?? 0) * 2;
      const publishedAt = post.created_utc
        ? new Date(post.created_utc * 1000).toISOString()
        : null;
      const summary = stripMarkup(post.selftext).slice(0, 180);

      return {
        id: `reddit-${post.id}`,
        source: "reddit",
        sourceLabel: "r/formula1",
        title: post.title,
        url: normalizeUrl(post.permalink ?? post.url, "https://www.reddit.com"),
        publishedAt,
        summary,
        category: "community",
        signalScore: scoreActivity(post.title, summary, publishedAt, engagement),
        engagementLabel: engagementLabel(engagement),
        tags: [
          ...(post.link_flair_text ? [post.link_flair_text] : []),
          ...buildActivityTags(`${post.title} ${summary}`, drivers),
        ].slice(0, 4),
      };
    });

    const pulse: SourcePulse = {
      source: "reddit",
      label: "Reddit",
      status: items.length ? "live" : "empty",
      count: items.length,
      updatedAt: items.length ? new Date().toISOString() : null,
      note: "Community activity from r/formula1 hot posts.",
    };

    return {
      items,
      pulse,
    };
  } catch {
    const pulse: SourcePulse = {
      source: "reddit",
      label: "Reddit",
      status: "fallback",
      count: 0,
      updatedAt: null,
      note: "Reddit activity was unavailable during this snapshot.",
    };

    return {
      items: [] as ActivityItem[],
      pulse,
    };
  }
}

async function fetchXActivity(drivers: DriverInsight[], raceLabel: string) {
  const token = process.env.X_BEARER_TOKEN;

  if (!token) {
    const pulse: SourcePulse = {
      source: "x",
      label: "X",
      status: "fallback",
      count: 0,
      updatedAt: null,
      note: "Set X_BEARER_TOKEN to enable recent-search activity.",
    };

    return {
      items: [] as ActivityItem[],
      pulse,
    };
  }

  const query = encodeURIComponent(
    `("F1" OR "Formula 1" OR "${raceLabel}") (upgrade OR qualifying OR race OR sprint OR penalty OR pace) lang:en -is:retweet`,
  );

  try {
    const response = await fetch(
      `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=10&tweet.fields=created_at,public_metrics`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "user-agent": "PolePositionHQ/1.0",
        },
        next: { revalidate: NEWS_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`X recent search failed with ${response.status}`);
    }

    const payload = (await response.json()) as XRecentSearch;
    const items = (payload.data ?? []).map<ActivityItem>((post) => {
      const engagement =
        (post.public_metrics?.like_count ?? 0) +
        (post.public_metrics?.retweet_count ?? 0) * 2 +
        (post.public_metrics?.reply_count ?? 0) * 2 +
        (post.public_metrics?.quote_count ?? 0) * 2;

      return {
        id: `x-${post.id}`,
        source: "x",
        sourceLabel: "X",
        title: stripMarkup(post.text).slice(0, 130),
        url: `https://x.com/i/web/status/${post.id}`,
        publishedAt: post.created_at ?? null,
        summary: stripMarkup(post.text).slice(0, 220),
        category: classifyActivity(post.text),
        signalScore: scoreActivity(post.text, "", post.created_at ?? null, engagement),
        engagementLabel: engagementLabel(engagement),
        tags: buildActivityTags(post.text, drivers),
      };
    });

    const pulse: SourcePulse = {
      source: "x",
      label: "X",
      status: items.length ? "live" : "empty",
      count: items.length,
      updatedAt: items.length ? new Date().toISOString() : null,
      note: "Recent-search activity from the configured X API app.",
    };

    return {
      items,
      pulse,
    };
  } catch {
    const pulse: SourcePulse = {
      source: "x",
      label: "X",
      status: "fallback",
      count: 0,
      updatedAt: null,
      note: "X recent search failed for this snapshot.",
    };

    return {
      items: [] as ActivityItem[],
      pulse,
    };
  }
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
  return standings.map((standing) => {
    const permanentNumber = standing.driver.permanentNumber ?? "0";
    const openDriver = findDriverMatch(
      {
        permanentNumber,
        abbreviation: standing.driver.abbreviation,
        fullName: standing.driver.fullName,
        firstName: standing.driver.firstName,
        lastName: standing.driver.lastName,
      },
      openDrivers,
    );
    const teamName = canonicalizeConstructorName(openDriver?.team_name);
    const sessionDriverNumber = String(openDriver?.driver_number ?? permanentNumber);
    const driverLaps = laps
      .filter(
        (lap) =>
          String(lap.driver_number) === sessionDriverNumber &&
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
      fullName: formatDriverName({
        firstName: openDriver?.first_name ?? standing.driver.firstName,
        lastName: openDriver?.last_name ?? standing.driver.lastName,
        fullName: openDriver?.full_name ?? standing.driver.fullName,
      }),
      firstName: openDriver?.first_name ?? standing.driver.firstName,
      lastName: openDriver?.last_name ?? standing.driver.lastName,
      abbreviation: (openDriver?.name_acronym ?? standing.driver.abbreviation).toUpperCase(),
      permanentNumber,
      sessionDriverNumber,
      standingPosition: standing.positionNumber ?? 99,
      standingText: standing.positionText,
      points: standing.points,
      championshipWon: standing.championshipWon,
      teamName: teamName ?? "Constructor unavailable",
      teamColor: teamName ? normalizeTeamColor(openDriver?.team_colour) : "697386",
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
  const bases = [
    FANTASY_API_BASE_URL,
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
    insights.map((driver) => [driver.sessionDriverNumber, driver]),
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
        trackProgress:
          latestByDriver.size > 1
            ? (latestByDriver.size - entry.position) / (latestByDriver.size - 1)
            : 0,
      };
  });
}

function minimum(values: Array<number | undefined>): number | null {
  const filtered = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return filtered.length ? Math.min(...filtered) : null;
}

function getSectorState(
  value: number | null,
  personalBest: number | null,
  overallBest: number | null,
): TimingSectorState {
  if (value === null) {
    return "unavailable";
  }

  if (overallBest !== null && Math.abs(value - overallBest) < 0.0005) {
    return "overall-best";
  }

  if (personalBest !== null && Math.abs(value - personalBest) < 0.0005) {
    return "personal-best";
  }

  return "slower";
}

function buildTimingTower(
  sessionResults: OpenF1SessionResult[],
  positions: OpenF1Position[],
  intervals: OpenF1Interval[],
  stints: OpenF1Stint[],
  pits: OpenF1Pit[],
  laps: OpenF1Lap[],
  insights: DriverInsight[],
): TimingTowerEntry[] {
  const earliestPositionByDriver = new Map<number, OpenF1Position>();
  const latestIntervalByDriver = new Map<number, OpenF1Interval>();
  const latestStintByDriver = new Map<number, OpenF1Stint>();
  const lapsByDriver = new Map<number, OpenF1Lap[]>();
  const pitsByDriver = new Map<number, OpenF1Pit[]>();

  positions.forEach((entry) => {
    const earliest = earliestPositionByDriver.get(entry.driver_number);
    if (!earliest || entry.date < earliest.date) {
      earliestPositionByDriver.set(entry.driver_number, entry);
    }
  });

  intervals.forEach((entry) => {
    const latest = latestIntervalByDriver.get(entry.driver_number);
    if (!latest || entry.date > latest.date) {
      latestIntervalByDriver.set(entry.driver_number, entry);
    }
  });

  stints.forEach((entry) => {
    const latest = latestStintByDriver.get(entry.driver_number);
    if (
      !latest ||
      entry.stint_number > latest.stint_number ||
      (entry.stint_number === latest.stint_number &&
        (entry.lap_end ?? entry.lap_start) > (latest.lap_end ?? latest.lap_start))
    ) {
      latestStintByDriver.set(entry.driver_number, entry);
    }
  });

  laps.forEach((lap) => {
    const driverLaps = lapsByDriver.get(lap.driver_number) ?? [];
    driverLaps.push(lap);
    lapsByDriver.set(lap.driver_number, driverLaps);
  });

  pits.forEach((pit) => {
    const driverPits = pitsByDriver.get(pit.driver_number) ?? [];
    driverPits.push(pit);
    pitsByDriver.set(pit.driver_number, driverPits);
  });

  const overallSectorBests = {
    sector1: minimum(laps.map((lap) => lap.duration_sector_1)),
    sector2: minimum(laps.map((lap) => lap.duration_sector_2)),
    sector3: minimum(laps.map((lap) => lap.duration_sector_3)),
  };
  const driversByNumber = new Map(
    insights.map((driver) => [Number(driver.sessionDriverNumber), driver]),
  );
  const orderedResults = sessionResults
    .map((result, index) => ({
      result,
      position: result.position ?? index + 1,
    }))
    .sort((a, b) => a.position - b.position);

  return orderedResults.map(({ result, position }, index): TimingTowerEntry => {
      const driverNumber = result.driver_number;
      const driver = driversByNumber.get(driverNumber);
      const earliestPosition = earliestPositionByDriver.get(driverNumber);
      const interval = latestIntervalByDriver.get(driverNumber);
      const previousResult = orderedResults[index - 1]?.result ?? null;
      const derivedInterval =
        typeof result.gap_to_leader === "number" &&
        typeof previousResult?.gap_to_leader === "number"
          ? Number(
              (result.gap_to_leader - previousResult.gap_to_leader).toFixed(3),
            )
          : null;
      const driverLaps = (lapsByDriver.get(driverNumber) ?? []).sort(
        (a, b) => a.lap_number - b.lap_number,
      );
      const timedLaps = driverLaps.filter(
        (lap) =>
          typeof lap.lap_duration === "number" &&
          Number.isFinite(lap.lap_duration) &&
          !lap.is_pit_out_lap,
      );
      const latestLap = timedLaps.at(-1) ?? null;
      const bestLap = timedLaps
        .slice()
        .sort(
          (a, b) =>
            (a.lap_duration ?? Number.POSITIVE_INFINITY) -
            (b.lap_duration ?? Number.POSITIVE_INFINITY),
        )[0] ?? null;
      const personalSectorBests = {
        sector1: minimum(driverLaps.map((lap) => lap.duration_sector_1)),
        sector2: minimum(driverLaps.map((lap) => lap.duration_sector_2)),
        sector3: minimum(driverLaps.map((lap) => lap.duration_sector_3)),
      };
      const sectors = {
        sector1: latestLap?.duration_sector_1 ?? null,
        sector2: latestLap?.duration_sector_2 ?? null,
        sector3: latestLap?.duration_sector_3 ?? null,
      };
      const stint = latestStintByDriver.get(driverNumber) ?? null;
      const latestRecordedLap = driverLaps.at(-1) ?? null;
      const latestLapNumber =
        result.number_of_laps ?? latestRecordedLap?.lap_number ?? null;
      const driverPits = (pitsByDriver.get(driverNumber) ?? []).sort(
        (a, b) => a.lap_number - b.lap_number,
      );
      const tyreAge =
        stint && latestLapNumber !== null
          ? Math.max(
              0,
              (stint.tyre_age_at_start ?? 0) + latestLapNumber - stint.lap_start + 1,
            )
          : null;

      return {
        driverId: driver?.id ?? `driver-${driverNumber}`,
        fullName: driver?.fullName ?? `Driver ${driverNumber}`,
        abbreviation: driver?.abbreviation ?? String(driverNumber),
        permanentNumber: driver?.permanentNumber ?? String(driverNumber),
        teamName: driver?.teamName ?? "Constructor unavailable",
        teamColor: normalizeTeamColor(driver?.teamColor ?? "697386"),
        position,
        positionChange: earliestPosition
          ? earliestPosition.position - position
          : null,
        gapToLeader:
          position === 1
            ? 0
            : result.gap_to_leader ?? interval?.gap_to_leader ?? null,
        interval:
          position === 1 ? null : interval?.interval ?? derivedInterval,
        lastLap: latestLap?.lap_duration ?? null,
        bestLap: bestLap?.lap_duration ?? null,
        sectors,
        sectorStates: {
          sector1: getSectorState(
            sectors.sector1,
            personalSectorBests.sector1,
            overallSectorBests.sector1,
          ),
          sector2: getSectorState(
            sectors.sector2,
            personalSectorBests.sector2,
            overallSectorBests.sector2,
          ),
          sector3: getSectorState(
            sectors.sector3,
            personalSectorBests.sector3,
            overallSectorBests.sector3,
          ),
        },
        compound: stint?.compound ?? null,
        tyreAge,
        stintNumber: stint?.stint_number ?? null,
        pitStops: driverPits.length,
        lastPitLap: driverPits.at(-1)?.lap_number ?? null,
        pitStatus:
          latestRecordedLap?.is_pit_out_lap === true
            ? "pit-out"
            : latestRecordedLap
              ? "track"
              : "unavailable",
        raceStatus: result.dsq
          ? "dsq"
          : result.dns
            ? "dns"
            : result.dnf
              ? "dnf"
              : "classified",
        latestLapNumber,
      };
    });
}

function buildStrategyDrivers(
  sessionResults: OpenF1SessionResult[],
  positions: OpenF1Position[],
  stints: OpenF1Stint[],
  pits: OpenF1Pit[],
  insights: DriverInsight[],
  timingEntries: TimingTowerEntry[],
): StrategyDriver[] {
  const driversByNumber = new Map(
    insights.map((driver) => [Number(driver.sessionDriverNumber), driver]),
  );
  const timingByDriverId = new Map(
    timingEntries.map((entry) => [entry.driverId, entry]),
  );
  const positionsByDriver = new Map<number, OpenF1Position[]>();
  const stintsByDriver = new Map<number, OpenF1Stint[]>();
  const pitsByDriver = new Map<number, OpenF1Pit[]>();

  positions.forEach((position) => {
    const driverPositions = positionsByDriver.get(position.driver_number) ?? [];
    driverPositions.push(position);
    positionsByDriver.set(position.driver_number, driverPositions);
  });
  stints.forEach((stint) => {
    const driverStints = stintsByDriver.get(stint.driver_number) ?? [];
    driverStints.push(stint);
    stintsByDriver.set(stint.driver_number, driverStints);
  });
  pits.forEach((pit) => {
    const driverPits = pitsByDriver.get(pit.driver_number) ?? [];
    driverPits.push(pit);
    pitsByDriver.set(pit.driver_number, driverPits);
  });

  positionsByDriver.forEach((driverPositions) =>
    driverPositions.sort((a, b) => a.date.localeCompare(b.date)),
  );
  stintsByDriver.forEach((driverStints) =>
    driverStints.sort((a, b) => a.stint_number - b.stint_number),
  );
  pitsByDriver.forEach((driverPits) =>
    driverPits.sort((a, b) => a.lap_number - b.lap_number),
  );

  const pitLapsByStop = new Map<number, number[]>();
  pitsByDriver.forEach((driverPits) => {
    driverPits.forEach((pit, index) => {
      const laps = pitLapsByStop.get(index) ?? [];
      laps.push(pit.lap_number);
      pitLapsByStop.set(index, laps);
    });
  });

  return sessionResults.map((result, index) => {
    const driver = driversByNumber.get(result.driver_number);
    const driverId = driver?.id ?? `driver-${result.driver_number}`;
    const timing = timingByDriverId.get(driverId);
    const driverPositions = positionsByDriver.get(result.driver_number) ?? [];
    const driverPits = pitsByDriver.get(result.driver_number) ?? [];
    const pitOutcomes: StrategyDriver["pitOutcomes"] = driverPits.map((pit, pitIndex) => {
      const pitTime = new Date(pit.date).getTime();
      const positionBefore = driverPositions
        .filter((position) => new Date(position.date).getTime() <= pitTime)
        .at(-1) ?? null;
      const positionAfter =
        driverPositions.find((position) => {
          const positionTime = new Date(position.date).getTime();
          return positionTime > pitTime && positionTime - pitTime <= 4 * 60_000;
        }) ?? positionBefore;
      const positionDelta =
        positionBefore && positionAfter
          ? positionBefore.position - positionAfter.position
          : null;
      const fieldMedianLap = median(pitLapsByStop.get(pitIndex) ?? []);
      const signal: StrategyDriver["pitOutcomes"][number]["signal"] =
        positionDelta === null
          ? "unavailable"
          : positionDelta > 0
            ? fieldMedianLap !== null && pit.lap_number < fieldMedianLap - 1
              ? "undercut"
              : fieldMedianLap !== null && pit.lap_number > fieldMedianLap + 1
                ? "overcut"
                : "gained"
            : positionDelta < 0
              ? "lost"
              : "neutral";

      return {
        lapNumber: pit.lap_number,
        positionBefore: positionBefore?.position ?? null,
        positionAfter: positionAfter?.position ?? null,
        positionDelta,
        signal,
      };
    });

    return {
      driverId,
      fullName: timing?.fullName ?? driver?.fullName ?? `Driver ${result.driver_number}`,
      abbreviation:
        timing?.abbreviation ?? driver?.abbreviation ?? String(result.driver_number),
      teamColor: timing?.teamColor ?? driver?.teamColor ?? "697386",
      finalPosition: timing?.position ?? result.position ?? index + 1,
      raceStatus: timing?.raceStatus ?? "classified",
      stints: (stintsByDriver.get(result.driver_number) ?? []).map((stint) => ({
        stintNumber: stint.stint_number,
        compound: stint.compound,
        lapStart: stint.lap_start,
        lapEnd: stint.lap_end,
        tyreAgeAtStart: stint.tyre_age_at_start,
      })),
      pitOutcomes,
    } satisfies StrategyDriver;
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
  return openDrivers.slice(0, 24).map((driver, index) => {
    const teamName = canonicalizeConstructorName(driver.team_name);
    return {
      id: `fallback-${driver.driver_number}`,
      fullName: formatDriverName({
        firstName: driver.first_name,
        lastName: driver.last_name,
        fullName: driver.full_name,
      }),
      firstName: driver.first_name,
      lastName: driver.last_name,
      abbreviation: driver.name_acronym.toUpperCase(),
      permanentNumber: String(driver.driver_number),
      sessionDriverNumber: String(driver.driver_number),
      standingPosition: index + 1,
      standingText: String(index + 1),
      points: 0,
      championshipWon: false,
      teamName: teamName ?? "Constructor unavailable",
      teamColor: teamName ? normalizeTeamColor(driver.team_colour) : "697386",
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
    };
  });
}

async function fetchOpenDriversForContext(sessionKey: number | null) {
  const attempts: Array<number | "latest"> = ["latest"];
  if (sessionKey !== null) {
    attempts.push(sessionKey);
  }

  for (const attempt of attempts) {
    try {
      const drivers = await fetchOpenDrivers(attempt);
      if (drivers.length) {
        return drivers;
      }
    } catch {
      continue;
    }
  }

  return [];
}

function buildFallbackActivity(
  drivers: DriverInsight[],
  raceLabel: string,
): ActivityItem[] {
  const leadDriver = drivers[0];
  const valueDriver = drivers
    .slice()
    .sort((a, b) => b.sentiment.delta - a.sentiment.delta)[0];

  return [
    {
      id: "fallback-news-upgrades",
      source: "fallback",
      sourceLabel: "Product model",
      title: `${raceLabel} upgrade watch opens across the front of the field`,
      url: "https://www.motorsport.com/rss/",
      publishedAt: null,
      summary:
        "Editorial sources are temporarily unavailable, so the dashboard is holding a model-generated upgrade watch until the next successful news pull.",
      category: "upgrade",
      signalScore: 58,
      engagementLabel: "model",
      tags: ["upgrade", leadDriver?.abbreviation ?? "F1"].filter(Boolean),
    },
    {
      id: "fallback-news-timing",
      source: "fallback",
      sourceLabel: "Product model",
      title: `${leadDriver?.fullName ?? "The championship leader"} sets the timing benchmark`,
      url: "https://api.openf1.org/v1",
      publishedAt: null,
      summary:
        "Timing context is derived from OpenF1 lap averages and standings while live editorial/social feeds recover.",
      category: "timing",
      signalScore: 52,
      engagementLabel: "model",
      tags: ["timing", valueDriver?.abbreviation ?? "pace"].filter(Boolean),
    },
  ];
}

function buildConstructorContext(drivers: DriverInsight[]) {
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

async function fetchActivitySurface(drivers: DriverInsight[], raceLabel: string) {
  const [editorial, reddit, x] = await Promise.all([
    fetchEditorialActivity(drivers),
    fetchRedditActivity(drivers),
    fetchXActivity(drivers, raceLabel),
  ]);

  const items = dedupeActivityItems([
    ...editorial.items,
    ...reddit.items,
    ...x.items,
  ]).slice(0, 18);
  const sourcePulse = [...editorial.pulse, reddit.pulse, x.pulse];

  if (items.length) {
    return { items, sourcePulse };
  }

  return {
    items: buildFallbackActivity(drivers, raceLabel),
    sourcePulse: [
      ...sourcePulse,
      {
        source: "fallback" as const,
        label: "Product model",
        status: "fallback" as const,
        count: 2,
        updatedAt: new Date().toISOString(),
        note: "Fallback activity keeps the newsroom usable when external feeds fail.",
      },
    ],
  };
}

function buildUpgradeSignals(
  activityItems: ActivityItem[],
  drivers: DriverInsight[],
): UpgradeSignal[] {
  const teams = buildConstructorContext(drivers);
  const upgradeItems = activityItems.filter((item) => item.category === "upgrade");

  const signals = teams.slice(0, 6).flatMap<UpgradeSignal>((team, index) => {
    const related = upgradeItems.filter((item) => {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      return (
        text.includes(team.teamName.toLowerCase()) ||
        team.drivers.some((driver) => item.tags.includes(driver))
      );
    });

    if (!related.length && index > 2) {
      return [];
    }

    const confidence = related.length
      ? Math.min(94, 58 + related.reduce((sum, item) => sum + item.signalScore, 0) / related.length / 2)
      : Math.max(42, 68 - index * 6);

    return {
      id: `upgrade-${team.teamName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      teamName: team.teamName,
      teamColor: team.teamColor,
      package: related[0]?.title.match(/\b(floor|wing|sidepod|aero|package|upgrade)\b/i)?.[0]
        ? `${related[0].title.match(/\b(floor|wing|sidepod|aero|package|upgrade)\b/i)?.[0]} focus`
        : index === 0
          ? "Front-end balance watch"
          : index === 1
            ? "Low-drag trim watch"
            : "Race package watch",
      impact: confidence >= 76 ? "high" : confidence >= 58 ? "medium" : "low",
      confidence: Math.round(confidence),
      evidence: related[0]?.summary || related[0]?.title || "Derived from standings pressure and recent pace context.",
      relatedItemIds: related.slice(0, 3).map((item) => item.id),
    };
  });

  return signals.slice(0, 4);
}

function buildTimingDeltas(drivers: DriverInsight[]): TimingDelta[] {
  const driversWithLap = drivers.filter((driver) => typeof driver.avgLap === "number");
  const bestLap = driversWithLap.length
    ? Math.min(...driversWithLap.map((driver) => driver.avgLap ?? Number.POSITIVE_INFINITY))
    : null;

  return drivers.slice(0, 8).map((driver) => {
    const sectorPairs: Array<["S1" | "S2" | "S3", number | null]> = [
      ["S1" as const, driver.sectorAverages.sector1],
      ["S2" as const, driver.sectorAverages.sector2],
      ["S3" as const, driver.sectorAverages.sector3],
    ];
    const slowestSector = sectorPairs
      .filter((entry): entry is ["S1" | "S2" | "S3", number] => typeof entry[1] === "number")
      .sort((a, b) => b[1] - a[1])[0];
    const deltaToBest =
      typeof driver.avgLap === "number" && bestLap !== null
        ? Number((driver.avgLap - bestLap).toFixed(3))
        : null;

    return {
      driverId: driver.id,
      driverLabel: driver.abbreviation,
      teamColor: driver.teamColor,
      avgLap: driver.avgLap,
      deltaToBest,
      sectorFocus: slowestSector?.[0] ?? "race pace",
      note:
        deltaToBest === null
          ? "No comparable lap sample yet"
          : deltaToBest <= 0.05
            ? "Benchmark window"
            : deltaToBest <= 0.45
              ? "Within setup range"
              : "Needs stint read",
    };
  });
}

function buildRaceIntelligence(
  activityItems: ActivityItem[],
  sourcePulse: SourcePulse[],
  drivers: DriverInsight[],
  raceLabel: string,
): DashboardData["raceIntelligence"] {
  const upgradeSignals = buildUpgradeSignals(activityItems, drivers);
  const timingDeltas = buildTimingDeltas(drivers);
  const leadSignal = upgradeSignals[0];
  const hotTiming = timingDeltas.find((delta) => delta.deltaToBest !== null);

  return {
    raceLabel,
    headline: leadSignal
      ? `${leadSignal.teamName} ${leadSignal.package.toLowerCase()} leads the upgrade board`
      : hotTiming
        ? `${hotTiming.driverLabel} anchors the current timing read`
        : `${raceLabel} intelligence is building from the live feed`,
    upgradeSignals,
    timingDeltas,
    sourcePulse,
  };
}

function buildRaceControl(
  nextSession: OpenF1Session | null,
): DashboardData["raceControl"] {
  const upcomingStart = nextSession ? new Date(nextSession.date_start).getTime() : null;
  const countdownEndsAt =
    upcomingStart && upcomingStart > Date.now() ? nextSession?.date_start ?? null : null;

  return {
    flag: "Idle",
    message: "No live race-control feed is connected.",
    countdownEndsAt,
    events: [],
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const endpoints = await getEndpointConfig();
  OPEN_F1_BASE = endpoints.openF1BaseUrl;
  GRAPHQL_ENDPOINT = endpoints.f1GraphqlEndpoint;
  FANTASY_API_BASE_URL = endpoints.fantasyApiBaseUrl;

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
    fetchOpenDriversForContext(recentRaceSession?.session_key ?? null),
  ]);
  const standingsRows =
    standingsRowsResult.status === "fulfilled" ? standingsRowsResult.value : [];
  const fallbackDrivers =
    fallbackDriversResult.status === "fulfilled" ? fallbackDriversResult.value : [];

  const telemetrySession = recentRaceSession ? mapSession(recentRaceSession) : null;

  const intervalWindowStart = recentRaceSession
    ? new Date(
        new Date(recentRaceSession.date_end).getTime() - 40 * 60_000,
      ).toISOString()
    : null;
  const sessionResults = recentRaceSession
    ? await fetchArrayOrEmpty<OpenF1SessionResult>(
        `${OPEN_F1_BASE}/session_result?session_key=${recentRaceSession.session_key}`,
      )
    : [];
  const intervals = recentRaceSession
    ? await fetchArrayOrEmpty<OpenF1Interval>(
        `${OPEN_F1_BASE}/intervals?session_key=${recentRaceSession.session_key}&date>=${encodeURIComponent(intervalWindowStart ?? recentRaceSession.date_start)}`,
      )
    : [];
  const laps = recentRaceSession
    ? await fetchArrayOrEmpty<OpenF1Lap>(
        `${OPEN_F1_BASE}/laps?session_key=${recentRaceSession.session_key}`,
      )
    : [];
  const positions = recentRaceSession
    ? await fetchArrayOrEmpty<OpenF1Position>(
        `${OPEN_F1_BASE}/position?session_key=${recentRaceSession.session_key}`,
      )
    : [];
  const stints = recentRaceSession
    ? await fetchArrayOrEmpty<OpenF1Stint>(
        `${OPEN_F1_BASE}/stints?session_key=${recentRaceSession.session_key}`,
      )
    : [];
  const pits = recentRaceSession
    ? await fetchArrayOrEmpty<OpenF1Pit>(
        `${OPEN_F1_BASE}/pit?session_key=${recentRaceSession.session_key}`,
      )
    : [];
  const finalPositions: OpenF1Position[] = sessionResults.map((result, index) => ({
    date: recentRaceSession?.date_end ?? generatedAt,
    driver_number: result.driver_number,
    position: result.position ?? index + 1,
  }));

  const driverInsights = standingsRows.length
    ? computeDriverInsights(standingsRows, fallbackDrivers, laps)
    : buildFallbackDriverInsights(fallbackDrivers);
  const telemetryDriver = driverInsights[0];

  let telemetrySamples: TelemetrySample[] = [];

  if (recentRaceSession && telemetryDriver) {
    const telemetryLaps = laps
      .filter(
        (lap) =>
          String(lap.driver_number) === telemetryDriver.sessionDriverNumber &&
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
            telemetryDriver.sessionDriverNumber
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
  const trackCars = buildTrackCars(finalPositions, driverInsights);
  const timingEntries = buildTimingTower(
    sessionResults,
    positions,
    intervals,
    stints,
    pits,
    laps,
    driverInsights,
  );
  const strategyDrivers = buildStrategyDrivers(
    sessionResults,
    positions,
    stints,
    pits,
    driverInsights,
    timingEntries,
  );
  const strategyTotalLaps = Math.max(
    0,
    ...sessionResults.map((result) => result.number_of_laps ?? 0),
  );
  const mapContextSession =
    recentRaceSession && (telemetrySamples.length || trackCars.length)
      ? recentRaceSession
      : nextSession;
  const mapCircuitName = mapContextSession?.circuit_short_name ?? "Circuit unavailable";
  const raceLabel = nextSession
    ? `${nextSession.circuit_short_name} ${nextSession.session_name}`
    : telemetrySession
      ? `${telemetrySession.circuitName} review`
      : `${season} season`;
  const [fantasy, activity] = await Promise.all([
    fetchFantasyBoard(driverInsights),
    fetchActivitySurface(driverInsights, raceLabel),
  ]);
  const raceIntelligence = buildRaceIntelligence(
    activity.items,
    activity.sourcePulse,
    driverInsights,
    raceLabel,
  );
  const raceControl = buildRaceControl(nextSession);
  const weekendWeather: DashboardData["weekendWeather"] = [];

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
    timingTower: {
      session: telemetrySession,
      status: timingEntries.length ? "cached" : "empty",
      updatedAt: timingEntries.length ? generatedAt : null,
      note: timingEntries.length
        ? `Archived ${telemetrySession?.sessionName ?? "race"} timing from OpenF1. Gaps, sectors, tyre stints, and pit events are session-scoped replay data.`
        : "No session-matched timing, stint, or pit data is available in this snapshot.",
      entries: timingEntries,
    },
    strategy: {
      session: telemetrySession,
      status: strategyDrivers.some((driver) => driver.stints.length)
        ? "cached"
        : "empty",
      updatedAt: strategyDrivers.some((driver) => driver.stints.length)
        ? generatedAt
        : null,
      note: strategyDrivers.some((driver) => driver.stints.length)
        ? "Archived OpenF1 stint and pit sequence. Undercut and overcut signals are inferred from observable position change and stop timing versus the field median; they are directional, not causal proof."
        : "No session-matched tyre stint sequence is available in this snapshot.",
      totalLaps: strategyTotalLaps,
      drivers: strategyDrivers,
    },
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
        status: telemetrySamples.length ? "cached" : "empty",
        updatedAt: telemetrySamples.length ? generatedAt : null,
        note: telemetrySamples.length
          ? `Archived fastest-lap telemetry from ${telemetrySession?.circuitName ?? "the latest completed race"}; this is a replay, not a live session.`
          : "No session-matched telemetry is available in this snapshot.",
      },
      fantasy: {
        label: "Fantasy",
        source:
          fantasy.source === "official"
            ? "Official F1 Fantasy API"
            : "Standings-derived fallback model",
        status: fantasy.source === "official" ? "live" : "simulated",
        updatedAt: generatedAt,
        note: fantasy.note,
      },
      activity: {
        label: "Activity",
        source: "Motorsport.com, The Race, Reddit, X",
        status: activity.items.some((item) => item.source !== "fallback")
          ? "cached"
          : "simulated",
        updatedAt: activity.items.length ? generatedAt : null,
        note: activity.items.some((item) => item.source !== "fallback")
          ? "Editorial and social feeds are normalized into a single activity rail."
          : "External activity feeds were unavailable, so modeled race notes are displayed.",
      },
      raceIntel: {
        label: "Race intel",
        source: "Activity feeds + OpenF1 timing model",
        status: raceIntelligence.timingDeltas.length || raceIntelligence.upgradeSignals.length
          ? "cached"
          : "empty",
        updatedAt: generatedAt,
        note: "Upgrade and timing cards are generated from source mentions, standings pressure, and lap data.",
      },
    },
    activity,
    raceIntelligence,
    raceControl,
    weekendWeather,
    liveTiming: {
      connection: "offline",
      receivedAt: null,
      sampleIndex: Math.max(0, telemetrySamples.length - 1),
      trackPosition: telemetrySamples.at(-1)?.trackPosition ?? 0,
      latencyMs: 0,
    },
    fantasy,
  };
}
