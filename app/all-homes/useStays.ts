"use client";
import { track } from "@/client/track";
import { useCallback, useEffect, useRef, useState } from "react";

/** Shared by the All Homes mockups (C current; A and B archived): dates + guests, one read-only price check for all five homes, links that carry the search. */
export type Result = { key: string; ok: boolean; total?: number; nights?: number; reason?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const todayCT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
export const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const shortDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function useStays(variant: "a" | "b" | "c" | "e" | "f") {
  const [ci, setCi] = useState(""), [co, setCo] = useState("");
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const req = useRef(0);
  const min = todayCT();

  const run = useCallback(async (a: string, b: string, ad: number, ch: number) => {
    if (!a || !b) { setError("Add your check-in and check-out dates."); setState("error"); return; }
    if (b <= a) { setError("Check-out must be after check-in."); setState("error"); return; }
    const id = ++req.current;
    setState("loading"); setError("");
    try {
      const r = await fetch(`/api/availability?checkIn=${a}&checkOut=${b}&adults=${ad}&children=${ch}`, { cache: "no-store" });
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) { setError(j.error ?? "We couldn't check these dates."); setState("error"); return; }
      setResults(Object.fromEntries((j.homes as Result[]).map((h) => [h.key, h])));
      setState("done");
      const u = new URL(location.href);
      for (const [k, v] of Object.entries({ checkIn: a, checkOut: b, adults: String(ad), children: String(ch) })) u.searchParams.set(k, v);
      history.replaceState(null, "", u);
      track("all_homes_search", { variant, nights: (Date.parse(b) - Date.parse(a)) / 864e5, guests: ad + ch, adults: ad, children: ch, check_in: a, check_out: b, available_homes: (j.homes as Result[]).filter((h) => (h as { available?: boolean }).available).length }, "ahs" + a + b + ad + "-" + ch);
    } catch {
      if (id === req.current) { setError("We couldn't reach our booking system. Please try again."); setState("error"); }
    }
  }, [variant]);

  // A shared or ad link can carry the search (?checkIn=&checkOut=&adults=&children=).
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const a = q.get("checkIn") ?? "", b = q.get("checkOut") ?? "";
    const ad = Math.max(1, Number(q.get("adults")) || 2), ch = Math.max(0, Number(q.get("children")) || 0);
    setAdults(ad); setChildren(ch);
    if (ISO.test(a) && ISO.test(b)) { setCi(a); setCo(b); void run(a, b, ad, ch); }
  }, [run]);

  const search = () => run(ci, co, adults, children);
  /**
   * Link to a home from these results. It carries the search (dates + guests, only after a finished search, as before)
   * and from=browse plus any extra list state (e.g. saved=1), so the listing's "Back to all homes" can rebuild these
   * exact results (Oscar, Nov 19). The URL stays the one source of truth; no separate storage.
   */
  const href = (slug: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ from: "browse" });
    if (ci && co && state === "done") for (const [k, v] of Object.entries({ checkIn: ci, checkOut: co, adults: String(adults), children: String(children) })) q.set(k, v);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/homes/${slug}?${q}`;
  };
  const setCheckIn = (v: string) => { setCi(v); if (co && co <= v) setCo(""); };
  return { ci, co, setCheckIn, setCo, adults, setAdults, children, setChildren, results, state, error, search, href, min };
}
