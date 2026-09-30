"use client";

import { ArrowUpRight, Check, Command, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { searchDashboardCommands, type DashboardCommand } from "@/lib/dashboard-commands";
import styles from "./dashboard-command-menu.module.css";

export function DashboardCommandMenu({ commands }: { commands: DashboardCommand[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const id = useId();
  const results = searchDashboardCommands(commands, query);
  const activeIndex = Math.min(index, Math.max(0, results.length - 1));
  const show = useCallback(() => {
    if (dialog.current?.open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery(""); setIndex(0); setOpen(true);
    dialog.current?.showModal();
    input.current?.focus();
  }, []);
  const close = () => dialog.current?.close();
  const execute = (command: DashboardCommand) => {
    if (command.disabled) return;
    close();
    command.run();
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !event.altKey && !event.repeat) {
        if (document.querySelector("dialog[open]") && !dialog.current?.open) return;
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close(); else show();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [show]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, id, open, query]);

  return <>
    <button type="button" className={styles.trigger} onClick={show} aria-label="Open command menu" aria-haspopup="dialog" aria-keyshortcuts="Control+k Meta+k">
      <Command size={15} /><span>Commands</span><kbd>Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onClose={() => { setOpen(false); opener.current?.focus(); }}
      onClick={(event) => { if (event.target === dialog.current) {
        const rect = dialog.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      } }}>
      <header className={styles.header}><div><span className={styles.eyebrow}>Pole Position / Command menu</span><h2 id={`${id}-title`}>Where next?</h2></div>
        <button type="button" onClick={close} aria-label="Close command menu"><X size={18} /></button>
      </header>
      <div className={styles.search}><Search size={19} />
        <input ref={input} role="combobox" aria-label="Search commands" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`}
          aria-activedescendant={results.length ? `${id}-option-${activeIndex}` : undefined}
          value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} placeholder="Try a driver, team, or workspace…"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (results.length) setIndex((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (results[activeIndex]) execute(results[activeIndex]);
            }
          }} />
        {query && <button type="button" onClick={() => { setQuery(""); setIndex(0); input.current?.focus(); }} aria-label="Clear command search"><X size={15} /></button>}
      </div>
      <div className={styles.meta}><span role="status">{results.length} commands</span><span>Search runs on this device</span></div>
      <div className={styles.results} id={`${id}-results`} role="listbox" aria-label="Commands">
        {results.map((command, position) => <div key={command.id} id={`${id}-option-${position}`} role="option" aria-selected={position === activeIndex}
          aria-disabled={command.disabled || undefined} className={styles.option} onMouseMove={() => setIndex(position)} onClick={() => execute(command)}>
          <span className={styles.category}>{command.category}</span>
          <span className={styles.description}><strong>{command.label}</strong><span>{command.detail}</span></span>
          {command.disabled ? <span className={styles.state}>Busy</span> : command.current ? <Check size={16} aria-label="Current selection" /> : <ArrowUpRight size={16} />}
        </div>)}
      </div>
      {!results.length && <div className={styles.empty}>No matching command.<span>Try “Analysis”, a driver surname, or “theme”.</span></div>}
      <footer className={styles.footer}><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Select</span><span><kbd>Esc</kbd> Close</span></footer>
    </dialog>
  </>;
}
