"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StripeCard, type CreatePm } from "./StripeCard";
import { PROPERTIES } from "@/domain/properties";
import { HOMES } from "@/content/homes";
import type { Quote } from "@/domain/quote";
import type { StayPolicy } from "@/domain/policy";

/**
 * Direct checkout, layout "option E" (Oscar, Nov 15, 2026). Phone follows the option E mockup element for element:
 * header (back · logo · "1 of 3"), price-lock bar, home card with Dates/Guests rows, pay choice, price details,
 * cancellation, trust badges, and a fixed footer with the labeled 3-step bar and the main button.
 * Desktop follows the option E desktop mockup: steps on the left, sticky price card on the right.
 */
type Day = { date: string; available: boolean; price: number; minStay: number; closedForCheckin?: boolean; closedForCheckout?: boolean };
type Step = "review" | "details" | "pay" | "done";
type Sheet = null | "dates" | "guests" | "breakdown" | "policy";

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDay = (iso: string, withYear = false) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
const fmtRange = (a: string, b: string) => `${fmtDay(a)} – ${fmtDay(b, true)}`;
const chargeDay = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const nightsOf = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const SIMS = [["none", "Everything works"], ["dates_taken", "Dates booked on Airbnb during checkout"], ["card_declined", "Card declined"], ["reservation_fails", "Hospitable reservation fails"], ["capture_fails", "Payment capture fails"]] as const;
const CARD_SIMS = ["card_declined", "capture_fails"];
const STEPS: [Step, string, string][] = [["review", "Review", "Review"], ["details", "Your details", "Your details"], ["pay", "Confirm and pay", "Payment"]];
const PHOTOS: Record<string, { src: string; alt: string }> = { claywell: { src: "/homes/claywell.jpg", alt: "The Claywell main bedroom with fireplace" } };

function Badges() {
  return (
    <div className="badges">
      <span><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9l7-5 7 5v7a1 1 0 0 1-1 1h-3v-4H7v4H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg><b>Book direct</b>with the hosts</span>
      <span><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg><b>Secure payment</b>by Stripe</span>
      <span><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10 6.5V10l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg><b>Local hosts</b>usually reply in 1 hr</span>
    </div>
  );
}

