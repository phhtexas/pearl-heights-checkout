// DB-backed quotes, idempotency, quote lease, booking records and reconciliation (ChatGPT notes 69, 78, 82, 85),
// on a real Postgres engine (PGlite) with the versioned migrations.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger, ReconcileDeps } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { runCheckout, CheckoutRequest } from "../src/services/checkout";
import { bookingAttempt } from "../src/services/bookingFlow";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { verificationDeadline } from "../src/domain/verification";
import { runMigrations, loadMigrations } from "../scripts/migrate.mjs";

function wrap(pg: PGlite): Db {
  return {
    async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
    async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
  };
}
async function freshDb(): Promise<Db> {
  const db = wrap(new PGlite());
  await runMigrations(db, undefined, () => {});
  await runMigrations(db, undefined, () => {}); // second run must be a no-op
  return db;
}

const NOW = new Date("2026-11-14T20:00:00Z");
const p752 = getProperty("752");
const fast = { blockCheckDelaysMs: [0, 1, 1], sleep: async () => {} };
async function setup(ledger: DbLedger, h: MockHospitable, checkIn = "2027-04-12", checkOut = "2027-04-14") {
  const stay = { property: "752", checkIn, checkOut, adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(p752.hospitableUuid, checkIn, checkOut);
  const quote = buildQuote({ payPlan: "split",  ...stay, property: p752, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "sess", NOW);
  const req = (ref: string): CheckoutRequest => ({ ...stay, property: p752, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "Test", lastName: "Guest", email: "t@example.com", phone: "2105550100" } });
  return { saved, quote, req };
}
const count = async (db: Db, sql: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`))[0]!.n);
const deps = (h: MockHospitable, p: MockPayments): ReconcileDeps => ({ hosp: h, pay: p, propertyUuid: (k) => getProperty(k).hospitableUuid, verification: (ci) => verificationDeadline(NOW, ci) });

let db: Db, ledger: DbLedger;
beforeEach(async () => { db = await freshDb(); ledger = new DbLedger(db, 5); });

describe("persisted quotes", () => {
  it("saves and reads back the exact quote with a 15-minute expiry and its session", async () => {
    const { saved, quote } = await setup(ledger, new MockHospitable());
    const back = await ledger.getQuote(saved.id);
    expect(back).toMatchObject({ propertyKey: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", total: quote.total, sessionId: "sess" });
    expect(back!.expiresAt.getTime() - NOW.getTime()).toBe(15 * 60_000);
  });
  it("unknown quote id returns null", async () => expect(await ledger.getQuote("00000000-0000-4000-8000-000000000000")).toBeNull());
});

describe("attempt idempotency and the quote lease", () => {
  const run = (h: MockHospitable, p: MockPayments, saved: any, req: any, ref: string) => () => bookingAttempt(ledger, saved, req(ref), h, p, fast);
  it("same attempt key x3 at once: one run, one charge, one booking, identical results", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    let runs = 0;
    const work = async () => { runs++; return run(h, p, saved, req, "PH-IDEM01")(); };
    const key = "11111111-1111-4111-8111-111111111111";
    const results = await Promise.all([1, 2, 3].map(() => ledger.runAttempt(key, saved, "PH-IDEM01", work)));
    expect(runs).toBe(1);
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(results[0]).toMatchObject({ ok: true, bookingRef: "PH-IDEM01" });
    expect(p.intents.size).toBe(1);
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(1);
  });
  it("4 DIFFERENT keys at once on one quote: exactly 1 authorization, reservation, capture and confirmed booking", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    let runs = 0;
    const results = await Promise.all([1, 2, 3, 4].map((i) => ledger.runAttempt(`7777777${i}-7777-4777-8777-777777777777`, saved, `PH-PAR00${i}`,
      async () => { runs++; return run(h, p, saved, req, `PH-PAR00${i}`)(); })));
    expect(runs).toBe(1);
    expect(p.intents.size).toBe(1);
    expect(h.reservationCount).toBe(1);
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(1);
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });
  it("after a decline the lease is released and a new attempt can succeed", async () => {
    const h = new MockHospitable(), p = new MockPayments("card_declined");
    const { saved, req } = await setup(ledger, h);
    expect(await ledger.runAttempt("44444444-4444-4444-8444-444444444444", saved, "PH-DEC001", run(h, p, saved, req, "PH-DEC001"))).toMatchObject({ reason: "card_declined" });
    expect((await db.query<any>(`SELECT active_attempt FROM quotes WHERE id = $1`, [saved.id]))[0].active_attempt).toBeNull();
    p.failure = "none";
    expect(await ledger.runAttempt("55555555-5555-4555-8555-555555555555", saved, "PH-DEC002", run(h, p, saved, req, "PH-DEC002"))).toMatchObject({ ok: true });
    expect(await count(db, "bookings WHERE state = 'failed_authorization'")).toBe(1); // first booking row closed, not confirmed
  });
  it("an unclassified crash is queued for reconciliation (not 'done'), keeps the quote locked, and the next attempt does not run", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    const crashed = await ledger.runAttempt("88888888-8888-4888-8888-888888888881", saved, "PH-CRASH1", async () => { throw new Error("died"); });
    expect(crashed).toMatchObject({ ok: false, reason: "processing" });
    expect(await ledger.pendingReconciliation()).toEqual(["88888888-8888-4888-8888-888888888881"]);
    let ran = false;
    const next = await ledger.runAttempt("88888888-8888-4888-8888-888888888882", saved, "PH-CRASH2", async () => { ran = true; return run(h, p, saved, req, "PH-CRASH2")(); });
    expect(ran).toBe(false);
    expect(next).toMatchObject({ reason: "in_progress" });
  });
  it("a holder still 'running' past its lease is never taken over", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    await db.query(`INSERT INTO checkout_attempts (attempt_key, quote_id, quote_version, booking_ref, status) VALUES ('stuck', $1, $2, 'PH-STUCK1', 'running')`, [saved.id, saved.version]);
    await db.query(`UPDATE quotes SET active_attempt = 'stuck', lease_until = now() - interval '1 second' WHERE id = $1`, [saved.id]);
    let ran = false;
    expect(await ledger.runAttempt("99999999-9999-4999-8999-999999999999", saved, "PH-STUCK2", async () => { ran = true; return run(h, p, saved, req, "PH-STUCK2")(); }))
      .toMatchObject({ reason: "in_progress" });
    expect(ran).toBe(false);
  });
  it("stored outcomes keep internal details; the returned view never does", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    const v = await ledger.runAttempt("66666666-6666-4666-8666-666666666666", saved, "PH-VIEW01", run(h, p, saved, req, "PH-VIEW01"));
    expect(JSON.stringify(v)).not.toMatch(/log|pi_mock|mock-res/);
    expect(JSON.stringify((await db.query<any>(`SELECT outcome FROM checkout_attempts WHERE booking_ref = 'PH-VIEW01'`))[0].outcome)).toMatch(/pi_mock/);
  });
});

describe("booking records", () => {
  it("a booking row exists BEFORE any payment, and is confirmed with payments, verification, jobs and audit after capture", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req, quote } = await setup(ledger, h);
    let rowsAtAuthorize = -1;
    const auth = p.authorize.bind(p);
    p.authorize = async (i) => { rowsAtAuthorize = await count(db, "bookings WHERE booking_ref = 'PH-REC001'"); return auth(i); };
    const o = await bookingAttempt(ledger, saved, req("PH-REC001"), h, p, fast);
    expect(o.ok).toBe(true);
    expect(rowsAtAuthorize).toBe(1);
    expect(await db.query<any>(`SELECT kind, amount_cents, status, idempotency_key FROM payments ORDER BY kind`)).toEqual([
      { kind: "initial", amount_cents: quote.plan.dueNow, status: "captured", idempotency_key: "PH-REC001:initial" },
      { kind: "scheduled", amount_cents: quote.plan.scheduled!.amount, status: "scheduled", idempotency_key: "PH-REC001:scheduled" },
    ]);
    expect((await db.query<any>(`SELECT type FROM jobs ORDER BY type`)).map((r) => r.type)).toEqual(["deadline", "second_payment"]);
    expect(await count(db, "verifications")).toBe(1);
    expect((await db.query<any>(`SELECT action FROM audit_log ORDER BY id`)).map((r) => r.action)).toEqual(["checkout_started", "booking_confirmed"]);
  });
});

describe("P0: captured but not recorded (note 85)", () => {
  it("is never reported as success; IDs are queued; quote stays locked; a second key makes no new charge; recovery confirms exactly once", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    const realConfirm = ledger.confirmBooking.bind(ledger);
    ledger.confirmBooking = async () => { throw new Error("db down after capture"); };
    const first = await ledger.runAttempt("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", saved, "PH-CNR001", () => bookingAttempt(ledger, saved, req("PH-CNR001"), h, p, fast));
    expect(first.ok).toBe(false);
    expect(first).toMatchObject({ reason: "processing" });
    expect((first as any).guestMessage).toMatch(/don't pay again/);
    const [a] = await db.query<any>(`SELECT status, reconcile FROM checkout_attempts WHERE attempt_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'`);
    expect(a.status).toBe("needs_reconciliation");
    expect(a.reconcile).toMatchObject({ stage: "record_booking", bookingRef: "PH-CNR001" });
    expect(a.reconcile.paymentIntentId).toMatch(/^pi_mock/);
    expect(a.reconcile.reservationId).toMatch(/^mock-res/);
    expect(JSON.stringify(a.reconcile)).not.toMatch(/t@example\.com|2105550100|Guest/); // no PII in the queue
    expect((await db.query<any>(`SELECT lease_until FROM quotes WHERE id = $1`, [saved.id]))[0].lease_until).not.toBeNull();
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(0);

    ledger.confirmBooking = realConfirm;
    const second = await ledger.runAttempt("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", saved, "PH-CNR002", () => bookingAttempt(ledger, saved, req("PH-CNR002"), h, p, fast));
    expect(second).toMatchObject({ ok: false, reason: "in_progress" });
    expect(p.intents.size).toBe(1);
    expect(h.reservationCount).toBe(1);

    expect(await ledger.pendingReconciliation()).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"]);
    const fixed = await ledger.reconcile("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", deps(h, p));
    expect(fixed).toMatchObject({ ok: true, bookingRef: "PH-CNR001" });
    expect(await ledger.reconcile("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", deps(h, p))).toBeNull(); // already resolved
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(1);
    expect(await count(db, "payments WHERE kind = 'initial'")).toBe(1);
    expect([...p.intents.values()].filter((x) => x.status === "captured")).toHaveLength(1);

    // Only now does the guest-visible result change: a retry with the original key returns success.
    expect(await ledger.runAttempt("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", saved, "PH-CNR001", async () => { throw new Error("must not run"); }))
      .toMatchObject({ ok: true, bookingRef: "PH-CNR001" });
    expect(await ledger.runAttempt("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", saved, "PH-CNR003", async () => { throw new Error("must not run"); }))
      .toMatchObject({ ok: true, bookingRef: "PH-CNR001" });
  });
});

