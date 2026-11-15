// DB-backed quote acceptance and idempotency (gates from ChatGPT notes 69 and 78), on a real Postgres engine (PGlite).
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { runCheckout, CheckoutRequest } from "../src/services/checkout";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";

async function freshDb(): Promise<{ db: Db; pg: PGlite }> {
  const pg = new PGlite();
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await pg.exec(schema);
  await pg.exec(schema); // idempotent: running twice must not fail
  const db: Db = {
    async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
    async tx(st) { await pg.transaction(async (t) => { for (const [text, p] of st) await t.query(text, p as any[]); }); },
  };
  return { db, pg };
}

const NOW = new Date("2026-11-14T20:00:00Z");
const p752 = getProperty("752");
async function setup(ledger: DbLedger, h: MockHospitable, checkIn = "2027-04-12", checkOut = "2027-04-14") {
  const stay = { property: "752", checkIn, checkOut, adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(p752.hospitableUuid, checkIn, checkOut);
  const quote = buildQuote({ ...stay, property: p752, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "sess", NOW);
  const req = (ref: string): CheckoutRequest => ({ ...stay, property: p752, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "Test", lastName: "Guest", email: "t@example.com", phone: "2105550100" } });
  return { saved, quote, req };
}
const count = async (db: Db, table: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n);

let db: Db, ledger: DbLedger;
beforeEach(async () => { ({ db } = await freshDb()); ledger = new DbLedger(db, 5); });

describe("persisted quotes", () => {
  it("saves and reads back the exact quote with a 15-minute expiry", async () => {
    const { saved, quote } = await setup(ledger, new MockHospitable());
    const back = await ledger.getQuote(saved.id);
    expect(back).toMatchObject({ propertyKey: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", total: quote.total });
    expect(back!.expiresAt.getTime() - NOW.getTime()).toBe(15 * 60_000);
    expect(back!.quote.total).toBe(quote.total);
  });
  it("unknown quote id returns null", async () => expect(await ledger.getQuote("00000000-0000-4000-8000-000000000000")).toBeNull());
});

describe("attempt idempotency", () => {
  it("the same attempt key sent 3 times at once charges and books exactly once", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    let runs = 0;
    const work = async () => { runs++; const o = await runCheckout(req("PH-IDEM01"), h, p); if (o.ok) await ledger.recordBooking(req("PH-IDEM01"), saved, o); return o; };
    const key = "11111111-1111-4111-8111-111111111111";
    const results = await Promise.all([ledger.runAttempt(key, saved, "PH-IDEM01", work), ledger.runAttempt(key, saved, "PH-IDEM0X", work), ledger.runAttempt(key, saved, "PH-IDEM0Y", work)]);
    expect(runs).toBe(1);
    expect(results.every((r) => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true);
    expect(results[0]).toMatchObject({ ok: true, bookingRef: "PH-IDEM01" });
    expect(p.intents.size).toBe(1);
    expect(await count(db, "bookings")).toBe(1);
  });
  it("a new attempt on an already-booked quote (second tab) returns that booking without charging", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    const first = await ledger.runAttempt("22222222-2222-4222-8222-222222222222", saved, "PH-TAB001", async () => {
      const o = await runCheckout(req("PH-TAB001"), h, p); if (o.ok) await ledger.recordBooking(req("PH-TAB001"), saved, o); return o; });
    let ranAgain = false;
    const second = await ledger.runAttempt("33333333-3333-4333-8333-333333333333", saved, "PH-TAB002", async () => { ranAgain = true; return runCheckout(req("PH-TAB002"), h, p); });
    expect(ranAgain).toBe(false);
    expect(second).toEqual(first);
    expect(p.intents.size).toBe(1);
  });
  it("after a decline, a new attempt on the same quote may succeed", async () => {
    const h = new MockHospitable(), p = new MockPayments("card_declined");
    const { saved, req } = await setup(ledger, h);
    const a = await ledger.runAttempt("44444444-4444-4444-8444-444444444444", saved, "PH-DEC001", () => runCheckout(req("PH-DEC001"), h, p));
    expect(a).toMatchObject({ ok: false, reason: "card_declined" });
    p.failure = "none";
    const b = await ledger.runAttempt("55555555-5555-4555-8555-555555555555", saved, "PH-DEC002", () => runCheckout(req("PH-DEC002"), h, p));
    expect(b).toMatchObject({ ok: true, bookingRef: "PH-DEC002" });
  });
  it("stored outcomes hold internal details but the returned view never does", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    const v = await ledger.runAttempt("66666666-6666-4666-8666-666666666666", saved, "PH-VIEW01", () => runCheckout(req("PH-VIEW01"), h, p));
    expect(JSON.stringify(v)).not.toMatch(/log|pi_mock|mock-res/);
    const [row] = await db.query<any>(`SELECT outcome FROM checkout_attempts WHERE booking_ref = 'PH-VIEW01'`);
    expect(JSON.stringify(row.outcome)).toMatch(/pi_mock/);
  });
});

describe("booking records", () => {
  it("split booking writes guest, booking, initial + scheduled payment, verification, jobs and audit in one go", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req, quote } = await setup(ledger, h);
    expect(quote.plan.split).toBe(true);
    const o = await runCheckout(req("PH-REC001"), h, p);
    if (!o.ok) throw new Error("expected success");
    await ledger.recordBooking(req("PH-REC001"), saved, o);
    const pays = await db.query<any>(`SELECT kind, amount_cents, status, idempotency_key FROM payments ORDER BY kind`);
    expect(pays).toEqual([
      { kind: "initial", amount_cents: quote.plan.dueNow, status: "captured", idempotency_key: "PH-REC001:initial" },
      { kind: "scheduled", amount_cents: quote.plan.scheduled!.amount, status: "scheduled", idempotency_key: "PH-REC001:scheduled" },
    ]);
    expect((await db.query<any>(`SELECT type FROM jobs ORDER BY type`)).map((r) => r.type)).toEqual(["deadline", "second_payment"]);
    expect(await count(db, "verifications")).toBe(1);
    expect(await count(db, "audit_log")).toBe(1);
  });
  it("is all-or-nothing: a duplicate booking ref writes nothing", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const { saved, req } = await setup(ledger, h);
    const o = await runCheckout(req("PH-ATOM01"), h, p);
    if (!o.ok) throw new Error("expected success");
    await ledger.recordBooking(req("PH-ATOM01"), saved, o);
    const { saved: other } = await setup(ledger, h, "2027-05-03", "2027-05-05");
    await expect(ledger.recordBooking(req("PH-ATOM01"), other, o)).rejects.toThrow();
    expect(await count(db, "guests")).toBe(1);
    expect(await count(db, "payments")).toBe(2);
  });
});
