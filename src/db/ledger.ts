import type { Db } from "./client";
import type { Quote } from "../domain/quote";
import { PROCESSING_MESSAGE, type CheckoutOutcome, type CheckoutRequest, type Reconcile } from "../services/checkout";

export class ManualReviewError extends Error { name = "ManualReviewError"; }

export type ReconcileResult =
  | { result: "resolved"; guest: GuestView } | { result: "deferred" } | { result: "skipped" }
  | { result: "failed"; error: Error } | { result: "manual_review"; error: Error };
/** Absence evidence policy (ChatGPT note 89). */
export const ABSENCE_MIN_AGE_S = 120;
export const ABSENCE_CHECKS = 3;
const ABSENCE_SCHEDULE_S = [120, 300, 900]; // ~2, 5, 15 minutes after the attempt
export const RECONCILE_MAX_ATTEMPTS = 12;
export const RECONCILE_MAX_AGE_S = 48 * 3600;
export class ConfirmConflictError extends Error { name = "ConfirmConflictError"; }
import type { HospitableAdapter, PaymentsAdapter } from "../adapters/types";
import type { VerificationDeadline } from "../domain/verification";

export interface ReconcileDeps {
  hosp: HospitableAdapter; pay: PaymentsAdapter;
  propertyUuid: (key: string) => string;
  verification: (checkIn: string) => VerificationDeadline;
}
import { guestView, GuestView } from "../server/guestView";

/**
 * Durable checkout records (ChatGPT note 69/78 gates: DB-backed idempotency and persisted quote acceptance).
 *
 *  - Every quote shown to a guest is saved with a 15-minute expiry; checkout must name that saved quote.
 *  - Every Pay press is one checkout attempt with a browser-generated attempt key. A repeated request with the
 *    same key never runs again: it waits for and returns the first result.
 *  - A quote can produce at most one confirmed booking (unique index), so two tabs cannot book it twice.
 *  - Only one attempt per quote may touch Stripe/Hospitable at a time (quote lease, migration 0003). Attempts are
 *    serialized with single-statement row updates; no database transaction is held open while waiting or while
 *    Stripe/Hospitable calls run. A lease whose attempt is still 'running' (crash) is never taken over: later
 *    attempts get "in progress" and the stuck attempt is left for reconciliation.
 *  - On success, the guest, booking, payments (initial + scheduled second charge) and the second-charge job are
 *    written in one transaction, with an audit entry.
 */
export interface SavedQuote {
  id: string; version: number; propertyKey: string; checkIn: string; checkOut: string;
  adults: number; children: number; infants: number; total: number; expiresAt: Date; quote: Quote;
  /** Anonymous browser session that requested the quote; checkout must come from the same session. */
  sessionId: string;
}

export interface StayRef { property: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number }

export interface Ledger {
  saveQuote(stay: StayRef, quote: Quote, session: string, now: Date): Promise<SavedQuote>;
  getQuote(id: string): Promise<SavedQuote | null>;
  /** Runs the checkout once per attempt key; repeats get the stored guest view. */
  runAttempt(attemptKey: string, q: SavedQuote, bookingRef: string, work: () => Promise<CheckoutOutcome>): Promise<GuestView>;
}

export const QUOTE_HOLD_MS = 15 * 60_000;
/** Longer than the checkout function's 60-second limit. */
const LEASE_SECONDS = 90;
const IN_PROGRESS: StoredOutcome = { guest: { ok: false, reason: "in_progress", guestMessage: "Your booking is still being processed. Please don't pay again; we'll email you the result." } };
const WAIT_FOR_RUNNING_MS = 25_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StoredOutcome = { guest: GuestView; internal?: Record<string, unknown> };

export class DbLedger implements Ledger {
  constructor(private db: Db, private pollMs = 400) {}

