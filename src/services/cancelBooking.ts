import type { Db } from "@/db/client";
import type { HospitableAdapter, PaymentsAdapter } from "@/adapters/types";
import type { Quote } from "@/domain/quote";
import { computeRefund, type CancelReason, type RefundResult } from "@/domain/refunds";
import { HOMES } from "@/content/homes";

/**
 * Host cancel tool (audit F3, Oscar Nov 19). From the host inbox: preview what the cancellation policy refunds, then
 * cancel. Order, each step safe to repeat:
 *   1. mark the booking cancelled (once) and record the planned refund;
 *   2. stop the scheduled second payment and its job;
 *   3. refund in Stripe, newest payment first, up to the planned amount (idempotency key per payment);
 *   4. cancel the reservation in Hospitable (frees the dates);
 *   5. turn off the stay link. The guest's cancellation email goes out from the notices run (GUEST_EMAILS=on).
 * If a step fails, the booking stays cancelled and "Finish cancellation" resumes from the step that failed.
 */
export const CANCEL_REASONS: Record<"guest" | "host" | "verification_missed", string> = {
  guest: "Guest asked to cancel (cancellation policy)",
  host: "We're cancelling (full refund)",
  verification_missed: "Paperwork not done by the deadline (full refund)",
};
export type HostCancelReason = keyof typeof CANCEL_REASONS;

type Paid = { id: string; kind: string; pi: string; amount: number; refunded: number; at: Date };
export type CancelPreview = {
  bookingId: string; ref: string; home: string; checkIn: string; checkOut: string; guest: string; state: string; livemode: boolean;
  cancelled: boolean; paidSoFar: number; refund: number; kept: number; tier: RefundResult["tier"]; scheduledToStop: number;
  refundedSoFar: number; plannedRefund: number | null; hospitableId: string | null;
};

async function load(db: Db, bookingId: string) {
  const [b] = await db.query<any>(
    `SELECT b.id, b.booking_ref, b.state, b.created_at, b.hospitable_reservation_id, b.reservation_ref, q.property_key, q.check_in, q.check_out,
            q.line_items, q.livemode, g.first_name, g.last_name
       FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version JOIN guests g ON g.id = b.guest_id
      WHERE b.id = $1 AND b.confirmed_at IS NOT NULL`, [bookingId]).catch(() => [] as any[]);
  if (!b) return null;
  const pays = await db.query<any>(`SELECT id, kind, stripe_payment_intent_id, amount_cents, refunded_cents, status, created_at FROM payments WHERE booking_id = $1`, [bookingId]);
  const paid: Paid[] = pays
    .filter((p) => p.stripe_payment_intent_id && ((p.kind === "initial" && p.status === "captured") || (p.kind === "scheduled" && p.status === "paid") || p.status === "partially_refunded" || p.status === "refunded"))
    .filter((p) => p.kind !== "refund")
    .map((p) => ({ id: p.id, kind: p.kind, pi: p.stripe_payment_intent_id, amount: Number(p.amount_cents), refunded: Number(p.refunded_cents ?? 0), at: new Date(p.created_at) }));
  const scheduled = pays.filter((p) => p.kind === "scheduled" && ["scheduled", "retrying", "requires_action"].includes(p.status));
  const refundRows = pays.filter((p) => p.kind === "refund");
  const [plan] = await db.query<any>(`SELECT after FROM audit_log WHERE booking_id = $1 AND action = 'host_cancel_planned' ORDER BY id DESC LIMIT 1`, [bookingId]);
  const planned = plan ? (typeof plan.after === "string" ? JSON.parse(plan.after) : plan.after) : null;
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
  return {
    b, paid, scheduled, planned, refundRows,
    quote: (typeof b.line_items === "string" ? JSON.parse(b.line_items) : b.line_items) as Quote,
    checkIn: iso(b.check_in), checkOut: iso(b.check_out),
  };
}

const CANCELLED = new Set(["cancelled", "cancelled_unverified", "closed"]);
const refundedTotal = (paid: Paid[], refundRows: any[]) =>
  Math.max(paid.reduce((n, p) => n + p.refunded, 0), refundRows.reduce((n, r) => n + Number(r.amount_cents), 0));

export async function cancelPreview(db: Db, bookingId: string, reason: HostCancelReason, now = new Date()): Promise<CancelPreview | null> {
  const L = await load(db, bookingId);
  if (!L) return null;
  const { b, paid, scheduled, planned } = L;
  const refundedSoFar = refundedTotal(paid, L.refundRows);
  const paidSoFar = paid.reduce((n, p) => n + p.amount, 0);
  const r = computeRefund({ quote: L.quote, checkIn: L.checkIn, bookedAt: new Date(b.created_at), cancelledAt: now, paidSoFar, reason: reason as CancelReason });
  return {
    bookingId, ref: b.booking_ref, home: HOMES[b.property_key]?.title ?? b.property_key, checkIn: L.checkIn, checkOut: L.checkOut,
    guest: `${b.first_name} ${b.last_name}`.trim(), state: b.state, livemode: !!b.livemode, cancelled: CANCELLED.has(b.state),
    paidSoFar, refund: r.refund, kept: r.retained, tier: r.tier, scheduledToStop: scheduled.reduce((n: number, p: any) => n + Number(p.amount_cents), 0),
    refundedSoFar, plannedRefund: planned ? Number(planned.refund) : null, hospitableId: b.hospitable_reservation_id ?? b.reservation_ref ?? null,
  };
}

export type CancelStep = { step: string; ok: boolean; detail?: string };

