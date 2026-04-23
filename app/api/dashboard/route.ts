import { getDashboardData } from "@/lib/dashboard-data";

export const revalidate = 120;
export const runtime = "nodejs";

export async function GET() {
  const dashboard = await getDashboardData();

  return Response.json(dashboard, {
    headers: {
      "Cache-Control": "s-maxage=120, stale-while-revalidate=300",
    },
  });
}
