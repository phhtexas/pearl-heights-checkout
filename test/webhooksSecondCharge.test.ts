import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { bookingAttempt } from "../src/services/bookingFlow";
import { runDueSecondCharges, SECOND_CHARGE_MAX_DECLINES } from "../src/services/secondCharge";
import { handleStripeEvent, verifyStripeEvent, WebhookSignatureError } from "../src/server/stripeWebhook";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { runMigrations } from "../scripts/migrate.mjs";

const wrap = (pg: PGlite): Db => ({
  async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
  async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
});
let db: Db, ledger: DbLedger;
beforeEach(async () => { db = wrap(new PGlite()); await runMigrations(db, undefined, () => {}); ledger = new DbLedger(db, 5); });
const one = async (sql: string, p: unknown[] = []) => (await db.query<any>(sql, p))[0];
const NOW = new Date("2026-11-14T20:00:00Z");

/** A confirmed split booking (check-in > 30 days out) with its second charge due now. */
async function splitBooking(p: MockPayments, ref = "PH-SPL001") {
  const h = new MockHospitable(), prop = getProperty("752");
  const stay = { property: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(prop.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ payPlan: "split",  ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "s", NOW);
  const o = await bookingAttempt(ledger, saved, { ...stay, property: prop, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } }, h, p, { blockCheckDelaysMs: [0], sleep: async () => {} });
  expect(o.ok).toBe(true);
  await db.query(`UPDATE jobs SET run_at = now() - interval '1 minute' WHERE type = 'second_payment'`);
  return { quote, initialPi: `pi_mock_${ref}:initial` };
}
const scheduled = () => one(`SELECT status, attempts, stripe_payment_intent_id AS pi, amount_cents FROM payments WHERE kind = 'scheduled'`);
const job = () => one(`SELECT status, run_at, last_error FROM jobs WHERE type = 'second_payment'`);
/** Time passes: the job and the payment's retry time are both due (simulates the 24 h wait). */
const dueAgain = async () => {
  await db.query(`UPDATE jobs SET run_at = now() - interval '1 second' WHERE type = 'second_payment'`);
  await db.query(`UPDATE payments SET next_attempt_at = now() - interval '1 second' WHERE kind = 'scheduled' AND next_attempt_at IS NOT NULL`);
};
const offSessionCharges = (p: MockPayments) => [...p.intents.keys()].filter((k) => k.includes(":scheduled:")).length;

