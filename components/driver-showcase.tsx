"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DashboardData, DriverInsight } from "@/lib/types";
import { dossierColor, dossierLap, dossierPortrait, getDriverRaceSnapshot } from "@/lib/driver-dossier";
import { formatBriefDate } from "@/lib/pit-wall-presentation";
import styles from "./driver-showcase.module.css";

const CarScene = dynamic(() => import("./driver-car-scene"), { ssr: false });
type RaceSnapshot = ReturnType<typeof getDriverRaceSnapshot>;

function Portrait({ driver }: { driver: DriverInsight }) {
  const [failures, setFailures] = useState(0);
  const portrait = dossierPortrait(driver.headshotUrl);
  return <div className={styles.portrait}>
    {portrait && failures < 2 ? <Image src={failures ? driver.headshotUrl! : portrait} alt={driver.fullName} fill sizes="(max-width: 700px) 130px, 330px" style={{ objectFit: "contain", objectPosition: "bottom" }} onError={() => setFailures(value => value + 1)} />
      : <span className={styles.initials}>{driver.abbreviation}</span>}
  </div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className={styles.stat}><dt>{label}</dt><dd>{value}</dd></div>;
}

function RaceDialog({ driver, race, onClose }: { driver: DriverInsight; race: RaceSnapshot; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [view, setView] = useState("Timing");
  useEffect(() => {
    if (!opener.current && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    ref.current?.showModal();
    return () => { const target = opener.current; requestAnimationFrame(() => { if (target?.isConnected && !document.querySelector("dialog[open]")) target.focus(); }); };
  }, []);
  const entry = race.entry;
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="race-dossier-title" aria-describedby="race-dossier-context" onClose={onClose}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} onClick={(event) => {
      if (event.target !== ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ref.current.close();
    }}>
    <div className={styles.dialogHeader}><div><span className={styles.eyebrow}>Race dossier / {driver.abbreviation}</span><h2 id="race-dossier-title">{driver.fullName}</h2></div>
      <button aria-label="Close race stats" onClick={() => ref.current?.close()}><X size={20}/></button></div>
    <p id="race-dossier-context" className={styles.context}>{race.session ? `${race.session.circuitName} / ${race.session.sessionName} · ${formatBriefDate(race.session.dateStart)}` : "No session context available"}</p>
    <div className={styles.provenance}><span>{race.status === "live" ? "Live-source snapshot" : `${race.status} snapshot`}</span><span>Frozen on open · not live telemetry</span></div>
    <div className={styles.viewSwitch} role="group" aria-label="Race stats view">{["Timing", "Sectors", "Strategy"].map(label => <button key={label} aria-pressed={view === label} onClick={() => setView(label)}>{label}</button>)}</div>
    {!entry ? <p className={styles.empty}>No timing record for this driver in the supplied session. Another driver’s data is never substituted.</p> : <>
      {view === "Timing" && <dl className={styles.raceStats}>
        <Stat label="Session position" value={`P${entry.position}`}/><Stat label="Best lap" value={dossierLap(entry.bestLap)}/>
        <Stat label="Last lap" value={dossierLap(entry.lastLap)}/><Stat label="Gap to leader" value={entry.position === 1 ? "Leader" : typeof entry.gapToLeader === "number" ? `+${entry.gapToLeader.toFixed(3)}s` : entry.gapToLeader ?? "—"}/>
        <Stat label="Compound" value={entry.compound ?? "—"}/><Stat label="Race status" value={entry.raceStatus}/>
      </dl>}
      {view === "Sectors" && <><dl className={styles.raceStats}>{(["sector1", "sector2", "sector3"] as const).map((key, index) => <Stat key={key} label={`Sector ${index + 1} · ${entry.sectorStates[key].replaceAll("-", " ")}`} value={entry.sectors[key] == null ? "—" : `${entry.sectors[key].toFixed(3)}s`}/>)}</dl><p className={styles.context}>Recorded sector values from this timing snapshot, not a predicted or combined best lap.</p></>}
      {view === "Strategy" && <>{race.strategy?.stints.length ? <>
        <div className={styles.stints}>{race.strategy.stints.map(stint => <div key={stint.stintNumber}><span>Stint {stint.stintNumber}</span><strong>{stint.compound ?? "Unknown"}</strong><span>Laps {stint.lapStart}–{stint.lapEnd ?? "?"}</span></div>)}</div>
        <p className={styles.context}>Strategy source: {race.strategyStatus}. Observed stints from the same session; not a pit-window prediction.</p>
      </> : <p className={styles.empty}>No matching-session strategy for this driver. Timing from another race is not mixed into this view.</p>}</>}
    </>}
    <footer className={styles.receipt}><strong>Source receipt</strong><span>OpenF1 timing · session {race.session?.sessionKey ?? "unavailable"}</span><span>Updated {race.updatedAt ? formatBriefDate(race.updatedAt) : "time unavailable"}</span><p>{race.note}</p></footer>
  </dialog>;
}

export function DriverShowcase({ dashboard, driver, onSelect, onBrief }: {
  dashboard: DashboardData; driver: DriverInsight | null; onSelect: (id: string) => void; onBrief: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [graphicsEnabled, setGraphicsEnabled] = useState(true);
  const [popup, setPopup] = useState<{driver: DriverInsight; race: RaceSnapshot} | null>(null);
  if (!driver) return null;
  const color = dossierColor(driver.teamColor);
  const index = dashboard.standings.findIndex(item => item.id === driver.id);
  const step = (direction: number) => onSelect(dashboard.standings[(index + direction + dashboard.standings.length) % dashboard.standings.length].id);
  return <section className={styles.showcase} style={{ "--driver-color": color } as CSSProperties} aria-label="Driver showcase">
    <div className={styles.topline}><span><i/> THE GRID / {dashboard.season}</span><span>Driver collection <b>{String(index + 1).padStart(2, "0")}</b> / {dashboard.standings.length}</span></div>
    <div className={styles.layout}>
      <div className={styles.stage}>
        <div className={styles.watermark} aria-hidden="true">{driver.abbreviation}</div>
        <div key={`identity-${driver.id}`} className={styles.identity}><span className={styles.eyebrow}>{driver.teamName} / #{driver.permanentNumber}</span><h2><span>{driver.firstName}</span>{driver.lastName}</h2></div>
        <div className={styles.scene}><CarScene color={color} paused={paused || Boolean(popup)} enabled={graphicsEnabled}/></div>
        <Portrait key={`portrait-${driver.id}`} driver={driver}/>
        <div className={styles.stageFooter}><span>Concept car<br/><small>Illustration, not team geometry or telemetry</small></span><div className={styles.sceneControls}>
          <button onClick={() => setGraphicsEnabled(!graphicsEnabled)} aria-label={graphicsEnabled ? "Switch to static artwork" : "Enable 3D graphics"} aria-pressed={graphicsEnabled}>3D</button>
          <button disabled={!graphicsEnabled} onClick={() => setPaused(!paused)} aria-label={paused ? "Resume 3D rotation" : "Pause 3D rotation"}>{paused ? <Play size={14}/> : <Pause size={14}/>}</button>
        </div></div>
      </div>
      <div className={styles.dossier}>
        <div className={styles.dossierTitle}><span className={styles.eyebrow}>Season dossier</span><ScanLine size={18}/></div>
        <div className={styles.rank}><span><small>CHAMPIONSHIP</small><strong>P{driver.standingPosition}</strong></span><span><b>{driver.points}</b><small>POINTS</small></span></div>
        <dl className={styles.career}><Stat label="Career wins" value={driver.totalRaceWins}/><Stat label="Podiums" value={driver.totalPodiums}/><Stat label="Poles" value={driver.totalPolePositions}/></dl>
        <p className={styles.factsNote}>Recorded career totals. No synthetic player ratings.</p>
        <button className={styles.primary} onClick={() => setPopup({driver, race:getDriverRaceSnapshot(dashboard, driver.id)})} aria-haspopup="dialog">Race stats <ArrowUpRight size={18}/></button>
        <button className={styles.secondary} onClick={onBrief}>Open driver briefing <ArrowUpRight size={15}/></button>
        <span className={styles.snapshot}>Snapshot {formatBriefDate(dashboard.generatedAt)}</span>
      </div>
    </div>
    <div className={styles.selector}>
      <span className={styles.eyebrow}>Choose your driver</span>
      <div><button aria-label="Previous driver" onClick={() => step(-1)}><ChevronLeft size={17}/></button>
        <select aria-label="Showcase driver" value={driver.id} onChange={event => onSelect(event.target.value)}>{dashboard.standings.map(item => <option key={item.id} value={item.id}>{item.fullName} · {item.teamName}</option>)}</select>
        <button aria-label="Next driver" onClick={() => step(1)}><ChevronRight size={17}/></button></div>
    </div>
    {popup && <RaceDialog driver={popup.driver} race={popup.race} onClose={() => setPopup(null)}/>}
  </section>;
}
