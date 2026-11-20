"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StripeCard, type CreatePm } from "../../StripeCard";

/** Supervised LIVE tests (host only): $1 card test (hold + capture, saved-card charge, both refunded) and a live ID self-test. */
export function CardTest() {
  const [pk, setPk] = useState<string | null>(null), [err, setErr] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState("bookings@pearlheightshomes.com");
  const [busy, setBusy] = useState(false), [result, setResult] = useState<{ ok: boolean; steps: { step: string; ok: boolean; detail?: string }[] } | null>(null);
  const createPm = useRef<CreatePm | null>(null);
  const onReady = useCallback((fn: CreatePm | null) => { createPm.current = fn; }, []);
  useEffect(() => { fetch("/api/host/card-test").then((r) => r.json()).then((j) => (j.publishableKey ? setPk(j.publishableKey) : setErr(j.error ?? "Live keys aren't set up."))).catch(() => setErr("Couldn't load.")); }, []);
  const go = async () => {
    if (!createPm.current || busy) return;
    setBusy(true); setErr(""); setResult(null);
    const pm = await createPm.current({ name, email, phone: "" });
    if (!pm.id) { setErr(pm.error ?? "Card error"); setBusy(false); return; }
    const r = await fetch("/api/host/card-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentMethodId: pm.id, name, email }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "The test didn't run."); return; }
    setResult(j);
  };
  return (
    <div className="H-wrap" style={{ maxWidth: 520 }}>
      <header className="H-top"><h1>Live card test</h1><a className="H-back" href="/host">Inbox</a></header>
      <p className="H-dim">Real money, LIVE mode: this charges your card $1, captures it, charges $1 more to the saved card (like a split booking&apos;s second payment), then refunds both. Refunds take 5–10 days to show on your statement.</p>
      {err && <p className="H-err">{err}</p>}
      {pk && (
        <div className="H-card" style={{ margin: "16px 0", maxWidth: "none" }}>
          <label className="H-dim" htmlFor="ct-n">Name on card</label>
          <input id="ct-n" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="H-dim" htmlFor="ct-e">Email for the receipt</label>
          <input id="ct-e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <StripeCard publishableKey={pk} amount={100} saveForLater onReady={onReady} canPay={!busy} billing={{ name, email, phone: "" }} onExpress={() => {}} onLockedTap={() => {}} />
          <button className="H-btn" type="button" onClick={go} disabled={busy}>{busy ? "Running…" : "Run the $1 live test"}</button>
        </div>
      )}
      <IdTest />
      {result && (
        <div className="H-card" style={{ margin: 0, maxWidth: "none" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{result.ok ? "All steps passed" : "A step failed"}</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{result.steps.map((s) => <li key={s.step}>{s.ok ? "✓" : "✗"} {s.step}{s.detail ? ` (${s.detail})` : ""}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/**
 * Live ID self-test (Oscar, Nov 20): Oscar checks his own ID once in Stripe LIVE mode, the same check guests do.
 * Stripe's page opens; it returns here with ?vs=, the result shows, and Stripe deletes the ID data right after.
 */
function IdTest() {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [res, setRes] = useState<{ status: string; live: boolean; lastError: string | null; redacted: boolean } | null>(null);
  useEffect(() => {
    const vs = new URLSearchParams(location.search).get("vs");
    if (!vs) return;
    setMsg("Checking the result…");
    fetch(`/api/host/id-test?vs=${encodeURIComponent(vs)}`).then((r) => r.json()).then((j) => { setMsg(j.error ?? ""); if (!j.error) setRes(j); }).catch(() => setMsg("Couldn't read the result."));
  }, []);
  const start = async () => {
    setBusy(true); setMsg(""); setRes(null);
    const r = await fetch("/api/host/id-test", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j?.url) { setBusy(false); setMsg(j?.error ?? "The test didn't start."); return; }
    location.assign(j.url);
  };
  const label: Record<string, string> = { verified: "Verified: live ID checks work", processing: "Stripe is still processing: reload this page in a minute", requires_input: "Not verified (Stripe asked for another try). Live ID checks are working; this was the check itself", canceled: "Cancelled" };
  return (
    <div className="H-card" style={{ margin: "16px 0", maxWidth: "none" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Live ID self-test</h2>
      <p className="H-dim" style={{ margin: 0 }}>Checks your own ID and a selfie in Stripe LIVE mode, exactly like a guest. It proves Stripe Identity is turned on and the live key has permission. Stripe&apos;s first 50 checks are free; the ID images and data are deleted at Stripe right after.</p>
      {res ? (
        <p style={{ margin: 0 }}><b>{res.live ? "" : "(test mode) "}{label[res.status] ?? res.status}</b>{res.lastError ? ` (${res.lastError})` : ""}{res.redacted ? " · ID data deleted at Stripe" : ""}</p>
      ) : null}
      {msg && <p className={/Couldn|didn|Bad|Not/.test(msg) ? "H-err" : "H-dim"} style={{ margin: 0 }}>{msg}</p>}
      <button className="H-btn" type="button" onClick={start} disabled={busy}>{busy ? "Opening Stripe…" : res ? "Run it again" : "Verify my own ID (live)"}</button>
    </div>
  );
}
