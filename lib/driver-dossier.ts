import type { DashboardData } from "./types";

// Never borrow another driver's timing or join strategy from a different session.
export function getDriverRaceSnapshot(dashboard: DashboardData, driverId: string) {
  const timing = dashboard.timingTower;
  const entry = timing.session ? timing.entries.find((item) => item.driverId === driverId) ?? null : null;
  const sameSession = Boolean(timing.session && dashboard.strategy.session &&
    timing.session.sessionKey === dashboard.strategy.session.sessionKey);
  return {
    session: timing.session,
    entry,
    status: timing.status,
    updatedAt: timing.updatedAt,
    note: timing.note,
    strategy: sameSession ? dashboard.strategy.drivers.find((item) => item.driverId === driverId) ?? null : null,
    strategyStatus: sameSession ? dashboard.strategy.status : null,
  };
}

export function dossierLap(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const milliseconds = Math.round(seconds * 1000);
  return `${Math.floor(milliseconds / 60000)}:${((milliseconds % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}

export function dossierColor(value: string) {
  const hex = value.replace(/^#/, "");
  return /^[a-f\d]{6}$/i.test(hex) ? `#${hex}` : "#e10600";
}

export function dossierPortrait(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "media.formula1.com") return null;
    // Preserve identity and asset path; only upgrade the supplied CDN rendition.
    url.pathname = url.pathname.replace(/\.transform\/1col\/image\.png$/, ".transform/5col/image.png");
    return url.href;
  } catch { return null; }
}
