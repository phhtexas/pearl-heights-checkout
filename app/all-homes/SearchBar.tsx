"use client";
import { useEffect, useRef, useState } from "react";
import type { useStays } from "./useStays";

/** Airbnb-style search: check-in, check-out, guests, search. No destination (every home is in San Antonio). */
const ic = { viewBox: "0 0 24 24", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "S-ic" };
const Cal = () => <svg {...ic}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
const People = () => <svg {...ic}><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><path d="M16 5.3a3 3 0 0 1 0 5.6M18 14.8c1.6.6 2.7 2.2 3 4.7" /></svg>;

/** `icons` (mockup C): a small icon on each field and an arrow on the button. */
export function SearchBar({ s, cls, icons = false }: { s: ReturnType<typeof useStays>; cls: string; icons?: boolean }) {
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !pop.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const guests = s.adults + s.children;
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
    <form className={`S-bar ${cls}`} role="search" aria-label="Find available homes" onSubmit={(e) => { e.preventDefault(); setOpen(false); void s.search(); }}>
      <label className="S-field">
        <span>{icons && <Cal />}Check-in</span>
        <input type="date" min={s.min} value={s.ci} onChange={(e) => s.setCheckIn(e.target.value)} aria-label="Check-in date" />
      </label>
      <label className="S-field">
        <span>{icons && <Cal />}Check-out</span>
        <input type="date" min={s.ci || s.min} value={s.co} onChange={(e) => s.setCo(e.target.value)} aria-label="Check-out date" />
      </label>
      <div className="S-field S-guests" ref={pop}>
        <span id="guests-label">{icons && <People />}Guests</span>
        <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-labelledby="guests-label guests-value" onClick={() => setOpen((o) => !o)}>
          <span id="guests-value">{guests} guest{guests === 1 ? "" : "s"}</span>
        </button>
        {open && (
          <div className="S-pop" role="dialog" aria-label="Guests">
            {step("Adults", "Ages 13 or above", s.adults, s.setAdults, 1)}
            {step("Children", "Ages 2–12", s.children, s.setChildren, 0)}
            <p className="S-popNote">Infants under 2 stay free and don&apos;t count. Homes sleep 8 to 10.</p>
            <button type="button" className="S-done" onClick={() => setOpen(false)}>Done</button>
          </div>
        )}
      </div>
      <button className="S-go" type="submit" disabled={s.state === "loading"}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span>{s.state === "loading" ? "Checking…" : "Search homes"}</span>
        {icons && s.state !== "loading" && <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
      </button>
      {s.state === "error" && <p className="S-err" role="alert">{s.error}</p>}
    </form>
  );
}
