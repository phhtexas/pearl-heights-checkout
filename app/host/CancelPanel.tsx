"use client";
import { useEffect, useState } from "react";

/**
 * Host cancel tool (audit F3, Oscar Nov 19). Shows what the cancellation policy refunds for the chosen reason, then
 * cancels after the host types the booking code. Every step is listed; if one fails, "Finish cancellation" resumes.
 */
type Preview = { ref: string; cancelled: boolean; livemode: boolean; paidSoFar: number; refund: number; kept: number; tier: string; scheduledToStop: number; refundedSoFar: number; plannedRefund: number | null };
type Step = { step: string; ok: boolean; detail?: string };
const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const TIER: Record<string, string> = {
  full_no_fee: "Full refund", grace_24h: "Within 24 hours of booking: full refund", non_refundable: "Booked 7 days or less before check-in: non-refundable",
  "30_plus": "30+ days before check-in: refund minus 5% processing fee", "14_to_29": "14–29 days before: 50% of the stay plus the damage waiver",
  under_14: "Under 14 days: damage waiver only", check_in_day: "Check-in day: no refund", after_check_in: "After check-in: no refund", nonpayment: "Unpaid balance",
};

export function CancelPanel({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [reason, setReason] = useState("guest");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [p, setP] = useState<Preview | null>(null);
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null), [done, setDone] = useState(false);
  useEffect(() => {
    setErr("");
    fetch(`/api/host/bookings/${bookingId}/cancel?reason=${reason}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.preview) { setP(j.preview); setReasons(j.reasons); } else setErr(j.error ?? "Couldn't load."); }).catch(() => setErr("Couldn't load."));
  }, [bookingId, reason]);
  const run = async () => {
    setBusy(true); setErr("");
    const r = await fetch(`/api/host/bookings/${bookingId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, confirmRef: code }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setErr(j.error ?? "Something went wrong. Nothing else was changed."); return; }
    setSteps(j.steps ?? []); setDone(!!j.done); if (j.preview) setP(j.preview);
  };
  const refundShown = p ? (p.cancelled && p.plannedRefund != null ? p.plannedRefund : p.refund) : 0;
  const unfinished = p?.cancelled && p.plannedRefund != null && p.refundedSoFar < p.plannedRefund;
  return (
    <div className="CH-sheet" onClick={onClose}>
      <div className="CH-sheetIn H-cancel" role="dialog" aria-label="Cancel booking" onClick={(e) => e.stopPropagation()}>
        <h2>{p?.cancelled ? "Booking cancelled" : "Cancel this booking"}</h2>
        {p && !p.livemode && <p className="H-dim">Test booking: test refunds only; Hospitable isn&apos;t changed.</p>}
        {!p?.cancelled && (
          <label>Reason
            <select value={reason} onChange={(e) => { setReason(e.target.value); setSteps(null); }}>
              {Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}
        {p && (
          <dl>
            <dt>Paid so far</dt><dd>{usd(p.paidSoFar)}</dd>
            {!p.cancelled && <><dt>Policy</dt><dd>{TIER[p.tier] ?? p.tier}</dd></>}
            <dt>Refund</dt><dd><b>{usd(refundShown)}</b>{p.cancelled ? ` (${usd(p.refundedSoFar)} refunded so far)` : ""}</dd>
            {!p.cancelled && <><dt>We keep</dt><dd>{usd(p.kept)}</dd></>}
            {!p.cancelled && p.scheduledToStop > 0 && <><dt>Second payment</dt><dd>{usd(p.scheduledToStop)} won&apos;t be charged</dd></>}
          </dl>
        )}
        {p && (!p.cancelled || unfinished) && (<>
          <p className="H-dim">{p.cancelled ? "Some steps didn't finish. Type the code to finish them." : "This refunds the guest, frees the dates in Hospitable, turns off their stay page and (after launch) emails them. It can't be undone."}</p>
          <label>Type the booking code {p.ref} to confirm<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" /></label>
          <button className="H-btn H-danger" type="button" disabled={busy || code.trim() !== p.ref} onClick={run}>{busy ? "Working…" : p.cancelled ? "Finish cancellation" : `Cancel and refund ${usd(refundShown)}`}</button>
        </>)}
        {err && <p className="H-err" role="alert">{err}</p>}
        {steps && (
          <ul className="H-steps" aria-live="polite">
            {steps.map((s, i) => <li key={i} className={s.ok ? "" : "is-bad"}>{s.ok ? "✓" : "✕"} {s.step}{s.detail ? `: ${s.detail}` : ""}</li>)}
            <li><b>{done ? "Done." : "Not finished: fix the step marked ✕, then Finish cancellation."}</b></li>
          </ul>
        )}
        <button type="button" className="CH-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
