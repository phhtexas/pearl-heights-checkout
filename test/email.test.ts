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
      expect(s).toContain("$600.00 on Mon, Mar 29");
      expect(s).not.toMatch(/door code|wi-?fi|password/i);
    }
    expect(m.html).not.toContain("<b>Ana</b>");
    // Oscar, Nov 20: no cancellation line in the confirmation; the policy is linked in the footer.
    expect(m.text).not.toContain("Free cancellation");
    expect(m.html).toContain("/policies/cancellation");
  });
  it("Nov 20 redesign: listing name (no street address), full dates, itemized payment summary, footer", () => {
    const quote = { nights: 2, lodging: 80000, extraGuestFee: 0, cleaning: 22500, protection: 7900, taxableBase: 102500, tax: 17150, taxRate: 0.1673, total: 127550,
      plan: { split: true, dueNow: 63775, scheduled: { amount: 63775, chargeAt: new Date("2027-03-13T22:00:00Z") } }, fullPlan: { split: false, dueNow: 127550 },
      nonRefundable: false, processingFeeBase: 102500 } as any;
    const m = confirmationEmail({ ...o, link: "https://x/stay/abc", propertyKey: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 1, infants: 0,
      quote, bookedAt: new Date("2026-11-20T18:00:00Z"), card: "Amex •••• 3425" });
    for (const s of [m.html, m.text]) {
      expect(s).not.toContain("752 Myrtle");
      expect(s).toContain("Walk to Pearl Riverwalk");
      expect(s).toContain("Monday, April 12, 2027 @ 4:00 PM");
      expect(s).toContain("Wednesday, April 14, 2027 @ 10:00 AM");
      expect(s).toContain("Payment summary".toUpperCase() === "PAYMENT SUMMARY" && s === m.text ? "PAYMENT SUMMARY" : "Payment summary");
      expect(s).toContain("$1,275.50");
      expect(s).toContain("Second payment, due Mar 13, 2027");
      expect(s).toContain("Balance due");
      expect(s).toContain("Paid with Amex •••• 3425");
      expect(s).toContain("Will be charged to Amex •••• 3425");
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

describe("card label (Oscar, Nov 20)", async () => {
  const { cardLabel } = await import("../src/services/emailBlocks");
  it("brand and last 4 only", () => {
    expect(cardLabel({ brand: "amex", last4: "3425" })).toBe("Amex\u00A0••••\u00A03425");
    expect(cardLabel({ brand: "visa", last4: "4242" })).toBe("Visa\u00A0••••\u00A04242");
    expect(cardLabel({ brand: "link", last4: "0001" })).toBe("Link\u00A0••••\u00A00001");
    expect(cardLabel(null)).toBeUndefined();
  });
});

describe("standard footer (Oscar, Nov 20)", async () => {
  const { noticeContent } = await import("../src/services/guestNotices");
  const { noticeEmail } = await import("../src/services/email");
  const { guestInquiryEmail, hostInquiryEmail } = await import("../src/services/inquiries");
  const { guestReplyEmail, hostAlertEmail, loginEmail } = await import("../src/services/stayChat");
  const row = { id: "b", ref: "PH-FOOT01", state: "confirmed", confirmedAt: new Date("2027-01-01T12:00:00Z"), deadlineAt: new Date("2027-01-02T12:00:00Z"), rule: "24h",
    propertyKey: "752", checkIn: "2027-02-01", checkOut: "2027-02-03", firstName: "Ana", email: "a@x.com", phone: "", agreementDone: false, idDone: false, textedConfirmation: false,
    balance: { cents: 1000, status: "scheduled", scheduledFor: new Date("2027-01-10T12:00:00Z"), cureDeadline: new Date("2027-01-13T12:00:00Z"), declined: false }, refundedCents: 0 } as any;
  const inq = { id: "i", propertyKey: "752", checkIn: null, checkOut: null, adults: 2, children: 0, infants: 0, quotedTotal: null, guestName: "Ana B", guestEmail: "a@x.com", livemode: true, createdAt: "" };
  const thread = { bookingId: "b", bookingRef: "PH-FOOT01", propertyKey: "752", checkIn: "2027-02-01", checkOut: "2027-02-03", guestName: "Ana B", guestEmail: "a@x.com" };
  it("every guest email has it; host-only emails don't", () => {
    const guest = [
      ...(["paperwork_reminder_1", "paperwork_reminder_2", "balance_upcoming", "balance_failed", "balance_approval", "balance_paid", "checkin_day", "cancellation"] as const)
        .map((k) => noticeEmail(noticeContent(k, row, "https://x/stay/abc")).html),
      guestInquiryEmail(inq, "hi", "https://x/m/a", "received").html, guestInquiryEmail(inq, "hi", "https://x/m/a", "reply").html,
      guestReplyEmail(thread, "hi", "https://x/stay/abc").html,
    ];
    for (const h of guest) { expect(h).toContain("About this email"); expect(h).toContain("/policies/cancellation"); expect(h).toContain("instagram.com/pearlheightshomes"); }
    for (const h of [hostInquiryEmail(inq, "hi", "https://x/host", true).html, hostAlertEmail(thread, "hi", "https://x/host").html, loginEmail("https://x/login").html])
      expect(h).not.toContain("About this email");
  });
});