  async saveQuote(stay: StayRef, quote: Quote, session: string, now: Date): Promise<SavedQuote> {
    const expiresAt = new Date(now.getTime() + QUOTE_HOLD_MS);
    const [row] = await this.db.query<{ id: string; version: number }>(
      `INSERT INTO quotes (property_key, check_in, check_out, adults, children, infants, line_items, total_cents, expires_at, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, version`,
      [stay.property, stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.infants, JSON.stringify(quote), quote.total, expiresAt.toISOString(), session],
    );
    return { id: row!.id, version: row!.version, propertyKey: stay.property, checkIn: stay.checkIn, checkOut: stay.checkOut,
      adults: stay.adults, children: stay.children, infants: stay.infants, total: quote.total, expiresAt, quote, sessionId: session };
  }

  async getQuote(id: string): Promise<SavedQuote | null> {
    const rows = await this.db.query<any>(
      `SELECT id, version, property_key, to_char(check_in, 'YYYY-MM-DD') AS check_in, to_char(check_out, 'YYYY-MM-DD') AS check_out,
              adults, children, infants, total_cents, expires_at, line_items, session_id
       FROM quotes WHERE id = $1 ORDER BY version DESC LIMIT 1`, [id]);
    const r = rows[0];
    if (!r) return null;
    const quote = typeof r.line_items === "string" ? JSON.parse(r.line_items) : r.line_items;
    return { id: r.id, version: r.version, propertyKey: r.property_key, checkIn: r.check_in, checkOut: r.check_out,
      adults: r.adults, children: r.children, infants: r.infants, total: r.total_cents, expiresAt: new Date(r.expires_at), quote, sessionId: r.session_id ?? "" };
  }

  async runAttempt(attemptKey: string, q: SavedQuote, bookingRef: string, work: () => Promise<CheckoutOutcome>): Promise<GuestView> {
    const claimed = await this.db.query(
      `INSERT INTO checkout_attempts (attempt_key, quote_id, quote_version, booking_ref, status) VALUES ($1, $2, $3, $4, 'running')
       ON CONFLICT (attempt_key) DO NOTHING RETURNING attempt_key`, [attemptKey, q.id, q.version, bookingRef]);
    if (!claimed.length) return this.waitFor(attemptKey);

    // Serialize per quote: wait (without holding a transaction) until this attempt holds the quote lease.
    const until = Date.now() + WAIT_FOR_RUNNING_MS;
    for (;;) {
      const booked = await this.priorSuccess(q);
      if (booked) {
        await this.finish(attemptKey, { ...booked, internal: { note: "quote already booked by an earlier attempt" } });
        return booked.guest;
      }
      if (await this.acquireLease(q, attemptKey)) break;
      const holder = await this.leaseHolder(q);
      if (holder?.stuck) {
        // The holder outlived its lease without finishing: possible crash after a side effect. Never take over.
        console.error("ALERT stuck checkout attempt; reconciliation needed", holder!.attempt_key);
        return this.finish(attemptKey, IN_PROGRESS).then(() => IN_PROGRESS.guest);
      }
      if (Date.now() > until) return this.finish(attemptKey, IN_PROGRESS).then(() => IN_PROGRESS.guest);
      await sleep(this.pollMs);
    }

    // Re-check after acquiring: the previous holder may have just booked this quote.
    const booked = await this.priorSuccess(q);
    if (booked) {
      await this.finish(attemptKey, { ...booked, internal: { note: "quote already booked by an earlier attempt" } });
      await this.releaseLease(q, attemptKey);
      return booked.guest;
    }

    let outcome: CheckoutOutcome;
    try {
      outcome = await work();
    } catch (e) {
      // An unexpected error the work did not classify: a payment or reservation may exist. Queue it for
      // reconciliation (which finds IDs by booking ref) instead of storing a generic 'done' (ChatGPT note 87).
      console.error("ALERT unclassified checkout error; queued for reconciliation", bookingRef, (e as Error).name);
      outcome = { ok: false, state: "needs_reconciliation", reason: "processing", guestMessage: PROCESSING_MESSAGE, log: [`unclassified error: ${(e as Error).name}`],
        reconcile: { stage: "unknown", bookingRef } };
    }
    if (!outcome.ok && outcome.reconcile) {
      // A payment and/or reservation exists but the booking could not be confirmed or recorded (note 85):
      // never report success, keep the quote locked, and queue it durably for reconciliation by ID.
      console.error("ALERT checkout needs reconciliation", outcome.reconcile.stage, outcome.reconcile.bookingRef);
      const stored: StoredOutcome = { guest: guestView(outcome, bookingRef), internal: { state: outcome.state, log: outcome.log } };
      await this.db.query(
        `UPDATE checkout_attempts SET status = 'needs_reconciliation', outcome = $2, reconcile = $3, booking_id = $4, finished_at = now() WHERE attempt_key = $1`,
        [attemptKey, JSON.stringify(stored), JSON.stringify(outcome.reconcile), outcome.reconcile.bookingId ?? null]);
      await this.db.query(`UPDATE quotes SET lease_until = 'infinity' WHERE id = $1 AND version = $2 AND active_attempt = $3`, [q.id, q.version, attemptKey]);
      return stored.guest;
    }
    const stored: StoredOutcome = { guest: guestView(outcome, bookingRef), internal: { state: outcome.state, log: outcome.log,
      ...(outcome.ok ? { reservationId: outcome.reservationId, paymentIntentId: outcome.paymentIntentId } : {}) } };
    await this.finish(attemptKey, stored);
    await this.releaseLease(q, attemptKey);
    return stored.guest;
  }