/**
 * Cancels (or finishes cancelling) a booking. `reason` and the refund are fixed the first time; later calls only
 * finish the remaining steps. `hosp` is null when this booking's Hospitable reservation can't be changed from here
 * (test bookings without Hospitable writes): that step is then skipped and reported.
 */
export async function cancelBooking(db: Db, bookingId: string, o: { reason: HostCancelReason; by: string; pay: PaymentsAdapter; hosp: HospitableAdapter | null; now?: Date }): Promise<{ steps: CancelStep[]; done: boolean } | null> {
  const now = o.now ?? new Date();
  const pre = await cancelPreview(db, bookingId, o.reason, now);
  if (!pre) return null;
  const steps: CancelStep[] = [];

  // 1. Cancel once; the planned refund is fixed at this moment.
  if (!pre.cancelled) {
    await db.tx([
      [`UPDATE bookings SET state = $2, updated_at = now() WHERE id = $1 AND state NOT IN ('cancelled', 'cancelled_unverified', 'closed')`,
        [bookingId, o.reason === "verification_missed" ? "cancelled_unverified" : "cancelled"]],
      [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, $2, 'host_cancel_planned', $3)`,
        [bookingId, o.by, JSON.stringify({ reason: o.reason, tier: pre.tier, refund: pre.refund, kept: pre.kept, paid: pre.paidSoFar, at: now.toISOString() })]],
    ]);
    steps.push({ step: "Booking marked cancelled", ok: true });
  } else steps.push({ step: "Booking already cancelled", ok: true });
  const L = (await load(db, bookingId))!;
  const planned = Number(L.planned?.refund ?? pre.refund);

  // 2. Stop the second payment.
  await db.tx([
    [`UPDATE payments SET status = 'cancelled', last_error = 'host cancelled booking' WHERE booking_id = $1 AND kind = 'scheduled' AND status IN ('scheduled', 'retrying', 'requires_action')`, [bookingId]],
    [`UPDATE jobs SET status = 'cancelled' WHERE booking_id = $1 AND type = 'second_payment' AND status IN ('pending', 'running')`, [bookingId]],
  ]);
  steps.push({ step: pre.scheduledToStop ? "Scheduled second payment stopped" : "No scheduled payment to stop", ok: true });

  // 3. Refund, newest payment first, until the planned amount is refunded.
  let remaining = planned - refundedTotal(L.paid, L.refundRows);
  let refundOk = true;
  for (const p of [...L.paid].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, p.amount - p.refunded);
    if (amount <= 0) continue;
    try {
      if (!o.pay.refund) throw new Error("refunds not available");
      const { refundId } = await o.pay.refund(p.pi, amount, `${pre.ref}:refund:${p.pi}:${planned}`, { booking_ref: pre.ref, reason: `host_cancel_${o.reason}` });
      await db.tx([
        [`INSERT INTO payments (booking_id, kind, idempotency_key, amount_cents, status, last_error) VALUES ($1, 'refund', $2, $3, 'refunded', $4) ON CONFLICT (idempotency_key) DO NOTHING`,
          [bookingId, `${pre.ref}:refund:${p.pi}`, amount, refundId]],
        [`UPDATE payments SET refunded_cents = GREATEST(refunded_cents, $2), status = CASE WHEN GREATEST(refunded_cents, $2) >= amount_cents THEN 'refunded' ELSE 'partially_refunded' END WHERE id = $1`,
          [p.id, p.refunded + amount]],
        [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, $2, 'refund_issued', $3)`, [bookingId, o.by, JSON.stringify({ payment_intent: p.pi, amount, refund: refundId })]],
      ]);
      remaining -= amount;
      steps.push({ step: `Refunded ${usd(amount)}`, ok: true });
    } catch (e) {
      refundOk = false;
      steps.push({ step: `Refund of ${usd(amount)}`, ok: false, detail: (e as Error).message.slice(0, 160) });
      break;
    }
  }
  if (planned === 0) steps.push({ step: "No refund under the policy", ok: true });

  // 4. Free the dates in Hospitable.
  let hospOk = true;
  const rid = (L.b.hospitable_reservation_id ?? L.b.reservation_ref ?? null) as string | null;
  const [already] = await db.query<any>(`SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = 'hospitable_cancelled'`, [bookingId]);
  if (already) steps.push({ step: "Dates already freed in Hospitable", ok: true });
  else if (!rid) steps.push({ step: "No Hospitable reservation on file", ok: true });
  else if (!o.hosp) steps.push({ step: "Hospitable not changed (test booking)", ok: true });
  else {
    try {
      await o.hosp.cancelReservation(rid);
      await db.query(`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $1, $2, 'hospitable_cancelled', $3::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = 'hospitable_cancelled')`, [bookingId, o.by, JSON.stringify({ reservation: rid })]);
      steps.push({ step: "Dates freed in Hospitable", ok: true });
    } catch (e) {
      hospOk = false;
      steps.push({ step: "Cancel in Hospitable", ok: false, detail: (e as Error).message.slice(0, 160) });
    }
  }

  // 5. The stay link stops working.
  await db.query(`UPDATE stay_links SET revoked_at = now() WHERE booking_id = $1 AND revoked_at IS NULL`, [bookingId]);
  steps.push({ step: "Stay page link turned off", ok: true });

  const done = refundOk && hospOk && remaining <= 0;
  if (done) await db.query(`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $1, $2, 'host_cancel_done', $3::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = 'host_cancel_done')`, [bookingId, o.by, JSON.stringify({ refund: planned })]);
  return { steps, done };
}

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
