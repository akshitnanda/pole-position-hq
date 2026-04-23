import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard-client";
import { DashboardLoading } from "@/components/dashboard-loading";
import { getDashboardData } from "@/lib/dashboard-data";

async function DashboardPage() {
  const dashboard = await getDashboardData();

  return <DashboardClient initialData={dashboard} />;
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  );
}
