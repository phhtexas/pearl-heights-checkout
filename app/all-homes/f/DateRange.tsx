"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Airbnb-style date range picker (Oscar, Nov 16). Desktop: a popover with two months side by side and arrows.
 * Phones: a full-screen sheet with months stacked to scroll. First tap = check-in, second = check-out; tapping a day
 * before check-in restarts. Past days are disabled. Arrow keys move day to day, Escape closes.
 */
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + "T00:00:00Z");
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monthStart = (s: string) => s.slice(0, 7) + "-01";
const addMonths = (m: string, n: number) => { const d = parse(m); d.setUTCMonth(d.getUTCMonth() + n); return iso(d).slice(0, 7) + "-01"; };
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => parse(s).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
export const nightsBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);

function Month({ m, ci, co, hover, min, minNights, tip, onPick, onHover }: { m: string; ci: string; co: string; hover: string; min: string; minNights: number; tip: { d: string; text: string } | null; onPick: (d: string) => void; onHover: (d: string) => void }) {
  const first = parse(m); const lead = first.getUTCDay();
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const firstOut = ci ? addDays(ci, minNights) : "";
  const end = co || (ci && hover >= firstOut ? hover : "");
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(m, i))];
  return (
    <div className="DR-month">
      <p className="DR-title" aria-hidden="true">{fmt(m, { month: "long", year: "numeric" })}</p>
      <div className="DR-grid" role="group" aria-label={fmt(m, { month: "long", year: "numeric" })}>
        {DOW.map((d) => <span key={d} className="DR-dow" aria-hidden="true">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const past = d < min;
          const isStart = d === ci, isEnd = d === end && !!end;
          const inRange = !!ci && !!end && d > ci && d < end;
          const tooShort = !!ci && !co && d > ci && d < firstOut; // inside the 2-night minimum
          const tipHere = tip?.d === d ? tip.text : "";
          const cls = ["DR-day", past && "is-past", isStart && "is-start", isEnd && "is-end", inRange && "is-in", (isStart && end) && "has-end", !co && isEnd && "is-preview", tooShort && "is-short", tipHere && "has-tip"].filter(Boolean).join(" ");
          return (
            <button key={d} type="button" className={cls} data-date={d} disabled={past} tabIndex={d === (ci || min) ? 0 : -1}
              aria-label={`${fmt(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${isStart ? ", check-in" : ""}${isEnd && co ? ", check-out" : ""}`}
              aria-pressed={isStart || (isEnd && !!co)} aria-disabled={tooShort || undefined} title={tooShort ? `${minNights}-night minimum` : undefined}
              onClick={() => onPick(d)} onMouseEnter={() => onHover(d)} onFocus={() => onHover(d)}>
              <span>{parse(d).getUTCDate()}</span>
              {/* Airbnb-style label above the day (Oscar, Nov 20). Visual only: the same facts are in the heading and the day's name. */}
              {tipHere && <i className={`DR-tip${i % 7 <= 1 ? " DR-tipL" : i % 7 >= 5 ? " DR-tipR" : ""}`} aria-hidden="true">{tipHere}</i>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRange({ ci, co, min, minNights = 2, onChange, onClose, onDone }: {
  ci: string; co: string; min: string; minNights?: number; onChange: (ci: string, co: string) => void; onClose: () => void; onDone: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  const [view, setView] = useState(monthStart(ci || min));
  const [hover, setHover] = useState("");
  const [last, setLast] = useState(""); // the day picked last: phones have no hover, so its label shows there
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const mq = matchMedia("(max-width: 759px)"); const on = () => setMobile(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      // Desktop: if the popover opens below the fold, bring all of it into view (as Airbnb does).
      if (!mobile && box.current && box.current.getBoundingClientRect().bottom > innerHeight) {
        box.current.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      box.current?.querySelector<HTMLButtonElement>(`.DR-day[data-date="${ci || ""}"], .DR-day:not(:disabled)`)?.focus({ preventScroll: !mobile });
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    if (mobile) document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [mobile, onClose]);

  const pick = (d: string) => {
    if (!ci || co || d <= ci) { onChange(d, ""); setLast(d); }
    else if (nightsBetween(ci, d) < minNights) return; // all five homes have a 2-night minimum (Airbnb calendars)
    else { onChange(ci, d); setLast(d); }
  };
  // Labels above the calendar days, like Airbnb: "2-night minimum" on check-in until check-out is picked; then
  // "Check-in day" / "Checkout day" on the one being pointed at (or, on phones, the one just tapped).
  const at = hover === ci || hover === co ? hover : last;
  const tip = ci && !co ? { d: ci, text: `${minNights}-night minimum` }
    : ci && co && at === ci ? { d: ci, text: "Check-in day" }
    : ci && co && at === co ? { d: co, text: "Checkout day" } : null;
  const months = useMemo(() => (mobile ? Array.from({ length: 12 }, (_, i) => addMonths(monthStart(min), i)) : [view, addMonths(view, 1)]), [mobile, view, min]);
  const n = ci && co ? nightsBetween(ci, co) : 0;
  const heading = n ? `${n} night${n === 1 ? "" : "s"}` : ci ? "Select check-out date" : "Select check-in date";
  const sub = ci && co ? `${fmt(ci, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(co, { month: "short", day: "numeric", year: "numeric" })}` : ci ? `Check-in ${fmt(ci, { month: "short", day: "numeric" })}` : "Add your travel dates for exact totals";
  const minNote = `${minNights}-night minimum`;

  // Arrow keys move one day (left/right) or one week (up/down); moves into the next month when needed.
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement; const d = t.dataset.date; if (!d) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(d, step); if (next < min) return;
    if (!mobile && !months.includes(monthStart(next))) setView(step > 0 ? addMonths(view, 1) : addMonths(view, -1));
    setTimeout(() => box.current?.querySelector<HTMLButtonElement>(`.DR-day[data-date="${next}"]`)?.focus(), 0);
  };

  const ui = (
    <div className={`DR ${mobile ? "DR-sheet" : "DR-pop"}`} ref={box} role="dialog" aria-modal={mobile} aria-label="Choose your dates" onKeyDown={onKey} onMouseLeave={() => setHover("")}>
      <div className="DR-head">
        {mobile && <button type="button" className="DR-x" aria-label="Close" onClick={onClose}>×</button>}
        <div><p className="DR-h">{heading}</p><p className="DR-sub">{sub}{ci && !co ? <> · <b className="DR-min" role="status">{minNote}</b></> : !ci ? <> · {minNote}</> : null}</p></div>
      </div>
      {mobile && <div className="DR-dowRow" aria-hidden="true">{DOW.map((d) => <span key={d}>{d}</span>)}</div>}
      <div className="DR-body">
        {!mobile && (
          <>
            <button type="button" className="DR-nav DR-prev" aria-label="Previous month" disabled={view <= monthStart(min)} onClick={() => setView(addMonths(view, -1))}>‹</button>
            <button type="button" className="DR-nav DR-next" aria-label="Next month" onClick={() => setView(addMonths(view, 1))}>›</button>
          </>
        )}
        <div className="DR-months">
          {months.map((m) => <Month key={m} m={m} ci={ci} co={co} hover={hover} min={min} minNights={minNights} tip={tip} onPick={pick} onHover={setHover} />)}
        </div>
      </div>
      <div className="DR-foot">
        <button type="button" className="DR-clear" disabled={!ci} onClick={() => onChange("", "")}>Clear dates</button>
        <button type="button" className="DR-done" onClick={onDone}>{ci && co ? "Select dates" : "Close"}</button>
      </div>
    </div>
  );
  // On phones the sheet is full screen: render it on the page itself so no parent can box it in.
  return mobile ? createPortal(<div className="F-page DR-portal">{ui}</div>, document.body) : ui;
}
