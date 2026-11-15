import type { Db } from "../db/client";
import { AdapterError, PaymentsAdapter } from "../adapters/types";

/**
 * Off-session second charge (split plans): 50% charged at 10:00 AM CT, 30 days before check-in.
 *
 *  - Each due job is claimed atomically (UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING) before any Stripe call;
 *    overlapping runners never charge twice. A worker that dies leaves an expiring claim.
 *  - Idempotency key `<ref>:scheduled:<n>` where n = 1 + number of DEFINITE declines so far. An ambiguous error
 *    (timeout/5xx) retries later with the SAME key, so Stripe returns the original result instead of charging again.
 *  - Definite decline / authentication required: retried daily within the 3-day grace period (Terms), then
 *    'failed_final' + ALERT for Oscar (cancellation per Terms is a manual decision for now). Guest emails are a
 *    separate gate; the notice is logged.
 *  - Never charges a booking that is cancelled/closed or a payment already paid.
 */
export const SECOND_CHARGE_MAX_DECLINES = 3; // first try + retries on day 1, 2; final at day 3
const RETRY_AFTER_DECLINE_S = 24 * 3600;
const CLAIM_S = 120;

export interface SecondChargeCounts { due: number; paid: number; retry_scheduled: number; failed_final: number; skipped: number; ambiguous: number }

export async function runDueSecondCharges(db: Db, pay: PaymentsAdapter, limit = 10): Promise<SecondChargeCounts> {
  const c: SecondChargeCounts = { due: 0, paid: 0, retry_scheduled: 0, failed_final: 0, skipped: 0, ambiguous: 0 };
  for (let i = 0; i < limit; i++) {
    const token = crypto.randomUUID();
    const [job] = await db.query<{ id: string; booking_id: string }>(
      `UPDATE jobs SET status = 'running', claim_token = $1, claim_expires_at = now() + make_interval(secs => $2), attempts = attempts + 1
       WHERE id = (SELECT id FROM jobs WHERE type = 'second_payment'
                     AND ((status = 'pending' AND run_at <= now()) OR (status = 'running' AND claim_expires_at < now()))
                   ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING id, booking_id`, [token, CLAIM_S]);
    if (!job) break;
    c.due++;
    c[await chargeOne(db, pay, job.id, job.booking_id, token)]++;
  }
  return c;
}

type Result = "paid" | "retry_scheduled" | "failed_final" | "skipped" | "ambiguous";

async function chargeOne(db: Db, pay: PaymentsAdapter, jobId: string, bookingId: string, token: string): Promise<Result> {
  const finishJob = (status: string, err: string | null, runAtOffsetS?: number) => db.query(
    `UPDATE jobs SET status = $3, last_error = $4, claim_token = NULL, claim_expires_at = NULL,
       run_at = CASE WHEN $5::float IS NULL THEN run_at ELSE now() + make_interval(secs => $5::float) END
     WHERE id = $1 AND claim_token = $2`, [jobId, token, status, err, runAtOffsetS ?? null]);

  const [b] = await db.query<any>(
    `SELECT b.booking_ref, b.state, s.id AS pay_id, s.status AS pay_status, s.amount_cents, s.attempts AS declines,
            i.stripe_payment_intent_id AS initial_pi
     FROM bookings b
     JOIN payments s ON s.booking_id = b.id AND s.kind = 'scheduled'
     JOIN payments i ON i.booking_id = b.id AND i.kind = 'initial'
     WHERE b.id = $1`, [bookingId]);
  if (!b || b.pay_status === "paid" || !["confirmed", "verified", "access_released"].includes(b.state)) {
    await finishJob("done", b ? `skipped: payment ${b.pay_status}, booking ${b.state}` : "skipped: no scheduled payment");
    return "skipped";
  }
  const n = Number(b.declines) + 1;
  const idempotencyKey = `${b.booking_ref}:scheduled:${n}`;
  try {
    const saved = await pay.savedMethod(b.initial_pi);
    if (!saved) throw new AdapterError("no saved card", "card_declined");
    const r = await pay.chargeSaved({ customerId: saved.customerId, paymentMethodId: saved.paymentMethodId, amount: b.amount_cents, idempotencyKey,
      description: `Second payment ${b.booking_ref}`, metadata: { booking_ref: b.booking_ref, kind: "scheduled", attempt: String(n) } });
    await db.tx([
      [`UPDATE payments SET status = 'paid', stripe_payment_intent_id = $2, customer_id = $3, payment_method_id = $4, status_event_at = COALESCE(status_event_at, now()), last_error = NULL
        WHERE id = $1 AND status <> 'paid'`, [b.pay_id, r.paymentIntentId, saved.customerId, saved.paymentMethodId]],
      [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'second_payment_paid', $2)`, [bookingId, JSON.stringify({ amount: b.amount_cents, attempt: n })]],
    ]);
    await finishJob("done", null);
    return "paid";
  } catch (e) {
    const code = e instanceof AdapterError ? e.code : "unknown";
    if (code === "card_declined" || code === "authentication_required") {
      const declines = n;
      if (declines >= SECOND_CHARGE_MAX_DECLINES) {
        await db.query(`UPDATE payments SET status = 'failed_final', attempts = $2, last_error = $3 WHERE id = $1`, [b.pay_id, declines, code]);
        await db.query(`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'second_payment_failed_final', $2)`, [bookingId, JSON.stringify({ declines, code })]);
        await finishJob("failed", code);
        console.error("ALERT second payment failed after grace period; Oscar decides per Terms");
        return "failed_final";
      }
      await db.query(`UPDATE payments SET status = 'retrying', attempts = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4) WHERE id = $1`,
        [b.pay_id, declines, code, RETRY_AFTER_DECLINE_S]);
      await finishJob("pending", code, RETRY_AFTER_DECLINE_S);
      console.info("second payment declined; guest notice pending (email gate); retry scheduled");
      return "retry_scheduled";
    }
    // Ambiguous: same key next time (attempts on the job count tries; payments.attempts counts only definite declines).
    const [j] = await db.query<{ attempts: number }>(`SELECT attempts FROM jobs WHERE id = $1`, [jobId]);
    const backoffS = Math.min(300 * 2 ** Math.max(0, (j?.attempts ?? 1) - 1), 6 * 3600) * (0.8 + Math.random() * 0.4);
    await finishJob("pending", `ambiguous: ${code}`, backoffS);
    return "ambiguous";
  }
}
