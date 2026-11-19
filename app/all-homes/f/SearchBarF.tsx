"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { useStays } from "../useStays";
import { DateRange } from "./DateRange";

/** F's search: date fields open the Airbnb-style calendar; guests popover; search. (C and E keep the shared SearchBar.) */
const ic = { viewBox: "0 0 24 24", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "S-ic" };
const Cal = () => <svg {...ic}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
const People = () => <svg {...ic}><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><path d="M16 5.3a3 3 0 0 1 0 5.6M18 14.8c1.6.6 2.7 2.2 3 4.7" /></svg>;
const short = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export type SearchBarFHandle = { openDates: () => void };

export const SearchBarF = forwardRef<SearchBarFHandle, { s: ReturnType<typeof useStays> }>(function SearchBarF({ s }, ref) {
  const [cal, setCal] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const ciBtn = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({ openDates: () => { setGuestsOpen(false); setCal(true); } }));
  useEffect(() => {
    if (!guestsOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !pop.current?.contains(e.target as Node)) setGuestsOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [guestsOpen]);
  const guests = s.adults + s.children;
  const closeCal = () => { setCal(false); setTimeout(() => ciBtn.current?.focus({ preventScroll: true }), 0); };
  // Fernanda's test (Nov 19): after a search the guest expects to land on the results, so scroll to the homes list.
  const searchAndShow = async () => {
    if (!(await s.search())) return;
    const el = document.getElementById("homes");
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };
  const doneCal = () => { setCal(false); if (s.ci && s.co) void searchAndShow(); };
  const step = (label: string, sub: string, v: number, set: (n: number) => void, lo: number) => (
    <div className="S-step">
      <div><b>{label}</b><small>{sub}</small></div>
      <div className="S-stepper">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={v <= lo} onClick={() => set(v - 1)}>−</button>
        <span aria-live="polite">{v}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={guests >= 10} onClick={() => set(v + 1)}>+</button>
      </div>
    </div>
  );
  return (
    <div className="FS-wrap">
      <form className="S-bar F-search" role="search" aria-label="Find available homes" onSubmit={(e) => { e.preventDefault(); setCal(false); setGuestsOpen(false); void searchAndShow(); }}>
        <div className="S-field">
          <span><Cal />Check-in</span>
          <button type="button" ref={ciBtn} className={`FS-date${cal && !s.ci ? " is-active" : ""}`} aria-haspopup="dialog" aria-expanded={cal} aria-label={`Check-in date: ${s.ci ? short(s.ci) : "add date"}`} onClick={() => { setGuestsOpen(false); setCal(true); }}>
            {s.ci ? short(s.ci) : <span className="FS-ph">Add dates</span>}
          </button>
        </div>
        <div className="S-field">
          <span><Cal />Check-out</span>
          <button type="button" className={`FS-date${cal && !!s.ci && !s.co ? " is-active" : ""}`} aria-haspopup="dialog" aria-expanded={cal} aria-label={`Check-out date: ${s.co ? short(s.co) : "add date"}`} onClick={() => { setGuestsOpen(false); setCal(true); }}>
            {s.co ? short(s.co) : <span className="FS-ph">Add dates</span>}
          </button>
        </div>
        <div className="S-field S-guests" ref={pop}>
          <span id="f-guests-label"><People />Guests</span>
          <button type="button" aria-haspopup="dialog" aria-expanded={guestsOpen} aria-labelledby="f-guests-label f-guests-value" onClick={() => { setCal(false); setGuestsOpen((o) => !o); }}>
            <span id="f-guests-value">{guests} guest{guests === 1 ? "" : "s"}</span>
          </button>
          {guestsOpen && (
            <div className="S-pop" role="dialog" aria-label="Guests">
              {step("Adults", "Ages 13 or above", s.adults, s.setAdults, 1)}
              {step("Children", "Ages 2–12", s.children, s.setChildren, 0)}
              <p className="S-popNote">Infants under 2 stay free and don&apos;t count. Homes sleep 8 to 10.</p>
              <button type="button" className="S-done" onClick={() => setGuestsOpen(false)}>Done</button>
            </div>
          )}
        </div>
        <button className="S-go" type="submit" disabled={s.state === "loading"}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span>{s.state === "loading" ? "Checking…" : "Search homes"}</span>
          {s.state !== "loading" && <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
        {s.state === "error" && <p className="S-err" role="alert">{s.error}</p>}
      </form>
      {cal && <DateRange ci={s.ci} co={s.co} min={s.min} onChange={(a, b) => { s.setCheckIn(a); s.setCo(b); }} onClose={closeCal} onDone={doneCal} />}
    </div>
  );
});