export default function Checkout() {
  const [home, setHome] = useState("claywell");
  const [step, setStep] = useState<Step>("review");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [cal, setCal] = useState<{ property: string; days: Day[] }>({ property: "", days: [] });
  const [calVersion, setCalVersion] = useState(0);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [ci, setCi] = useState<string | null>(null);
  const [co, setCo] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ ci: string | null; co: string | null }>({ ci: null, co: null });
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0), [infants, setInfants] = useState(0);
  const [plan, setPlan] = useState<"full" | "split">("full");
  const [ready, setReady] = useState(false);
  // Note 150: never paint a default home. Until the link's home/dates/guests are read (and, when the link has dates,
  // until the first price is back), show a neutral skeleton; then reveal the complete checkout at once.
  const [revealed, setRevealed] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [policy, setPolicy] = useState<StayPolicy | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [guest, setGuest] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [agreed, setAgreed] = useState(false);
  const [sim, setSim] = useState("none");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [fieldErr, setFieldErr] = useState<Partial<Record<"firstName" | "lastName" | "email" | "phone", string>>>({});
  const lastTotal = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [cfg, setCfg] = useState<{ mode: string; publishableKey?: string }>({ mode: "loading" });
  const createPm = useRef<CreatePm | null>(null);
  const onCardReady = useCallback((fn: CreatePm | null) => { createPm.current = fn; }, []);
  const stripeMode = cfg.mode === "test" && !!cfg.publishableKey;
  const prop = PROPERTIES.find((p) => p.key === home)!;
  const guests = adults + children;
  const listing = HOMES[home];
  const photo = listing?.photos[0]
    ? { src: `/_next/image?url=${encodeURIComponent(listing.photoBase + listing.photos[0].id + ".jpg")}&w=828&q=75`, alt: listing.photos[0].alt }
    : PHOTOS[home];
  const homeTitle = listing?.title ?? `${prop.name} — ${prop.area}`;

  // Pre-selected home and stay from the home's page: ?home=claywell&checkIn=2027-01-05&checkOut=2027-01-07&adults=4
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const h = q.get("home");
    if (h && PROPERTIES.some((p) => p.key === h)) setHome(h);
    const a = q.get("checkIn"), b = q.get("checkOut");
    if (a && b && /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && b > a) { setCi(a); setCo(b); setMonth(a.slice(0, 7)); }
    // Guest mix from the home's page (note 144): adults, children and infants arrive separately.
    const num = (k: string, min: number, max: number) => { const v = q.get(k); const n = Number(v); return v !== null && Number.isInteger(n) && n >= min && n <= max ? n : null; };
    const ad = num("adults", 1, 20), ch = num("children", 0, 20), inf = num("infants", 0, 6);
    if (ad !== null) setAdults(ad);
    if (ch !== null) setChildren(ch);
    if (inf !== null) setInfants(inf);
    setReady(true);
    if (!(a && b && b > a)) setRevealed(true); // no dates in the link: the date picker is the first thing to show
  }, []);
  useEffect(() => { if (!ready) return; const t = setTimeout(() => setRevealed(true), 8000); return () => clearTimeout(t); }, [ready]); // never stay hidden
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => undefined); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!ready) return; // don't fetch the default home's calendar before the link is read
    const ctrl = new AbortController();
    setCal({ property: home, days: [] });
    fetch(`/api/calendar?property=${home}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!ctrl.signal.aborted && j.property === home) setCal({ property: home, days: j.days ?? [] }); })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [home, calVersion, ready]);
  const days = cal.property === home ? cal.days : [];
  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);

  useEffect(() => { if (ready && !ci && !co && step === "review" && sheet === null) openDates(); }, [ready, ci, co]); // eslint-disable-line react-hooks/exhaustive-deps

  const getQuote = useCallback(async (payPlan: "full" | "split" = plan) => {
    if (!ci || !co) return;
    setErr(""); setQuoting(true);
    const r = await fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: home, checkIn: ci, checkOut: co, adults, children, infants, payPlan }) });
    const j = await r.json().catch(() => ({}));
    setQuoting(false);
    setRevealed(true);
    if (!r.ok) { setQuote(null); setErr(j.error ?? "We couldn't price these dates. Please try other dates."); return; }
    const prev = lastTotal.current;
    if (prev != null && prev !== j.quote.total) {
      setNotice(`Your total changed from ${money(prev)} to ${money(j.quote.total)}. Please review it before you pay.`);
      setAgreed(false); // a changed total needs fresh acceptance
    } else setNotice("");
    lastTotal.current = j.quote.total;
    setQuote(j.quote); setQuoteId(j.quoteId); setExpiresAt(j.expiresAt); setPolicy(j.policy ?? null);
    if (payPlan === "split" && !j.quote.splitPlan) setPlan("full");
  }, [ci, co, home, adults, children, infants, plan]);
  useEffect(() => { if (ci && co) void getQuote(); }, [ci, co, home, adults, children, infants]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sheets: focus moves in, Tab stays inside, Escape closes, focus returns to the button that opened it.
  useEffect(() => {
    if (!sheet) { opener.current?.focus?.(); return; }
    const el = sheetRef.current;
    el?.querySelector<HTMLElement>("button, [href], input, select")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSheet(null); return; }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select")];
      if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);
  const openSheet = (s: Exclude<Sheet, null>) => { opener.current = document.activeElement as HTMLElement; if (s === "dates") openDates(); else setSheet(s); };

  function choosePlan(p: "full" | "split") { if (p === plan && quote && quote.plan.split === (p === "split")) return; setPlan(p); void getQuote(p); }
  function openDates() { if (!opener.current) opener.current = document.activeElement as HTMLElement; setDraft({ ci, co }); if (ci) setMonth(ci.slice(0, 7)); setSheet("dates"); }
  function pickDay(iso: string) {
    if (!draft.ci || draft.co || iso <= draft.ci) { setDraft({ ci: iso, co: null }); return; }
    setDraft({ ci: draft.ci, co: iso });
  }
  function saveDates() { if (draft.ci && draft.co) { setCi(draft.ci); setCo(draft.co); setSheet(null); } }
  const shiftMonth = (k: number) => { const [y, m] = month.split("-").map(Number) as [number, number]; setMonth(new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7)); };
  const monthDays = useMemo(() => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const pad = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { pad, list: Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`) };
  }, [month]);

  async function pay() {
    if (!quote) return;
    if (now > expiresAt) { await getQuote(); setErr("Your price lock ended, so we rechecked the price. Please review your total."); return; }
    setErr(""); setBusy(true);
    let paymentMethodId: string | undefined;
    if (stripeMode) {
      if (!createPm.current) { setBusy(false); setErr("The payment form is still loading. Please try again."); return; }
      const pm = await createPm.current({ name: `${guest.firstName} ${guest.lastName}`.trim(), email: guest.email, phone: guest.phone });
      if (pm.error || !pm.id) { setBusy(false); setErr(pm.error ?? "Please check your card details."); return; }
      paymentMethodId = pm.id;
    }
    const r = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ property: home, checkIn: ci, checkOut: co, adults, children, infants, payPlan: quote.plan.split ? "split" : "full", guest, agreed, acceptedTotal: quote.total, quoteId, attemptKey: crypto.randomUUID(), simulate: sim, paymentMethodId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.reason === "quote_expired") { await getQuote(); setErr(j.guestMessage); return; }
    if (!r.ok) { setErr(j.error ?? j.guestMessage ?? "Something went wrong. No charge was made."); return; }
    if (j.ok) { setResult(j); setStep("done"); window.scrollTo(0, 0); return; }
    if (j.reason === "dates_taken") {
      setResult(null); setQuote(null); setCi(null); setCo(null); setStep("review"); setCalVersion((v) => v + 1);
      setErr(j.guestMessage + " Please choose new dates.");
      return;
    }
    setResult(j);
  }

  function restart() {
    setStep("review"); setCi(null); setCo(null); setQuote(null); setResult(null); setErr(""); setAgreed(false); setPlan("full");
    setGuest({ firstName: "", lastName: "", email: "", phone: "" }); setCalVersion((v) => v + 1);
  }
  function submitDetails() {
    const e: typeof fieldErr = {};
    if (!guest.firstName.trim()) e.firstName = "Enter your first name.";
    if (!guest.lastName.trim()) e.lastName = "Enter your last name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email)) e.email = "Enter a valid email so we can send your confirmation.";
    if (guest.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a mobile number with area code.";
    setFieldErr(e);
    if (Object.keys(e).length) { setTimeout(() => document.getElementById("errsum")?.focus(), 0); return; }
    go("pay");
  }
  const go = (s: Step) => { setErr(""); setStep(s); window.scrollTo(0, 0); };

  const left = Math.max(0, expiresAt - now);
  const lockMin = Math.ceil(left / 60000);
  const lockAnnounce = left <= 0 ? "Your price lock ended. We'll recheck the price before you pay." : lockMin === 5 || lockMin === 1 ? `${lockMin} ${lockMin === 1 ? "minute" : "minutes"} left on your price lock.` : "";
  const lockText = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
  const folded = quote ? quote.lodging + quote.extraGuestFee + quote.cleaning + quote.protection : 0;
  const balance = quote?.plan.scheduled ? chargeDay(quote.plan.scheduled.chargeAt) : "";
  const stepIdx = STEPS.findIndex(([s]) => s === step);
  // Verification window: 24 hours when booked 48+ hours before check-in, otherwise 2 hours (Terms section 1).
  const deadlineWindow = ci && Date.parse(ci + "T22:00:00Z") - now >= 48 * 3_600_000 ? "24 hours" : "2 hours";

  // The one main action per step (fixed footer on phones, inline on desktop).
  const primary = step === "review" ? { label: "Continue to your details", disabled: !quote || quoting, run: () => go("details") }
    : step === "details" ? { label: "Continue to payment", disabled: false, run: submitDetails }
    : step === "pay" && quote ? { label: busy ? "Processing…" : `Confirm and pay ${money(quote.plan.dueNow)}`, disabled: !agreed || busy, run: pay }
    : null;

  const dayState = (iso: string) => {
    const d = byDate[iso];
    if (!d) return { ok: false, price: "" };
    if (draft.ci && !draft.co && iso > draft.ci) {
      const min = byDate[draft.ci]?.minStay ?? 2;
      let free = true;
      for (let x = draft.ci; x < iso; x = addDays(x, 1)) if (!byDate[x]?.available) { free = false; break; }
      return { ok: free && nightsOf(draft.ci, iso) >= min && !d.closedForCheckout, price: "" };
    }
    return { ok: d.available && !d.closedForCheckin, price: d.available ? "$" + Math.round(d.price / 100) : "" };
  };
  const draftMin = draft.ci ? byDate[draft.ci]?.minStay ?? 2 : byDate[days.find((d) => d.available)?.date ?? ""]?.minStay ?? 2;

  const photoEl = (h: number) => photo
    ? <img className="photoImg" src={photo.src} alt={photo.alt} style={{ height: h }} />
    : <div className="photo" style={{ height: h }} aria-hidden="true"><span>{prop.name}</span></div>;

  const priceRows = quote && (<>
    <div className="ln"><span>{quote.nights} {quote.nights === 1 ? "night" : "nights"} × {money(Math.round(folded / quote.nights))}</span><span>{money(folded)}</span></div>
    <div className="ln"><span>Taxes</span><span>{money(quote.tax)}</span></div>
    <div className="ln total"><span>Total <u>USD</u></span><span>{money(quote.total)}</span></div>
    <button className="link tight" onClick={() => openSheet("breakdown")}>Price breakdown</button>
  </>);

  const cancelLine = quote && (
    <section className="cancel">
      <span className={quote.nonRefundable ? "dot gray" : "dot"} aria-hidden="true">{quote.nonRefundable ? "i" : "✓"}</span>
      {quote.nonRefundable
        ? <div><b>Non-refundable</b><div className="sub">This reservation is non-refundable. <button className="link inline" onClick={() => openSheet("policy")}>Full policy</button></div></div>
        : <div><b className="green">Free cancellation</b><div className="sub">Cancel within 24 hours for a full refund. <button className="link inline" onClick={() => openSheet("policy")}>View policy</button></div></div>}
    </section>
  );

  // Desktop right column (option E desktop mockup).
  const aside = (
    <aside className="sum" aria-label="Your stay">
      {photoEl(190)}
      <div className="sumBody">
        <div><div className="homeName">{homeTitle}</div><div className="muted">Entire home · sleeps {prop.maxGuests} · direct booking</div></div>
        {step !== "review" && ci && co && <div className="sumLine"><span>{fmtRange(ci, co)}</span><span>{guests} {guests === 1 ? "guest" : "guests"}</span></div>}
        {quote && <div className="price"><div className="h3">Price details</div>{priceRows}</div>}
        <Badges />
      </div>
    </aside>
  );


  if (!ready || !revealed) return (
    <div className="ck" aria-busy="true">
      <div className="testbar"><span>Test checkout · no real charges</span></div>
      <header className="top"><span className="hdrSide" /><span className="brand">Pearl Heights <span>HOMES</span></span><span className="hdrSide" /></header>
      <main className="layout" aria-label="Loading your stay">
        <p className="sr" role="status">Loading your stay…</p>
        <div className="flow" aria-hidden="true">
          <div className="skel skelH1" />
          <div className="skel skelCard" />
          <div className="skel skelLine" /><div className="skel skelLine short" />
          <div className="skel skelPlan" /><div className="skel skelPlan" />
        </div>
      </main>
    </div>
  );

  return (
    <div className="ck">
      <div className="testbar">
        <span>Test checkout · {stripeMode ? "Stripe test payments" : "fake payments"} · no real charges</span>
        <label>Home <select value={home} onChange={(e) => { setHome(e.target.value); setCi(null); setCo(null); setQuote(null); setStep("review"); }}>
          {PROPERTIES.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
        <button className="link" onClick={async () => { await fetch("/api/mock/reset", { method: "POST" }); restart(); }}>Reset</button>
      </div>

      <header className="top">
        <span className="mobileOnly hdrSide">{(step === "details" || step === "pay") &&
          <button className="back" aria-label="Back" onClick={() => go(step === "pay" ? "details" : "review")}>‹</button>}</span>
        <div className="brand">Pearl Heights <span>HOMES</span></div>
        <span className="mobileOnly hdrSide stepOf">{step !== "done" ? `${stepIdx + 1} of 3` : ""}</span>
        {step !== "done" && <ol className="progress desktopOnlyFlex" aria-label="Checkout steps">
          {STEPS.map(([k, label], i) => <li key={k} className={i < stepIdx ? "past" : i === stepIdx ? "now" : ""} aria-current={i === stepIdx ? "step" : undefined}><span>{i + 1}</span>{label}</li>)}
        </ol>}
      </header>

      {quote && step !== "done" && (
        <div className="lock">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.5V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          {left > 0 ? <><span>Your price is locked for</span><b aria-hidden="true">{lockText}</b><span className="sr">{Math.ceil(left / 60000)} minutes</span></> : <span>Price lock ended · we'll recheck the price</span>}
        </div>
      )}

      <div className="sr" aria-live="polite">{quote && step !== "done" ? lockAnnounce : ""}</div>
      <div className={"layout" + (step === "done" ? " single" : "")}>
        <main className="flow">
          {step === "review" && (<>
            <h1>Review and continue</h1>

            {/* Phone: home card with Dates and Guests rows (option E). */}
            <section className="homeCard mobileOnly">
              {photoEl(172)}
              <div className="hcHead"><div className="homeName">{homeTitle}</div><div className="muted">Entire home · sleeps {prop.maxGuests} · direct booking</div></div>
              <div className="hcRow"><div><div className="cap">Dates</div><div className="val">{ci && co ? fmtRange(ci, co) : "Choose your dates"}</div>{ci && co && <div className="muted">{nightsOf(ci, co)} {nightsOf(ci, co) === 1 ? "night" : "nights"}</div>}</div>
                <button className="chip" aria-label="Change dates" onClick={() => openSheet("dates")}>{ci ? "Change" : "Choose"}</button></div>
              <div className="hcRow"><div><div className="cap">Guests</div><div className="val">{guests} {guests === 1 ? "guest" : "guests"}{infants ? `, ${infants} ${infants === 1 ? "infant" : "infants"}` : ""}</div></div>
                <button className="chip" aria-label="Change guests" onClick={() => openSheet("guests")}>Change</button></div>
            </section>

            {/* Desktop: Your trip rows (option E desktop). */}
            <section className="trip desktopOnly">
              <h2>Your trip</h2>
              <div className="tripRow"><div><b>Dates</b><div className="muted">{ci && co ? fmtRange(ci, co) : "Choose your dates"}</div></div>
                <button className="chip" onClick={() => openSheet("dates")}>{ci ? "Change" : "Choose"}</button></div>
              <div className="tripRow"><div><b>Guests</b><div className="muted">{guests} {guests === 1 ? "guest" : "guests"}{infants ? `, ${infants} ${infants === 1 ? "infant" : "infants"}` : ""}</div></div>
                <button className="chip" onClick={() => openSheet("guests")}>Change</button></div>
            </section>

            {quote && (<section className="plans">
              <h2>Choose when to pay</h2>
              <button className={"plan" + (!quote.plan.split ? " on" : "")} onClick={() => choosePlan("full")} aria-pressed={!quote.plan.split}>
                <span className="radio" /><span className="pt">Pay {money(quote.total)} now</span></button>
              {quote.splitPlan && (
                <button className={"plan tall" + (quote.plan.split ? " on" : "")} onClick={() => choosePlan("split")} aria-pressed={quote.plan.split} disabled={quoting}>
                  <span className="radio" />
                  <span className="grow"><span className="pt">Pay {money(quote.splitPlan.dueNow)} now, the rest later</span>
                    <span className="sub14">Second {money(quote.splitPlan.scheduled!.amount)} auto-charged {chargeDay(quote.splitPlan.scheduled!.chargeAt)}</span></span>
                  <span className="pill">No interest</span>
                </button>)}
            </section>)}

            {quote && <section className="priceSec mobileOnly"><h2>Price details</h2>{priceRows}</section>}
            {notice && <div className="notice" role="status">{notice}</div>}
            {cancelLine}
            <div className="mobileOnly"><Badges /></div>
            {quoting && <div className="muted" role="status">Checking price and availability…</div>}
          </>)}

          {step === "details" && (<>
            <button className="back desktopOnly" aria-label="Back" onClick={() => go("review")}>‹</button>
            <h1>Your details</h1>
            <div className="muted">The person booking must be 25 or older and stay at the home.</div>
            {Object.keys(fieldErr).length > 0 && <div id="errsum" className="alert" tabIndex={-1} role="alert">Please fix {Object.keys(fieldErr).length === 1 ? "this" : "these"}: {Object.values(fieldErr).join(" ")}</div>}
            {([["firstName", "First name", "given-name", "text"], ["lastName", "Last name", "family-name", "text"], ["email", "Email", "email", "email"], ["phone", "Mobile phone", "tel", "tel"]] as const).map(([k, label, ac, type]) => (
              <label key={k} className="fld"><span className="lbl">{label}</span>
                <input className={"f" + (fieldErr[k] ? " bad" : "")} type={type} autoComplete={ac} value={guest[k]} aria-invalid={!!fieldErr[k]} aria-describedby={fieldErr[k] ? k + "-err" : undefined}
                  onChange={(e) => { setGuest({ ...guest, [k]: e.target.value }); if (fieldErr[k]) setFieldErr({ ...fieldErr, [k]: undefined }); }} />
                {fieldErr[k] && <span id={k + "-err"} className="err">{fieldErr[k]}</span>}</label>))}
            <div className="muted">We use your phone for your stay details. Your private stay link is emailed after booking.</div>
          </>)}

          {step === "pay" && quote && (<>
            <button className="back desktopOnly" aria-label="Back" onClick={() => go("details")}>‹</button>
            <h1>Confirm and pay</h1>
            {notice && <div className="notice" role="status">{notice}</div>}
            <div className="card">
              <div className="ln"><span>{prop.name} · {fmtRange(ci!, co!)}</span></div>
              <div className="ln"><span>Total</span><b>{money(quote.total)}</b></div>
              <div className="ln"><span>Due today</span><b>{money(quote.plan.dueNow)}</b></div>
              {quote.plan.split && <div className="ln muted"><span>Charged {balance}</span><span>{money(quote.plan.scheduled!.amount)}</span></div>}
            </div>
            <div className="accept"><div className="cap">We accept</div>
              <div className="brands" aria-label="Accepted cards"><span className="visa">VISA</span><span>Mastercard</span><span>Amex</span><span>Discover</span></div></div>
            {stripeMode
              ? <><StripeCard publishableKey={cfg.publishableKey!} amount={quote.plan.dueNow} saveForLater={quote.plan.split} onReady={onCardReady} />
                  <div className="muted">Test mode: card 4242 4242 4242 4242, any future date, any CVC. Decline: 4000 0000 0000 0002.</div></>
              : <div className="cardForm">Secure card form (Stripe) appears here</div>}
            
            <div className="muted small">After paying, you'll sign the rental agreement and verify your ID within {deadlineWindow}.</div>
            <label className="fld"><span className="lbl">Test: simulate</span>
              <select className="f" value={sim} onChange={(e) => setSim(e.target.value)}>{SIMS.filter(([v]) => !(stripeMode && CARD_SIMS.includes(v))).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {result && !result.ok && <div className="alert">{result.guestMessage}</div>}
            <label className="chk"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{quote.plan.split ? `I authorize Pearl Heights Homes to charge ${money(quote.plan.scheduled!.amount)} to this card on ${balance} at 4:00 PM CT, when flexible cancellation ends. ` : ""}
                I'm at least 25 and will stay at the home. I agree to the <a href="https://pearlheightshomes.com/terms-and-conditions/" target="_blank" rel="noreferrer">Terms</a>, <a href="https://pearlheightshomes.com/house-rules/" target="_blank" rel="noreferrer">House rules</a> and <button className="link inline" onClick={(e) => { e.preventDefault(); openSheet("policy"); }}>Cancellation policy</button>.</span></label>
          </>)}

          {step === "done" && result?.ok && (<>
            <div className="okmark" aria-hidden="true">✓</div>
            <h1>You're booked, {guest.firstName}!</h1>
            <div>{prop.name} · {fmtRange(ci!, co!)} · {guests} {guests === 1 ? "guest" : "guests"} · Booking {result.bookingRef}</div>
            <div className="box warm">To keep your reservation, please finish two quick steps by <b>{result.verification.deadlineText}</b>: sign the rental agreement and verify your ID.</div>
            <div className="muted">Paid today: {money(quote!.plan.dueNow)}{quote!.plan.split ? ` · ${money(quote!.plan.scheduled!.amount)} on ${balance}` : ""}</div>
            <div className="muted">Test mode: no email is sent. Questions: <a href="mailto:bookings@thepearlheightshomes.com">bookings@thepearlheightshomes.com</a></div>
            <button className="btn ghost" onClick={restart}>Start another booking</button>
          </>)}

          {err && <div className="err" role="alert">{err}</div>}
          {primary && <button className="btn desktopOnly" disabled={primary.disabled} onClick={primary.run}>{primary.label}</button>}
        </main>
        {step !== "done" && <div className="side desktopOnly">{aside}</div>}
      </div>

      {primary && (
        <footer className="foot mobileOnly">
          <ol className="bars" aria-label="Checkout progress">
            {STEPS.map(([k, , short], i) => <li key={k} className={i <= stepIdx ? "on" : ""} aria-current={i === stepIdx ? "step" : undefined}><i aria-hidden="true" /><span>{i + 1} {short}</span></li>)}
          </ol>
          <button className="btn" disabled={primary.disabled} onClick={primary.run}>{primary.label}</button>
        </footer>
      )}

      {sheet && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={{ dates: "Change dates", guests: "Change guests", breakdown: "Price breakdown", policy: "Cancellation policy" }[sheet]}>
            <div className="sheetHead"><h2>{{ dates: "Change dates", guests: "Change guests", breakdown: "Price breakdown", policy: "Cancellation policy" }[sheet]}</h2>
              <button className="x" aria-label="Close" onClick={() => setSheet(null)}>×</button></div>

            {sheet === "dates" && (<>
              <div className="row"><button className="nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <div className="center"><b>{new Date(month + "-15T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" })}</b><div className="muted small">{draftMin}-night minimum</div></div>
                <button className="nav" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button></div>
              <div className="grid">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} className="dow">{d}</div>)}
                {Array.from({ length: monthDays.pad }, (_, i) => <div key={"p" + i} />)}
                {monthDays.list.map((iso) => {
                  const s = dayState(iso);
                  const cls = "day" + (iso === draft.ci || iso === draft.co ? " sel" : draft.ci && draft.co && iso > draft.ci && iso < draft.co ? " in" : "");
                  const why = !byDate[iso] ? "not available" : draft.ci && !draft.co && iso > draft.ci && !s.ok ? "not available as check-out (booked night or under the minimum stay)" : !s.ok ? "booked or not available for check-in" : s.price ? s.price + " per night" : "available";
                  return <button key={iso} className={cls} disabled={!s.ok} onClick={() => pickDay(iso)} aria-label={`${fmtDay(iso, true)}, ${why}`} aria-pressed={iso === draft.ci || iso === draft.co}>{Number(iso.slice(8))}<small>{s.price}</small></button>;
                })}
              </div>
              {days.length === 0 && <div className="muted" role="status">Loading availability and prices…</div>}
              <div className="hint">{draft.ci && draft.co ? `${fmtRange(draft.ci, draft.co)} · ${nightsOf(draft.ci, draft.co)} nights` : draft.ci ? "Now choose your check-out date." : "Choose your check-in date."}</div>
              <div className="muted small">Crossed-out days are already booked or not available for check-in. The minimum stay comes from each home's settings.</div>
              <button className="btn" disabled={!draft.ci || !draft.co} onClick={saveDates}>Save dates</button>
            </>)}

            {sheet === "guests" && (<>
              {([["Adults", "Ages 13+", adults, setAdults, 1], ["Children", "Ages 2–12", children, setChildren, 0], ["Infants", "Under 2", infants, setInfants, 0]] as const).map(([l, sub, v, set, min]) => (
                <div key={l} className="row gr"><div><b>{l}</b><div className="muted">{sub}</div></div><span className="stepper">
                  <button aria-label={"Fewer " + l} disabled={v <= min} onClick={() => set(v - 1)}>−</button><b>{v}</b>
                  <button aria-label={"More " + l} disabled={l === "Infants" ? v >= 6 : guests >= prop.maxGuests} onClick={() => set(v + 1)}>+</button></span></div>))}
              <div className="muted">Sleeps {prop.maxGuests}. Infants don't count toward the limit.{guests > prop.extraGuestFrom ? ` Extra-guest fee ${money(prop.extraGuestFee)}/night for each guest over ${prop.extraGuestFrom}.` : ""}</div>
              <button className="btn" onClick={() => setSheet(null)}>Save guests</button>
            </>)}

            {sheet === "breakdown" && quote && (<>
              <div className="ln"><span>{quote.nights} nights</span><span>{money(quote.lodging)}</span></div>
              {quote.extraGuestFee > 0 && <div className="ln"><span>Extra guests</span><span>{money(quote.extraGuestFee)}</span></div>}
              <div className="ln"><span>Cleaning</span><span>{money(quote.cleaning)}</span></div>
              <div className="ln"><span>Damage waiver — $5,000 coverage</span><span>{money(quote.protection)}</span></div>
              <div className="ln"><span>Taxes</span><span>{money(quote.tax)}</span></div>
              <div className="ln total"><span>Total (USD)</span><span>{money(quote.total)}</span></div>
              <div className="muted small">Damage waiver — $5,000 coverage: covers accidental damage during your stay, as described in the <a href="https://pearlheightshomes.com/damage-waiver-terms" target="_blank" rel="noreferrer">waiver terms and conditions</a>.</div>
              <div className="muted small">Tax shown is an example rate until confirmed by our accountant.</div>
              <button className="btn ghost" onClick={() => setSheet(null)}>Close</button>
            </>)}

            {sheet === "policy" && policy && (<>
              {/* Generated by the server from the same rules as the refund math (src/domain/policy.ts). */}
              <ul className="pol">
                {policy.rows.map((row) => (
                  <li key={row.tier}><b>{row.when}{row.untilText ? ` (until ${row.untilText})` : ""}:</b> {row.outcome}</li>))}
              </ul>
              {policy.footer.map((f) => <p key={f} className="muted small">{f}</p>)}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
