type EndpointConfig = {
  openF1BaseUrl: string;
  f1GraphqlEndpoint: string;
  fantasyApiBaseUrl: string | null;
  weatherApiBaseUrl: string | null;
  liveTimingWsUrl: string | null;
  useMockData: boolean;
};

const defaults: EndpointConfig = {
  openF1BaseUrl: "https://api.openf1.org/v1",
  f1GraphqlEndpoint: "https://f1-graphql.davideladisa.it/graphql",
  fantasyApiBaseUrl: null,
  weatherApiBaseUrl: null,
  liveTimingWsUrl: null,
  useMockData: false,
};

async function readEdgeConfigValue<T>(key: string): Promise<T | null> {
  if (!process.env.EDGE_CONFIG) {
    return null;
  }

  try {
    const { get } = await import("@vercel/edge-config");
    return (await get<T>(key)) ?? null;
  } catch {
    return null;
  }
}

export async function getEndpointConfig(): Promise<EndpointConfig> {
  const edgeEndpoints = await readEdgeConfigValue<Partial<EndpointConfig>>(
    "f1DashboardEndpoints",
  );

  return {
    openF1BaseUrl:
      process.env.OPENF1_API_BASE_URL?.replace(/\/$/, "") ??
      edgeEndpoints?.openF1BaseUrl?.replace(/\/$/, "") ??
      defaults.openF1BaseUrl,
    f1GraphqlEndpoint:
      process.env.F1_GRAPHQL_ENDPOINT ??
      edgeEndpoints?.f1GraphqlEndpoint ??
      defaults.f1GraphqlEndpoint,
    fantasyApiBaseUrl:
      process.env.F1_FANTASY_API_BASE_URL?.replace(/\/$/, "") ??
      edgeEndpoints?.fantasyApiBaseUrl?.replace(/\/$/, "") ??
      defaults.fantasyApiBaseUrl,
    weatherApiBaseUrl:
      process.env.WEATHER_API_BASE_URL?.replace(/\/$/, "") ??
      edgeEndpoints?.weatherApiBaseUrl?.replace(/\/$/, "") ??
      defaults.weatherApiBaseUrl,
    liveTimingWsUrl:
      process.env.NEXT_PUBLIC_LIVE_TIMING_WS_URL ??
      edgeEndpoints?.liveTimingWsUrl ??
      defaults.liveTimingWsUrl,
    useMockData:
      process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" ||
      edgeEndpoints?.useMockData === true,
  };
}