describe("P0: reservation block must be visible before capture (note 85)", () => {
  it("delayed visibility: captures once the block shows within the polling window", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.hideNewBlocksForReads = 2;
    const { saved, req } = await setup(ledger, h);
    const o = await bookingAttempt(ledger, saved, req("PH-BLK001"), h, p, fast);
    expect(o.ok).toBe(true);
    expect([...p.intents.values()][0]!.status).toBe("captured");
  });
  it("never visible: no capture, no success, queued; reconciliation later captures if the block appears", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.hideNewBlocksForReads = Infinity;
    const { saved, req } = await setup(ledger, h);
    const view = await ledger.runAttempt("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", saved, "PH-BLK002", () => bookingAttempt(ledger, saved, req("PH-BLK002"), h, p, fast));
    expect(view).toMatchObject({ ok: false, reason: "processing" });
    expect([...p.intents.values()][0]!.status).toBe("authorized"); // held, not captured
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(0);
    h.hideNewBlocksForReads = 0; // block now visible
    expect(await ledger.reconcile("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", deps(h, p))).toMatchObject({ ok: true, bookingRef: "PH-BLK002" });
    expect([...p.intents.values()][0]!.status).toBe("captured");
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(1);
  });
  it("never visible and still not visible at reconciliation: reservation cancelled, authorization voided, no charge", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.hideNewBlocksForReads = Infinity;
    const { saved, req } = await setup(ledger, h);
    await ledger.runAttempt("cccccccc-cccc-4ccc-8ccc-ccccccccccc1", saved, "PH-BLK003", () => bookingAttempt(ledger, saved, req("PH-BLK003"), h, p, fast));
    const r = await ledger.reconcile("cccccccc-cccc-4ccc-8ccc-ccccccccccc1", deps(h, p));
    expect(r).toMatchObject({ ok: false });
    expect([...p.intents.values()][0]!.status).toBe("voided");
    expect(await count(db, "bookings WHERE confirmed_at IS NOT NULL")).toBe(0);
    expect((await db.query<any>(`SELECT active_attempt FROM quotes WHERE id = $1`, [saved.id]))[0].active_attempt).toBeNull(); // guest may retry
  });
});

