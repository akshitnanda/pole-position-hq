function SkeletonBlock({
  className,
}: {
  className: string;
}) {
  return <div className={`animate-pulse rounded-3xl bg-white/6 ${className}`} />;
}

export function DashboardLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1480px] flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:px-8 lg:py-7">
      <SkeletonBlock className="h-[260px] w-full sm:h-[300px]" />
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-4 sm:gap-5">
          <SkeletonBlock className="h-[440px] w-full sm:h-[500px]" />
          <SkeletonBlock className="h-[320px] w-full" />
          <SkeletonBlock className="h-[300px] w-full" />
        </div>
        <div className="grid gap-4 sm:gap-5">
          <SkeletonBlock className="h-[760px] w-full sm:h-[860px]" />
        </div>
      </div>
    </main>
  );
}
