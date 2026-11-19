// Host cancel tool (audit F3, Oscar Nov 19), on PGlite with all migrations.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import type { CheckoutRequest } from "../src/services/checkout";
import { bookingAttempt } from "../src/services/bookingFlow";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { runMigrations } from "../scripts/migrate.mjs";
import { issueStayLink, loadStay } from "../src/services/stayLinks";
import { cancelBooking, cancelPreview } from "../src/services/cancelBooking";

function wrap(pg: PGlite): Db {
  return {
    async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
    async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
  };
}
const NOW = new Date("2026-11-14T20:00:00Z");
const p752 = getProperty("752");
const fast = { blockCheckDelaysMs: [0, 1, 1], sleep: async () => {} };
let db: Db, ledger: DbLedger;
beforeEach(async () => { db = wrap(new PGlite()); await runMigrations(db, undefined, () => {}); ledger = new DbLedger(db, 5); });

async function book(ref = "PH-STAY01", session = "sess-A") {
  const h = new MockHospitable(), p = new MockPayments();
  const stay = { property: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 1, infants: 0 };
  const cal = await h.getCalendar(p752.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ payPlan: "split", ...stay, property: p752, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, session, NOW);
  const req: CheckoutRequest = { ...stay, property: p752, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "Ana", lastName: "Guest", email: "ana@example.com", phone: "2105550100" } };
  const r = await ledger.runAttempt("12121212-1212-4121-8121-121212121212", saved, ref, () => bookingAttempt(ledger, saved, req, h, p, fast));
  expect(r).toMatchObject({ ok: true });
  return { quote, h, p };
}


const H = 3600_000;
async function bookingId() {
  await db.query(`UPDATE bookings SET created_at = $1`, [NOW.toISOString()]); // booked at the test clock
  return (await db.query<any>(`SELECT id FROM bookings WHERE booking_ref = 'PH-STAY01'`))[0].id as string;
}

describe("host cancel tool", () => {
  it("within 24 hours of booking: full refund, second payment stopped, link off, Hospitable cancelled; repeat does nothing more", async () => {
    const { quote, h, p } = await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const id = await bookingId();
    const at = new Date(NOW.getTime() + 2 * H);
    const pre = (await cancelPreview(db, id, "guest", at))!;
    expect(pre).toMatchObject({ ref: "PH-STAY01", cancelled: false, paidSoFar: quote.plan.dueNow, refund: quote.plan.dueNow, kept: 0, tier: "grace_24h", scheduledToStop: quote.plan.scheduled!.amount });
    let cancels = 0; const hosp = { ...h, cancelReservation: async () => { cancels++; } } as any;
    const out = (await cancelBooking(db, id, { reason: "guest", by: "host@example.com", pay: p, hosp, now: at }))!;
    expect(out.done).toBe(true);
    expect(p.refunds.map((r) => r.amount)).toEqual([quote.plan.dueNow]);
    expect(cancels).toBe(1);
    const st = (await db.query<any>(`SELECT state FROM bookings WHERE id = $1`, [id]))[0].state;
    expect(st).toBe("cancelled");
    const sched = (await db.query<any>(`SELECT status FROM payments WHERE booking_id = $1 AND kind = 'scheduled'`, [id]))[0].status;
    expect(sched).toBe("cancelled");
    const job = (await db.query<any>(`SELECT status FROM jobs WHERE booking_id = $1 AND type = 'second_payment'`, [id]))[0].status;
    expect(job).toBe("cancelled");
    expect(await loadStay(db, t, NOW)).toBeNull(); // stay link off
    // Again: nothing is refunded twice; Hospitable cancel is harmless to repeat.
    const again = (await cancelBooking(db, id, { reason: "guest", by: "host@example.com", pay: p, hosp, now: at }))!;
    expect(again.done).toBe(true);
    expect(p.refunds).toHaveLength(1);
    expect(cancels).toBe(1); // Hospitable cancelled only once
    expect((await cancelPreview(db, id, "guest", at))!).toMatchObject({ cancelled: true, plannedRefund: quote.plan.dueNow, refundedSoFar: quote.plan.dueNow });
  });

  it("30+ days out after the first 24 hours: refund minus the 5% processing fee; refund failure can be finished later", async () => {
    const { quote, h, p } = await book();
    const id = await bookingId();
    const at = new Date(NOW.getTime() + 3 * 24 * H);
    const pre = (await cancelPreview(db, id, "guest", at))!;
    const fee = Math.round(quote.processingFeeBase * 0.05);
    expect(pre.tier).toBe("30_plus");
    expect(pre.kept).toBe(fee);
    expect(pre.refund).toBe(quote.plan.dueNow - fee);
    p.refundFails = true;
    const first = (await cancelBooking(db, id, { reason: "guest", by: "h", pay: p, hosp: null, now: at }))!;
    expect(first.done).toBe(false);
    expect(first.steps.some((s) => !s.ok && /Refund/.test(s.step))).toBe(true);
    expect((await db.query<any>(`SELECT state FROM bookings WHERE id = $1`, [id]))[0].state).toBe("cancelled");
    p.refundFails = false;
    // Later (even a week later) the planned refund stays the same.
    const later = (await cancelBooking(db, id, { reason: "guest", by: "h", pay: p, hosp: null, now: new Date(at.getTime() + 7 * 24 * H) }))!;
    expect(later.done).toBe(true);
    expect(p.refunds.map((r) => r.amount)).toEqual([quote.plan.dueNow - fee]);
    expect(later.steps.some((s) => /Hospitable not changed/.test(s.step))).toBe(true);
  });

  it("we cancel: full refund, no fee", async () => {
    const { quote, p } = await book();
    const id = await bookingId();
    const at = new Date(NOW.getTime() + 10 * 24 * H);
    expect((await cancelPreview(db, id, "host", at))!).toMatchObject({ refund: quote.plan.dueNow, kept: 0, tier: "full_no_fee" });
    expect((await cancelBooking(db, id, { reason: "host", by: "h", pay: p, hosp: null, now: at }))!.done).toBe(true);
    expect(p.refunds.map((r) => r.amount)).toEqual([quote.plan.dueNow]);
  });
});
