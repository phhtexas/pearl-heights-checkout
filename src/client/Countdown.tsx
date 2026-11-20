"use client";
import { useEffect, useState } from "react";

/**
 * "Expires in 23 h 58 min" for a special offer (Oscar, Nov 20: show the guest it's time-sensitive). Ticks every
 * 30 seconds; turns red in the last 3 hours; calls onEnd once when it runs out. Styles: .CH-offerTimer (chat.css).
 */
export function Countdown({ until, onEnd, className = "CH-offerTimer" }: { until: string; onEnd?: () => void; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const ms = Date.parse(until) - now, ended = ms <= 0;
  useEffect(() => { if (ended) onEnd?.(); }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
  if (ended) return <p className={`${className} is-ended`}>This offer has ended.</p>;
  const mins = Math.ceil(ms / 60_000), h = Math.floor(mins / 60), m = mins % 60;
  const text = h > 0 ? `${h} h ${m} min` : `${m} min`;
  return <p className={`${className}${ms < 3 * 3600_000 ? " is-soon" : ""}`}><span aria-hidden="true">⏱ </span>Expires in {text}</p>;
}
