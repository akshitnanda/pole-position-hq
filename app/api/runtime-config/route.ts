import { getEndpointConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  const config = await getEndpointConfig();

  return Response.json({
    openF1BaseUrl: config.openF1BaseUrl,
    f1GraphqlEndpoint: config.f1GraphqlEndpoint,
    fantasyApiBaseUrl: config.fantasyApiBaseUrl,
    weatherApiBaseUrl: config.weatherApiBaseUrl,
    liveTimingWsUrl: config.liveTimingWsUrl,
    useMockData: config.useMockData,
  });
}
