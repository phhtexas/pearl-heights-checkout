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
 *  - On success, the guest, booking, payments (initial + scheduled second charge) and the second-charge job are
 *    written in one transaction, with an audit entry.
 */
export interface SavedQuote {
  id: string; version: number; propertyKey: string; checkIn: string; checkOut: string;
  adults: number; children: number; infants: number; total: number; expiresAt: Date; quote: Quote;
}

export interface StayRef { property: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number }

export interface Ledger {
  saveQuote(stay: StayRef, quote: Quote, session: string, now: Date): Promise<SavedQuote>;
  getQuote(id: string): Promise<SavedQuote | null>;
  /** Runs the checkout once per attempt key; repeats get the stored guest view. */
  runAttempt(attemptKey: string, q: SavedQuote, bookingRef: string, work: () => Promise<CheckoutOutcome>): Promise<GuestView>;
}

export const QUOTE_HOLD_MS = 15 * 60_000;
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
      adults: stay.adults, children: stay.children, infants: stay.infants, total: quote.total, expiresAt, quote };
  }

  async getQuote(id: string): Promise<SavedQuote | null> {
    const rows = await this.db.query<any>(
      `SELECT id, version, property_key, to_char(check_in, 'YYYY-MM-DD') AS check_in, to_char(check_out, 'YYYY-MM-DD') AS check_out,
              adults, children, infants, total_cents, expires_at, line_items
       FROM quotes WHERE id = $1 ORDER BY version DESC LIMIT 1`, [id]);
    const r = rows[0];
    if (!r) return null;
    const quote = typeof r.line_items === "string" ? JSON.parse(r.line_items) : r.line_items;
    return { id: r.id, version: r.version, propertyKey: r.property_key, checkIn: r.check_in, checkOut: r.check_out,
      adults: r.adults, children: r.children, infants: r.infants, total: r.total_cents, expiresAt: new Date(r.expires_at), quote };
  }

  async runAttempt(attemptKey: string, q: SavedQuote, bookingRef: string, work: () => Promise<CheckoutOutcome>): Promise<GuestView> {
    const claimed = await this.db.query(
      `INSERT INTO checkout_attempts (attempt_key, quote_id, quote_version, booking_ref, status) VALUES ($1, $2, $3, $4, 'running')
       ON CONFLICT (attempt_key) DO NOTHING RETURNING attempt_key`, [attemptKey, q.id, q.version, bookingRef]);
    if (!claimed.length) return this.waitFor(attemptKey);

    // Same quote already booked (e.g. a second tab): return that booking, never charge again.
    const prior = await this.db.query<{ outcome: StoredOutcome }>(
      `SELECT outcome FROM checkout_attempts WHERE quote_id = $1 AND quote_version = $2 AND status = 'done'
         AND outcome -> 'guest' ->> 'ok' = 'true' LIMIT 1`, [q.id, q.version]);
    if (prior[0]) {
      await this.finish(attemptKey, { ...prior[0].outcome, internal: { note: "quote already booked by an earlier attempt" } });
      return prior[0].outcome.guest;
    }

    let outcome: CheckoutOutcome;
    try {
      outcome = await work();
    } catch (e) {
      // Leave a record for reconciliation; the guest sees a generic error from the route.
      await this.finish(attemptKey, { guest: { ok: false, reason: "error", guestMessage: "Something went wrong. No charge was made." }, internal: { error: String((e as Error).message) } });
      throw e;
    }
    const stored: StoredOutcome = { guest: guestView(outcome, bookingRef), internal: { state: outcome.state, log: outcome.log,
      ...(outcome.ok ? { reservationId: outcome.reservationId, paymentIntentId: outcome.paymentIntentId } : {}) } };
    await this.finish(attemptKey, stored);
    return stored.guest;
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

  private async finish(attemptKey: string, stored: StoredOutcome) {
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
  async saveQuote(stay: StayRef, quote: Quote, _s: string, now: Date) {
    const q: SavedQuote = { id: crypto.randomUUID(), version: 1, propertyKey: stay.property, checkIn: stay.checkIn, checkOut: stay.checkOut,
      adults: stay.adults, children: stay.children, infants: stay.infants, total: quote.total, expiresAt: new Date(now.getTime() + QUOTE_HOLD_MS), quote };
    this.quotes.set(q.id, q); return q;
  }
  async getQuote(id: string) { return this.quotes.get(id) ?? null; }
  runAttempt(attemptKey: string, q: SavedQuote, bookingRef: string, work: () => Promise<CheckoutOutcome>) {
    const existing = this.attempts.get(attemptKey);
    if (existing) return existing.promise;
    const booked = [...this.attempts.values()].find((a) => a.quoteId === q.id);
    const promise = (async () => {
      if (booked) { const g = await booked.promise; if (g.ok) return g; }
      return guestView(await work(), bookingRef);
    })();
    this.attempts.set(attemptKey, { quoteId: q.id, promise });
    return promise;
  }
}
