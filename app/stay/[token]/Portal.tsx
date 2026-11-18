"use client";
import { useEffect, useRef, useState } from "react";
import type { StayData } from "@/content/stayDemo";
import { loadStripe } from "@stripe/stripe-js";
import { checkInInstant, todayChicago } from "@/domain/time";

/**
 * Guest portal, phase 1 (test data). Flow, matching the "Booking directly is simple" steps on All Homes F:
 *  1 Your home is booked  ->  2 Complete paperwork (sign agreement + verify ID by the deadline)
 *  ->  3 Receive check-in details (address, entry steps, Wi-Fi unlock only after BOTH are done; door code on check-in morning)
 *  ->  4 Enjoy your stay (house rules, messages).
 * In this test version the state lives in this browser only (localStorage), and nothing is sent or charged.
 */
type State = { signedAt?: string; signedOn?: string; signedName?: string; signDoc?: string; pendingDoc?: { id: string }; pendingName?: string; nameEdited?: boolean; verifiedAt?: string; idSession?: string; allSetSeen?: boolean; simDay?: "morning" | "checkin"; messages: { from: "guest" | "note"; text: string; at: string }[] };
const fresh = (): State => ({ messages: [] });
const KEY = (t: string) => `ph-stay-${t}`;
/** Sandbox labels render only when NEXT_PUBLIC_SANDBOX=true (inlined at build); never in a production build without it. */
const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === "true";
const signedDate = (iso?: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" }).format(iso ? new Date(iso) : new Date());
const fmtDay = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const nowText = () => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());

const Ico = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const I = {
  check: "m5 12.5 4.5 4.5L19 7.5",
  pen: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  doc: "M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 12h6M9 15h6M9 18h3",
  id: "M3.5 6.5h17v11h-17zM8 10.5a1.8 1.8 0 1 0 0 .01M6 15c.5-1.3 1.2-2 2-2s1.5.7 2 2M13 10h5M13 13h4",
  lock: "M6.5 10.5h11v9h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  pin: "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  key: "M14.5 9.5a4 4 0 1 1-1.2-2.8M13.3 6.7 20 13.4l-2 2-1.5-1.5-1.5 1.5-1.5-1.5M7.5 9.5h.01",
  wifi: "M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19h.01",
  door: "M6 20.5V4h12v16.5M4 20.5h16M14.5 12.5h.01",
  car: "M5 16.5V12l2-5h10l2 5v4.5M5 16.5h14M7.5 16.5v2M16.5 16.5v2M5 12h14",
  chat: "M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2",
  rules: "M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01",
  washer: "M5 3.5h14v17H5zM5 8h14M8 5.8h.01M11 5.8h.01M12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  plug: "M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v4.5",
  home: "M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  trash: "M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6",
  aid: "M4 7.5h16v12H4zM9 7.5V5h6v2.5M12 10.5v6M9 13.5h6",
  route: "M6 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17.5h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  shield: "M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4",
  nav: "M12 3 20 20l-8-3.5L4 20z",
};

// House guide topic icons (Oscar, Nov 17).
const GUIDE_IC: Record<string, string> = {
  "Check-in and check-out": I.clock, "House rules": I.rules, "Washer and dryer": I.washer, "Appliances": I.plug,
  "Around the house": I.home, "Parking": I.car, "Trash": I.trash, "Emergencies and nearby help": I.aid,
  "Getting around": I.route, "Our favorite places": I.heart, "Safety and property": I.shield,
};

