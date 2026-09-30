"use client";

import { Activity, ArrowUpRight, ChevronDown, Database, Radio, UserRound } from "lucide-react";
import type { DashboardData, DriverInsight } from "@/lib/types";
import type { PitWallMode } from "@/lib/pit-wall-ai";
import { FEED_STATUS_LABELS, scheduleContext, summarizeSourceHealth } from "@/lib/cockpit-status";
import { formatBriefDate } from "@/lib/pit-wall-presentation";
import styles from "./cockpit-status.module.css";

export function CockpitStatus({ dashboard, driver, onBrief }: {
  dashboard: DashboardData; driver: DriverInsight | null; onBrief: (mode: PitWallMode) => void;
}) {
  const health = summarizeSourceHealth(dashboard.sources);
  const session = dashboard.nextSession;
  const connection = dashboard.liveTiming.connection;
  const archive = dashboard.timingTower.session;
  return <section className={styles.shell} aria-label="Race cockpit">
    <div className={styles.strip}>
      <button className={styles.cell} onClick={() => onBrief("weekend-outlook")} aria-label="Open weekend outlook">
        <span className={styles.label}><Activity size={12} /> {scheduleContext(session, dashboard.generatedAt)}</span>
        <strong>{session?.circuitName ?? "Waiting for schedule"}<ArrowUpRight size={15} /></strong>
        <span className={styles.meta}>{session ? `${session.sessionName} · ${formatBriefDate(session.dateStart)}` : "No upcoming session in this snapshot"}</span>
      </button>
      <button className={styles.cell} onClick={() => onBrief("driver-focus")} disabled={!driver} aria-label="Open selected driver briefing">
        <span className={styles.label}><UserRound size={12} /> Driver focus</span>
        <strong>{driver?.fullName ?? "No driver selected"}<ArrowUpRight size={15} /></strong>
        <span className={styles.meta}>{driver ? `${driver.teamName} · Championship P${driver.standingPosition} · ${driver.points} pts` : "Select a driver when standings are available"}</span>
      </button>
      <div className={styles.cell}>
        <span className={styles.label}><Radio size={12} /> Timing connection</span>
        <strong>{connection === "websocket" ? "Upstream connected" : connection === "eventsource" ? "Replay connected" : "Snapshot only"}</strong>
        <span className={styles.meta}>{archive ? `${archive.circuitName} · ${archive.sessionName}` : "Timing session unavailable"}</span>
      </div>
    </div>
    <details className={styles.health}>
      <summary>
        <span className={styles.healthTitle}><Database size={13} /> Source health <span className={styles.healthCount}>{health.summary}</span></span>
        <span className={styles.inspect}>Inspect <ChevronDown size={14} /></span>
      </summary>
      <div className={styles.healthBody}>
        <div className={styles.explainer}>
          <div><h2>Know what powers this view.</h2><p>Source status belongs to the snapshot. A connected replay is not a live feed.</p></div>
          <span>Snapshot assembled<br /><time dateTime={dashboard.generatedAt}>{formatBriefDate(dashboard.generatedAt)}</time></span>
        </div>
        <div className={styles.feeds}>
          {health.feeds.map((feed) => <article key={feed.id} className={styles.feed}>
            <header><h3>{feed.label}</h3><span className={styles.badge} data-status={feed.status}>{FEED_STATUS_LABELS[feed.status]}</span></header>
            <p className={styles.source}>{feed.source}</p>
            <p>{feed.note ?? "No additional source notes."}</p>
            <span className={styles.timestamp}>Source timestamp: {feed.updatedAt ? <time dateTime={feed.updatedAt}>{formatBriefDate(feed.updatedAt)}</time> : "not supplied"}</span>
          </article>)}
        </div>
      </div>
    </details>
  </section>;
}
