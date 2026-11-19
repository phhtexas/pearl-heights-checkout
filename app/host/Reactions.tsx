"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./reactions.css";

/**
 * Message actions like the Airbnb app (Oscar's reference, Nov 19): press and hold a message (or hover and tap the smiley
 * on a computer) -> the five reactions 😊 ❤️ 👍 👏 🤣 and a menu (Copy, and when it was read). Tapping your current reaction
 * removes it. Shared by the guest's stay page and the host inbox.
 */
export const REACTIONS = ["😊", "❤️", "👍", "👏", "🤣"] as const;
export type Reaction = (typeof REACTIONS)[number];
const NAMES: Record<Reaction, string> = { "😊": "Smile", "❤️": "Love", "👍": "Like", "👏": "Clap", "🤣": "Laugh" };

export function MessageActions({ children, shown, mine, onPick, text, seen, mineSide }: {
  children: ReactNode; shown: (Reaction | null)[]; mine: Reaction | null; onPick: (e: Reaction | null) => void;
  text: string; seen?: string | null; mineSide: boolean;
}) {
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => { hold.current = setTimeout(() => { setOpen(true); navigator.vibrate?.(10); }, 450); };
  const cancel = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [open]);
  const list = shown.filter(Boolean) as Reaction[];
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 700); } catch { setOpen(false); } };
  return (
    <div className={"RX" + (mineSide ? " RX-mine" : "") + (open ? " RX-open" : "")}>
      {open && <div className="RX-back" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="RX-bubble" onTouchStart={start} onTouchEnd={cancel} onTouchMove={cancel}
        onContextMenu={(e) => { e.preventDefault(); setOpen(true); }}>
        {children}
        <button type="button" className="RX-add" aria-label="React or copy" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 10h.01M15 10h.01" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        </button>
        {list.length > 0 && <span className="RX-shown" aria-label={"Reactions: " + list.map((e) => NAMES[e]).join(", ")}>{list.join("")}</span>}
      </div>
      {open && (
        <div className="RX-pop">
          <div className="RX-bar" role="group" aria-label="React">
            {REACTIONS.map((e) => (
              <button key={e} type="button" aria-label={NAMES[e]} aria-pressed={mine === e} className={mine === e ? "RX-on" : ""}
                onClick={() => { onPick(mine === e ? null : e); setOpen(false); }}>{e}</button>
            ))}
          </div>
          <div className="RX-menu">
            <button type="button" onClick={copy}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="currentColor" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              {copied ? "Copied" : "Copy"}
            </button>
            {mineSide && (
              <p className="RX-seen">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="currentColor" /><circle cx="12" cy="12" r="3" fill="#fff" /></svg>
                {seen ? `Read ${seen}` : "Not read yet"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