describe("second charge", () => {
  it("charges the saved card once for the scheduled amount; a rerun does nothing", async () => {
    const p = new MockPayments();
    const { quote } = await splitBooking(p);
    expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 1, paid: 1 });
    expect(await scheduled()).toMatchObject({ status: "paid", pi: "pi_mock_PH-SPL001:scheduled:1", amount_cents: quote.plan.scheduled!.amount });
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ paid: 0 });
    expect(offSessionCharges(p)).toBe(1);
  });
  it("is not due before run_at", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    await db.query(`UPDATE jobs SET run_at = now() + interval '1 day' WHERE type = 'second_payment'`);
    expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 0 });
  });
  it("two overlapping runners charge once", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    const charge = p.chargeSaved.bind(p);
    p.chargeSaved = async (i) => { await new Promise((r) => setTimeout(r, 20)); return charge(i); };
    const [a, b] = await Promise.all([runDueSecondCharges(db, p), runDueSecondCharges(db, p)]);
    expect(a.paid + b.paid).toBe(1);
    expect(offSessionCharges(p)).toBe(1);
  });
  it("ambiguous error after Stripe charged: retry uses the SAME key -> no double charge", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "timeout_after_charge";
    expect(await runDueSecondCharges(db, p)).toMatchObject({ ambiguous: 1 });
    expect((await scheduled()).status).toBe("scheduled");
    p.offSession = "ok";
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ paid: 1 });
    expect(offSessionCharges(p)).toBe(1);
    expect((await scheduled()).pi).toBe("pi_mock_PH-SPL001:scheduled:1");
  });
  it("declines retry daily within the 72-hour cure period, then failed_final + alert; never more than the limit", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "decline";
    for (let i = 1; i < SECOND_CHARGE_MAX_DECLINES; i++) {
      expect(await runDueSecondCharges(db, p)).toMatchObject({ retry_scheduled: 1 });
      expect(await scheduled()).toMatchObject({ status: "retrying", attempts: i });
      const j = await job();
      expect(new Date(j.run_at).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);
      await dueAgain();
    }
    expect(await runDueSecondCharges(db, p)).toMatchObject({ failed_final: 1 });
    expect(await scheduled()).toMatchObject({ status: "failed_final", attempts: SECOND_CHARGE_MAX_DECLINES });
    expect((await job()).status).toBe("failed");
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 0 });
  });
  it("the 72-hour cure period starts at the FIRST decline and never moves", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "decline";
    const t0 = Date.now();
    await runDueSecondCharges(db, p);
    const first = await one(`SELECT first_decline_at, cure_deadline_at, next_attempt_at FROM payments WHERE kind = 'scheduled'`);
    expect(new Date(first.first_decline_at).getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(new Date(first.cure_deadline_at).getTime() - new Date(first.first_decline_at).getTime()).toBe(72 * 3600_000);
    expect(new Date(first.next_attempt_at).getTime() - t0).toBeGreaterThan(23 * 3600_000);
    expect(await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'second_payment_cure_started'`)).toEqual({ n: 1 });
    await dueAgain();
    await runDueSecondCharges(db, p);
    const second = await one(`SELECT first_decline_at, cure_deadline_at FROM payments WHERE kind = 'scheduled'`);
    expect(second).toEqual({ first_decline_at: first.first_decline_at, cure_deadline_at: first.cure_deadline_at });
    expect((await scheduled()).status).toBe("retrying"); // not cancelled, not final
    expect(await one(`SELECT state FROM bookings`)).toMatchObject({ state: "confirmed" });
  });
  it("the last retry lands on the deadline, and a decline after it is final (booking left for Oscar)", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "decline";
    await runDueSecondCharges(db, p);
    // 10 hours left in the cure period: the next retry is at the deadline, not 24 h later
    await db.query(`UPDATE payments SET cure_deadline_at = now() + interval '10 hours' WHERE kind = 'scheduled'`);
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ retry_scheduled: 1 });
    const r = await one(`SELECT EXTRACT(EPOCH FROM (next_attempt_at - cure_deadline_at))::float AS gap FROM payments WHERE kind = 'scheduled'`);
    expect(Math.abs(r.gap)).toBeLessThan(5);
    // Deadline reached and still declined -> final + alert, booking itself unchanged
    await db.query(`UPDATE payments SET cure_deadline_at = now() - interval '1 second' WHERE kind = 'scheduled'`);
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ failed_final: 1 });
    expect((await scheduled()).status).toBe("failed_final");
    expect(await one(`SELECT state FROM bookings`)).toMatchObject({ state: "confirmed" });
  });
  it("paid within the cure period: done, no more tries", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "decline";
    await runDueSecondCharges(db, p);
    p.offSession = "ok";
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ paid: 1 });
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 0 });
  });
  it("a decline then success uses a new key for the new attempt", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "decline";
    await runDueSecondCharges(db, p);
    p.offSession = "ok";
    await dueAgain();
    await runDueSecondCharges(db, p);
    expect((await scheduled()).pi).toBe("pi_mock_PH-SPL001:scheduled:2");
  });
  it("never charges a cancelled booking", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    await db.query(`UPDATE bookings SET state = 'cancelled'`);
    expect(await runDueSecondCharges(db, p)).toMatchObject({ skipped: 1, paid: 0 });
    expect(offSessionCharges(p)).toBe(0);
  });
});

describe("Stripe webhooks", () => {
  const SECRET = "whsec_test_" + "a".repeat(24);
  const event = (id: string, type: string, created: number, obj: Record<string, unknown>) =>
    ({ id, object: "event", type, created, livemode: false, data: { object: obj } }) as unknown as Stripe.Event;
  it("verifies the signature on the raw body; tampered or missing signatures are refused", () => {
    const raw = JSON.stringify(event("evt_1", "payment_intent.succeeded", 1, { id: "pi_x" }));
    const sig = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: SECRET });
    expect(verifyStripeEvent(raw, sig, SECRET).id).toBe("evt_1");
    expect(() => verifyStripeEvent(raw.replace("pi_x", "pi_y"), sig, SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyStripeEvent(raw, null, SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyStripeEvent(raw, sig, "whsec_other")).toThrow(WebhookSignatureError);
  });
  it("replays are acknowledged without effects", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    const e = event("evt_r1", "charge.refunded", 2_000_000_000, { id: "ch_1", payment_intent: initialPi, amount: 100, amount_refunded: 100, refunded: true });
    expect(await handleStripeEvent(db, e)).toBe("processed");
    expect(await handleStripeEvent(db, e)).toBe("duplicate");
    expect((await one(`SELECT count(*)::int AS n FROM webhook_events`)).n).toBe(1);
  });
  it("out of order: an older event never overwrites a newer status", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    await handleStripeEvent(db, event("evt_new", "charge.refunded", 2_000_000_100, { id: "ch_1", payment_intent: initialPi, amount: 100, amount_refunded: 100, refunded: true }));
    await handleStripeEvent(db, event("evt_old", "payment_intent.succeeded", 2_000_000_000, { id: initialPi, status: "succeeded" }));
    expect((await one(`SELECT status FROM payments WHERE kind = 'initial'`)).status).toBe("refunded");
  });
  it("stores only a minimal summary (no customer details)", async () => {
    await handleStripeEvent(db, event("evt_pii", "payment_intent.succeeded", 1, { id: "pi_none", status: "succeeded", receipt_email: "t@example.com", shipping: { name: "Test Guest" } }));
    expect(JSON.stringify(await one(`SELECT payload FROM webhook_events`))).not.toMatch(/example\.com|Test Guest/);
  });
  it("wakes a queued reconciliation for the same payment but takes no money action itself", async () => {
    const p = new MockPayments(), h = new MockHospitable(), prop = getProperty("edgewood");
    const stay = { property: "edgewood", checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0 };
    const cal = await h.getCalendar(prop.hospitableUuid, stay.checkIn, stay.checkOut);
    const quote = buildQuote({ payPlan: "split",  ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
    const saved = await ledger.saveQuote(stay, quote, "s", NOW);
    h.hideNewBlocksForReads = Infinity;
    const k = "00000000-0000-4000-8000-0000000000aa";
    await ledger.runAttempt(k, saved, "PH-WAK001", () => bookingAttempt(ledger, saved, { ...stay, property: prop, now: NOW, bookingRef: "PH-WAK001", acceptedTotal: quote.total,
      guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } }, h, p, { blockCheckDelaysMs: [0], sleep: async () => {} }));
    await db.query(`UPDATE checkout_attempts SET next_reconcile_at = now() + interval '1 hour' WHERE attempt_key = $1`, [k]);
    const before = JSON.stringify([...p.intents.entries()]);
    await handleStripeEvent(db, event("evt_wake", "payment_intent.amount_capturable_updated", 3, { id: "pi_mock_PH-WAK001:initial", metadata: { booking_ref: "PH-WAK001" } }));
    expect(new Date((await one(`SELECT next_reconcile_at FROM checkout_attempts WHERE attempt_key = $1`, [k])).next_reconcile_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(JSON.stringify([...p.intents.entries()])).toBe(before);
  });
  it("a processing failure leaves the event unprocessed so Stripe's retry processes it", async () => {
    const e = event("evt_fail", "charge.refunded", 5, { id: "ch_9", payment_intent: "pi_z" });
    const broken: Db = { ...db, query: async (t, p) => { if (/^\s*SELECT id, kind/.test(t)) throw new Error("db blip"); return db.query(t, p); } };
    await expect(handleStripeEvent(broken, e)).rejects.toThrow();
    expect((await one(`SELECT processed_at FROM webhook_events WHERE external_event_id = 'evt_fail'`)).processed_at).toBeNull();
    expect(await handleStripeEvent(db, e)).not.toBe("duplicate");
    expect((await one(`SELECT processed_at FROM webhook_events WHERE external_event_id = 'evt_fail'`)).processed_at).not.toBeNull();
  });
});

describe("note 95 fixes", () => {
  const SECRET = "whsec_test_" + "c".repeat(24);
  const ev = (id: string, type: string, created: number, obj: Record<string, unknown>) =>
    ({ id, object: "event", type, created, livemode: false, data: { object: obj } }) as unknown as Stripe.Event;

  it("(1) two concurrent deliveries of the same new event: effects run once; the other returns in_progress", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    let effects = 0;
    const counting: Db = { ...db, query: async (t, prm) => { if (/^\s*UPDATE payments SET refunded_cents/.test(t)) { effects++; await new Promise((r) => setTimeout(r, 20)); } return db.query(t, prm); } };
    const e = ev("evt_conc", "charge.refunded", 10, { id: "ch_1", payment_intent: initialPi, amount: 1000, amount_refunded: 200 });
    const results = await Promise.all([handleStripeEvent(counting, e), handleStripeEvent(counting, e)]);
    expect(results.sort()).toEqual(["in_progress", "processed"]);
    expect(effects).toBe(1);
    expect(await handleStripeEvent(db, e)).toBe("duplicate");
  });
  it("(1) a crash after the dispute audit but before processed_at does not duplicate the audit on retry", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    const e = ev("evt_disp", "charge.dispute.created", 11, { id: "dp_1", payment_intent: initialPi, amount: 500 });
    const crashing: Db = { ...db, query: async (t, prm) => { if (/SET processed_at = now\(\)/.test(t)) throw new Error("crash"); return db.query(t, prm); } };
    await expect(handleStripeEvent(crashing, e)).rejects.toThrow();
    expect(await handleStripeEvent(db, e)).toBe("processed");
    expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'dispute_opened'`)).n).toBe(1);
  });
  it("(2) partial then full refund; out-of-order delivery never lowers the cumulative amount", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    const pay = () => one(`SELECT status, refunded_cents FROM payments WHERE kind = 'initial'`);
    await handleStripeEvent(db, ev("evt_p1", "charge.refunded", 100, { id: "ch_1", payment_intent: initialPi, amount: 1000, amount_refunded: 300, refunded: false }));
    expect(await pay()).toEqual({ status: "partially_refunded", refunded_cents: 300 });
    await handleStripeEvent(db, ev("evt_full", "charge.refunded", 300, { id: "ch_1", payment_intent: initialPi, amount: 1000, amount_refunded: 1000, refunded: true }));
    expect(await pay()).toEqual({ status: "refunded", refunded_cents: 1000 });
    // An older partial-refund event delivered late:
    await handleStripeEvent(db, ev("evt_p2_late", "charge.refunded", 200, { id: "ch_1", payment_intent: initialPi, amount: 1000, amount_refunded: 600, refunded: false }));
    expect(await pay()).toEqual({ status: "refunded", refunded_cents: 1000 });
    // An even older payment_intent.succeeded never downgrades a refunded payment:
    await handleStripeEvent(db, ev("evt_old_success", "payment_intent.succeeded", 50, { id: initialPi, status: "succeeded" }));
    expect(await pay()).toEqual({ status: "refunded", refunded_cents: 1000 });
  });
  it("(2) out-of-order partials: larger cumulative amount wins", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    await handleStripeEvent(db, ev("evt_b", "charge.refunded", 200, { id: "ch_1", payment_intent: initialPi, amount: 1000, amount_refunded: 500 }));
    await handleStripeEvent(db, ev("evt_a", "charge.refunded", 100, { id: "ch_1", payment_intent: initialPi, amount: 1000, amount_refunded: 200 }));
    expect(await one(`SELECT status, refunded_cents FROM payments WHERE kind = 'initial'`)).toEqual({ status: "partially_refunded", refunded_cents: 500 });
  });
  it("(3) persistent ambiguity stops: manual_review, one Stripe charge via the same key, no longer due", async () => {
    const { SECOND_CHARGE_MAX_AMBIGUOUS } = await import("../src/services/secondCharge");
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "timeout_always";
    let last: any;
    for (let i = 0; i < SECOND_CHARGE_MAX_AMBIGUOUS + 2; i++) { last = await runDueSecondCharges(db, p); await dueAgain(); }
    expect(last).toMatchObject({ due: 0 });
    expect((await job()).status).toBe("manual_review");
    expect((await scheduled()).status).toBe("manual_review");
    expect(offSessionCharges(p)).toBe(1);
    expect([...p.intents.keys()].filter((k) => k.includes(":scheduled:"))).toEqual(["pi_mock_PH-SPL001:scheduled:1"]);
  });
  it("(3) ambiguity past 48 h after the scheduled time -> manual_review", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    await db.query(`UPDATE payments SET scheduled_for = now() - interval '49 hours' WHERE kind = 'scheduled'`);
    p.offSession = "timeout_after_charge";
    expect(await runDueSecondCharges(db, p)).toMatchObject({ manual_review: 1 });
  });
  it("(4) missing saved card -> manual_review; no key, no decline consumed, no charge", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.savedMethod = async () => null;
    expect(await runDueSecondCharges(db, p)).toMatchObject({ manual_review: 1 });
    expect(await one(`SELECT status, attempts, decline_count FROM payments WHERE kind = 'scheduled'`)).toEqual({ status: "manual_review", attempts: 0, decline_count: 0 });
    expect(offSessionCharges(p)).toBe(0);
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 0 });
  });
  it("(4) authentication required -> requires_action + manual review; no further off-session tries", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "auth_required";
    expect(await runDueSecondCharges(db, p)).toMatchObject({ manual_review: 1 });
    expect(await one(`SELECT status, decline_count FROM payments WHERE kind = 'scheduled'`)).toEqual({ status: "requires_action", decline_count: 0 });
    expect((await one(`SELECT state FROM bookings`)).state).toBe("confirmed"); // booking intact
    await dueAgain();
    expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 0 });
  });
  it("(5) body limit: oversized chunked stream and oversized declared length are refused before any work", async () => {
    const { readBodyLimited } = await import("../src/server/stripeWebhook");
    const big = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(100_000)); c.close(); } });
    expect(await readBodyLimited(new Request("https://x.test", { method: "POST", body: big, duplex: "half" } as any), 1_000_000)).toBeNull();
    expect(await readBodyLimited(new Request("https://x.test", { method: "POST", body: "x", headers: { "content-length": "2000000" } }), 1_000_000)).toBeNull();
    expect(await readBodyLimited(new Request("https://x.test", { method: "POST", body: "ok" }), 1_000_000)).toBe("ok");
  });
});

