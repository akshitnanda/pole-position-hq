export type SessionSummary = {
  meetingKey: number;
  sessionKey: number;
  sessionName: string;
  sessionType: string;
  dateStart: string;
  dateEnd: string;
  circuitName: string;
  countryName: string;
  countryCode: string | null;
  location: string;
  gmtOffset: string;
  isCancelled: boolean;
};

export type DriverInsight = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  abbreviation: string;
  permanentNumber: string;
  standingPosition: number;
  standingText: string;
  points: number;
  championshipWon: boolean;
  teamName: string;
  teamColor: string;
  headshotUrl: string;
  totalRaceWins: number;
  totalPodiums: number;
  totalPolePositions: number;
  totalPoints: number;
  paceSeries: number[];
  avgLap: number | null;
  sectorAverages: {
    sector1: number | null;
    sector2: number | null;
    sector3: number | null;
  };
  sentiment: {
    score: number;
    label: string;
    delta: number;
  };
};

export type TelemetrySample = {
  index: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  elapsed: number;
  deltaSpeed: number;
  trackPosition: number;
  phase: "push" | "brake" | "coast";
};

export type TelemetryInsights = {
  peakSpeed: number;
  minSpeed: number;
  avgSpeed: number;
  avgThrottle: number;
  avgBrake: number;
  fullThrottlePct: number;
  brakeZonePct: number;
  topGearPct: number;
  gearChanges: number;
  brakeEvents: number;
  commitmentScore: number;
  attackBalance: number;
};

export type TrackCar = {
  driverId: string;
  abbreviation: string;
  teamColor: string;
  position: number;
  gapLabel: string;
};

export type FantasyEntry = {
  driverId: string;
  label: string;
  teamName: string;
  valueScore: number;
  price: number;
  trend: number;
  points: number;
};

export type ActivitySource = "motorsport" | "the-race" | "x" | "reddit" | "fallback";

export type ActivityItem = {
  id: string;
  source: ActivitySource;
  sourceLabel: string;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
  category: "breaking" | "upgrade" | "timing" | "strategy" | "community" | "business";
  signalScore: number;
  engagementLabel: string;
  tags: string[];
};

export type SourcePulse = {
  source: ActivitySource;
  label: string;
  status: DataFeedStatus;
  count: number;
  updatedAt: string | null;
  note?: string | null;
};

export type UpgradeSignal = {
  id: string;
  teamName: string;
  teamColor: string;
  package: string;
  impact: "high" | "medium" | "low";
  confidence: number;
  evidence: string;
  relatedItemIds: string[];
};

export type TimingDelta = {
  driverId: string;
  driverLabel: string;
  teamColor: string;
  avgLap: number | null;
  deltaToBest: number | null;
  sectorFocus: "S1" | "S2" | "S3" | "race pace";
  note: string;
};

export type RaceIntelligence = {
  headline: string;
  raceLabel: string;
  upgradeSignals: UpgradeSignal[];
  timingDeltas: TimingDelta[];
  sourcePulse: SourcePulse[];
};

export type DataFeedStatus = "live" | "cached" | "fallback" | "empty";

export type DashboardFeedMeta = {
  label: string;
  source: string;
  status: DataFeedStatus;
  updatedAt: string | null;
  note?: string | null;
};

export type DashboardData = {
  generatedAt: string;
  season: number;
  nextSession: SessionSummary | null;
  nextSessions: SessionSummary[];
  telemetrySession: SessionSummary | null;
  telemetryDriverId: string | null;
  telemetryDriverLabel: string | null;
  telemetrySamples: TelemetrySample[];
  telemetryInsights: TelemetryInsights | null;
  standings: DriverInsight[];
  trackMap: {
    circuitName: string;
    layoutKey: string;
    cars: TrackCar[];
  };
  sources: {
    schedule: DashboardFeedMeta;
    telemetry: DashboardFeedMeta;
    fantasy: DashboardFeedMeta;
    activity: DashboardFeedMeta;
    raceIntel: DashboardFeedMeta;
  };
  activity: {
    items: ActivityItem[];
    sourcePulse: SourcePulse[];
  };
  raceIntelligence: RaceIntelligence;
  fantasy: {
    source: "official" | "fallback";
    note: string;
    topValue: FantasyEntry[];
    priceRisers: FantasyEntry[];
  };
};
