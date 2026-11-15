import type { Db } from "../db/client";
import { AdapterError, PaymentsAdapter } from "../adapters/types";

/**
 * Off-session second charge (split plans): 50% charged at 10:00 AM CT, 30 days before check-in.
 *
 *  - Each due job is claimed atomically (UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING) before any Stripe call;
 *    overlapping runners never charge twice. A worker that dies leaves an expiring claim.
 *  - Idempotency key `<ref>:scheduled:<n>` where n = 1 + number of DEFINITE declines so far. An ambiguous error
 *    (timeout/5xx) retries later with the SAME key, so Stripe returns the original result instead of charging again.
 *  - Definite card decline: retried daily within the 3-day grace period (Terms), then 'failed_final' + ALERT
 *    (cancellation per Terms is a manual decision for now). Guest emails are a separate gate; the notice is logged.
 *  - Authentication required: payment 'requires_action', job 'manual_review', no more off-session tries (note 95).
 *  - No saved card: 'manual_review' (integration/data problem), no key or decline consumed.
 *  - Unknown outcome: same key with backoff; after 12 tries or 48 h past schedule -> 'manual_review', never failed_final.
 *  - Never charges a booking that is cancelled/closed or a payment already paid.
 */
export const SECOND_CHARGE_MAX_DECLINES = 3; // first try + retries on day 1, 2; final at day 3
/** Unknown outcomes stop after 12 tries or 48 h past the scheduled time, whichever first (note 95). */
export const SECOND_CHARGE_MAX_AMBIGUOUS = 12;
export const SECOND_CHARGE_MAX_OVERDUE_S = 48 * 3600;
const RETRY_AFTER_DECLINE_S = 24 * 3600;
const CLAIM_S = 120;

export interface SecondChargeCounts { due: number; paid: number; retry_scheduled: number; failed_final: number; skipped: number; ambiguous: number; manual_review: number }

