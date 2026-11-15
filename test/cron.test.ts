import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { authorized, runReconciliation } from "../src/server/reconcileRunner";
import type { Db } from "../src/db/client";
import { DbLedger } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { getProperty } from "../src/domain/properties";
import { verificationDeadline } from "../src/domain/verification";
import { runMigrations } from "../scripts/migrate.mjs";

const SECRET = "x".repeat(40);
describe("cron auth", () => {
  it("accepts only the exact bearer secret from the header", () => {
    expect(authorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(authorized(`Bearer ${SECRET}y`, SECRET)).toBe(false);
    expect(authorized(SECRET, SECRET)).toBe(false);
    expect(authorized(null, SECRET)).toBe(false);
    expect(authorized(`Bearer ${SECRET}`, undefined)).toBe(false); // unset -> always refused
    expect(authorized("Bearer short", "short")).toBe(false); // weak secrets refused
  });
});

describe("runner", () => {
  it("overlapping runs on the same queue: each item handled once; counts only, no IDs", async () => {
    const pg = new PGlite();
    const db: Db = { async query(t, p = []) { return (await pg.query(t, p as any[])).rows as any; }, async tx(st) { await pg.transaction(async (x) => { for (const [t, p] of st) await x.query(t, p as any[]); }); } };
    await runMigrations(db, undefined, () => {});
    const ledger = new DbLedger(db, 5);
    // One queued item whose IDs are known (block never visible), now blocked -> will capture.
    const h = new MockHospitable(), p = new MockPayments();
    const { bookingAttempt } = await import("../src/services/bookingFlow");
    const { buildQuote } = await import("../src/domain/quote");
    const prop = getProperty("edgewood");
    const stay = { property: "edgewood", checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0 };
    const cal = await h.getCalendar(prop.hospitableUuid, stay.checkIn, stay.checkOut);
    const quote = buildQuote({ ...stay, property: prop, now: new Date(), nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
    const saved = await ledger.saveQuote(stay, quote, "s", new Date());
    h.hideNewBlocksForReads = Infinity;
    await ledger.runAttempt("00000000-0000-4000-8000-000000000001", saved, "PH-CRN001", () => bookingAttempt(ledger, saved,
      { ...stay, property: prop, now: new Date(), bookingRef: "PH-CRN001", acceptedTotal: quote.total, guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } },
      h, p, { blockCheckDelaysMs: [0], sleep: async () => {} }));
    h.hideNewBlocksForReads = 0;
    let captures = 0; const cap = p.capture.bind(p); p.capture = async (id) => { captures++; await new Promise((r) => setTimeout(r, 20)); return cap(id); };
    const deps = { hosp: h, pay: p, propertyUuid: (k: string) => getProperty(k).hospitableUuid, verification: (ci: string) => verificationDeadline(new Date(), ci) };
    const [a, b] = await Promise.all([runReconciliation(ledger, deps), runReconciliation(ledger, deps)]);
    expect(a.resolved + b.resolved).toBe(1);
    expect(captures).toBe(1);
    expect(Object.keys(a).sort()).toEqual(["deferred", "due", "failed", "manual_review", "resolved", "skipped", "timed_out"]);
    expect(JSON.stringify([a, b])).not.toMatch(/PH-|pi_|mock-res|@/);
  });
});
