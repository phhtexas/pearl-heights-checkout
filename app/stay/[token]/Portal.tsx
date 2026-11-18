"use client";
import { useEffect, useRef, useState } from "react";
import type { StayData } from "@/content/stayDemo";
import { loadStripe } from "@stripe/stripe-js";

/**
 * Guest portal, phase 1 (test data). Flow, matching the "Booking directly is simple" steps on All Homes F:
 *  1 Booked  ->  2 Confirm your reservation (sign agreement + verify ID by the deadline)
 *  ->  3 Get ready for arrival (address, entry steps, Wi-Fi unlock only after BOTH are done; door code on check-in morning)
 *  ->  4 Enjoy your stay (house rules, messages).
 * In this test version the state lives in this browser only (localStorage), and nothing is sent or charged.
 */
type State = { signedAt?: string; signedOn?: string; signedName?: string; signDoc?: string; pendingDoc?: { id: string }; pendingName?: string; nameEdited?: boolean; verifiedAt?: string; idSession?: string; messages: { from: "guest" | "note"; text: string; at: string }[] };
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
  id: "M3.5 6.5h17v11h-17zM8 10.5a1.8 1.8 0 1 0 0 .01M6 15c.5-1.3 1.2-2 2-2s1.5.7 2 2M13 10h5M13 13h4",
  lock: "M6.5 10.5h11v9h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  pin: "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  key: "M14.5 9.5a4 4 0 1 1-1.2-2.8M13.3 6.7 20 13.4l-2 2-1.5-1.5-1.5 1.5-1.5-1.5M7.5 9.5h.01",
  wifi: "M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19h.01",
  door: "M6 20.5V4h12v16.5M4 20.5h16M14.5 12.5h.01",
  car: "M5 16.5V12l2-5h10l2 5v4.5M5 16.5h14M7.5 16.5v2M16.5 16.5v2M5 12h14",
  chat: "M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
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
  const signed = !!s.signedAt, verified = !!s.verifiedAt, unlocked = signed && verified;
  const step = unlocked ? 3 : 2;
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
            <p className="ST-eyebrow">Your stay · {stay.code}</p>
            <h1 id="st-h">{stay.home.title}</h1>
            <p className="ST-dim">{stay.home.neighborhood}, San Antonio</p>
            <dl className="ST-facts">
              <div><dt>Check-in</dt><dd>{ci}<span>after 4:00 PM</span></dd></div>
              <div><dt>Check-out</dt><dd>{co}<span>by 10:00 AM</span></dd></div>
              <div><dt>Guests</dt><dd>{stay.guests.adults + stay.guests.children}<span>{stay.guests.adults} adults · {stay.guests.children} children</span></dd></div>
            </dl>
          </div>
        </section>

        {/* Progress, same 4 steps as All Homes F */}
        <ol className="ST-steps" aria-label="Your booking steps">
          {["Book your home", "Confirm your reservation", "Get ready for arrival", "Enjoy your stay"].map((t, i) => {
            const n = i + 1, done = n < step || (n === 1), now = n === step && !done;
            const sub = n === 2 && !unlocked && (signed || verified) ? "1 of 2 done" : "";
            return <li key={t} className={`${done ? "is-done" : now ? "is-now" : ""}${sub ? " is-half" : ""}`} aria-current={now ? "step" : undefined}><span className="ST-dot">{done ? <Ico d={I.check} size={14} /> : n}</span><span>{t}{sub && <small className="ST-sub">{sub}</small>}</span></li>;
          })}
        </ol>

        {/* Step 2: confirm */}
        <section className="ST-card" aria-labelledby="confirm-h">
          <div className="ST-cardHead">
            <h2 id="confirm-h">Confirm your reservation</h2>
            <p className={`ST-due${unlocked ? " is-ok" : ""}`}>{unlocked ? "All done" : <>Due by <b>{stay.deadlineText}</b></>}</p>
          </div>
          <p className="ST-dim">The reservation holder signs the rental agreement and verifies their ID. Each takes about 2 minutes.</p>

          <div className={`ST-task${signed ? " is-done" : ""}`}>
            <span className="ST-taskIc"><Ico d={signed ? I.check : I.pen} /></span>
            <div className="ST-taskBody">
              <h3>Rental agreement</h3>
              {signed ? (
                // Confirmation state (Oscar, Nov 17): check, signed date, download link.
                <div className="ST-signed" role="status">
                  <p className="ST-signedLine">Agreement signed — {signedDate(s.signedOn)}</p>
                  {s.signDoc
                    ? <a className="ST-dl" href={`/api/stay/${stay.token}/agreement/pdf?doc=${s.signDoc}`} target="_blank" rel="noopener">Download a copy (PDF)</a>
                    : <p className="ST-dim">Signed by {s.signedName}</p>}
                </div>
              ) : (
                <p className="ST-dim">Sign online — takes about 2 minutes.</p>
              )}
              {/* Oscar, Nov 17: one tap. "Review & sign" opens SignWell right away; the guest's full legal name is an
                  editable field inside the agreement, prefilled from the reservation (no name field on this page). */}
              {!signed && esign !== "fallback" && (
                <div className="ST-signFlow">
                  <p className="ST-copy">The agreement covers your reservation details, house rules, and cancellation terms. When you tap the button, it opens in a secure window from SignWell, our e-signature partner — no printing or downloads needed.</p>
                  {esign !== "open" && esign !== "checking" && (
                    <div className="ST-row">
                      <button className="ST-btn" type="button" onClick={() => { setSigning(true); void openAgreement(); }} disabled={!ready || !name.trim() || esign === "loading"}>
                        {esign === "loading" ? "Opening…" : "Review & sign"}
                      </button>
                    </div>
                  )}
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
          </div>

          <div className={`ST-task${verified ? " is-done" : ""}`}>
            <span className="ST-taskIc"><Ico d={verified ? I.check : I.id} /></span>
            <div className="ST-taskBody">
              <h3>ID check</h3>
              <p className="ST-dim">{verified ? `Verified · ${s.verifiedAt}` : "A quick photo of your ID and a selfie, handled securely by Stripe Identity."}</p>
              {!verified && idState !== "fallback" && (
                <>
                  {idState !== "checking" && (
                    <button className="ST-btn" type="button" onClick={() => void startId()} disabled={!ready || idState === "loading"}>
                      {idState === "loading" ? "Opening…" : idState === "retry" ? "Try again" : "Verify my ID"}
                    </button>
                  )}
                  {idMsg && <p className={idState === "checking" ? "ST-hint" : "ST-err"} role={idState === "checking" ? "status" : "alert"}>{idMsg}</p>}
                  {SANDBOX && <p className="ST-testLine">Sandbox mode — Stripe test mode: no real ID needed, and you can choose the result.</p>}
                </>
              )}
              {!verified && idState === "fallback" && idOpen && (
                <div className="ST-panel">
                  <p>Stripe Identity isn&apos;t connected here yet, so this sandbox simulates the check. Your ID photos would go to Stripe; we never store them on this site.</p>
                  <div className="ST-row"><button className="ST-btn" type="button" onClick={() => { save({ ...s, verifiedAt: nowText() }); setIdOpen(false); setIdState("idle"); }}>Simulate a successful check</button><button className="ST-link" type="button" onClick={() => { setIdOpen(false); setIdState("idle"); }}>Cancel</button></div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Step 3: arrival details, locked until both are done */}
        <section className={`ST-card${unlocked ? "" : " is-locked"}`} aria-labelledby="arrive-h">
          <div className="ST-cardHead">
            <h2 id="arrive-h">Get ready for arrival</h2>
            {!unlocked && <p className="ST-lockNote"><Ico d={I.lock} size={16} /> Unlocks after you sign and verify</p>}
          </div>
          {unlocked ? (
            <ul className="ST-info">
              <li><span className="ST-infoIc"><Ico d={I.pin} /></span><div><h3>Address</h3><p>Test address (the real one appears here)</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.door} /></span><div><h3>Entry steps</h3><p>Self check-in with a door keypad. Step-by-step entry instructions appear here.</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.wifi} /></span><div><h3>Wi-Fi</h3><p>Network and password appear here (test)</p></div></li>
              <li><span className="ST-infoIc"><Ico d={I.car} /></span><div><h3>Parking</h3><p>Parking details for this home appear here.</p></div></li>
              <li className="ST-code"><span className="ST-infoIc"><Ico d={I.key} /></span><div><h3>Door code</h3><p>Arrives on check-in morning, {ciMorning}.</p></div></li>
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
          <h2 id="know-h">Good to know</h2>
          {stay.thingsToKnow.map((g) => (
            <details key={g.title} className="ST-know" open={g.title === "Check-in and check-out"}>
              <summary>{g.title}</summary>
              <ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul>
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

        {SANDBOX && <p className="ST-reset"><button className="ST-link" type="button" onClick={() => { save(fresh()); setAgree(false); setName(stay.holder); setEsign("idle"); setIdState("idle"); setIdMsg(""); }}>Reset sandbox</button></p>}
      </main>
    </div>
  );
}
