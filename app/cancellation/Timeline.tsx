"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { stayPolicy, type PolicyRow } from "@/domain/policy";
import { addDaysISO, checkInInstant, todayChicago } from "@/domain/time";

/**
 * Guest-facing cancellation timeline (Oscar, Nov 21): pick your dates, then swipe a bar that runs from today to your
 * check-in. Colors and dots come from stayPolicy() (the same engine checkout and refunds use), so the picture can never
 * disagree with what we actually refund. A fixed needle in the middle reads out what you'd get back on that day.
 */
type Tier = PolicyRow["tier"];
const TIER: Record<Tier, { label: string; short: string; color: string; ink?: string }> = {
  grace_24h: { label: "Full refund", short: "Full refund", color: "#0F6B52" },
  "30_plus": { label: "Refund minus a 5% processing fee", short: "Refund minus 5% fee", color: "#5FA88B", ink: "#2F7D60" },
  "14_to_29": { label: "50% of the stay back, plus the damage waiver", short: "50% refund", color: "#D99A2B", ink: "#8A5A00" },
  under_14: { label: "No refund except the damage waiver", short: "No refund", color: "#C4533D", ink: "#A1291F" },
  check_in_day: { label: "No refund", short: "No refund", color: "#8E2A1E" },
  non_refundable: { label: "Non-refundable (booked 7 days or less before check-in)", short: "Non-refundable", color: "#8E2A1E" },
  full_no_fee: { label: "Full refund", short: "Full refund", color: "#0F6B52" },
  after_check_in: { label: "No refund", short: "No refund", color: "#8E2A1E" },
  nonpayment: { label: "No refund", short: "No refund", color: "#8E2A1E" },
};
const DAY = 864e5, PX = 18; // pixels per day on the bar
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago", ...o });
const short = (d: Date) => fmt(d, { month: "short", day: "numeric" });
const long = (d: Date) => fmt(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function CancelTimeline() {
  const [now, setNow] = useState<Date | null>(null);
  const [ci, setCi] = useState(""), [co, setCo] = useState("");
  useEffect(() => setNow(new Date()), []);
  const today = now ? todayChicago(now) : "";
  const min = today ? addDaysISO(today, 1) : undefined;

  const plan = useMemo(() => {
    if (!now || !ci || ci <= today) return null;
    const p = stayPolicy(ci, now);
    const end = checkInInstant(ci);
    let start = now.getTime();
    const segs = p.rows.map((r) => { const s = { tier: r.tier, from: start, to: r.until ? Date.parse(r.until) : end.getTime() }; start = s.to; return s; })
      .filter((s) => s.to > s.from);
    const total = end.getTime() - now.getTime();
    return { p, segs, start: now.getTime(), end: end.getTime(), width: Math.max(320, Math.ceil(total / DAY) * PX) };
  }, [now, ci, today]);

  // The needle: the date under the middle of the scroller.
  const sc = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0), [half, setHalf] = useState(160);
  useEffect(() => { const m = () => sc.current && setHalf(sc.current.clientWidth / 2); m(); addEventListener("resize", m); return () => removeEventListener("resize", m); }, [plan]);
  const onScroll = () => { const el = sc.current; if (!el || !plan) return; setAt(Math.min(1, Math.max(0, el.scrollLeft / plan.width))); };
  useEffect(() => { if (sc.current) sc.current.scrollLeft = 0; setAt(0); }, [plan?.width, plan?.start]);
  const atTime = plan ? plan.start + at * (plan.end - plan.start) : 0;
  const cur = plan?.segs.find((s) => atTime >= s.from && atTime < s.to) ?? plan?.segs[plan.segs.length - 1];

  // Dots where the refund changes (labels stacked in rows so they never overlap).
  const dots = useMemo(() => {
    if (!plan) return [];
    const out: { x: number; t: number; tier: Tier; row: number }[] = [];
    let last = [0, -1e9, -1e9]; // row 0 starts with the "Today" label
    // The check-in-day dot sits under the Check-in marker itself (same day), so the Check-in label covers it.
    for (const s of plan.segs.slice(1).filter((x) => plan.end - x.from > DAY)) {
      const x = ((s.from - plan.start) / (plan.end - plan.start)) * plan.width;
      const row = [0, 1, 2].find((r) => x - last[r]! > 120) ?? 0;
      last[row] = x; out.push({ x, t: s.from, tier: s.tier, row });
    }
    // keep clear of the "Check-in" label at the far end
    for (const d of out) if (d.row === 0 && plan.width - d.x < 120) d.row = out.some((o) => o !== d && o.row === 1 && Math.abs(o.x - d.x) < 120) ? 2 : 1;
    return out;
  }, [plan]);
  const rows = dots.reduce((m, d) => Math.max(m, d.row), 0);

  return (
    <div className="CX">
      <form className="CX-dates" onSubmit={(e) => e.preventDefault()} aria-label="Your trip dates">
        <label><span>Check-in</span><input type="date" value={ci} min={min} onChange={(e) => { setCi(e.target.value); if (co && co <= e.target.value) setCo(""); }} /></label>
        <label><span>Check-out</span><input type="date" value={co} min={ci ? addDaysISO(ci, 1) : min} onChange={(e) => setCo(e.target.value)} /></label>
      </form>

      {!plan ? <p className="CX-empty">Pick a check-in date to see your cancellation timeline.</p> : (
        <>
          <div className="CX-read" aria-live="polite" style={{ borderColor: TIER[cur!.tier].color }}>
            <p className="CX-readWhen">If you cancel {at < 0.002 ? "today" : `on ${long(new Date(atTime))}`}</p>
            <p className="CX-readWhat" style={{ color: TIER[cur!.tier].ink ?? TIER[cur!.tier].color }}>{TIER[cur!.tier].label}</p>
          </div>

          <div className="CX-wrap">
          <div className="CX-scroll" ref={sc} onScroll={onScroll} tabIndex={0} role="region" aria-label="Cancellation timeline from today to check-in. Scroll sideways.">
            <div className="CX-track" style={{ width: plan.width, marginLeft: half, marginRight: half, height: 84 + rows * 40 }}>
              <div className="CX-bar">
                {plan.segs.map((s) => <span key={s.tier} style={{ left: ((s.from - plan.start) / (plan.end - plan.start)) * plan.width, width: Math.max(3, ((s.to - s.from) / (plan.end - plan.start)) * plan.width), background: TIER[s.tier].color }} />)}
              </div>
              <div className="CX-end CX-endL"><i /><span><b>Today</b>{short(new Date(plan.start))}</span></div>
              <div className="CX-end CX-endR"><i /><span><b>Check-in</b>{short(new Date(plan.end))}</span></div>
              {dots.map((d) => (
                <div key={d.t} className="CX-dot" style={{ left: d.x, ["--row" as string]: d.row }}>
                  <i style={{ background: TIER[d.tier].color }} />
                  <span><b>{short(new Date(d.t))}</b>{TIER[d.tier].short}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="CX-needle" aria-hidden="true" />
          </div>
          <p className="CX-hint">Swipe the timeline to see what you&apos;d get back on any day before your trip.</p>

          <ol className="CX-list">
            {plan.segs.map((s) => (
              <li key={s.tier}><i style={{ background: TIER[s.tier].color }} />
                <div><b>{TIER[s.tier].label}</b><span>{s.tier === "grace_24h" ? `Until ${long(new Date(s.to))} (24 hours after booking)` : s.tier === "check_in_day" ? `On check-in day, ${long(new Date(s.from))}` : `${long(new Date(s.from))} – ${long(new Date(s.to - 1))}`}</span></div>
              </li>
            ))}
          </ol>
          <p className="CX-small">Based on booking today{co ? ` for ${short(new Date(ci + "T12:00:00Z"))} – ${short(new Date(co + "T12:00:00Z"))}` : ""}. Times are San Antonio time, measured against the 4:00 PM check-in. Your exact dates and amounts are also shown before you pay.</p>
        </>
      )}
    </div>
  );
}
