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
  };
  fantasy: {
    source: "official" | "fallback";
    note: string;
    topValue: FantasyEntry[];
    priceRisers: FantasyEntry[];
  };
};
