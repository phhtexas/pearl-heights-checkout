// ChatGPT note 89: eventual consistency. Records that appear after an initial empty lookup must not cause a
// premature void/cancel/release; exactly one final action happens once the evidence is reliable.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger, ReconcileDeps, RECONCILE_MAX_ATTEMPTS } from "../src/db/ledger";
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
  async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
});
const NOW = new Date("2026-11-14T20:00:00Z");
const prop = getProperty("edgewood");
const fast = { blockCheckDelaysMs: [0, 1], sleep: async () => {} };
let db: Db, ledger: DbLedger, n = 0;
beforeEach(async () => { db = wrap(new PGlite()); await runMigrations(db, undefined, () => {}); ledger = new DbLedger(db, 5); });
const one = async (sql: string, p: unknown[] = []) => (await db.query<any>(sql, p))[0];
const deps = (h: MockHospitable, p: MockPayments): ReconcileDeps => ({ hosp: h, pay: p, propertyUuid: (k) => getProperty(k).hospitableUuid, verification: (ci) => verificationDeadline(NOW, ci) });

async function queued(h: MockHospitable, p: MockPayments, ref: string) {
  const stay = { property: "edgewood", checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(prop.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "s", NOW);
  const req: CheckoutRequest = { ...stay, property: prop, now: NOW, bookingRef: ref, acceptedTotal: quote.total, guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } };
  const k = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const view = await ledger.runAttempt(k, saved, ref, () => bookingAttempt(ledger, saved, req, h, p, fast));
  expect(view).toMatchObject({ reason: "processing" });
  return { k, saved };
}
/** Move the clock: pretend the attempt is older and the next check is due. */
const age = (k: string, minutes: number) => db.query(`UPDATE checkout_attempts SET created_at = created_at - make_interval(mins => $2), next_reconcile_at = LEAST(next_reconcile_at, now() - interval '1 second') WHERE attempt_key = $1`, [k, minutes]);
const row = (k: string) => one(`SELECT status, negative_checks, next_reconcile_at, reconcile_attempts FROM checkout_attempts WHERE attempt_key = $1`, [k]);

describe("Stripe record appears after an empty search (authorize_unknown)", () => {
  it("no void/release while the search is empty; when the PaymentIntent appears it is voided exactly once", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    p.authorizeThenTimeout = true;
    const { k, saved } = await queued(h, p, "PH-EVC001");
    p.authorizeThenTimeout = false;
    // Stripe search lags: empty for now.
    const realFind = p.findByRef.bind(p);
    let searchVisible = false;
    p.findByRef = async (ref) => (searchVisible ? realFind(ref) : []);
    let voids = 0; const realVoid = p.voidAuthorization.bind(p); p.voidAuthorization = async (id) => { voids++; return realVoid(id); };

    expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "deferred" }); // < 2 minutes old
    expect((await row(k)).negative_checks).toBe(0);
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "skipped" }); // not due yet
    await age(k, 3);
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "deferred" }); // 1st negative
    expect((await row(k)).negative_checks).toBe(1);
    expect(voids).toBe(0);
    expect((await one(`SELECT active_attempt FROM quotes WHERE id = $1`, [saved.id])).active_attempt).not.toBeNull(); // not released
    searchVisible = true; // Stripe search catches up
    await age(k, 3);
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toMatchObject({ result: "resolved", guest: { ok: false } });
    expect(voids).toBe(1);
    expect([...p.intents.values()][0]!.status).toBe("voided");
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "skipped" });
    expect(voids).toBe(1);
  });
  it("when the search stays empty, release happens only after 3 negative checks across >= 2 minutes", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    p.authorizeThenTimeout = true;
    const { k, saved } = await queued(h, p, "PH-EVC002");
    p.intents.clear(); // Stripe never created it after all
    for (const expected of [0, 1]) {
      await age(k, 6);
      expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "deferred" });
      expect((await row(k)).negative_checks).toBe(expected + 1);
      expect((await one(`SELECT active_attempt FROM quotes WHERE id = $1`, [saved.id])).active_attempt).not.toBeNull();
    }
    // The third negative check (all >= 2 minutes old) is final: absence is reliable, so it resolves now.
    await age(k, 6);
    const res = await ledger.reconcileDetailed(k, deps(h, p));
    expect(res).toMatchObject({ result: "resolved", guest: { ok: false } });
    expect((await one(`SELECT active_attempt FROM quotes WHERE id = $1`, [saved.id])).active_attempt).toBeNull();
  });
});

describe("Hospitable reservation appears after an empty lookup (reservation_unknown)", () => {
  it("no void while the reservation lookup is empty; when it appears and dates are blocked: capture + confirm once", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    h.createThenTimeout = true;
    const { k } = await queued(h, p, "PH-EVH001");
    h.createThenTimeout = false;
    const realFind = h.findReservationByCode.bind(h);
    let visible = false;
    h.findReservationByCode = async (c) => (visible ? realFind(c) : null);
    let voids = 0, captures = 0;
    const rv = p.voidAuthorization.bind(p), rc = p.capture.bind(p);
    p.voidAuthorization = async (id) => { voids++; return rv(id); };
    p.capture = async (id) => { captures++; return rc(id); };
    await age(k, 3);
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "deferred" });
    await age(k, 3);
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toEqual({ result: "deferred" });
    expect(voids + captures).toBe(0);
    visible = true;
    await age(k, 10);
    expect(await ledger.reconcileDetailed(k, deps(h, p))).toMatchObject({ result: "resolved", guest: { ok: true } });
    expect({ voids, captures }).toEqual({ voids: 0, captures: 1 });
    expect((await one(`SELECT count(*)::int AS n FROM bookings WHERE confirmed_at IS NOT NULL`)).n).toBe(1);
  });
});

describe("ambiguous lookups and limits", () => {
  it("a lookup error is never treated as absence: backoff, no action, negative_checks unchanged", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    p.authorizeThenTimeout = true;
    const { k } = await queued(h, p, "PH-AMB001");
    p.findByRef = async () => { throw new AdapterError("search 503", "upstream_error"); };
    await age(k, 10);
    expect((await ledger.reconcileDetailed(k, deps(h, p))).result).toBe("failed");
    const r = await row(k);
    expect(r.status).toBe("needs_reconciliation");
    expect(r.negative_checks).toBe(0);
    expect(new Date(r.next_reconcile_at).getTime()).toBeGreaterThan(Date.now());
    expect([...p.intents.values()][0]!.status).toBe("authorized"); // untouched
  });
  it("after the attempt limit the item moves to manual_review (no hot loop)", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    p.authorizeThenTimeout = true;
    const { k } = await queued(h, p, "PH-LIM001");
    await db.query(`UPDATE checkout_attempts SET reconcile_attempts = $2 WHERE attempt_key = $1`, [k, RECONCILE_MAX_ATTEMPTS]);
    expect((await ledger.reconcileDetailed(k, deps(h, p))).result).toBe("manual_review");
    expect((await row(k)).status).toBe("manual_review");
    expect(await ledger.pendingReconciliation()).toEqual([]);
  });
});
