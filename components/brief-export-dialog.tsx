"use client";

import { Check, Copy, Download, TextSelect, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createTextDownload, type TextExportDocument } from "@/lib/text-export";
import styles from "./brief-export-dialog.module.css";

export function BriefExportDialog({ artifact, onClose }: { artifact: TextExportDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const download = useRef<HTMLAnchorElement>(null);
  const unavailable = useRef<HTMLParagraphElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed" | "selected">("idle");
  const id = useId();

  useEffect(() => {
    if (!opener.current && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    let resource: ReturnType<typeof createTextDownload> | null = null;
    try {
      resource = createTextDownload(artifact.text);
      if (download.current) { download.current.href = resource.href; download.current.hidden = false; }
      if (unavailable.current) unavailable.current.hidden = true;
    } catch {
      // The text remains readable and selectable even if this browser blocks Blob URLs.
      if (download.current) download.current.hidden = true;
      if (unavailable.current) unavailable.current.hidden = false;
    }
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => {
      // Give a just-clicked download time to consume its URL before releasing it.
      if (resource) window.setTimeout(resource.release, 1000);
      const restoreTo = opener.current;
      window.requestAnimationFrame(() => {
        if (restoreTo?.isConnected && !document.querySelector("dialog[open]")) restoreTo.focus();
      });
    };
  }, [artifact]);

  async function copy() {
    setCopyState("copying");
    try { await navigator.clipboard.writeText(artifact.text); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onClose={onClose} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]:not([hidden]), textarea");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={(event) => {
      if (event.target !== dialog.current) return;
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current.close();
    }}>
    <header className={styles.header}>
      <div><span>Pole Position / Export preview</span><h2 id={`${id}-title`}>{artifact.title}</h2></div>
      <button type="button" onClick={() => dialog.current?.close()} aria-label="Close export preview"><X size={18} /></button>
    </header>
    <p id={`${id}-description`} className={styles.description}>This text is frozen when you open the preview. Dashboard refreshes cannot change it. Review, copy or download it before leaving.</p>
    <div className={styles.actions}>
      <button type="button" onClick={() => void copy()} disabled={copyState === "copying"}>
        {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}{copyState === "copied" ? "Copied" : copyState === "copying" ? "Copying…" : "Copy text"}
      </button>
      <button type="button" onClick={() => { text.current?.focus(); text.current?.select(); setCopyState("selected"); }}><TextSelect size={15} />Select text</button>
      <a ref={download} download={artifact.filename}><Download size={15} />Download .txt</a>
    </div>
    <p className={styles.status} role="status">{copyState === "failed" ? "Clipboard access is unavailable. Choose Select text, then press Ctrl+C (Cmd+C on Mac)."
      : copyState === "copied" ? "Copied the complete export text to your clipboard."
        : copyState === "selected" ? "Text selected. Press Ctrl+C (Cmd+C on Mac) to copy it."
          : "Download completion depends on your browser. If no file appears, use Copy text or Select text."}</p>
    <p ref={unavailable} hidden className={styles.status}>Downloads are unavailable in this browser. The complete text below is still available to copy.</p>
    <textarea ref={text} className={styles.text} aria-label="Export text" value={artifact.text} readOnly spellCheck={false} />
    <footer className={styles.footer}><span>{artifact.filename}</span><span>{artifact.text.length.toLocaleString("en-US")} characters · Plain text</span></footer>
  </dialog>;
}
