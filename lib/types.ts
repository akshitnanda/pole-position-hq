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
  sessionDriverNumber: string;
  standingPosition: number;
  standingText: string;
  points: number;
  championshipWon: boolean;
  teamName: string;
  teamColor: string;
  headshotUrl: string | null;
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

export type TelemetryTrace = {
  driverId: string;
  driverLabel: string;
  abbreviation: string;
  teamColor: string;
  lapNumber: number;
  lapTime: number;
  samples: TelemetrySample[];
};

export type TrackCar = {
  driverId: string;
  abbreviation: string;
  teamColor: string;
  position: number;
  gapLabel: string;
  trackProgress: number;
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

export type RaceControlFlag = "Idle" | "Green" | "Yellow" | "Red" | "VSC" | "SC";

export type RaceControlEvent = {
  id: string;
  timestamp: string;
  type: "flag" | "pit" | "incident" | "overtake" | "system";
  message: string;
  driverId?: string | null;
};

export type RaceControlState = {
  flag: RaceControlFlag;
  message: string;
  countdownEndsAt: string | null;
  events: RaceControlEvent[];
};

export type TeamRadioClip = {
  id: string;
  driverId: string | null;
  driverNumber: string;
  driverLabel: string;
  abbreviation: string;
  teamColor: string;
  recordedAt: string;
  recordingUrl: string;
};

export type SessionWeather = {
  sessionKey: number;
  label: string;
  temperatureC: number;
  rainChance: number;
  summary: string;
};

export type LiveTimingState = {
  connection: "websocket" | "eventsource" | "offline";
  receivedAt: string | null;
  sampleIndex: number;
  trackPosition: number;
  latencyMs: number;
};

export type TimingSectorState =
  | "overall-best"
  | "personal-best"
  | "slower"
  | "unavailable";

export type TimingTowerEntry = {
  driverId: string;
  fullName: string;
  abbreviation: string;
  permanentNumber: string;
  teamName: string;
  teamColor: string;
  position: number;
  positionChange: number | null;
  gapToLeader: number | string | null;
  interval: number | string | null;
  lastLap: number | null;
  bestLap: number | null;
  sectors: {
    sector1: number | null;
    sector2: number | null;
    sector3: number | null;
  };
  sectorStates: {
    sector1: TimingSectorState;
    sector2: TimingSectorState;
    sector3: TimingSectorState;
  };
  compound: string | null;
  tyreAge: number | null;
  stintNumber: number | null;
  pitStops: number;
  lastPitLap: number | null;
  pitStatus: "track" | "pit-out" | "unavailable";
  raceStatus: "classified" | "dnf" | "dns" | "dsq";
  latestLapNumber: number | null;
};

export type StrategyStint = {
  stintNumber: number;
  compound: string | null;
  lapStart: number;
  lapEnd: number | null;
  tyreAgeAtStart: number | null;
};

export type StrategyPitOutcome = {
  lapNumber: number;
  positionBefore: number | null;
  positionAfter: number | null;
  positionDelta: number | null;
  signal: "undercut" | "overcut" | "gained" | "lost" | "neutral" | "unavailable";
};

export type StrategyDriver = {
  driverId: string;
  fullName: string;
  abbreviation: string;
  teamColor: string;
  finalPosition: number;
  raceStatus: TimingTowerEntry["raceStatus"];
  stints: StrategyStint[];
  pitOutcomes: StrategyPitOutcome[];
};

export type DataFeedStatus = "live" | "cached" | "simulated" | "fallback" | "empty";

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
  telemetryComparison: {
    session: SessionSummary | null;
    status: DataFeedStatus;
    updatedAt: string | null;
    note: string;
    traces: TelemetryTrace[];
  };
  standings: DriverInsight[];
  timingTower: {
    session: SessionSummary | null;
    status: DataFeedStatus;
    updatedAt: string | null;
    note: string;
    entries: TimingTowerEntry[];
  };
  strategy: {
    session: SessionSummary | null;
    status: DataFeedStatus;
    updatedAt: string | null;
    note: string;
    totalLaps: number;
    drivers: StrategyDriver[];
  };
  trackMap: {
    circuitName: string;
    layoutKey: string;
    cars: TrackCar[];
  };
  sources: {
    schedule: DashboardFeedMeta;
    weather: DashboardFeedMeta;
    telemetry: DashboardFeedMeta;
    fantasy: DashboardFeedMeta;
    activity: DashboardFeedMeta;
    raceIntel: DashboardFeedMeta;
    teamRadio: DashboardFeedMeta;
  };
  activity: {
    items: ActivityItem[];
    sourcePulse: SourcePulse[];
  };
  raceIntelligence: RaceIntelligence;
  raceControl: RaceControlState;
  teamRadio: {
    session: SessionSummary | null;
    status: DataFeedStatus;
    updatedAt: string | null;
    note: string;
    clips: TeamRadioClip[];
  };
  weekendWeather: SessionWeather[];
  liveTiming: LiveTimingState;
  fantasy: {
    source: "official" | "fallback";
    note: string;
    topValue: FantasyEntry[];
    priceRisers: FantasyEntry[];
  };
};
