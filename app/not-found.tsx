export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[960px] items-center justify-center px-6 py-16">
      <div className="glass-panel w-full rounded-[28px] p-8 text-center sm:p-12">
        <div className="eyebrow">404</div>
        <h1 className="section-title mt-3 text-[2rem] font-semibold sm:text-[3rem]">
          Track limit exceeded
        </h1>
        <p className="section-copy mx-auto mt-3 max-w-xl text-sm sm:text-base">
          That page is off the racing line. Head back to the dashboard to keep
          following the live telemetry and timing surface.
        </p>
      </div>
    </main>
  );
}