  private async priorSuccess(q: SavedQuote): Promise<StoredOutcome | null> {
    const rows = await this.db.query<{ outcome: StoredOutcome | string }>(
      `SELECT outcome FROM checkout_attempts WHERE quote_id = $1 AND quote_version = $2 AND status = 'done'
         AND outcome -> 'guest' ->> 'ok' = 'true' LIMIT 1`, [q.id, q.version]);
    const o = rows[0]?.outcome;
    return o ? (typeof o === "string" ? JSON.parse(o) : o) : null;
  }

  /** Single-statement compare-and-set. Free if nobody holds it, or the holder's attempt has finished. */
  private async acquireLease(q: SavedQuote, attemptKey: string): Promise<boolean> {
    const rows = await this.db.query(
      `UPDATE quotes SET active_attempt = $3, lease_until = now() + interval '${LEASE_SECONDS} seconds'
       WHERE id = $1 AND version = $2 AND (
         active_attempt IS NULL OR active_attempt = $3 OR
         (lease_until IS DISTINCT FROM 'infinity' AND
          EXISTS (SELECT 1 FROM checkout_attempts a WHERE a.attempt_key = quotes.active_attempt AND a.status = 'done')))
       RETURNING id`, [q.id, q.version, attemptKey]);
    return rows.length > 0;
  }

  private async leaseHolder(q: SavedQuote) {
    // stuck = marked for reconciliation (lease 'infinity'), or still 'running' past its lease (crash).
    const [r] = await this.db.query<{ attempt_key: string; status: string; stuck: boolean }>(
      `SELECT a.attempt_key, a.status,
              (q.lease_until = 'infinity'::timestamptz OR (a.status = 'running' AND q.lease_until < now())) AS stuck
       FROM quotes q JOIN checkout_attempts a ON a.attempt_key = q.active_attempt
       WHERE q.id = $1 AND q.version = $2`, [q.id, q.version]);
    return r ?? null;
  }

  private async releaseLease(q: SavedQuote, attemptKey: string) {
    await this.db.query(`UPDATE quotes SET active_attempt = NULL, lease_until = NULL WHERE id = $1 AND version = $2 AND active_attempt = $3`, [q.id, q.version, attemptKey]);
  }

