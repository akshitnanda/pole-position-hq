"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[960px] items-center justify-center px-6 py-16">
      <div className="glass-panel w-full rounded-[28px] p-8 sm:p-12">
        <div className="eyebrow">System status</div>
        <h1 className="section-title mt-3 text-[2rem] font-semibold sm:text-[3rem]">
          Pit wall signal lost
        </h1>
        <p className="section-copy mt-3 text-sm sm:text-base">
          The app hit an unexpected runtime issue while building the current race
          surface. The last successful server snapshot should recover on retry.
        </p>
        <div className="mt-4 rounded-[18px] border border-black/8 bg-white/70 px-4 py-3 text-sm text-[var(--muted)]">
          {error.message || "Unknown runtime error"}
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-105"
        >
          Retry surface
        </button>
      </div>
    </main>
  );
}
