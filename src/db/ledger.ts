import type { Db } from "./client";
import type { Quote } from "../domain/quote";
import type { CheckoutOutcome, CheckoutRequest } from "../services/checkout";
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
      // Unknown failure mid-checkout: a payment may or may not exist. Record it for reconciliation; the attempt is
      // marked done but the quote lease is NOT released here, so nobody retries this quote blindly.
      console.error("ALERT checkout attempt failed mid-flight; reconciliation needed", attemptKey, (e as Error).name);
      const guest: GuestView = { ok: false, reason: "error", guestMessage: "Something went wrong while completing your booking. Please don't pay again; we're checking whether a payment went through and will email you." };
      await this.finish(attemptKey, { guest, internal: { error: String((e as Error).message), needsReconciliation: true } });
      await this.db.query(`UPDATE quotes SET lease_until = 'infinity' WHERE id = $1 AND version = $2 AND active_attempt = $3`, [q.id, q.version, attemptKey]);
      return guest;
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

  /** Writes the confirmed booking in one transaction. Called by the checkout work after capture. */
  async recordBooking(req: CheckoutRequest, q: SavedQuote, o: Extract<CheckoutOutcome, { ok: true }>): Promise<void> {
    const guestId = crypto.randomUUID(), bookingId = crypto.randomUUID();
    const plan = o.quote.plan;
    const st: Array<[string, unknown[]]> = [
      [`INSERT INTO guests (id, first_name, last_name, email, phone) VALUES ($1, $2, $3, $4, $5)`,
        [guestId, req.guest.firstName, req.guest.lastName, req.guest.email, req.guest.phone]],
      [`INSERT INTO bookings (id, booking_ref, quote_id, quote_version, guest_id, state, hospitable_reservation_id, plan, verification_deadline_at, verification_rule)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [bookingId, req.bookingRef, q.id, q.version, guestId, o.state, uuidOrNull(o.reservationId), plan.split ? "split" : "full",
          o.verification.deadline.toISOString(), o.verification.rule]],
      [`INSERT INTO payments (booking_id, kind, idempotency_key, stripe_payment_intent_id, amount_cents, status) VALUES ($1, 'initial', $2, $3, $4, 'captured')`,
        [bookingId, `${req.bookingRef}:initial`, o.paymentIntentId, plan.dueNow]],
      [`INSERT INTO verifications (booking_id) VALUES ($1)`, [bookingId]],
      [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'booking_confirmed', $2)`,
        [bookingId, JSON.stringify({ booking_ref: req.bookingRef, reservation: o.reservationId, payment_intent: o.paymentIntentId, total: o.quote.total, due_now: plan.dueNow })]],
    ];
    if (plan.split && plan.scheduled) {
      st.push([`INSERT INTO payments (booking_id, kind, idempotency_key, amount_cents, status, scheduled_for) VALUES ($1, 'scheduled', $2, $3, 'scheduled', $4)`,
        [bookingId, `${req.bookingRef}:scheduled`, plan.scheduled.amount, new Date(plan.scheduled.chargeAt).toISOString()]]);
      st.push([`INSERT INTO jobs (type, booking_id, run_at) VALUES ('second_payment', $1, $2)`, [bookingId, new Date(plan.scheduled.chargeAt).toISOString()]]);
    }
    st.push([`INSERT INTO jobs (type, booking_id, run_at) VALUES ('deadline', $1, $2)`, [bookingId, o.verification.deadline.toISOString()]]);
    await this.db.tx(st);
  }

  private async finish(attemptKey: string, stored: StoredOutcome): Promise<void> {
    await this.db.query(`UPDATE checkout_attempts SET status = 'done', outcome = $2, finished_at = now() WHERE attempt_key = $1`, [attemptKey, JSON.stringify(stored)]);
  }

  private async waitFor(attemptKey: string): Promise<GuestView> {
    const until = Date.now() + WAIT_FOR_RUNNING_MS;
    for (;;) {
      const [r] = await this.db.query<{ status: string; outcome: StoredOutcome | null }>(`SELECT status, outcome FROM checkout_attempts WHERE attempt_key = $1`, [attemptKey]);
      if (r?.status === "done" && r.outcome) return (typeof r.outcome === "string" ? JSON.parse(r.outcome) : r.outcome).guest;
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