  /**
   * Step 1, BEFORE any payment or reservation: the guest and a pending booking are saved, so a later failure
   * never leaves a captured payment without a booking row.
   */
  async startBooking(req: CheckoutRequest, q: SavedQuote): Promise<string> {
    const guestId = crypto.randomUUID(), bookingId = crypto.randomUUID();
    await this.db.tx([
      [`INSERT INTO guests (id, first_name, last_name, email, phone) VALUES ($1, $2, $3, $4, $5)`,
        [guestId, req.guest.firstName, req.guest.lastName, req.guest.email, req.guest.phone]],
      [`INSERT INTO bookings (id, booking_ref, quote_id, quote_version, guest_id, state, plan, consent_id, consent_text, policy_versions, consent_accepted_at)
        VALUES ($1, $2, $3, $4, $5, 'checkout_started', $6, $7, $8, $9, $10)`,
        [bookingId, req.bookingRef, q.id, q.version, guestId, q.quote.plan.split ? "split" : "full",
          req.consent?.id ?? null, req.consent?.text ?? null, req.consent ? JSON.stringify(req.consent.versions) : null, req.consent?.acceptedAt ?? null]],
      [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'checkout_started', $2)`,
        [bookingId, JSON.stringify({ booking_ref: req.bookingRef, quote: q.id, total: q.total, consent: req.consent?.id ?? null })]],
    ]);
    return bookingId;
  }

  /**
   * Step 2, after capture: confirms the booking, records payments, verification row and jobs in one transaction.
   * Idempotent (safe to repeat from reconciliation): the booking update only applies once and every insert is keyed.
   */
  async confirmBooking(bookingId: string, q: SavedQuote, c: { bookingRef: string; state: string; reservationId: string; paymentIntentId: string;
    verification: { deadline: string; rule: string } }): Promise<void> {
    const plan = q.quote.plan;
    // Already confirmed? It must be the same payment, reservation and amount; never silently accept different data.
    const [existing] = await this.db.query<any>(
      `SELECT b.confirmed_at, b.reservation_ref, p.stripe_payment_intent_id AS pi, p.amount_cents FROM bookings b
       LEFT JOIN payments p ON p.booking_id = b.id AND p.kind = 'initial' WHERE b.id = $1`, [bookingId]);
    if (existing?.confirmed_at) {
      if (existing.reservation_ref !== c.reservationId || existing.pi !== c.paymentIntentId || existing.amount_cents !== plan.dueNow)
        throw new ConfirmConflictError(`booking ${c.bookingRef} already confirmed with different payment/reservation/amount`);
      return;
    }
    const st: Array<[string, unknown[]]> = [
      [`UPDATE bookings SET state = $2, hospitable_reservation_id = $3, reservation_ref = $4, verification_deadline_at = $5, verification_rule = $6,
          confirmed_at = now(), updated_at = now() WHERE id = $1 AND confirmed_at IS NULL`,
        [bookingId, c.state, uuidOrNull(c.reservationId), c.reservationId, c.verification.deadline, c.verification.rule]],
      [`INSERT INTO payments (booking_id, kind, idempotency_key, stripe_payment_intent_id, amount_cents, status) VALUES ($1, 'initial', $2, $3, $4, 'captured')
        ON CONFLICT (idempotency_key) DO NOTHING`, [bookingId, `${c.bookingRef}:initial`, c.paymentIntentId, plan.dueNow]],
      [`INSERT INTO verifications (booking_id) VALUES ($1) ON CONFLICT (booking_id) DO NOTHING`, [bookingId]],
      [`INSERT INTO jobs (type, booking_id, run_at) VALUES ('deadline', $1, $2) ON CONFLICT DO NOTHING`, [bookingId, c.verification.deadline]],
      [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'booking_confirmed', $2)
        ON CONFLICT (booking_id, action) WHERE action IN ('booking_confirmed', 'reconciled') DO NOTHING`,
        [bookingId, JSON.stringify({ booking_ref: c.bookingRef, reservation: c.reservationId, payment_intent: c.paymentIntentId, total: q.total, due_now: plan.dueNow })]],
    ];
    if (plan.split && plan.scheduled) {
      st.push([`INSERT INTO payments (booking_id, kind, idempotency_key, amount_cents, status, scheduled_for) VALUES ($1, 'scheduled', $2, $3, 'scheduled', $4)
        ON CONFLICT (idempotency_key) DO NOTHING`, [bookingId, `${c.bookingRef}:scheduled`, plan.scheduled.amount, new Date(plan.scheduled.chargeAt).toISOString()]]);
      st.push([`INSERT INTO jobs (type, booking_id, run_at) VALUES ('second_payment', $1, $2) ON CONFLICT DO NOTHING`, [bookingId, new Date(plan.scheduled.chargeAt).toISOString()]]);
    }
    await this.db.tx(st);
  }

