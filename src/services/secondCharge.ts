import type { Db } from "../db/client";
import { AdapterError, PaymentsAdapter } from "../adapters/types";

/**
 * Off-session second charge (split plans): 50% charged at 4:00 PM CT, 30 days before check-in (when flexible cancellation ends; Oscar, Nov 15).
 *
 *  - Each due job is claimed atomically (UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING) before any Stripe call;
 *    overlapping runners never charge twice. A worker that dies leaves an expiring claim.
 *  - Idempotency key `<ref>:scheduled:<n>` where n = 1 + number of DEFINITE declines so far. An ambiguous error
 *    (timeout/5xx) retries later with the SAME key, so Stripe returns the original result instead of charging again.
 *  - Definite card decline: the 72-hour cure period starts at the FIRST decline (Booking Terms V1.2 §6): first_decline_at
 *    and cure_deadline_at are saved once and never move. Retries every 24 h, the last one at the deadline; a decline at
 *    or after the deadline (or the hard cap of tries) -> 'failed_final' + ALERT. The booking is never cancelled
 *    automatically: Oscar decides. Guest emails are a separate gate; the notice (with the deadline) is logged.
 *  - Authentication required: payment 'requires_action', job 'manual_review', no more off-session tries (note 95).
 *  - No saved card: 'manual_review' (integration/data problem), no key or decline consumed.
 *  - Unknown outcome: same key with backoff; after 12 tries or 48 h past schedule -> 'manual_review', never failed_final.
 *  - Never charges a booking that is cancelled/closed or a payment already paid.
 */
/** Cure period from the first decline (Booking Terms V1.2 §6, Rental Agreement §4). */
export const SECOND_CHARGE_CURE_HOURS = 72;
/** Hard cap on declined tries: first + retries at 24 h, 48 h and the 72 h deadline. */
export const SECOND_CHARGE_MAX_DECLINES = 4;
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

/** Payment states that must never be charged again; a reclaimed job just gets the matching terminal status. */
const TERMINAL: Record<string, string> = { paid: "done", refunded: "done", partially_refunded: "done", failed_final: "failed", manual_review: "manual_review", requires_action: "manual_review" };
const ONCE_AUDIT = `ON CONFLICT (booking_id, action) WHERE action IN ('second_payment_paid', 'second_payment_failed_final', 'second_payment_manual_review') DO NOTHING`;