export function Portal({ stay }: { stay: StayData }) {
  const [s, setS] = useState<State>(fresh);
  const sRef = useRef(s); sRef.current = s;
  const [ready, setReady] = useState(false);
  const [signing, setSigning] = useState(false);
  const [idOpen, setIdOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  // Oscar, Nov 17 (option 2): prefilled with the reservation holder's name from the booking; editable to fix a typo.
  const [name, setName] = useState(stay.holder);
  const [draft, setDraft] = useState("");
  useEffect(() => { try { const raw = localStorage.getItem(KEY(stay.token)); if (raw) setS({ ...fresh(), ...JSON.parse(raw) }); } catch { /* private mode */ } setReady(true); }, [stay.token]);
  const save = (n: State) => { setS(n); try { localStorage.setItem(KEY(stay.token), JSON.stringify(n)); } catch { /* ignore */ } };

  // ID check through Stripe Identity (Oscar, Nov 17, option 1). Stripe's own window opens over this page; the result
  // is then confirmed with the server (never the browser alone). Sandbox falls back to a simulated check if Stripe
  // Identity isn't set up yet (503 fallback).
  const [idState, setIdState] = useState<"idle" | "loading" | "checking" | "retry" | "fallback" | "error">("idle");
  const [idMsg, setIdMsg] = useState("");
  const checkId = async (vs: string, tries = 1): Promise<"verified" | "processing" | "requires_input" | "canceled" | "error"> => {
    for (let i = 0; i < tries; i++) {
      const r = await fetch(`/api/stay/${stay.token}/identity?vs=${vs}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      const st = r?.status;
      if (st === "verified") { save({ ...sRef.current, verifiedAt: nowText(), idSession: vs }); setIdState("idle"); setIdMsg(""); return st; }
      if (st === "requires_input" || st === "canceled") { setIdState("retry"); setIdMsg(st === "canceled" ? "The ID check was canceled. Please try again." : "We couldn't verify your ID. Please try again with a clear photo."); return st; }
      if (!st) { setIdState("error"); setIdMsg(r?.error ?? "We couldn't check your ID status."); return "error"; }
      if (i < tries - 1) await new Promise((w) => setTimeout(w, 2000));
    }
    setIdState("checking"); setIdMsg("Stripe is still reviewing your ID. This usually takes a minute.");
    return "processing";
  };
  const startId = async () => {
    setIdState("loading"); setIdMsg("");
    const r = await fetch(`/api/stay/${stay.token}/identity`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503 && j.fallback) { setIdState("fallback"); setIdOpen(true); return; }
    if (!r.ok || !j.clientSecret) { setIdState("error"); setIdMsg(j.error ?? "We couldn't start the ID check."); return; }
    save({ ...sRef.current, idSession: j.sessionId });
    try {
      const cfg = await fetch("/api/config").then((x) => x.json());
      const stripe = cfg?.publishableKey ? await loadStripe(cfg.publishableKey, { developerTools: { assistant: { enabled: false } } }) : null;
      if (!stripe) throw new Error("no stripe");
      const res = await stripe.verifyIdentity(j.clientSecret);
      if (res.error && res.error.code === "session_cancelled") { setIdState("retry"); setIdMsg("The ID check was closed before it finished. Tap Verify my ID to continue."); return; }
    } catch {
      location.href = j.url; return; // Stripe's hosted page; it returns here with ?id=done
    }
    setIdState("checking");
    void checkId(j.sessionId, 8);
  };
  // Came back from Stripe's hosted page, or reloaded mid-check: look up the saved session.
  useEffect(() => {
    if (!ready || sRef.current.verifiedAt || !sRef.current.idSession) return;
    const vs = sRef.current.idSession;
    void checkId(vs, new URLSearchParams(location.search).get("id") === "done" ? 6 : 1).then((st) => { if (st === "requires_input" && !new URLSearchParams(location.search).get("id")) { setIdState("idle"); setIdMsg(""); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (idState !== "checking" || !s.idSession) return;
    const t = setInterval(() => { if (sRef.current.idSession) void checkId(sRef.current.idSession); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idState, s.idSession]);
  // House guide search: every word must appear in the topic title or the line (case-insensitive).
  const [gq, setGq] = useState("");
  const gWords = gq.toLowerCase().split(/\s+/).filter(Boolean);
  const gMatch = (t: string) => gWords.every((w) => t.toLowerCase().includes(w));
  const guideHits = gWords.length ? stay.thingsToKnow
    .map((g) => gMatch(g.title) ? g : { ...g, items: g.items.filter((x) => gMatch(x) || gWords.every((w) => (g.title + " " + x).toLowerCase().includes(w))) })
    .filter((g) => g.items.length) : [];
  const hl = (t: string) => {
    if (!gWords.length) return t;
    const re = new RegExp(`(${gWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
    return t.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };
  const signed = !!s.signedAt, verified = !!s.verifiedAt, unlocked = signed && verified;
  const firstName = (s.signedName || stay.holder).trim().split(/\s+/)[0] || "there";
  // Show "You're all set!" the first time the guest sees both steps done (this visit); remember it, so later visits skip it.
  const [allSetNow, setAllSetNow] = useState(false);
  useEffect(() => {
    if (ready && unlocked && !s.allSetSeen) { setAllSetNow(true); save({ ...sRef.current, allSetSeen: true }); }
    if (!unlocked) setAllSetNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, unlocked]);
  // Oscar, Nov 17: the door code and Wi-Fi are released on check-in MORNING (Central time); step 4 "Enjoy your stay"
  // starts at check-in TIME (4:00 PM Central on check-in day). Both only once the paperwork is done.
  // Test controls can jump to check-in morning or to check-in time.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const isCheckinDay = s.simDay === "morning" || s.simDay === "checkin" || (now !== null && todayChicago(new Date(now)) >= stay.checkIn);
  const isCheckinTime = s.simDay === "checkin" || (now !== null && now >= checkInInstant(stay.checkIn).getTime());
  const released = unlocked && isCheckinDay;
  const step = !unlocked ? 2 : isCheckinTime ? 4 : 3;
  const ci = fmtDay(stay.checkIn, { weekday: "short", month: "short", day: "numeric" });
  const co = fmtDay(stay.checkOut, { weekday: "short", month: "short", day: "numeric" });
  const ciMorning = fmtDay(stay.checkIn, { weekday: "long", month: "long", day: "numeric" });
  const sign = () => { if (!agree || !name.trim()) return; save({ ...s, signedAt: nowText(), signedOn: new Date().toISOString(), signedName: name.trim() }); setSigning(false); };
  // SignWell: the server creates the agreement; it opens in a NEW TAB (Oscar, Nov 17) so this page stays open. We then
  // confirm completion with the server (never trusting the browser alone) when the guest comes back to this tab,
  // or when SignWell redirects the new tab back here with ?signed=1.
  const [esign, setEsign] = useState<"idle" | "loading" | "open" | "checking" | "fallback" | "error">("idle");
  const [esignMsg, setEsignMsg] = useState("");
  const checkSigned = async (doc: string, who: string, tries = 1): Promise<boolean> => {
    for (let i = 0; i < tries; i++) {
      const r = await fetch(`/api/stay/${stay.token}/agreement?doc=${doc}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r?.completed) {
        // signedName = what the guest typed in the agreement's "Full legal name" field (falls back to the booking name).
        save({ ...sRef.current, signedAt: nowText(), signedOn: r.signedAt ?? new Date().toISOString(), signedName: r.legalName || who, nameEdited: !!r.nameEdited, signDoc: doc, pendingDoc: undefined });
        setSigning(false); setEsign("idle"); return true;
      }
      if (i < tries - 1) await new Promise((w) => setTimeout(w, 1500));
    }
    return false;
  };
  // Back on this tab (or reloaded after the redirect): check the pending document.
  useEffect(() => {
    if (!ready) return;
    const pend = sRef.current.pendingDoc;
    if (!pend || sRef.current.signedAt) return;
    const who = sRef.current.pendingName ?? name;
    const fromRedirect = new URLSearchParams(location.search).get("signed") === "1";
    void checkSigned(pend.id, who, fromRedirect ? 6 : 1);
    const onBack = () => { if (document.visibilityState === "visible" && sRef.current.pendingDoc && !sRef.current.signedAt) void checkSigned(sRef.current.pendingDoc.id, who, 3); };
    document.addEventListener("visibilitychange", onBack); window.addEventListener("focus", onBack);
    const t = setInterval(onBack, 5000);
    return () => { document.removeEventListener("visibilitychange", onBack); window.removeEventListener("focus", onBack); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, s.pendingDoc?.id]);
  // Oscar, Nov 17 (later): SignWell opens INSIDE the portal again (preferred over a new tab), with the new copy.
  const loadScript = () => new Promise<void>((res, rej) => {
    if ((window as any).SignWellEmbed) return res();
    const el = document.createElement("script"); el.src = "https://static.signwell.com/assets/embedded.js"; el.async = true;
    el.onload = () => res(); el.onerror = () => rej(new Error("script")); document.head.appendChild(el);
  });
  const openAgreement = async () => {
    const who = name.trim(); if (!who) return;
    setEsign("loading"); setEsignMsg("");
    const r = await fetch(`/api/stay/${stay.token}/agreement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: who }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503 && j.fallback) { setEsign("fallback"); return; }
    if (!r.ok || !j.url) { setEsign("error"); setEsignMsg(j.error ?? "We couldn't open the agreement."); return; }
    save({ ...sRef.current, pendingDoc: { id: j.documentId }, pendingName: who });
    try { await loadScript(); } catch { setEsign("error"); setEsignMsg("The signing window couldn't load. Please try again."); return; }
    setEsign("open");
    const Embed = (window as any).SignWellEmbed;
    new Embed({ url: j.url, containerId: "st-sign-frame", allowDecline: false, allowRedirect: false, showHeader: true, signatureDefaultName: true, events: {
      completed: () => { setEsign("checking"); void checkSigned(j.documentId, who, 10).then((okd) => { if (!okd) { setEsign("error"); setEsignMsg("We couldn't confirm your signature yet. Please refresh in a minute."); } }); },
      closed: () => setEsign((x) => (x === "open" ? "idle" : x)),
      error: () => { setEsign("error"); setEsignMsg("Something went wrong in the signing window."); },
    } }).open();
  };
  const send = () => { const t = draft.trim(); if (!t) return; save({ ...s, messages: [...s.messages, { from: "guest", text: t, at: nowText() }] }); setDraft(""); };

  return (
    <div className="ST">
      {SANDBOX && <p className="ST-test" role="note"><b>Sandbox mode</b> · sample reservation · nothing here is real, sent or charged</p>}
      <header className="ST-top">
        <a href="/all-homes/f" className="ST-brand"><img src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} /></a>
        <a className="ST-ask" href="#messages">Message us</a>
      </header>

      <main className="ST-main">
        {/* Reservation summary */}
        <section className="ST-hero" aria-labelledby="st-h">
          <img className="ST-heroImg" src={stay.home.photo} alt={stay.home.photoAlt} />
          <div className="ST-heroText">
            {/* Oscar, Nov 17: personal greeting with the reservation holder's first name. */}
            <h1 id="st-h" className="ST-hello">Hi {firstName}! We&apos;re excited to host you.</h1>
            <p className="ST-eyebrow">Your stay · {stay.code}</p>
            <p className="ST-homeTitle">{stay.home.title}</p>
            <p className="ST-dim">{stay.home.neighborhood}, San Antonio</p>
            {unlocked && !allSetNow && (
              <p className="ST-paperDone"><Ico d={I.check} size={16} /> Paperwork complete{s.signDoc && <> · <a href={`/api/stay/${stay.token}/agreement/pdf?doc=${s.signDoc}`} target="_blank" rel="noopener">Rental agreement (PDF)</a></>}</p>
            )}
            <dl className="ST-facts">
              <div><dt>Check-in</dt><dd>{ci}<span>after 4:00 PM</span></dd></div>
              <div><dt>Check-out</dt><dd>{co}<span>by 10:00 AM</span></dd></div>
              <div><dt>Guests</dt><dd>{stay.guests.adults + stay.guests.children}<span>{stay.guests.adults} adults · {stay.guests.children} children</span></dd></div>
            </dl>
          </div>
        </section>

        {/* Progress, same 4 steps as All Homes F */}
        <ol className="ST-steps" aria-label="Your booking steps">
          {["Your home is booked", "Complete paperwork", "Receive check-in details", "Enjoy your stay"].map((t, i) => {
            const n = i + 1, done = n < step || (n === 1), now = n === step && !done;
            const sub = n === 2 && !unlocked && (signed || verified) ? "1 of 2 done" : "";
            return <li key={t} className={`${done ? "is-done" : now ? "is-now" : ""}${sub ? " is-half" : ""}`} aria-current={now ? "step" : undefined}><span className="ST-dot">{done ? <Ico d={I.check} size={14} /> : n}</span><span>{t}{sub && <small className="ST-sub">{sub}</small>}</span></li>;
          })}
        </ol>

        {/* Step 2: complete paperwork (Oscar's mockup, Nov 17): "You're booked!" box, then one row per item
            with an icon and its own button. The signing window / ID check open under their row. */}
        {/* Oscar, Nov 17: once both are done the guest sees "You're all set!" once; on later visits this whole section is
            gone and a "Paperwork complete · Rental agreement (PDF)" line stays in the stay card. */}
        {(!unlocked || allSetNow) && (
        <section className="ST-card ST-paper" aria-labelledby="confirm-h">
          <div className={`ST-booked${unlocked ? " is-all" : ""}`} role="status">
            <span className="ST-bookedIc" aria-hidden="true"><Ico d={I.check} size={26} /></span>
            <div>
              {unlocked ? (<>
                <p className="ST-bookedH">You&apos;re all set!</p>
                <p className="ST-bookedB">Paperwork complete. Your check-in details are below.</p>
              </>) : (<>
                <p className="ST-bookedH">You&apos;re booked!</p>
                <p className="ST-bookedB">Payment received. Your dates are reserved. The only items left are signing the rental agreement and completing ID verification.</p>
                <p className="ST-bookedS">Complete both by the deadline shown below to receive your check-in details.</p>
              </>)}
            </div>
          </div>

          {unlocked ? (
            <button className="ST-btn ST-goArrive" type="button" onClick={() => document.getElementById("arrive-h")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See your check-in details</button>
          ) : (<>
          <div className="ST-cardHead ST-paperHead">
            <h2 id="confirm-h">Complete paperwork</h2>
            <p className={`ST-due${unlocked ? " is-ok" : ""}`}>{unlocked ? "All done" : <>Due by <b>{stay.deadlineText}</b></>}</p>
          </div>

          {/* Row 1: rental agreement (SignWell, embedded; the guest's legal name is editable inside the agreement). */}
          <div className={`ST-task ST-pRow${signed ? " is-done" : ""}`}>
            <div className="ST-pMain">
              <span className="ST-pIc" aria-hidden="true"><Ico d={signed ? I.check : I.doc} size={26} /></span>
              <div className="ST-pText">
                <h3>Sign rental agreement</h3>
                {signed && (
                  <p className="ST-signedLine">Agreement signed — {signedDate(s.signedOn)}{s.signDoc
                    ? <> · <a className="ST-dl" href={`/api/stay/${stay.token}/agreement/pdf?doc=${s.signDoc}`} target="_blank" rel="noopener">Download a copy (PDF)</a></>
                    : <> · Signed by {s.signedName}</>}</p>
                )}
              </div>
              {!signed && esign !== "fallback" && esign !== "open" && esign !== "checking" && (
                <button className="ST-btn ST-pBtn" type="button" onClick={() => { setSigning(true); void openAgreement(); }} disabled={!ready || !name.trim() || esign === "loading"}>
                  {esign === "loading" ? "Opening…" : "Sign agreement"}
                </button>
              )}
              {!signed && esign === "fallback" && !signing && (
                <button className="ST-btn ST-pBtn" type="button" onClick={() => setSigning(true)}>Sign agreement</button>
              )}
            </div>
            {!signed && esign !== "fallback" && (
              <div className="ST-signFlow">
                {(esign === "open" || esign === "checking") && (
                  <div className="ST-row">
                    <span className="ST-hint" role="status">{esign === "checking" ? "Confirming your signature…" : "Check your name in the agreement, then sign."}</span>
                    <button className="ST-link" type="button" onClick={() => { setSigning(false); setEsign("idle"); }}>Not now</button>
                  </div>
                )}
                {esignMsg && <p className="ST-err" role="alert">{esignMsg}</p>}
                {SANDBOX && <p className="ST-testLine">Sandbox mode — this test document isn&apos;t legally binding.</p>}
                <div id="st-sign-frame" className={`ST-frame${esign === "open" && signing ? " is-open" : ""}`} />
              </div>
            )}
            {!signed && signing && esign === "fallback" && (
              <div className="ST-panel">
                <p>Read the full <a href="/rental-agreement" target="_blank" rel="noopener">rental agreement</a> (opens in a new tab). Signing isn&apos;t connected here, so this only records it in your browser.</p>
                <label className="ST-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read and agree to the rental agreement.</label>
                <label className="ST-field">Full legal name — exactly as it appears on your ID<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Full name" /></label>
                <div className="ST-row"><button className="ST-btn" type="button" onClick={sign} disabled={!agree || !name.trim()}>Sign agreement</button><button className="ST-link" type="button" onClick={() => setSigning(false)}>Not now</button></div>
              </div>
            )}
          </div>

          {/* Row 2: ID check (Stripe Identity). */}
          <div className={`ST-task ST-pRow${verified ? " is-done" : ""}`}>
            <div className="ST-pMain">
              <span className="ST-pIc" aria-hidden="true"><Ico d={verified ? I.check : I.id} size={26} /></span>
              <div className="ST-pText">
                <h3>Verify your identity</h3>
                {verified && <p className="ST-signedLine">Verified · {s.verifiedAt}</p>}
              </div>
              {!verified && idState !== "fallback" && idState !== "checking" && (
                <button className="ST-btn ST-pBtn" type="button" onClick={() => void startId()} disabled={!ready || idState === "loading"}>
                  {idState === "loading" ? "Opening…" : idState === "retry" ? "Try again" : "Verify identity"}
                </button>
              )}
            </div>
            {!verified && idState !== "fallback" && (idMsg || SANDBOX) && (
              <div className="ST-signFlow">
                {idMsg && <p className={idState === "checking" ? "ST-hint" : "ST-err"} role={idState === "checking" ? "status" : "alert"}>{idMsg}</p>}
                {SANDBOX && <p className="ST-testLine">Sandbox mode — Stripe test mode: no real ID needed, and you can choose the result.</p>}
              </div>
            )}
            {!verified && idState === "fallback" && idOpen && (
              <div className="ST-panel">
                <p>Stripe Identity isn&apos;t connected here yet, so this sandbox simulates the check. Your ID photos would go to Stripe; we never store them on this site.</p>
                <div className="ST-row"><button className="ST-btn" type="button" onClick={() => { save({ ...s, verifiedAt: nowText() }); setIdOpen(false); setIdState("idle"); }}>Simulate a successful check</button><button className="ST-link" type="button" onClick={() => { setIdOpen(false); setIdState("idle"); }}>Cancel</button></div>
              </div>
            )}
          </div>
          </>)}
        </section>
        )}

        {/* Step 3: arrival details, locked until both are done */}
        <section className={`ST-card${unlocked ? "" : " is-locked"}`} aria-labelledby="arrive-h">
          <div className="ST-cardHead">
            <h2 id="arrive-h">Get ready for arrival</h2>
            {!unlocked && <p className="ST-lockNote"><Ico d={I.lock} size={16} /> Unlocks after you sign and verify</p>}
          </div>
          {unlocked ? (
            <ul className="ST-info">
              <li><span className="ST-infoIc"><Ico d={I.pin} /></span><div><h3>Address</h3><p>Test address (the real one appears here)</p>
                {/* Oscar, Nov 17: Google Maps directions from wherever the guest is. Real stays link to the home's address
                    (sent from the server only after unlock); the test link goes to the neighborhood. */}
                <a className="ST-dir" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stay.home.neighborhood}, San Antonio, TX`)}`} target="_blank" rel="noopener"><Ico d={I.nav} size={16} /> Get directions</a>{SANDBOX && <span className="ST-testLine"> Test link goes to the neighborhood.</span>}</div></li>
              <li><span className="ST-infoIc"><Ico d={I.door} /></span><div><h3>Entry steps</h3><p>Self check-in with a door keypad. Step-by-step entry instructions appear here.</p></div></li>
              <li className="ST-code"><span className="ST-infoIc"><Ico d={I.wifi} /></span><div><h3>Wi-Fi</h3><p>{released ? "Network and password appear here (test)." : <>Arrives on check-in morning, {ciMorning}.</>}</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.car} /></span><div><h3>Parking</h3><p>Parking details for this home appear here.</p></div></li>
              <li className="ST-code"><span className="ST-infoIc"><Ico d={I.key} /></span><div><h3>Door code</h3><p>{released ? "Your door code appears here (test)." : <>Arrives on check-in morning, {ciMorning}.</>}</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.phone} /></span><div><h3>Urgent property contact</h3><p>Shown here for verified guests (test).</p></div></li>
            </ul>
          ) : (
            <ul className="ST-info ST-blur" aria-hidden="true">
              <li><span className="ST-infoIc"><Ico d={I.pin} /></span><div><h3>Address</h3><p>••••••••••••••</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.door} /></span><div><h3>Entry steps</h3><p>•••••••••••••••••••</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.wifi} /></span><div><h3>Wi-Fi</h3><p>••••••••••</p></div></li>
            </ul>
          )}
        </section>

        {/* Step 4: during the stay */}
        <section className="ST-card" aria-labelledby="know-h">
          <h2 id="know-h">House guide</h2>
          <p className="ST-dim">Everything you need during your stay: house rules, the washer, appliances, parking, trash and our favorite places nearby.</p>
          {/* Search (Oscar, Nov 17): filters topics and lines as you type; matching topics open, matches highlighted. */}
          <div className="ST-gSearch" role="search">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM20 20l-4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <input type="search" value={gq} onChange={(e) => setGq(e.target.value)} placeholder="Search the house guide" aria-label="Search the house guide" enterKeyHint="search" />
            {gq && <button type="button" className="ST-gClear" onClick={() => setGq("")} aria-label="Clear search">×</button>}
          </div>
          {gq.trim() && <p className="ST-dim ST-gCount" aria-live="polite">{guideHits.length ? `${guideHits.reduce((n, g) => n + g.items.length, 0)} result${guideHits.reduce((n, g) => n + g.items.length, 0) === 1 ? "" : "s"}` : <>No results for “{gq.trim()}”. <a href="#messages">Ask us</a> and we&apos;ll help.</>}</p>}
          {(gq.trim() ? guideHits : stay.thingsToKnow).map((g) => (
            <details key={g.title + (gq.trim() ? ":q" : "")} className="ST-know" open={gq.trim() ? true : g.title === "Check-in and check-out"}>
              <summary><span className="ST-kIc" aria-hidden="true"><Ico d={GUIDE_IC[g.title] ?? I.doc} size={20} /></span><span className="ST-kT">{hl(g.title)}</span></summary>
              <ul>{g.items.map((x) => <li key={x}>{hl(x)}</li>)}</ul>
            </details>
          ))}
          <p className="ST-dim ST-small">Cancellation terms: <a href="/policies/cancellation">cancellation policy</a> · <a href="/rental-agreement">rental agreement</a></p>
        </section>

        <section className="ST-card" id="messages" aria-labelledby="msg-h">
          <h2 id="msg-h">Messages</h2>
          <p className="ST-dim">Questions go straight to Oscar and Fernanda. We usually reply within an hour. For an emergency, call 911.</p>
          <ul className="ST-thread" aria-live="polite">
            {s.messages.length === 0 && <li className="ST-empty">No messages yet.</li>}
            {s.messages.map((m, i) => <li key={i} className="ST-msg"><p>{m.text}</p><span>{m.at}{SANDBOX ? " · sandbox, not sent" : ""}</span></li>)}
          </ul>
          <form className="ST-send" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label className="sr-only" htmlFor="st-msg">Message</label>
            <textarea id="st-msg" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message" />
            <button className="ST-btn" type="submit" disabled={!draft.trim()}>Send</button>
          </form>
        </section>

        {/* Test site only: walk through the whole flow in seconds (Oscar, Nov 17). */}
        {SANDBOX && (
          <section className="ST-testCtl" aria-label="Test controls">
            <p><b>Test controls</b> · test site only, never shown to guests</p>
            <div className="ST-row">
              <button className="ST-link" type="button" disabled={signed} onClick={() => save({ ...sRef.current, signedAt: nowText(), signedOn: new Date().toISOString(), signedName: stay.holder })}>Mark agreement signed</button>
              <button className="ST-link" type="button" disabled={verified} onClick={() => save({ ...sRef.current, verifiedAt: nowText() })}>Mark ID verified</button>
              <button className="ST-link" type="button" disabled={!!s.simDay} onClick={() => save({ ...sRef.current, simDay: "morning" })}>Jump to check-in morning</button>
              <button className="ST-link" type="button" disabled={s.simDay === "checkin"} onClick={() => save({ ...sRef.current, simDay: "checkin" })}>Jump to check-in time (4 PM)</button>
              <button className="ST-link" type="button" onClick={() => { save(fresh()); setAgree(false); setName(stay.holder); setEsign("idle"); setIdState("idle"); setIdMsg(""); setAllSetNow(false); scrollTo({ top: 0 }); }}>Reset sandbox</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