  /** Note 135: record that the 15-minute price lock was honored. No guest PII. */
  async auditPriceLock(bookingId: string, a: { bookingRef: string; quoteId: string; locked: number; live: number; absorbed: number; at: Date }): Promise<void> {
    await this.db.query(`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'price_lock_honored', $2)`,
      [bookingId, JSON.stringify({ booking_ref: a.bookingRef, quote_id: a.quoteId, locked_total: a.locked, live_total: a.live, absorbed: a.absorbed, at: a.at.toISOString() })]);
  }

  /** Best effort: a booking that ended without any payment or reservation is closed. */
  async closeBooking(bookingId: string, state: string): Promise<void> {
    await this.db.query(`UPDATE bookings SET state = $2, updated_at = now() WHERE id = $1 AND confirmed_at IS NULL`, [bookingId, state]).catch(() => undefined);
  }

  /**
   * Resolves one attempt queued as 'needs_reconciliation' (or a 'reconciling' claim whose worker died).
   * 1. Atomic claim (one UPDATE ... RETURNING with a random token) BEFORE any external call; a second worker gets null.
   * 2. Work out what really exists, by ID or by booking ref: the PaymentIntent status and the reservation.
   * 3. Decide: captured + reservation -> confirm booking. Authorized + reservation + dates blocked -> capture, confirm.
   *    Otherwise unwind: cancel any reservation, void any authorization, close the booking (no charge).
   *    Captured without a reservation -> stays queued for a human (refund decision), never auto-refunded.
   * 4. Only then: guest-visible result, audit (once), lease release. On an error the claim is returned to the
   *    queue with last_error; external steps are idempotent, so a retry is safe.
   */
  async reconcile(attemptKey: string, deps: ReconcileDeps, claimSeconds = 120): Promise<GuestView | null> {
    const res = await this.reconcileDetailed(attemptKey, deps, claimSeconds);
    if (res.result === "failed" || res.result === "manual_review") throw res.error;
    return res.result === "resolved" ? res.guest : null;
  }

