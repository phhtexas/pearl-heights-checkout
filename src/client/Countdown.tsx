"use client";
import { useEffect, useState } from "react";

/**
 * "Expires in 23 h 58 min" for a special offer (Oscar, Nov 20: show the guest it's time-sensitive). Ticks every
 * 30 seconds; turns red in the last 3 hours; calls onEnd once when it runs out. Styles: .CH-offerTimer (chat.css).
 */
/** Time left until `until`, refreshed every 30 seconds: "23 h 54 min" / "42 min", or ended. */
export function useTimeLeft(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const ms = Date.parse(until) - now, mins = Math.max(0, Math.ceil(ms / 60_000)), h = Math.floor(mins / 60), m = mins % 60;
  return { ms, ended: ms <= 0, soon: ms < 3 * 3600_000, text: h > 0 ? `${h} h ${m} min` : `${m} min` };
}

export function Countdown({ until, onEnd, className = "CH-offerTimer" }: { until: string; onEnd?: () => void; className?: string }) {
  const t = useTimeLeft(until);
  useEffect(() => { if (t.ended) onEnd?.(); }, [t.ended]); // eslint-disable-line react-hooks/exhaustive-deps
  if (t.ended) return <p className={`${className} is-ended`}>This offer has ended.</p>;
  return <p className={`${className}${t.soon ? " is-soon" : ""}`}><span aria-hidden="true">⏱ </span>Expires in {t.text}</p>;
}

/** Checkout banner text with a special offer (Oscar, Nov 20): replaces "Your price is locked for". */
export function OfferLockText({ until }: { until: string }) {
  const t = useTimeLeft(until);
  return t.ended ? <span>Your special offer has ended</span> : <><span>Your special offer expires in</span><b>{t.text}</b></>;
}
