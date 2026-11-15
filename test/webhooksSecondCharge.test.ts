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
  async tx(st) { await pg.transaction(async (t) => { for (const [text, p] of st) await t.query(text, p as any[]); }); },
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
  const quote = buildQuote({ ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "s", NOW);
  const o = await bookingAttempt(ledger, saved, { ...stay, property: prop, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } }, h, p, { blockCheckDelaysMs: [0], sleep: async () => {} });
  expect(o.ok).toBe(true);
  await db.query(`UPDATE jobs SET run_at = now() - interval '1 minute' WHERE type = 'second_payment'`);
  return { quote, initialPi: `pi_mock_${ref}:initial` };
}
const scheduled = () => one(`SELECT status, attempts, stripe_payment_intent_id AS pi, amount_cents FROM payments WHERE kind = 'scheduled'`);
const job = () => one(`SELECT status, run_at, last_error FROM jobs WHERE type = 'second_payment'`);
const dueAgain = () => db.query(`UPDATE jobs SET run_at = now() - interval '1 second' WHERE type = 'second_payment'`);
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
  it("declines retry daily within the grace period, then failed_final + alert; never more than the limit", async () => {
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
    const e = event("evt_r1", "charge.refunded", 2_000_000_000, { id: "ch_1", payment_intent: initialPi, amount: 100 });
    expect(await handleStripeEvent(db, e)).toBe("processed");
    expect(await handleStripeEvent(db, e)).toBe("duplicate");
    expect((await one(`SELECT count(*)::int AS n FROM webhook_events`)).n).toBe(1);
  });
  it("out of order: an older event never overwrites a newer status", async () => {
    const p = new MockPayments();
    const { initialPi } = await splitBooking(p);
    await handleStripeEvent(db, event("evt_new", "charge.refunded", 2_000_000_100, { id: "ch_1", payment_intent: initialPi }));
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
    const quote = buildQuote({ ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
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
