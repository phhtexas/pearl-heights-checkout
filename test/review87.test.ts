// ChatGPT note 87: every failure boundary is either safely retryable (nothing external happened) or queued for
// reconciliation with IDs; nothing is orphaned behind an 'infinity' lease; reconciliation workers claim atomically.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger, ReconcileDeps } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { AdapterError } from "../src/adapters/types";
import type { CheckoutRequest } from "../src/services/checkout";
import { bookingAttempt } from "../src/services/bookingFlow";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { verificationDeadline } from "../src/domain/verification";
import { runMigrations } from "../scripts/migrate.mjs";

const wrap = (pg: PGlite): Db => ({
  async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
  async tx(st) { await pg.transaction(async (t) => { for (const [text, p] of st) await t.query(text, p as any[]); }); },
});
const NOW = new Date("2026-11-14T20:00:00Z");
const prop = getProperty("edgewood");
const fast = { blockCheckDelaysMs: [0, 1], sleep: async () => {} };
let db: Db, ledger: DbLedger, n = 0;
beforeEach(async () => { db = wrap(new PGlite()); await runMigrations(db, undefined, () => {}); ledger = new DbLedger(db, 5); });

async function setup(h: MockHospitable) {
  const stay = { property: "edgewood", checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(prop.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "s", NOW);
  const req = (ref: string): CheckoutRequest => ({ ...stay, property: prop, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } });
  return { saved, req };
}
const key = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const one = async (sql: string, p: unknown[] = []) => (await db.query<any>(sql, p))[0];
const deps = (h: MockHospitable, p: MockPayments): ReconcileDeps => ({ hosp: h, pay: p, propertyUuid: (k) => getProperty(k).hospitableUuid, verification: (ci) => verificationDeadline(NOW, ci) });
async function attempt(h: MockHospitable, p: MockPayments, ref: string) {
  const { saved, req } = await setup(h);
  const k = key();
  const view = await ledger.runAttempt(k, saved, ref, () => bookingAttempt(ledger, saved, req(ref), h, p, fast));
  const row = await one(`SELECT status, reconcile FROM checkout_attempts WHERE attempt_key = $1`, [k]);
  const lease = await one(`SELECT active_attempt, lease_until::text AS lease_until FROM quotes WHERE id = $1`, [saved.id]);
  return { view, row, lease, saved, k, req };
}
/** No quote may be locked forever unless its attempt is queued for reconciliation. */
async function noOrphanedLeases() {
  const r = await one(`SELECT count(*)::int AS n FROM quotes q LEFT JOIN checkout_attempts a ON a.attempt_key = q.active_attempt
    WHERE q.lease_until = 'infinity' AND (a.status IS NULL OR a.status NOT IN ('needs_reconciliation', 'reconciling'))`);
  expect(r.n).toBe(0);
}

describe("before any side effect: retryable, lease released, booking closed, nothing charged", () => {
  it("startBooking DB failure", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    ledger.startBooking = async () => { throw new Error("db down"); };
    const r = await attempt(h, p, "PH-PRE001");
    expect(r.view).toMatchObject({ ok: false, reason: "retryable_error" });
    expect((r.view as any).guestMessage).toMatch(/No charge was made/);
    expect(r.row.status).toBe("done");
    expect(r.lease.active_attempt).toBeNull();
    expect(p.intents.size).toBe(0);
    await noOrphanedLeases();
  });
  it("first fresh Hospitable calendar read fails", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(h); // quote first, then break the calendar
    h.getCalendar = async () => { throw new AdapterError("Hospitable 503", "upstream_error"); };
    const k = key();
    const view = await ledger.runAttempt(k, saved, "PH-PRE002", () => bookingAttempt(ledger, saved, req("PH-PRE002"), h, p, fast));
    expect(view).toMatchObject({ reason: "retryable_error" });
    expect((await one(`SELECT active_attempt FROM quotes WHERE id = $1`, [saved.id])).active_attempt).toBeNull();
    expect((await one(`SELECT state FROM bookings WHERE booking_ref = 'PH-PRE002'`)).state).toBe("closed");
    expect(p.intents.size).toBe(0);
    await noOrphanedLeases();
  });
});