describe("P0: migration lock race (note 85)", () => {
  it("two runners that both believe a NON-idempotent migration is pending apply it exactly once", async () => {
    const pg = new PGlite();
    const db1 = wrap(pg), db2 = wrap(pg);
    await pg.exec("CREATE TABLE side_effects (n int)");
    const fixture = [{ version: "9001", file: "9001_counter.sql", checksum: "a".repeat(64), statements: ["INSERT INTO side_effects VALUES (1)"] }];
    // Both read 'absent' first (the old race), then both try to apply.
    await Promise.all([runMigrations(db1, fixture, () => {}), runMigrations(db2, fixture, () => {})]);
    await runMigrations(db1, fixture, () => {});
    expect((await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM side_effects")).rows[0]!.n).toBe(1);
  });
  it("a changed applied migration fails", async () => {
    const pg = new PGlite(); const d = wrap(pg);
    await pg.exec("CREATE TABLE side_effects (n int)");
    await runMigrations(d, [{ version: "9002", file: "9002_x.sql", checksum: "b".repeat(64), statements: ["INSERT INTO side_effects VALUES (2)"] }], () => {});
    await expect(runMigrations(d, [{ version: "9002", file: "9002_x.sql", checksum: "c".repeat(64), statements: ["INSERT INTO side_effects VALUES (2)"] }], () => {})).rejects.toThrow(/changed/);
  });
  it("the real migrations apply in order and are recorded", async () => {
    const d = wrap(new PGlite());
    expect(await runMigrations(d, undefined, () => {})).toEqual(loadMigrations().map((m) => m.file));
  });
});

describe("price lock audit (note 135)", () => {
  it("records locked/live/absorbed with quote id and booking ref in audit_log, no guest PII", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, quote, req } = await setup(ledger, h);
    const locked = { ...quote, total: quote.total - 1000, plan: { ...quote.plan, dueNow: quote.plan.dueNow - 500, scheduled: { ...quote.plan.scheduled!, amount: quote.plan.scheduled!.amount - 500 } } };
    const out = await bookingAttempt(ledger, saved, { ...req("PH-LCK001"), payPlan: "split", acceptedTotal: locked.total, lockedQuote: locked }, h, p, fast);
    expect(out.ok).toBe(true);
    const rows = await db.query<any>(`SELECT after FROM audit_log WHERE action = 'price_lock_honored'`);
    expect(rows.length).toBe(1);
    const a = typeof rows[0].after === "string" ? JSON.parse(rows[0].after) : rows[0].after;
    expect(a).toMatchObject({ booking_ref: "PH-LCK001", quote_id: saved.id, locked_total: locked.total, live_total: quote.total, absorbed: 1000 });
    expect(JSON.stringify(a)).not.toMatch(/@|Guest|2105550100/);
  });
  it("a failed audit write never blocks the booking", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, quote, req } = await setup(ledger, h);
    const locked = { ...quote, total: quote.total - 1000 };
    (ledger as any).auditPriceLock = async () => { throw new Error("db down"); };
    const out = await bookingAttempt(ledger, saved, { ...req("PH-LCK002"), payPlan: "split", acceptedTotal: locked.total, lockedQuote: locked }, h, p, fast);
    expect(out.ok).toBe(true);
  });
});
