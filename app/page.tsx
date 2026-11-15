"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StripeCard, type CreatePm } from "./StripeCard";
import { PROPERTIES } from "@/domain/properties";
import type { Quote } from "@/domain/quote";
import { formatChicagoDate } from "@/domain/time";

type Day = { date: string; available: boolean; price: number; minStay: number };
const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const SIMS = [["none", "Everything works"], ["dates_taken", "Dates booked on Airbnb during checkout"], ["card_declined", "Card declined"], ["reservation_fails", "Hospitable reservation fails"], ["capture_fails", "Payment capture fails"]] as const;
const CARD_SIMS = ["card_declined", "capture_fails"]; // in Stripe test mode, use Stripe's test cards instead

export default function Checkout() {
  const [step, setStep] = useState<"stay" | "total" | "pay" | "done">("stay");
  const [home, setHome] = useState("edgewood");
  // Calendar is tagged with the property it belongs to, so another home's prices can never render (ChatGPT note 76).
  const [cal, setCal] = useState<{ property: string; days: Day[] }>({ property: "", days: [] });
  const [calVersion, setCalVersion] = useState(0);
  const reloadCalendar = () => setCalVersion((v) => v + 1);
  const [month, setMonth] = useState("2026-12");
  const [ci, setCi] = useState<string | null>(null);
  const [co, setCo] = useState<string | null>(null);
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0), [infants, setInfants] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteId, setQuoteId] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [guest, setGuest] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [agreed, setAgreed] = useState(false);
  const [sim, setSim] = useState("none");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resent, setResent] = useState(false);
  const [cfg, setCfg] = useState<{ mode: string; publishableKey?: string }>({ mode: "loading" });
  const createPm = useRef<CreatePm | null>(null);
  const onCardReady = useCallback((fn: CreatePm | null) => { createPm.current = fn; }, []);
  const stripeMode = cfg.mode === "test" && !!cfg.publishableKey;
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => undefined); }, []);
  const prop = PROPERTIES.find((p) => p.key === home)!;

  useEffect(() => {
    const ctrl = new AbortController();
    setCal({ property: home, days: [] });
    fetch(`/api/calendar?property=${home}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!ctrl.signal.aborted && j.property === home) setCal({ property: home, days: j.days ?? [] }); })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [home, calVersion, result]);
  const days = cal.property === home ? cal.days : [];
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);
  const monthDays = useMemo(() => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { pad: first, list: Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`) };
  }, [month]);
  const shiftMonth = (k: number) => { const [y, m] = month.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + k, 1)); setMonth(d.toISOString().slice(0, 7)); };

  function pick(iso: string) {
    setErr("");
    if (!ci || co || iso <= ci) { setCi(iso); setCo(null); return; }
    setCo(iso);
  }
  async function getQuote() {
    setErr(""); setBusy(true);
    const r = await fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: home, checkIn: ci, checkOut: co, adults, children, infants }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error); return; }
    setQuote(j.quote); setQuoteId(j.quoteId); setExpiresAt(j.expiresAt); setStep("total");
  }
  async function pay() {
    if (now > expiresAt) { await getQuote(); setErr("Your price hold expired, so we rechecked the price. Please review your total."); return; }
    setErr(""); setBusy(true);
    let paymentMethodId: string | undefined;
    if (stripeMode) {
      if (!createPm.current) { setBusy(false); setErr("The payment form is still loading. Please try again."); return; }
      const pm = await createPm.current({ name: `${guest.firstName} ${guest.lastName}`.trim(), email: guest.email, phone: guest.phone });
      if (pm.error || !pm.id) { setBusy(false); setErr(pm.error ?? "Please check your card details."); return; }
      paymentMethodId = pm.id;
    }
    const r = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ property: home, checkIn: ci, checkOut: co, adults, children, infants, guest, agreed, acceptedTotal: quote!.total, quoteId, attemptKey: crypto.randomUUID(), simulate: sim, paymentMethodId }) });
    const j = await r.json(); setBusy(false);
    if (j.reason === "quote_expired") { await getQuote(); setErr(j.guestMessage); return; }
    if (!r.ok) { setErr(j.error ?? j.guestMessage ?? "Something went wrong. No charge was made."); return; }
    if (j.ok) { setResult(j); setStep("done"); return; }
    if (j.reason === "dates_taken") {
      // Back to date selection with fresh availability; nothing was charged or booked.
      setResult(null); setQuote(null); setCi(null); setCo(null); setStep("stay");
      reloadCalendar();
      setErr(j.guestMessage + " Please choose new dates.");
      return;
    }
    setResult(j);
  }
  const left = Math.max(0, expiresAt - now);
  const timer = `Price held for ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
  const total = guestsCount(adults, children);

  return (
    <>
      <div className="banner">{cfg.mode === "loading" ? "Test checkout · no real charges" : stripeMode ? "Test checkout · Stripe test payments · fake bookings · no real charges" : "Test checkout · fake payments and bookings · no real charges"} ·{" "}
        <button className="linkish" onClick={async () => { await fetch("/api/mock/reset", { method: "POST" }); setStep("stay"); setCi(null); setCo(null); setQuote(null); setResult(null); setErr(""); reloadCalendar(); }}>Reset my test bookings</button></div>
      <main className="phone">
        <div className="head">
          <div className="brand">Pearl Heights Homes</div>
          <div className="muted">Book direct with Oscar &amp; Fernanda. Your total, upfront.</div>
        </div>
        <div className="body">
          {step === "stay" && (<>
            <h2>Plan your stay</h2>
            <div className="lbl">Home</div>
            {PROPERTIES.map((p) => (
              <button key={p.key} className="opt" aria-pressed={home === p.key} onClick={() => { setHome(p.key); setCi(null); setCo(null); }}>
                <b>{p.name}</b><br /><span className="muted">{p.area} · sleeps {p.maxGuests}</span>
              </button>))}
            <div className="lbl">Dates</div>
            <div className="row"><button className="nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
              <b>{new Date(month + "-15T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
              <button className="nav" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button></div>
            <div className="grid">
              {"SMTWTFS".split("").map((d, i) => <div key={i} className="muted" style={{ textAlign: "center" }}>{d}</div>)}
              {Array.from({ length: monthDays.pad }, (_, i) => <div key={"p" + i} />)}
              {monthDays.list.map((iso) => {
                const d = byDate[iso];
                const asCheckout = ci && !co && iso > ci && d;
                const ok = !!d && (d.available || !!asCheckout);
                const cls = "day" + (iso === ci || iso === co ? " sel" : ci && co && iso > ci && iso < co ? " in" : "");
                return <button key={iso} className={cls} disabled={!ok} onClick={() => pick(iso)} aria-label={iso}>{Number(iso.slice(8))}<small>{d?.available ? "$" + d.price / 100 : ""}</small></button>;
              })}
            </div>
            {days.length === 0 && <div className="muted" role="status">Loading availability and prices…</div>}
            <div className="muted">{ci && co ? `${fmt(ci)} → ${fmt(co)}` : ci ? "Now choose your check-out date." : "Choose your check-in date."}</div>
            <div className="lbl">Guests</div>
            {([["Adults", adults, setAdults, 1], ["Children (2-12)", children, setChildren, 0], ["Infants (free)", infants, setInfants, 0]] as const).map(([l, v, set, min]) => (
              <div key={l} className="row"><span>{l}</span><span className="step">
                <button aria-label={"Fewer " + l} disabled={v <= min} onClick={() => set(v - 1)}>−</button><b>{v}</b>
                <button aria-label={"More " + l} disabled={l !== "Infants (free)" && total >= prop.maxGuests} onClick={() => set(v + 1)}>+</button></span></div>))}
            <div className="muted">Sleeps {prop.maxGuests}. {total > prop.extraGuestFrom ? `Extra-guest fee ${money(prop.extraGuestFee)}/night for each guest over ${prop.extraGuestFrom}.` : ""}</div>
            {err && <div className="err">{err}</div>}
            <button className="btn" disabled={!ci || !co || busy} onClick={getQuote}>{busy ? "Checking…" : "See my total"}</button>
          </>)}

          {step === "total" && quote && (<>
            <h2>Your total</h2>
            <div className="muted">{prop.name} · {fmt(ci!)} – {fmt(co!)} · {total} guests</div>
            <div>
              <div className="ln"><span>{quote.nights} nights</span><span>{money(quote.lodging)}</span></div>
              {quote.extraGuestFee > 0 && <div className="ln"><span>Extra guests</span><span>{money(quote.extraGuestFee)}</span></div>}
              <div className="ln"><span>Cleaning</span><span>{money(quote.cleaning)}</span></div>
              <div className="ln"><span>Damage protection (Waivo, up to $5,000)</span><span>{money(quote.protection)}</span></div>
              <div className="ln"><span>Taxes ({(quote.taxRate * 100).toFixed(2)}%, provisional)</span><span>{money(quote.tax)}</span></div>
              <div className="ln total"><span>Total</span><span>USD {money(quote.total)}</span></div>
            </div>
            <div className="muted">Your complete stay total is shown above. {timer}</div>
            <div className="box">{quote.plan.split
              ? <>Pay {money(quote.plan.dueNow)} today. {money(quote.plan.scheduled!.amount)} is charged automatically on {formatChicagoDate(new Date(quote.plan.scheduled!.chargeAt))}.</>
              : <>Check-in is within 30 days, so the full {money(quote.total)} is charged today.</>}</div>
            {err && <div className="err">{err}</div>}
            <button className="btn" onClick={() => setStep("pay")}>Continue</button>
            <button className="btn ghost" onClick={() => setStep("stay")}>Change dates or guests</button>
          </>)}

          {step === "pay" && quote && (<>
            <h2>Who's staying, and payment</h2>
            {(["firstName", "lastName", "email", "phone"] as const).map((k) => (
              <label key={k}><div className="lbl">{{ firstName: "First name", lastName: "Last name", email: "Email", phone: "Mobile phone" }[k]}</div>
                <input className="f" value={guest[k]} onChange={(e) => setGuest({ ...guest, [k]: e.target.value })} /></label>))}
            {stripeMode
              ? <><div className="lbl">Card</div><StripeCard publishableKey={cfg.publishableKey!} amount={quote.plan.dueNow} saveForLater={quote.plan.split} onReady={onCardReady} />
                  <div className="muted">Stripe test mode: use card 4242 4242 4242 4242, any future date, any CVC. Decline test: 4000 0000 0000 0002.</div></>
              : <div className="box sand">Stripe's secure payment form goes here. In test mode nothing is charged.</div>}
            <div className="box">After payment you'll sign the rental agreement and verify your ID. The address, door code and Wi-Fi are sent only after both are done.</div>
            <label className="chk"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I'm at least 25 and will stay at the home. I agree to the <a href="https://pearlheightshomes.com/house-rules/" target="_blank">house rules</a> and <a href="https://pearlheightshomes.com/terms-and-conditions/" target="_blank">cancellation policy</a>, and I authorize Pearl Heights Homes to charge {money(quote.plan.dueNow)} today{quote.plan.split ? ` and ${money(quote.plan.scheduled!.amount)} on ${formatChicagoDate(new Date(quote.plan.scheduled!.chargeAt))}` : ""}.</span></label>
            <label><div className="lbl">Test: simulate</div>
              <select className="f" value={sim} onChange={(e) => setSim(e.target.value)}>{SIMS.filter(([v]) => !(stripeMode && CARD_SIMS.includes(v))).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {err && <div className="err">{err}</div>}
            {result && !result.ok && <div className="alert">{result.guestMessage}</div>}
            <div className="muted">{timer}</div>
            <button className="btn" disabled={!agreed || busy} onClick={pay}>{busy ? "Processing…" : `Pay ${money(quote.plan.dueNow)}`}</button>
            <button className="btn ghost" onClick={() => { setResult(null); setStep("total"); }}>Back</button>
          </>)}

          {step === "done" && result?.ok && (<>
            <h2>Payment received. Your booking needs two more steps.</h2>
            <div className="muted">Booking {result.bookingRef} · {prop.name} · {fmt(ci!)} – {fmt(co!)}</div>
            <div className="box"><b>Check your email to sign the rental agreement and verify your ID.</b><br />
              Please finish both by {result.verification.deadlineText}. The address, door code and Wi-Fi are sent only after both are done.</div>
            <button className="btn" onClick={() => setResent(true)}>Resend the email</button>
            {resent && <div className="muted">Test mode: no email is actually sent.</div>}
            <div className="muted">Didn't get it? Check spam, or email <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a> with your booking number.</div>
            <button className="btn ghost" onClick={() => { setStep("stay"); setCi(null); setCo(null); setQuote(null); setResult(null); setResent(false); setAgreed(false); setGuest({ firstName: "", lastName: "", email: "", phone: "" }); }}>Start another booking</button>
          </>)}
        </div>
      </main>
    </>
  );
}

function guestsCount(a: number, c: number) { return a + c; }