export async function runDueSecondCharges(db: Db, pay: PaymentsAdapter, limit = 10): Promise<SecondChargeCounts> {
  const c: SecondChargeCounts = { due: 0, paid: 0, retry_scheduled: 0, failed_final: 0, skipped: 0, ambiguous: 0, manual_review: 0 };
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

type Result = "paid" | "retry_scheduled" | "failed_final" | "skipped" | "ambiguous" | "manual_review";

async function chargeOne(db: Db, pay: PaymentsAdapter, jobId: string, bookingId: string, token: string): Promise<Result> {
  const finishJob = (status: string, err: string | null, runAtOffsetS?: number) => db.query(
    `UPDATE jobs SET status = $3, last_error = $4, claim_token = NULL, claim_expires_at = NULL,
       run_at = CASE WHEN $5::float IS NULL THEN run_at ELSE now() + make_interval(secs => $5::float) END
     WHERE id = $1 AND claim_token = $2`, [jobId, token, status, err, runAtOffsetS ?? null]);
  const manualReview = async (payId: string, payStatus: string, why: string): Promise<Result> => {
    await db.query(`UPDATE payments SET status = $2, last_error = $3 WHERE id = $1`, [payId, payStatus, why]);
    await db.query(`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'second_payment_manual_review', $2)`, [bookingId, JSON.stringify({ why })]);
    await finishJob("manual_review", why);
    console.error("ALERT second payment needs manual review:", why);
    return "manual_review";
  };

  const [b] = await db.query<any>(
    `SELECT b.booking_ref, b.state, s.id AS pay_id, s.status AS pay_status, s.amount_cents, s.attempts AS keys_used, s.decline_count,
            s.scheduled_for, EXTRACT(EPOCH FROM (now() - s.scheduled_for))::float AS overdue_s, i.stripe_payment_intent_id AS initial_pi,
            (SELECT attempts FROM jobs WHERE id = $2) AS job_attempts
     FROM bookings b
     JOIN payments s ON s.booking_id = b.id AND s.kind = 'scheduled'
     JOIN payments i ON i.booking_id = b.id AND i.kind = 'initial'
     WHERE b.id = $1`, [bookingId, jobId]);
  if (!b || b.pay_status === "paid" || !["confirmed", "verified", "access_released"].includes(b.state)) {
    await finishJob("done", b ? `skipped: payment ${b.pay_status}, booking ${b.state}` : "skipped: no scheduled payment");
    return "skipped";
  }
  // A missing saved card is an integration/data problem, not a bank decline: no key, no decline consumed.
  const saved = await pay.savedMethod(b.initial_pi).catch(() => undefined);
  if (saved === undefined) return ambiguous(b);
  if (saved === null) return manualReview(b.pay_id, "manual_review", "no saved card on the first payment");

  const n = Number(b.keys_used) + 1; // one idempotency key per definite outcome
  const idempotencyKey = `${b.booking_ref}:scheduled:${n}`;
  try {
    const r = await pay.chargeSaved({ customerId: saved.customerId, paymentMethodId: saved.paymentMethodId, amount: b.amount_cents, idempotencyKey,
      description: `Second payment ${b.booking_ref}`, metadata: { booking_ref: b.booking_ref, kind: "scheduled", attempt: String(n) } });
    await db.tx([
      [`UPDATE payments SET status = 'paid', stripe_payment_intent_id = $2, customer_id = $3, payment_method_id = $4, attempts = $5,
          status_event_at = COALESCE(status_event_at, now()), last_error = NULL WHERE id = $1 AND status <> 'paid'`,
        [b.pay_id, r.paymentIntentId, saved.customerId, saved.paymentMethodId, n]],
      [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'second_payment_paid', $2)`, [bookingId, JSON.stringify({ amount: b.amount_cents, attempt: n })]],
    ]);
    await finishJob("done", null);
    return "paid";
  } catch (e) {
    const code = e instanceof AdapterError ? e.code : "unknown";
    if (code === "authentication_required") {
      // Not a normal decline: the bank wants the guest present. Stop blind off-session retries until the guest
      // recovery flow exists. Booking stays intact; cancellation is a separate Terms/manual decision.
      await db.query(`UPDATE payments SET attempts = $2 WHERE id = $1`, [b.pay_id, n]);
      return manualReview(b.pay_id, "requires_action", "card requires authentication; guest action needed");
    }
    if (code === "card_declined") {
      const declines = Number(b.decline_count) + 1;
      if (declines >= SECOND_CHARGE_MAX_DECLINES) {
        await db.query(`UPDATE payments SET status = 'failed_final', attempts = $2, decline_count = $3, last_error = $4 WHERE id = $1`, [b.pay_id, n, declines, code]);
        await db.query(`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'second_payment_failed_final', $2)`, [bookingId, JSON.stringify({ declines })]);
        await finishJob("failed", code);
        console.error("ALERT second payment failed after grace period; Oscar decides per Terms");
        return "failed_final";
      }
      await db.query(`UPDATE payments SET status = 'retrying', attempts = $2, decline_count = $3, last_error = $4, next_attempt_at = now() + make_interval(secs => $5) WHERE id = $1`,
        [b.pay_id, n, declines, code, RETRY_AFTER_DECLINE_S]);
      await finishJob("pending", code, RETRY_AFTER_DECLINE_S);
      console.info("second payment declined; guest notice pending (email gate); retry scheduled");
      return "retry_scheduled";
    }
    return ambiguous(b);
  }

  /** Outcome unknown: retry later with the SAME key, until the limits; then manual review (never failed_final). */
  async function ambiguous(row: any): Promise<Result> {
    if (Number(row.job_attempts) >= SECOND_CHARGE_MAX_AMBIGUOUS || Number(row.overdue_s) > SECOND_CHARGE_MAX_OVERDUE_S)
      return manualReview(row.pay_id, "manual_review", "charge outcome unknown after retry limit");
    const backoffS = Math.min(300 * 2 ** Math.max(0, Number(row.job_attempts) - 1), 6 * 3600) * (0.8 + Math.random() * 0.4);
    await finishJob("pending", "ambiguous", backoffS);
    return "ambiguous";
  }
}
