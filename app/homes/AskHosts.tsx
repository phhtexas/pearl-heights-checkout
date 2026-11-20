"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "@/client/track";
import { DateRange } from "../all-homes/f/DateRange";
import "../all-homes/f/f.css";

/**
 * "Message Oscar & Fernanda" (Oscar, Nov 19): a question before booking, like Airbnb. Opens from the chat icon on the
 * "Hosted by" row and the button in "Meet your hosts". Dates are filled in when the guest already picked them, and stay
 * optional otherwise (Oscar: "preselected dates if they selected them, or they select the dates, but optional").
 * After sending, the guest gets a private conversation link; nothing is booked or charged.
 */
type Props = {
  open: boolean; onClose: () => void;
  home: { key: string; title: string; maxGuests: number };
  ci: string | null; co: string | null; adults: number; children: number; infants: number; total: number | null;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const KEY = "ph_inquiries";

export function AskHosts(p: Props) {
  const [ci, setCi] = useState(""), [co, setCo] = useState("");
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0), [infants, setInfants] = useState(0);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [msg, setMsg] = useState(""), [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle"), [err, setErr] = useState(""), [link, setLink] = useState(""), [emailed, setEmailed] = useState(false);
  const [picked, setPicked] = useState(false), [cal, setCal] = useState(false);
  const box = useRef<HTMLDivElement>(null), opener = useRef<Element | null>(null), dateBtn = useRef<HTMLButtonElement>(null);
  const calOpen = useRef(false); calOpen.current = cal;

  // Each time it opens: take the dates and guests from the page (if any).
  useEffect(() => {
    if (!p.open) return;
    opener.current = document.activeElement;
    setCi(p.ci ?? ""); setCo(p.co ?? ""); setAdults(p.adults); setChildren(p.children); setInfants(p.infants);
    setPicked(!!(p.ci && p.co)); setCal(false);
    if (state === "sent") { setState("idle"); setMsg(""); setLink(""); }
    setErr("");
    try { const s = JSON.parse(localStorage.getItem("ph_guest_contact") ?? "null"); if (s?.name) setName(s.name); if (s?.email) setEmail(s.email); } catch { /* storage off */ }
    setTimeout(() => box.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), textarea")?.focus(), 30);
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (calOpen.current) return; // the calendar handles its own keys
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([tabindex='-1']), textarea, select")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1]!.focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0]!.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // The calendar unlocks page scrolling when it closes; keep it locked while the form is still open.
  useEffect(() => { if (p.open && !cal) document.body.style.overflow = "hidden"; }, [cal, p.open]);
  useEffect(() => { document.documentElement.classList.toggle("ah-open", p.open); return () => document.documentElement.classList.remove("ah-open"); }, [p.open]);
  if (!p.open) return null;
  const closeCal = () => { setCal(false); setTimeout(() => dateBtn.current?.focus({ preventScroll: true }), 0); };
  function close() { p.onClose(); (opener.current as HTMLElement | null)?.focus?.(); }

  const datesOk = (!ci && !co) || (!!ci && !!co && co > ci);
  const samePageStay = picked;
  const send = async () => {
    if (state === "sending") return;
    if (!datesOk) { setErr(ci && !co ? "Add a check-out date, or clear the dates." : !ci && co ? "Add a check-in date, or clear the dates." : "Check-out must be after check-in."); return; }
    setState("sending"); setErr("");
    const r = await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      property: p.home.key, checkIn: ci || null, checkOut: co || null, adults, children, infants,
      quotedTotal: samePageStay ? p.total : null, name, email, message: msg, website: hp }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !j.ok) { setState("idle"); setErr(r?.status === 429 ? "You've sent several messages already. Please try again in a little while." : j.error ?? "Your message didn't send. Please try again."); return; }
    try {
      localStorage.setItem("ph_guest_contact", JSON.stringify({ name, email }));
      const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (j.url) localStorage.setItem(KEY, JSON.stringify([{ home: p.home.key, url: j.url, at: Date.now() }, ...(Array.isArray(list) ? list : [])].slice(0, 10)));
    } catch { /* storage off */ }
    track("inquiry_sent", { property: p.home.key, has_dates: !!ci }, "inq" + Date.now());
    setLink(j.url ?? ""); setEmailed(!!j.emailed); setState("sent");
  };

  const guests = adults + children;
  return (
    <div className="scrim AH-scrim" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={box} className="sheet AH" role="dialog" aria-modal="true" aria-labelledby="ah-title">
        <div className="sheetHead AH-head">
          <div><h2 id="ah-title">Message Oscar &amp; Fernanda</h2><p className="AH-sub">Usually reply within an hour</p></div>
          <button className="x" aria-label="Close" onClick={close}>×</button>
        </div>
        {state === "sent" ? (
          <div className="AH-done" role="status">
            <h3>Message sent</h3>
            <p>We usually reply within an hour. Nothing is booked or charged.</p>
            {link && <a className="V-cta AH-cta" href={link}>Open your conversation</a>}
            <p className="AH-fine">{emailed ? "We also emailed you this link." : "Keep this link: it's where you'll see our reply."}</p>
            <button type="button" className="AH-link" onClick={close}>Back to the home</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
            {picked ? (
              <div className="AH-stay AH-sum">
                <b>{p.home.title}</b>
                <span>{shortRange(ci, co)} · {guests} {guests === 1 ? "guest" : "guests"}{infants ? ` + ${infants} ${infants === 1 ? "infant" : "infants"}` : ""}</span>
                {p.total ? <span>{money(p.total)} total</span> : null}
              </div>
            ) : (
              <div className="AH-stay">
                <b>{p.home.title}</b>
                <div className="AH-dates">
                  <div className="AH-dateF"><span>Check-in <i>(optional)</i></span>
                    <button type="button" ref={dateBtn} className="AH-dateBtn" aria-haspopup="dialog" aria-expanded={cal} aria-label={`Check-in date: ${ci ? shortDay(ci) : "add date"}`} onClick={() => setCal(true)}>
                      {ci ? shortDay(ci) : <span className="AH-ph">Add dates</span>}</button></div>
                  <div className="AH-dateF"><span>Check-out <i>(optional)</i></span>
                    <button type="button" className="AH-dateBtn" aria-haspopup="dialog" aria-expanded={cal} aria-label={`Check-out date: ${co ? shortDay(co) : "add date"}`} onClick={() => setCal(true)}>
                      {co ? shortDay(co) : <span className="AH-ph">Add dates</span>}</button></div>
                </div>
                {(ci || co) && <button type="button" className="AH-link AH-clear" onClick={() => { setCi(""); setCo(""); }}>Clear dates</button>}
                <div className="AH-guests">
                  <label>Adults<select value={adults} onChange={(e) => setAdults(Number(e.target.value))}>{range(1, Math.max(1, p.home.maxGuests - children)).map((n) => <option key={n}>{n}</option>)}</select></label>
                  <label>Children<select value={children} onChange={(e) => setChildren(Number(e.target.value))}>{range(0, Math.max(0, p.home.maxGuests - adults)).map((n) => <option key={n}>{n}</option>)}</select></label>
                  <label>Infants<select value={infants} onChange={(e) => setInfants(Number(e.target.value))}>{range(0, 6).map((n) => <option key={n}>{n}</option>)}</select></label>
                </div>
              </div>
            )}
            <label className="AH-f">Your name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
            <label className="AH-f">Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} required /></label>
            <label className="AH-f">Message<textarea rows={4} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask about these dates, the home or the area." required /></label>
            <label className="AH-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
            {err && <p className="AH-err" role="alert">{err}</p>}
            <button className="V-cta AH-cta" type="submit" disabled={state === "sending" || !name.trim() || !email.trim() || !msg.trim()}>{state === "sending" ? "Sending…" : "Send message"}</button>
            <p className="AH-fine">You&apos;ll get our reply by email with a private link to this conversation. Nothing is booked or charged.</p>
          </form>
        )}
      </div>
      {cal && createPortal(
        <div className="F-page AH-calLayer" onClick={(e) => { if (e.target === e.currentTarget) closeCal(); }}>
          <DateRange ci={ci} co={co} min={today()} onChange={(a, b) => { setCi(a); setCo(b); }} onClose={closeCal} onDone={closeCal} />
        </div>, document.body)}
    </div>
  );
}

const shortDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const shortRange = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${shortDay(a)}–${Number(b.slice(8))}` : `${shortDay(a)} – ${shortDay(b)}`);
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

export function ChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