async function chargeOne(db: Db, pay: PaymentsAdapter, jobId: string, bookingId: string, token: string): Promise<Result> {
  /**
   * Every outcome is ONE claim-guarded transaction (note 97): payment update, idempotent audit and job update all
   * check that this worker still holds the job's claim token; the job update (last) clears it. If another worker
   * reclaimed the job, every statement matches nothing and we report "skipped".
   */
  const owns = `EXISTS (SELECT 1 FROM jobs WHERE id = $1 AND claim_token = $2)`;
  async function commit(o: { payment?: [string, unknown[]]; audit?: { action: string; after: unknown }; jobStatus: string; err: string | null; runAtOffsetS?: number; result: Result }): Promise<Result> {
    const st: Array<[string, unknown[]]> = [];
    if (o.payment) {
      const k = o.payment[1].length;
      st.push([`${o.payment[0]} AND EXISTS (SELECT 1 FROM jobs WHERE id = $${k + 1} AND claim_token = $${k + 2})`, [...o.payment[1], jobId, token]]);
    }
    if (o.audit) st.push([`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $3, 'system', $4, $5 WHERE ${owns} ${ONCE_AUDIT}`,
      [jobId, token, bookingId, o.audit.action, JSON.stringify(o.audit.after)]]);
    st.push([`UPDATE jobs SET status = $3, last_error = $4, claim_token = NULL, claim_expires_at = NULL,
                run_at = CASE WHEN $5::float IS NULL THEN run_at ELSE now() + make_interval(secs => $5::float) END
              WHERE id = $1 AND claim_token = $2 RETURNING id`, [jobId, token, o.jobStatus, o.err, o.runAtOffsetS ?? null]]);
    const results = await db.tx(st);
    return results[results.length - 1]!.length ? o.result : "skipped";
  }
  const manualReview = (payStatus: string, why: string, extra: [string, unknown[]] | null, payId: string) =>
    commit({ payment: extra ?? [`UPDATE payments SET status = $1, last_error = $2 WHERE id = $3`, [payStatus, why, payId]],
      audit: { action: "second_payment_manual_review", after: { why } }, jobStatus: "manual_review", err: why, result: "manual_review" })
      .then((r) => { if (r === "manual_review") console.error("ALERT second payment needs manual review:", why); return r; });

  const [b] = await db.query<any>(
    `SELECT b.booking_ref, b.state, s.id AS pay_id, s.status AS pay_status, s.amount_cents, s.attempts AS keys_used, s.decline_count,
            EXTRACT(EPOCH FROM (now() - s.scheduled_for))::float AS overdue_s, i.stripe_payment_intent_id AS initial_pi,
            s.cure_deadline_at, EXTRACT(EPOCH FROM (s.cure_deadline_at - now()))::float AS cure_left_s,
            (SELECT attempts FROM jobs WHERE id = $2) AS job_attempts
     FROM bookings b
     JOIN payments s ON s.booking_id = b.id AND s.kind = 'scheduled'
     JOIN payments i ON i.booking_id = b.id AND i.kind = 'initial'
     WHERE b.id = $1`, [bookingId, jobId]);
  if (!b) return commit({ jobStatus: "done", err: "skipped: no scheduled payment", result: "skipped" }).then(() => "skipped");
  // Terminal payment states never call Stripe again; repair the (possibly stale, reclaimed) job without moving money.
  if (TERMINAL[b.pay_status]) return commit({ jobStatus: TERMINAL[b.pay_status]!, err: `already ${b.pay_status}`, result: "skipped" });
  if (!["confirmed", "verified", "access_released"].includes(b.state)) return commit({ jobStatus: "done", err: `skipped: booking ${b.state}`, result: "skipped" });
  // A retry is never earlier than its scheduled time, even if a stale claim is reclaimed.
  const [due] = await db.query<{ ok: boolean; wait_s: number }>(
    `SELECT (next_attempt_at IS NULL OR next_attempt_at <= now()) AS ok, GREATEST(EXTRACT(EPOCH FROM (next_attempt_at - now())), 0)::float AS wait_s
     FROM payments WHERE id = $1`, [b.pay_id]);
  if (!due?.ok) return commit({ jobStatus: "pending", err: "not due yet", runAtOffsetS: Number(due!.wait_s), result: "skipped" }); // job waits for the retry time

  // A missing saved card is an integration/data problem, not a bank decline: no key, no decline consumed.
  const saved = await pay.savedMethod(b.initial_pi).catch(() => undefined);
  if (saved === undefined) return ambiguous();
  if (saved === null) return manualReview("manual_review", "no saved card on the first payment", null, b.pay_id);

  const n = Number(b.keys_used) + 1; // one idempotency key per definite outcome
  try {
    const r = await pay.chargeSaved({ customerId: saved.customerId, paymentMethodId: saved.paymentMethodId, amount: b.amount_cents, idempotencyKey: `${b.booking_ref}:scheduled:${n}`,
      description: `Second payment ${b.booking_ref}`, metadata: { booking_ref: b.booking_ref, kind: "scheduled", attempt: String(n) } });
    return commit({
      payment: [`UPDATE payments SET status = 'paid', stripe_payment_intent_id = $1, customer_id = $2, payment_method_id = $3, attempts = $4,
                  status_event_at = COALESCE(status_event_at, now()), last_error = NULL WHERE id = $5 AND status <> 'paid'`,
        [r.paymentIntentId, saved.customerId, saved.paymentMethodId, n, b.pay_id]],
      audit: { action: "second_payment_paid", after: { amount: b.amount_cents, attempt: n } }, jobStatus: "done", err: null, result: "paid" });
  } catch (e) {
    const code = e instanceof AdapterError ? e.code : "unknown";
    if (code === "authentication_required") {
      // Not a normal decline: the bank wants the guest present. No more off-session tries; booking intact.
      return manualReview("requires_action", "card requires authentication; guest action needed",
        [`UPDATE payments SET status = 'requires_action', attempts = $1, last_error = $2 WHERE id = $3`, [n, code, b.pay_id]], b.pay_id);
    }
    if (code === "card_declined") {
      const declines = Number(b.decline_count) + 1;
      const cureS = SECOND_CHARGE_CURE_HOURS * 3600;
      // Seconds left in the cure period (the first decline starts it now).
      const leftS = b.cure_deadline_at == null ? cureS : Number(b.cure_left_s);
      if (leftS <= 0 || declines >= SECOND_CHARGE_MAX_DECLINES) {
        const res = await commit({
          payment: [`UPDATE payments SET status = 'failed_final', attempts = $1, decline_count = $2, last_error = $3,
                       first_decline_at = COALESCE(first_decline_at, now()), cure_deadline_at = COALESCE(cure_deadline_at, now() + make_interval(secs => $5)) WHERE id = $4`,
            [n, declines, code, b.pay_id, cureS]],
          audit: { action: "second_payment_failed_final", after: { declines, cure_deadline: b.cure_deadline_at } }, jobStatus: "failed", err: code, result: "failed_final" });
        if (res === "failed_final") console.error("ALERT second payment still unpaid at the end of the 72-hour cure period; Oscar decides whether to cancel (Booking Terms §6)");
        return res;
      }
      const waitS = Math.min(RETRY_AFTER_DECLINE_S, leftS); // the last retry lands exactly on the deadline
      const res = await commit({
        payment: [`UPDATE payments SET status = 'retrying', attempts = $1, decline_count = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4),
                     first_decline_at = COALESCE(first_decline_at, now()), cure_deadline_at = COALESCE(cure_deadline_at, now() + make_interval(secs => $6)) WHERE id = $5`,
          [n, declines, code, waitS, b.pay_id, cureS]],
        audit: declines === 1 ? { action: "second_payment_cure_started", after: { cure_hours: SECOND_CHARGE_CURE_HOURS } } : undefined,
        jobStatus: "pending", err: code, runAtOffsetS: waitS, result: "retry_scheduled" });
      if (res === "retry_scheduled") console.info(`second payment declined (${declines}); 72-hour cure period running; guest notice pending (email gate); retry scheduled`);
      return res;
    }
    return ambiguous();
  }

  /** Outcome unknown: retry later with the SAME key, until the limits; then manual review (never failed_final). */
  function ambiguous(): Promise<Result> {
    if (Number(b.job_attempts) >= SECOND_CHARGE_MAX_AMBIGUOUS || Number(b.overdue_s) > SECOND_CHARGE_MAX_OVERDUE_S)
      return manualReview("manual_review", "charge outcome unknown after retry limit", null, b.pay_id);
    const backoffS = Math.min(300 * 2 ** Math.max(0, Number(b.job_attempts) - 1), 6 * 3600) * (0.8 + Math.random() * 0.4);
    return commit({ jobStatus: "pending", err: "ambiguous", runAtOffsetS: backoffS, result: "ambiguous" });
  }
}