describe("after a possible side effect: queued with IDs, processing copy, quote locked; reconciliation resolves once", () => {
  const cases: Array<[string, (h: MockHospitable, p: MockPayments) => void, string, "confirmed" | "unwound"]> = [
    ["authorize times out after Stripe created the hold", (_h, p) => { p.authorizeThenTimeout = true; }, "authorize_unknown", "unwound"],
    ["createReservation times out after Hospitable created it", (h) => { h.createThenTimeout = true; }, "reservation_unknown", "confirmed"],
    ["reservation rejected and the void fails", (h, p) => { h.failure = "reservation_fails"; p.voidFails = true; }, "void_failed", "unwound"],
    ["block poll throws", (h) => { const g = h.getCalendar.bind(h); h.getCalendar = async (...a) => { if (h.reservationCount > 0) throw new AdapterError("503", "upstream_error"); return g(...a); }; }, "block_unconfirmed", "confirmed"],
    ["capture times out after Stripe captured", (_h, p) => { p.captureThenTimeout = true; }, "capture_unknown", "confirmed"],
    ["capture fails and the cancel fails", (h, p) => { p.failure = "capture_fails"; h.cancelReservation = async () => { throw new AdapterError("503", "upstream_error"); }; }, "cancel_failed", "unwound"],
  ];
  for (const [name, inject, stage, expected] of cases) {
    it(name, async () => {
      const h = new MockHospitable(), p = new MockPayments();
      const ref = `PH-${stage.slice(0, 3).toUpperCase()}${String(n).padStart(3, "0")}`.slice(0, 9).padEnd(9, "X");
      inject(h, p);
      const r = await attempt(h, p, ref);
      expect(r.view).toMatchObject({ ok: false, reason: "processing" });
      expect((r.view as any).guestMessage).toMatch(/don't pay again/);
      expect(r.row.status).toBe("needs_reconciliation");
      expect(r.row.reconcile.stage).toBe(stage);
      expect(r.lease.lease_until).toBe("infinity");
      await noOrphanedLeases();
      // A different attempt key on the same quote must not create anything new.
      const before = { pis: p.intents.size, res: h.reservationCount };
      expect(await ledger.runAttempt(key(), r.saved, "PH-OTHER1", () => bookingAttempt(ledger, r.saved, r.req("PH-OTHER1"), h, p, fast))).toMatchObject({ reason: "in_progress" });
      expect({ pis: p.intents.size, res: h.reservationCount }).toEqual(before);

      // Systems recover; reconciliation runs.
      const fresh = new MockHospitable(); // healthy calendar view with the same reservations
      Object.assign(h, { getCalendar: fresh.getCalendar.bind(h), cancelReservation: MockHospitable.prototype.cancelReservation.bind(h) });
      Object.assign(p, { voidFails: false, failure: "none", authorizeThenTimeout: false, captureThenTimeout: false });
      const g = await ledger.reconcile(r.k, deps(h, p));
      const captured = [...p.intents.values()].filter((x) => x.status === "captured").length;
      const authorized = [...p.intents.values()].filter((x) => x.status === "authorized").length;
      if (expected === "confirmed") {
        expect(g).toMatchObject({ ok: true, bookingRef: ref });
        expect(captured).toBe(1);
        expect((await one(`SELECT count(*)::int AS n FROM bookings WHERE confirmed_at IS NOT NULL`)).n).toBe(1);
      } else {
        expect(g).toMatchObject({ ok: false });
        expect(captured).toBe(0);
        expect(h.reservationCount === 0 || (await h.getCalendar(prop.hospitableUuid, "2027-04-05", "2027-04-06")).every((d) => d.available)).toBe(true);
        expect((await one(`SELECT active_attempt FROM quotes WHERE id = $1`, [r.saved.id])).active_attempt).toBeNull(); // guest may retry
      }
      expect(authorized).toBe(0); // no hold left behind
      expect(p.intents.size).toBe(before.pis); // reconciliation never creates payments
      expect(await ledger.reconcile(r.k, deps(h, p))).toBeNull(); // resolved exactly once
      expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'reconciled'`)).n).toBeLessThanOrEqual(1);
    });
  }
});

describe("atomic worker claim", () => {
  it("two workers at once: exactly one external action sequence and one reconciled audit row", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.hideNewBlocksForReads = Infinity;
    const r = await attempt(h, p, "PH-WRK001");
    expect(r.row.stage ?? r.row.reconcile.stage).toBe("block_unconfirmed");
    h.hideNewBlocksForReads = 0;
    let captures = 0;
    const cap = p.capture.bind(p);
    p.capture = async (id) => { captures++; await new Promise((x) => setTimeout(x, 20)); return cap(id); };
    const results = await Promise.all([ledger.reconcile(r.k, deps(h, p)), ledger.reconcile(r.k, deps(h, p))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(captures).toBe(1);
    expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'reconciled'`)).n).toBe(1);
    expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'booking_confirmed'`)).n).toBe(1);
  });
  it("a live claim is not taken; an expired claim (dead worker) is reclaimed explicitly", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.hideNewBlocksForReads = Infinity;
    const r = await attempt(h, p, "PH-WRK002");
    await db.query(`UPDATE checkout_attempts SET status = 'reconciling', claim_token = 'dead', claim_expires_at = now() + interval '1 minute' WHERE attempt_key = $1`, [r.k]);
    expect(await ledger.reconcile(r.k, deps(h, p))).toBeNull();
    expect(await ledger.pendingReconciliation()).toEqual([]);
    await db.query(`UPDATE checkout_attempts SET claim_expires_at = now() - interval '1 second' WHERE attempt_key = $1`, [r.k]);
    expect(await ledger.pendingReconciliation()).toEqual([r.k]);
    h.hideNewBlocksForReads = 0;
    expect(await ledger.reconcile(r.k, deps(h, p))).toMatchObject({ ok: true });
  });
  it("a failing reconciliation returns the item to the queue with last_error and attempts counted", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.hideNewBlocksForReads = Infinity;
    const r = await attempt(h, p, "PH-WRK003");
    h.hideNewBlocksForReads = 0;
    p.capture = async () => { throw new AdapterError("503", "upstream_error"); };
    await expect(ledger.reconcile(r.k, deps(h, p))).rejects.toThrow();
    const row = await one(`SELECT status, last_error, reconcile_attempts FROM checkout_attempts WHERE attempt_key = $1`, [r.k]);
    expect(row).toMatchObject({ status: "needs_reconciliation", reconcile_attempts: 1 });
    expect(row.last_error).toMatch(/503/);
  });
  it("captured without any reservation is never auto-resolved: stays queued for a human", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    p.captureThenTimeout = true;
    const r = await attempt(h, p, "PH-MAN001");
    h.findReservationByCode = async () => null;
    await db.query(`UPDATE checkout_attempts SET reconcile = reconcile - 'reservationId' WHERE attempt_key = $1`, [r.k]);
    await expect(ledger.reconcile(r.k, deps(h, p))).rejects.toThrow(/refund decision/);
    expect((await one(`SELECT status FROM checkout_attempts WHERE attempt_key = $1`, [r.k])).status).toBe("needs_reconciliation");
  });
});

describe("confirmBooking consistency", () => {
  it("re-confirming with the same data is a no-op; different PI/reservation/amount is refused; audit written once", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const r = await attempt(h, p, "PH-CNF001");
    expect(r.view).toMatchObject({ ok: true });
    const b = await one(`SELECT b.id, b.reservation_ref, p.stripe_payment_intent_id AS pi FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.kind = 'initial' WHERE b.booking_ref = 'PH-CNF001'`);
    const v = { deadline: "2026-11-15T20:00:00.000Z", rule: "24h" };
    await ledger.confirmBooking(b.id, r.saved, { bookingRef: "PH-CNF001", state: "confirmed", reservationId: b.reservation_ref, paymentIntentId: b.pi, verification: v });
    await expect(ledger.confirmBooking(b.id, r.saved, { bookingRef: "PH-CNF001", state: "confirmed", reservationId: b.reservation_ref, paymentIntentId: "pi_other", verification: v })).rejects.toThrow(/different/);
    await expect(ledger.confirmBooking(b.id, r.saved, { bookingRef: "PH-CNF001", state: "confirmed", reservationId: "mock-res-OTHER", paymentIntentId: b.pi, verification: v })).rejects.toThrow(/different/);
    expect((await one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'booking_confirmed'`)).n).toBe(1);
  });
});
