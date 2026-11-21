// Booking confirmation email (Oscar, Nov 18): off by default, every direct booking, sent once, stay link only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { DbLedger } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import type { CheckoutRequest } from "../src/services/checkout";
import { bookingAttempt } from "../src/services/bookingFlow";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { runMigrations } from "../scripts/migrate.mjs";
import { confirmationEmail, emailConfirmation, emailEnabled } from "../src/services/email";

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

async function book(ref = "PH-EML001", session = "sess-A") {
  const h = new MockHospitable(), p = new MockPayments();
  const stay = { property: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 1, infants: 0 };
  const cal = await h.getCalendar(p752.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ payPlan: "split", ...stay, property: p752, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, session, NOW);
  const req: CheckoutRequest = { ...stay, property: p752, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "Ana", lastName: "Guest", email: "ana@example.com", phone: "2105550100" } };
  const r = await ledger.runAttempt("12121212-1212-4121-8121-121212121212", saved, ref, () => bookingAttempt(ledger, saved, req, h, p, fast));
  expect(r).toMatchObject({ ok: true });
  return { quote };
}


const ENV = { GUEST_EMAILS: "on", RESEND_API_KEY: "re_test" } as any;
const resendOk = () => vi.fn(async () => new Response(JSON.stringify({ id: "em_123" }), { status: 200 }));
const o = { email: "ana@example.com", firstName: "Ana", homeName: "752 Myrtle", photoUrl: "https://assets.hospitable.com/p/1.jpg", bookingRef: "PH-EML001",
  dates: "Apr 12–14", guests: 3, deadline: "Friday, April 9, 2027 at 4:00 PM CT", paidToday: "$600.00", balanceLine: "$600.00 on Mon, Mar 29",
  nonRefundable: false, origin: "https://pearlheightshomes.com" };

describe("booking confirmation email", () => {
  it("stays off unless GUEST_EMAILS=on with a Resend key", () => {
    expect(emailEnabled({} as any)).toBe(false);
    expect(emailEnabled({ GUEST_EMAILS: "on" } as any)).toBe(false);
    expect(emailEnabled(ENV)).toBe(true);
  });
  it("has the booking, the deadline, the button and cancellation terms, and nothing private; HTML is escaped", () => {
    const m = confirmationEmail({ ...o, firstName: "<b>Ana</b>", link: "https://x/stay/abc" });
    expect(m.subject).toBe("You're booked, <b>Ana</b>! Apr 12–14 (PH-EML001)");
    for (const s of [m.html, m.text]) {
      expect(s).toContain("https://x/stay/abc");
      expect(s).toContain("Friday, April 9, 2027 at 4:00 PM CT");
      expect(s).toContain("Complete required steps");
      expect(s).toContain("Free cancellation");
      expect(s).toContain("$600.00 on Mon, Mar 29");
      expect(s).not.toMatch(/door code|wi-?fi|password/i);
    }
    expect(m.html).not.toContain("<b>Ana</b>");
    expect(confirmationEmail({ ...o, nonRefundable: true, link: "x" }).text).toContain("non-refundable");
  });
  it("Nov 20 redesign: listing name (no street address), full dates, itemized payment summary, footer", () => {
    const quote = { nights: 2, lodging: 80000, extraGuestFee: 0, cleaning: 22500, protection: 7900, taxableBase: 102500, tax: 17150, taxRate: 0.1673, total: 127550,
      plan: { split: true, dueNow: 63775, scheduled: { amount: 63775, chargeAt: new Date("2027-03-13T22:00:00Z") } }, fullPlan: { split: false, dueNow: 127550 },
      nonRefundable: false, processingFeeBase: 102500 } as any;
    const m = confirmationEmail({ ...o, link: "https://x/stay/abc", propertyKey: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 1, infants: 0,
      quote, bookedAt: new Date("2026-11-20T18:00:00Z") });
    for (const s of [m.html, m.text]) {
      expect(s).not.toContain("752 Myrtle");
      expect(s).toContain("Walk to Pearl Riverwalk");
      expect(s).toContain("Monday, April 12, 2027 @ 4:00 PM");
      expect(s).toContain("Wednesday, April 14, 2027 @ 10:00 AM");
      expect(s).toContain("Payment summary".toUpperCase() === "PAYMENT SUMMARY" && s === m.text ? "PAYMENT SUMMARY" : "Payment summary");
      expect(s).toContain("$1,275.50");
      expect(s).toContain("Second payment, due Mar 13, 2027");
      expect(s).toContain("Balance due");
      expect(s).toContain("Complete required steps");
    }
    expect(m.html).toContain("About this email");
    expect(m.html).toContain("instagram.com/pearlheightshomes");
  });
  it("sends once per booking through Resend with a fresh stay link; a retry doesn't email again", async () => {
    await book("PH-EML001");
    const f = resendOk();
    expect(await emailConfirmation(db, o, ENV, f as any)).toBe("sent");
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(init.headers["Idempotency-Key"]).toBe("confirmation-PH-EML001");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Pearl Heights Homes <bookings@pearlheightshomes.com>", to: ["ana@example.com"], reply_to: "bookings@pearlheightshomes.com" });
    expect(body.html).toMatch(/https:\/\/pearlheightshomes\.com\/stay\/[A-Za-z0-9_-]{40,}/);
    expect(await emailConfirmation(db, o, ENV, f as any)).toBe("duplicate");
    expect(f).toHaveBeenCalledTimes(1);
    const [row] = await db.query<any>(`SELECT status, channel, provider_id FROM guest_messages`);
    expect(row).toMatchObject({ status: "sent", channel: "email", provider_id: "em_123" });
    expect((await db.query<any>(`SELECT 1 FROM stay_links WHERE channel = 'email'`)).length).toBe(1);
  });
  it("a Resend error is recorded and never thrown; off means nothing is sent", async () => {
    await book("PH-EML001");
    const bad = vi.fn(async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 }));
    expect(await emailConfirmation(db, o, ENV, bad as any)).toBe("failed");
    expect((await db.query<any>(`SELECT status FROM guest_messages`))[0].status).toBe("failed");
    const f = resendOk();
    expect(await emailConfirmation(db, o, {} as any, f as any)).toBe("off");
    expect(f).not.toHaveBeenCalled();
  });
});