  /**
   * Eventual consistency (ChatGPT note 89): Stripe search and Hospitable lookups can lag, so an empty lookup is not
   * proof of absence. Absence becomes reliable only when the attempt is at least 2 minutes old AND three separate
   * negative checks agree (scheduled about 2, 5 and 15 minutes after the attempt, with jitter). Until then the item
   * is re-queued with next_reconcile_at and no external action is taken. A lookup error is "ambiguous": it never
   * counts as absence and is retried with exponential backoff. Beyond MAX_ATTEMPTS or MAX_AGE the item moves to
   * 'manual_review' with an alert, never a hot loop.
   */
  async reconcileDetailed(attemptKey: string, deps: ReconcileDeps, claimSeconds = 120): Promise<ReconcileResult> {
    const token = crypto.randomUUID();
    const [a] = await this.db.query<any>(
      `UPDATE checkout_attempts SET status = 'reconciling', claim_token = $2, claimed_at = now(),
         claim_expires_at = now() + make_interval(secs => $3), reconcile_attempts = reconcile_attempts + 1
       WHERE attempt_key = $1 AND (next_reconcile_at IS NULL OR next_reconcile_at <= now())
         AND (status = 'needs_reconciliation' OR (status = 'reconciling' AND claim_expires_at < now()))
       RETURNING quote_id, booking_ref, reconcile, booking_id, negative_checks, reconcile_attempts,
                 EXTRACT(EPOCH FROM (now() - created_at))::float AS age_s`, [attemptKey, token, claimSeconds]);
    if (!a) return { result: "skipped" }; // not queued, not due yet, or another worker holds a live claim
    const r: Reconcile = typeof a.reconcile === "string" ? JSON.parse(a.reconcile) : a.reconcile;
    const ageS: number = Number(a.age_s);
    try {
      if (a.reconcile_attempts > RECONCILE_MAX_ATTEMPTS || ageS > RECONCILE_MAX_AGE_S) throw new ManualReviewError("reconciliation attempt/age limit reached");
      const q = (await this.getQuote(a.quote_id))!;
      const bookingId: string | null = r.bookingId ?? a.booking_id ?? (await this.db.query<any>(`SELECT id FROM bookings WHERE booking_ref = $1`, [r.bookingRef]))[0]?.id ?? null;

      // Facts. Known IDs are used directly; missing ones are looked up (lookup errors propagate as ambiguous).
      const pis = r.paymentIntentId ? [r.paymentIntentId] : await deps.pay.findByRef(r.bookingRef);
      const paymentLookupEmpty = !r.paymentIntentId && pis.length === 0;
      // Stage tells us when a reservation was never created (authorization never succeeded) or was definitely
      // rejected/cancelled: no lookup needed. Otherwise look it up by code (= booking ref).
      const noReservationByStage = r.stage === "authorize_unknown" || r.stage === "void_failed";
      const reservationId = r.reservationId ?? (noReservationByStage ? null : await deps.hosp.findReservationByCode(r.bookingRef));
      const reservationLookupEmpty = !r.reservationId && !noReservationByStage && reservationId === null;

      if (paymentLookupEmpty || reservationLookupEmpty) {
        const negatives = ageS < ABSENCE_MIN_AGE_S ? a.negative_checks : a.negative_checks + 1;
        if (ageS < ABSENCE_MIN_AGE_S || negatives < ABSENCE_CHECKS) {
          const nextOffsetS = ABSENCE_SCHEDULE_S[Math.min(negatives, ABSENCE_SCHEDULE_S.length - 1)]!;
          await this.requeue(attemptKey, token, { negativeChecks: negatives, nextAtOffsetFromCreatedS: nextOffsetS,
            note: `absence not yet reliable (payment empty=${paymentLookupEmpty}, reservation empty=${reservationLookupEmpty}, negatives=${negatives})` });
          return { result: "deferred" };
        }
      }

      const statuses = await Promise.all(pis.map(async (id) => ({ id, status: await deps.pay.status(id) })));
      const captured = statuses.find((x) => x.status === "captured");
      const authorized = statuses.filter((x) => x.status === "authorized");

      // Stages where checkout had already decided to unwind (a definite failure, then the undo step failed) are
      // always finished as an unwind: never captured later.
      const mustUnwind = r.stage === "void_failed" || r.stage === "cancel_failed";
      let guest: GuestView, outcome: string;
      if (captured && (!reservationId || mustUnwind)) {
        throw new ManualReviewError("payment captured but the booking can't stand: refund decision needed");
      } else if (!mustUnwind && (captured || (authorized.length === 1 && reservationId && (await this.datesBlocked(q, deps))))) {
        const pi = captured?.id ?? authorized[0]!.id;
        if (!captured) await deps.pay.capture(pi);
        for (const extra of authorized.filter((x) => x.id !== pi)) await deps.pay.voidAuthorization(extra.id);
        const v = r.confirmed?.verification ?? (() => { const d = deps.verification(q.checkIn); return { deadline: d.deadline.toISOString(), deadlineText: d.deadlineText, rule: d.rule, mustCompleteBeforeAccess: d.mustCompleteBeforeAccess }; })();
        if (!bookingId) throw new ManualReviewError("no booking row for a captured payment");
        await this.confirmBooking(bookingId, q, { bookingRef: r.bookingRef, state: "confirmed", reservationId: reservationId!, paymentIntentId: pi, verification: v });
        guest = { ok: true, bookingRef: r.bookingRef, verification: { deadlineText: v.deadlineText, mustCompleteBeforeAccess: v.mustCompleteBeforeAccess } };
        outcome = "confirmed";
      } else {
        // Reached only with reliable evidence: a reservation is cancelled only when the payment side is known or
        // reliably absent, and an authorization is voided only when the reservation side is known or reliably absent.
        if (reservationId) await deps.hosp.cancelReservation(reservationId);
        for (const x of authorized) await deps.pay.voidAuthorization(x.id);
        if (bookingId) await this.closeBooking(bookingId, "closed");
        guest = { ok: false, reason: "reservation_failed", guestMessage: "We couldn't confirm this booking, so it was cancelled. No charge was completed; any temporary hold will be released by your bank." };
        outcome = "unwound";
      }
      // Finish only if we still hold the claim (a stale worker that lost it must not overwrite).
      const done = await this.db.query(
        `UPDATE checkout_attempts SET status = 'done', outcome = $3, finished_at = now(), claim_token = NULL, last_error = NULL, next_reconcile_at = NULL
         WHERE attempt_key = $1 AND claim_token = $2 RETURNING attempt_key`, [attemptKey, token, JSON.stringify({ guest, internal: { reconciled: r.stage, outcome } })]);
      if (!done.length) return { result: "skipped" };
      if (bookingId) await this.db.query(
        `INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'reconciled', $2)
         ON CONFLICT (booking_id, action) WHERE action IN ('booking_confirmed', 'reconciled') DO NOTHING`, [bookingId, JSON.stringify({ stage: r.stage, outcome })]);
      await this.releaseLease(q, attemptKey);
      return { result: "resolved", guest };
    } catch (e) {
      const err = e as Error;
      if (e instanceof ManualReviewError) {
        await this.db.query(
          `UPDATE checkout_attempts SET status = 'manual_review', claim_token = NULL, claim_expires_at = NULL, next_reconcile_at = NULL, last_error = $3
           WHERE attempt_key = $1 AND claim_token = $2`, [attemptKey, token, `${err.name}: ${err.message}`.slice(0, 300)]);
        console.error("ALERT reconciliation needs manual review", r.bookingRef, err.message);
        return { result: "manual_review", error: err };
      }
      // Ambiguous or transient: exponential backoff with jitter (30 s, 1, 2, 4 ... capped at 60 min).
      const backoffS = Math.min(30 * 2 ** Math.max(0, a.reconcile_attempts - 1), 3600) * (0.8 + Math.random() * 0.4);
      await this.db.query(
        `UPDATE checkout_attempts SET status = 'needs_reconciliation', claim_token = NULL, claim_expires_at = NULL,
           next_reconcile_at = now() + make_interval(secs => $4), last_error = $3
         WHERE attempt_key = $1 AND claim_token = $2`, [attemptKey, token, `${err.name}: ${err.message}`.slice(0, 300), backoffS]);
      return { result: "failed", error: err };
    }
  }

