"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StripeCard, type CreatePm } from "./StripeCard";
import { PROPERTIES } from "@/domain/properties";
import type { Quote } from "@/domain/quote";

/**
 * Direct checkout, layout "option E" (Oscar, Nov 15, 2026): the home arrives pre-selected (?home=claywell),
 * Review → Your details → Confirm and pay → booked. One page that becomes two columns on desktop.
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
const SIMS = [["none", "Everything works"], ["dates_taken", "Dates booked on Airbnb during checkout"], ["card_declined", "Card declined"], ["reservation_fails", "Hospitable reservation fails"], ["capture_fails", "Payment capture fails"]] as const;
const CARD_SIMS = ["card_declined", "capture_fails"];
const STEPS: [Step, string][] = [["review", "Review"], ["details", "Your details"], ["pay", "Confirm and pay"]];

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
  const [ready, setReady] = useState(false); // URL params applied
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [guest, setGuest] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [agreed, setAgreed] = useState(false);
  const [sim, setSim] = useState("none");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [cfg, setCfg] = useState<{ mode: string; publishableKey?: string }>({ mode: "loading" });
  const createPm = useRef<CreatePm | null>(null);
  const onCardReady = useCallback((fn: CreatePm | null) => { createPm.current = fn; }, []);
  const stripeMode = cfg.mode === "test" && !!cfg.publishableKey;
  const prop = PROPERTIES.find((p) => p.key === home)!;
  const guests = adults + children;

  // Pre-selected home and stay from the home's page: ?home=claywell&checkIn=2027-01-05&checkOut=2027-01-07&adults=4
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const h = q.get("home");
    if (h && PROPERTIES.some((p) => p.key === h)) setHome(h);
    const a = q.get("checkIn"), b = q.get("checkOut");
    if (a && b && /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && b > a) { setCi(a); setCo(b); setMonth(a.slice(0, 7)); }
    const n = Number(q.get("adults"));
    if (Number.isInteger(n) && n >= 1 && n <= 20) setAdults(n);
    setReady(true);
  }, []);
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => undefined); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setCal({ property: home, days: [] });
    fetch(`/api/calendar?property=${home}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!ctrl.signal.aborted && j.property === home) setCal({ property: home, days: j.days ?? [] }); })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [home, calVersion]);
  const days = cal.property === home ? cal.days : [];
  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);

  // No dates yet: open the calendar first.
  useEffect(() => { if (ready && !ci && !co && step === "review" && sheet === null) openDates(); }, [ready, ci, co]); // eslint-disable-line react-hooks/exhaustive-deps

  const getQuote = useCallback(async (payPlan: "full" | "split" = plan) => {
    if (!ci || !co) return;
    setErr(""); setQuoting(true);
    const r = await fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: home, checkIn: ci, checkOut: co, adults, children, infants, payPlan }) });
    const j = await r.json().catch(() => ({}));
    setQuoting(false);
    if (!r.ok) { setQuote(null); setErr(j.error ?? "We couldn't price these dates. Please try other dates."); return; }
    setQuote(j.quote); setQuoteId(j.quoteId); setExpiresAt(j.expiresAt);
    if (payPlan === "split" && !j.quote.splitPlan) setPlan("full");
  }, [ci, co, home, adults, children, infants, plan]);
  useEffect(() => { if (ci && co) void getQuote(); }, [ci, co, home, adults, children, infants]); // eslint-disable-line react-hooks/exhaustive-deps

  function choosePlan(p: "full" | "split") { if (p === plan) return; setPlan(p); void getQuote(p); }
  function openDates() { setDraft({ ci, co }); if (ci) setMonth(ci.slice(0, 7)); setSheet("dates"); }
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
    if (j.ok) { setResult(j); setStep("done"); return; }
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

  const left = Math.max(0, expiresAt - now);
  const lockText = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
  const detailsOk = guest.firstName.trim() && guest.lastName.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email) && guest.phone.replace(/\D/g, "").length >= 10;
  const folded = quote ? quote.lodging + quote.extraGuestFee + quote.cleaning + quote.protection : 0;
  const balance = quote?.plan.scheduled ? chargeDay(quote.plan.scheduled.chargeAt) : "";

  // Calendar rules: same-day cutoff and booked nights come from the server; minimum stay from Hospitable.
  const dayState = (iso: string) => {
    const d = byDate[iso];
    if (!d) return { ok: false, price: "" };
    const choosingCheckout = draft.ci && !draft.co && iso > draft.ci;
    if (choosingCheckout) {
      const start = byDate[draft.ci!];
      const min = start?.minStay ?? 2;
      // Every night between check-in and this check-out must be free, and the stay must meet the minimum.
      let free = true;
      for (let x = draft.ci!; x < iso; x = addDays(x, 1)) if (!byDate[x]?.available) { free = false; break; }
      const nights = Math.round((Date.parse(iso) - Date.parse(draft.ci!)) / 86_400_000);
      return { ok: free && nights >= min && !d.closedForCheckout, price: "" };
    }
    return { ok: d.available && !d.closedForCheckin, price: d.available ? "$" + Math.round(d.price / 100) : "" };
  };
  const draftMin = draft.ci ? byDate[draft.ci]?.minStay ?? 2 : 2;

  const summary = (
    <aside className="sum" aria-label="Your stay">
      <div className="photo" aria-hidden="true"><span>{prop.name}</span></div>
      <div className="sumBody">
        <div><div className="homeName">{prop.name}</div><div className="muted">{prop.area} · sleeps {prop.maxGuests} · direct booking</div></div>
        {ci && co && <div className="sumLine"><span>{fmtRange(ci, co)}</span><span>{guests} {guests === 1 ? "guest" : "guests"}</span></div>}
        {quote && (<div className="price">
          <div className="h3">Price details</div>
          <div className="ln"><span>{quote.nights} {quote.nights === 1 ? "night" : "nights"} × {money(Math.round(folded / quote.nights))}</span><span>{money(folded)}</span></div>
          <div className="ln"><span>Taxes</span><span>{money(quote.tax)}</span></div>
          <div className="ln total"><span>Total <u>USD</u></span><span>{money(quote.total)}</span></div>
          <button className="link tight" onClick={() => setSheet("breakdown")}>Price breakdown</button>
        </div>)}
        <div className="badges">
          <span><b>Book direct</b><br />with the hosts</span>
          <span><b>Secure payment</b><br />by Stripe</span>
          <span><b>Local hosts</b><br />usually reply in 1 hr</span>
        </div>
      </div>
    </aside>
  );

  const cancelLine = quote && (
    <section className="cancel">
      <span className={quote.nonRefundable ? "dot gray" : "dot"} aria-hidden="true">{quote.nonRefundable ? "i" : "✓"}</span>
      {quote.nonRefundable
        ? <div><b>Non-refundable</b><div className="muted">This reservation is non-refundable. <button className="link inline" onClick={() => setSheet("policy")}>Full policy</button></div></div>
        : <div><b className="green">Free cancellation</b><div className="muted">Cancel within 24 hours for a full refund. <button className="link inline" onClick={() => setSheet("policy")}>View policy</button></div></div>}
    </section>
  );

  return (
    <>
      <div className="testbar">
        <span>Test checkout · {stripeMode ? "Stripe test payments" : "fake payments"} · no real charges</span>
        <label>Home <select value={home} onChange={(e) => { setHome(e.target.value); setCi(null); setCo(null); setQuote(null); setStep("review"); }}>
          {PROPERTIES.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
        <button className="link" onClick={async () => { await fetch("/api/mock/reset", { method: "POST" }); restart(); }}>Reset</button>
      </div>

      <header className="top">
        <div className="brand">Pearl Heights <span>HOMES</span></div>
        {step !== "done" && <ol className="progress" aria-label="Checkout steps">
          {STEPS.map(([k, label], i) => {
            const idx = STEPS.findIndex(([s]) => s === step);
            return <li key={k} className={i < idx ? "past" : i === idx ? "now" : ""} aria-current={i === idx ? "step" : undefined}><span>{i + 1}</span>{label}</li>;
          })}
        </ol>}
      </header>

      {quote && step !== "done" && (
        <div className="lock" role="status">{left > 0
          ? <><span>Your price is locked for</span><b>{lockText}</b></>
          : <span>Price lock ended · we'll recheck the price</span>}</div>
      )}

      <div className="layout">
        <main className="flow">
          {step === "review" && (<>
            <h1>Review and continue</h1>
            <div className="mobileOnly">{summary}</div>
            <section className="trip">
              <h2>Your trip</h2>
              <div className="tripRow"><div><b>Dates</b><div className="muted">{ci && co ? fmtRange(ci, co) : "Choose your dates"}</div></div>
                <button className="chip" onClick={openDates}>{ci ? "Change" : "Choose"}</button></div>
              <div className="tripRow"><div><b>Guests</b><div className="muted">{guests} {guests === 1 ? "guest" : "guests"}{infants ? `, ${infants} ${infants === 1 ? "infant" : "infants"}` : ""}</div></div>
                <button className="chip" onClick={() => setSheet("guests")}>Change</button></div>
            </section>
            {quote && (<section className="plans">
              <h2>Choose when to pay</h2>
              <button className={"plan" + (!quote.plan.split ? " on" : "")} onClick={() => choosePlan("full")} aria-pressed={!quote.plan.split}>
                <span className="radio" /><span className="pt">Pay {money(quote.total)} now</span></button>
              {quote.splitPlan && (
                <button className={"plan" + (quote.plan.split ? " on" : "")} onClick={() => choosePlan("split")} aria-pressed={quote.plan.split} disabled={quoting}>
                  <span className="radio" />
                  <span className="grow"><span className="pt">Pay {money(quote.splitPlan.dueNow)} now, the rest later</span>
                    <span className="muted">Second {money(quote.splitPlan.scheduled!.amount)} auto-charged {chargeDay(quote.splitPlan.scheduled!.chargeAt)}</span></span>
                  <span className="pill">No interest</span>
                </button>)}
            </section>)}
            {cancelLine}
            {quoting && <div className="muted" role="status">Checking price and availability…</div>}
            {err && <div className="err" role="alert">{err}</div>}
            <button className="btn" disabled={!quote || quoting} onClick={() => setStep("details")}>Continue to your details</button>
          </>)}

          {step === "details" && (<>
            <button className="back" aria-label="Back" onClick={() => setStep("review")}>‹</button>
            <h1>Your details</h1>
            <p className="muted">The main guest must be 25 or older and stay at the home.</p>
            <div className="two">
              {(["firstName", "lastName"] as const).map((k) => (
                <label key={k}><span className="lbl">{k === "firstName" ? "First name" : "Last name"}</span>
                  <input className="f" autoComplete={k === "firstName" ? "given-name" : "family-name"} value={guest[k]} onChange={(e) => setGuest({ ...guest, [k]: e.target.value })} /></label>))}
            </div>
            <label><span className="lbl">Email</span><input className="f" type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></label>
            <label><span className="lbl">Mobile phone</span><input className="f" type="tel" autoComplete="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
            <div className="box">After payment you'll sign the rental agreement and verify your ID. The address, door code and Wi-Fi are sent once both are done.</div>
            <button className="btn" disabled={!detailsOk} onClick={() => setStep("pay")}>Continue to payment</button>
          </>)}

          {step === "pay" && quote && (<>
            <button className="back" aria-label="Back" onClick={() => setStep("details")}>‹</button>
            <h1>Confirm and pay</h1>
            <div className="card">
              <div className="ln"><span>{prop.name} · {fmtRange(ci!, co!)}</span></div>
              <div className="ln"><span>Total</span><b>{money(quote.total)}</b></div>
              <div className="ln"><span>Due today</span><b>{money(quote.plan.dueNow)}</b></div>
              {quote.plan.split && <div className="ln muted"><span>Charged {balance}</span><span>{money(quote.plan.scheduled!.amount)}</span></div>}
            </div>
            <div className="accept"><span className="lbl">We accept</span><span>Visa · Mastercard · American Express · Discover</span></div>
            {stripeMode
              ? <><StripeCard publishableKey={cfg.publishableKey!} amount={quote.plan.dueNow} saveForLater={quote.plan.split} onReady={onCardReady} />
                  <div className="muted">Test mode: card 4242 4242 4242 4242, any future date, any CVC. Decline: 4000 0000 0000 0002.</div></>
              : <div className="box sand">Stripe's secure card form goes here. In test mode nothing is charged.</div>}
            <label className="chk"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{quote.plan.split ? `I authorize Pearl Heights Homes to charge ${money(quote.plan.scheduled!.amount)} to this card on ${balance} at 4:00 PM CT, when flexible cancellation ends. ` : ""}
                I'm at least 25 and will stay at the home. I agree to the <a href="https://pearlheightshomes.com/terms-and-conditions/" target="_blank" rel="noreferrer">Terms</a>, <a href="https://pearlheightshomes.com/house-rules/" target="_blank" rel="noreferrer">House rules</a> and <button className="link inline" onClick={(e) => { e.preventDefault(); setSheet("policy"); }}>Cancellation policy</button>.</span></label>
            <label><span className="lbl">Test: simulate</span>
              <select className="f" value={sim} onChange={(e) => setSim(e.target.value)}>{SIMS.filter(([v]) => !(stripeMode && CARD_SIMS.includes(v))).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {err && <div className="err" role="alert">{err}</div>}
            {result && !result.ok && <div className="alert">{result.guestMessage}</div>}
            <button className="btn" disabled={!agreed || busy} onClick={pay}>{busy ? "Processing…" : `Confirm and pay ${money(quote.plan.dueNow)}`}</button>
          </>)}

          {step === "done" && result?.ok && (<>
            <div className="okmark" aria-hidden="true">✓</div>
            <h1>You're booked, {guest.firstName}!</h1>
            <div>{prop.name} · {fmtRange(ci!, co!)} · {guests} guests · Booking {result.bookingRef}</div>
            <div className="box warm">To keep your reservation, please finish two quick steps by <b>{result.verification.deadlineText}</b>: sign the rental agreement and verify your ID.</div>
            <div className="muted">Paid today: {money(quote!.plan.dueNow)}{quote!.plan.split ? ` · ${money(quote!.plan.scheduled!.amount)} on ${balance}` : ""}</div>
            <div className="muted">Test mode: no email is sent. Questions: <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a></div>
            <button className="btn ghost" onClick={restart}>Start another booking</button>
          </>)}
        </main>
        {step !== "done" && <div className="desktopOnly">{summary}{cancelLine && step !== "review" ? cancelLine : null}</div>}
      </div>

      {sheet && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={{ dates: "Change dates", guests: "Change guests", breakdown: "Price breakdown", policy: "Cancellation policy" }[sheet]}>
            <div className="sheetHead"><h2>{{ dates: "Change dates", guests: "Change guests", breakdown: "Price breakdown", policy: "Cancellation policy" }[sheet]}</h2>
              <button className="x" aria-label="Close" onClick={() => setSheet(null)}>×</button></div>

            {sheet === "dates" && (<>
              <div className="row"><button className="nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <b>{new Date(month + "-15T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" })}</b>
                <button className="nav" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button></div>
              <div className="grid">
                {"SMTWTFS".split("").map((d, i) => <div key={i} className="dow">{d}</div>)}
                {Array.from({ length: monthDays.pad }, (_, i) => <div key={"p" + i} />)}
                {monthDays.list.map((iso) => {
                  const s = dayState(iso);
                  const cls = "day" + (iso === draft.ci || iso === draft.co ? " sel" : draft.ci && draft.co && iso > draft.ci && iso < draft.co ? " in" : "");
                  return <button key={iso} className={cls} disabled={!s.ok} onClick={() => pickDay(iso)} aria-label={iso}>{Number(iso.slice(8))}<small>{s.price}</small></button>;
                })}
              </div>
              {days.length === 0 && <div className="muted" role="status">Loading availability and prices…</div>}
              <div className="muted">{draft.ci && draft.co ? fmtRange(draft.ci, draft.co) : draft.ci ? `Now choose check-out. Minimum stay: ${draftMin} nights.` : "Choose your check-in date."}</div>
              <button className="btn" disabled={!draft.ci || !draft.co} onClick={saveDates}>Save dates</button>
            </>)}

            {sheet === "guests" && (<>
              {([["Adults", "Ages 13+", adults, setAdults, 1], ["Children", "Ages 2–12", children, setChildren, 0], ["Infants", "Under 2, free", infants, setInfants, 0]] as const).map(([l, sub, v, set, min]) => (
                <div key={l} className="row gr"><div><b>{l}</b><div className="muted">{sub}</div></div><span className="stepper">
                  <button aria-label={"Fewer " + l} disabled={v <= min} onClick={() => set(v - 1)}>−</button><b>{v}</b>
                  <button aria-label={"More " + l} disabled={l === "Infants" ? v >= 6 : guests >= prop.maxGuests} onClick={() => set(v + 1)}>+</button></span></div>))}
              <div className="muted">{prop.name} sleeps {prop.maxGuests}.{guests > prop.extraGuestFrom ? ` Extra-guest fee ${money(prop.extraGuestFee)}/night for each guest over ${prop.extraGuestFrom}.` : ""}</div>
              <button className="btn" onClick={() => setSheet(null)}>Save guests</button>
            </>)}

            {sheet === "breakdown" && quote && (<>
              <div className="ln"><span>{quote.nights} nights</span><span>{money(quote.lodging)}</span></div>
              {quote.extraGuestFee > 0 && <div className="ln"><span>Extra guests</span><span>{money(quote.extraGuestFee)}</span></div>}
              <div className="ln"><span>Cleaning</span><span>{money(quote.cleaning)}</span></div>
              <div className="ln"><span>Damage waiver — $5,000 coverage<br /><a className="small" href="https://pearlheightshomes.com/damage-waiver-terms" target="_blank" rel="noreferrer">Waiver terms</a></span><span>{money(quote.protection)}</span></div>
              <div className="ln"><span>Taxes</span><span>{money(quote.tax)}</span></div>
              <div className="ln total"><span>Total USD</span><span>{money(quote.total)}</span></div>
            </>)}

            {sheet === "policy" && quote && (quote.nonRefundable
              ? <p>This stay starts within 7 days, so it is paid in full and non-refundable, including the damage waiver. If we cancel because the rental agreement and ID check aren't completed or don't match, everything you paid is refunded.</p>
              : <ul className="pol">
                  <li><b>Within 24 hours of booking:</b> everything back, no fee.</li>
                  <li><b>30 days or more before check-in:</b> everything back minus a 5% processing fee; any scheduled payment is cancelled.</li>
                  <li><b>14 to 29 days before:</b> 50% of the stay back.</li>
                  <li><b>Less than 14 days:</b> no refund except the damage waiver, refunded before check-in day.</li>
                  <li className="muted">All times are Central, measured against the 4:00 PM check-in.</li>
                </ul>)}
          </div>
        </div>
      )}
    </>
  );
}
