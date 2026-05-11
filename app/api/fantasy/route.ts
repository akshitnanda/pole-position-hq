import { getEndpointConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  const config = await getEndpointConfig();
  const base =
    config.fantasyApiBaseUrl ??
    "https://fantasy-api.formula1.com/partner_games/f1";

  for (const endpoint of ["players", "drivers", "market", "leaderboard"]) {
    try {
      const response = await fetch(`${base}/${endpoint}`, {
        headers: {
          accept: "application/json",
          "user-agent": "PolePositionHQ/1.0",
        },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
      });

      if (response.ok) {
        return Response.json(await response.json(), {
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=300",
          },
        });
      }
    } catch {
      // Try the next known fantasy surface.
    }
  }

  return Response.json(
    {
      source: "fallback",
      message: "Official fantasy endpoints are unavailable.",
    },
    { status: 502 },
  );
}