  /** Puts a claimed item back in the queue for a scheduled re-check (no external action was taken). */
  private async requeue(attemptKey: string, token: string, o: { negativeChecks: number; nextAtOffsetFromCreatedS: number; note: string }) {
    const jitterS = Math.round(o.nextAtOffsetFromCreatedS * (Math.random() * 0.2)); // up to +20%
    await this.db.query(
      `UPDATE checkout_attempts SET status = 'needs_reconciliation', claim_token = NULL, claim_expires_at = NULL, negative_checks = $3,
         next_reconcile_at = GREATEST(now() + interval '30 seconds', created_at + make_interval(secs => $4)), last_error = $5
       WHERE attempt_key = $1 AND claim_token = $2`, [attemptKey, token, o.negativeChecks, o.nextAtOffsetFromCreatedS + jitterS, o.note]);
  }

  private async datesBlocked(q: SavedQuote, deps: ReconcileDeps): Promise<boolean> {
    const cal = await deps.hosp.getCalendar(deps.propertyUuid(q.propertyKey), q.checkIn, q.checkOut, { fresh: true });
    return cal.filter((d) => d.date < q.checkOut).every((d) => !d.available);
  }

  /** Attempts waiting for reconciliation (including claims whose worker died), oldest first. */
  async pendingReconciliation(limit = 20): Promise<string[]> {
    return (await this.db.query<{ attempt_key: string }>(
      `SELECT attempt_key FROM checkout_attempts
       WHERE (status = 'needs_reconciliation' AND (next_reconcile_at IS NULL OR next_reconcile_at <= now()))
          OR (status = 'reconciling' AND claim_expires_at < now())
       ORDER BY created_at LIMIT $1`, [limit])).map((r) => r.attempt_key);
  }

