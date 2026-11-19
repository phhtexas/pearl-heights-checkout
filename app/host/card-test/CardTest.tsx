"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StripeCard, type CreatePm } from "../../StripeCard";

/** Supervised LIVE card test page (host only): $1 hold + capture, $1 saved-card charge, both refunded. */
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
      {result && (
        <div className="H-card" style={{ margin: 0, maxWidth: "none" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{result.ok ? "All steps passed" : "A step failed"}</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{result.steps.map((s) => <li key={s.step}>{s.ok ? "✓" : "✗"} {s.step}{s.detail ? ` (${s.detail})` : ""}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