describe("note 97: second-charge crash consistency", () => {
  const expireClaim = () => db.query(`UPDATE jobs SET claim_expires_at = now() - interval '1 second' WHERE type = 'second_payment'`);
  /** A db whose transaction fails at the final job update (after the payment/audit statements ran) -> full rollback. */
  const failingAtJobUpdate = (): Db => ({ ...db, tx: async (st) => db.tx([...st.slice(0, -1), ["SELECT 1/0", []]]) });
  const stripeCalls = (p: MockPayments) => { let n = 0; const c = p.chargeSaved.bind(p), s = p.savedMethod.bind(p);
    p.chargeSaved = async (i) => { n++; return c(i); }; p.savedMethod = async (x) => { n++; return s(x); }; return () => n; };

  for (const [name, mode, expectAfter] of [
    ["paid", "ok", { status: "paid", keys: ["pi_mock_PH-SPL001:scheduled:1"] }],
    ["decline", "decline", { status: "retrying", keys: [] }],
    ["auth required", "auth_required", { status: "requires_action", keys: [] }],
  ] as const) {
    it(`(1) failure at the ${name} commit rolls back fully; recovery reaches one consistent state with no extra charge`, async () => {
      const p = new MockPayments();
      await splitBooking(p);
      p.offSession = mode;
      await expect(runDueSecondCharges(failingAtJobUpdate(), p)).rejects.toThrow();
      expect(await one(`SELECT status, attempts, decline_count FROM payments WHERE kind = 'scheduled'`)).toEqual({ status: "scheduled", attempts: 0, decline_count: 0 });
      expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'second_payment%'`)).n).toBe(0);
      await expireClaim(); // the dead worker's claim expires
      await runDueSecondCharges(db, p);
      const pay = await one(`SELECT status, attempts, decline_count FROM payments WHERE kind = 'scheduled'`);
      expect(pay.status).toBe(expectAfter.status);
      expect(pay.attempts).toBe(1); // same key n=1 reused, not a new key
      expect([...p.intents.keys()].filter((k) => k.includes(":scheduled:"))).toEqual(expectAfter.keys);
      if (mode === "decline") expect(pay.decline_count).toBe(1);
    });
  }
  for (const terminal of ["requires_action", "manual_review", "failed_final", "refunded", "partially_refunded", "paid"]) {
    it(`(2) stale reclaimed job + payment ${terminal}: zero Stripe calls, job repaired`, async () => {
      const p = new MockPayments();
      await splitBooking(p);
      await db.query(`UPDATE payments SET status = $1 WHERE kind = 'scheduled'`, [terminal]);
      await db.query(`UPDATE jobs SET status = 'running', claim_token = 'dead', claim_expires_at = now() - interval '1 second' WHERE type = 'second_payment'`);
      const calls = stripeCalls(p);
      expect(await runDueSecondCharges(db, p)).toMatchObject({ due: 1, skipped: 1 });
      expect(calls()).toBe(0);
      expect((await job()).status).not.toBe("running");
      expect((await job()).status).not.toBe("pending");
    });
  }
  it("(3) after a decline, a stale/forced-due job cannot retry before the 24 h retry time", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    p.offSession = "decline";
    await runDueSecondCharges(db, p);
    await db.query(`UPDATE jobs SET run_at = now() - interval '1 second' WHERE type = 'second_payment'`); // job due, payment retry not
    const calls = stripeCalls(p);
    expect(await runDueSecondCharges(db, p)).toMatchObject({ skipped: 1 });
    expect(calls()).toBe(0);
    expect(await one(`SELECT decline_count, attempts FROM payments WHERE kind = 'scheduled'`)).toEqual({ decline_count: 1, attempts: 1 });
    expect(new Date((await job()).run_at).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000); // job re-aligned to the retry time
  });
  it("(4) worker B reclaims an expired claim while A is in Stripe: only B commits, one audit row, no overwrite", async () => {
    const p = new MockPayments();
    await splitBooking(p);
    let releaseA!: () => void;
    const aBlocked = new Promise<void>((r) => { releaseA = r; });
    const realCharge = p.chargeSaved.bind(p);
    let call = 0;
    p.chargeSaved = async (i) => { if (++call === 1) await aBlocked; return realCharge(i); };
    const a = runDueSecondCharges(db, p); // A claims, then waits inside Stripe
    await new Promise((r) => setTimeout(r, 50));
    await expireClaim();
    const b = await runDueSecondCharges(db, p); // B reclaims and finishes (same key n=1)
    expect(b).toMatchObject({ paid: 1 });
    releaseA();
    expect(await a).toMatchObject({ skipped: 1, paid: 0 }); // A's commit matches nothing
    expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'second_payment_paid'`)).n).toBe(1);
    expect(await one(`SELECT status, attempts FROM payments WHERE kind = 'scheduled'`)).toEqual({ status: "paid", attempts: 1 });
    expect([...p.intents.keys()].filter((k) => k.includes(":scheduled:"))).toEqual(["pi_mock_PH-SPL001:scheduled:1"]);
  });
});