  private async finish(attemptKey: string, stored: StoredOutcome): Promise<void> {
    await this.db.query(`UPDATE checkout_attempts SET status = 'done', outcome = $2, finished_at = now() WHERE attempt_key = $1`, [attemptKey, JSON.stringify(stored)]);
  }

  private async waitFor(attemptKey: string): Promise<GuestView> {
    const until = Date.now() + WAIT_FOR_RUNNING_MS;
    for (;;) {
      const [r] = await this.db.query<{ status: string; outcome: StoredOutcome | null }>(`SELECT status, outcome FROM checkout_attempts WHERE attempt_key = $1`, [attemptKey]);
      if (r && r.status !== "running" && r.outcome) return (typeof r.outcome === "string" ? JSON.parse(r.outcome) : r.outcome).guest;
      if (Date.now() > until) return { ok: false, reason: "in_progress", guestMessage: "Your booking is still being processed. Please don't pay again; we'll email you the result." };
      await sleep(this.pollMs);
    }
  }
}

/** Hospitable reservation IDs are UUIDs; mock IDs are not, so they are kept only in the audit log. */
const uuidOrNull = (id: string) => (/^[0-9a-f-]{36}$/i.test(id) ? id : null);

/** In-memory ledger for mock mode without a database (local demos). Same behavior, not durable. */
export class MemoryLedger implements Ledger {
  quotes = new Map<string, SavedQuote>();
  attempts = new Map<string, { quoteId: string; promise: Promise<GuestView> }>();
  private chains = new Map<string, Promise<unknown>>();
  async saveQuote(stay: StayRef, quote: Quote, _s: string, now: Date) {
    const q: SavedQuote = { id: crypto.randomUUID(), version: 1, propertyKey: stay.property, checkIn: stay.checkIn, checkOut: stay.checkOut,
      adults: stay.adults, children: stay.children, infants: stay.infants, total: quote.total, expiresAt: new Date(now.getTime() + QUOTE_HOLD_MS), quote, sessionId: _s };
    this.quotes.set(q.id, q); return q;
  }
  async getQuote(id: string) { return this.quotes.get(id) ?? null; }
  runAttempt(attemptKey: string, q: SavedQuote, bookingRef: string, work: () => Promise<CheckoutOutcome>) {
    const existing = this.attempts.get(attemptKey);
    if (existing) return existing.promise;
    const earlier = [...this.attempts.values()].filter((a) => a.quoteId === q.id).map((a) => a.promise);
    // Attempts for one quote run one after another; a later one returns an earlier success instead of running.
    const prev = this.chains.get(q.id) ?? Promise.resolve();
    const promise = prev.catch(() => undefined).then(async () => {
      for (const p of earlier) { const g = await p.catch(() => null); if (g?.ok) return g; }
      return guestView(await work(), bookingRef);
    });
    this.chains.set(q.id, promise);
    this.attempts.set(attemptKey, { quoteId: q.id, promise });
    return promise;
  }
}
