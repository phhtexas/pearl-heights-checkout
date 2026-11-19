// Follow-up guest notices (Oscar, Nov 18): reminders, payment notices, check-in day, cancellation. Once each, off by default.
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
import { dueNotices, noticeContent, sweepGuestNotices, type NoticeRow } from "../src/services/guestNotices";
import { noticeEmail } from "../src/services/email";

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

async function book(ref = "PH-NOT001", session = "sess-A") {
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


const at = (s: string) => new Date(s);
const base: NoticeRow = { id: "b1", ref: "PH-NOT001", state: "confirmed", confirmedAt: at("2027-04-01T15:00:00Z"), deadlineAt: at("2027-04-02T15:00:00Z"), rule: "24h",
  propertyKey: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", firstName: "Ana", email: "ana@example.com", phone: "2105550100",
  agreementDone: false, idDone: false, textedConfirmation: false, balance: null, refundedCents: 0 };

describe("which notice is due", () => {
  it("paperwork: first reminder halfway, final 2 h before; never both; nothing once done or past the deadline", () => {
    expect(dueNotices(base, at("2027-04-01T23:00:00Z"))).toEqual([]);
    expect(dueNotices(base, at("2027-04-02T03:30:00Z"))).toEqual(["paperwork_reminder_1"]);
    expect(dueNotices(base, at("2027-04-02T13:30:00Z"))).toEqual(["paperwork_reminder_2"]);
    expect(dueNotices(base, at("2027-04-02T15:30:00Z"))).toEqual([]);
    expect(dueNotices({ ...base, agreementDone: true, idDone: true }, at("2027-04-02T13:30:00Z"))).toEqual([]);
    const short = { ...base, rule: "2h", deadlineAt: at("2027-04-01T17:00:00Z") };
    expect(dueNotices(short, at("2027-04-01T16:10:00Z"))).toEqual(["paperwork_reminder_1"]);
  });
  it("balance: heads-up 3 days before (not if they booked inside that window); failure notice during the cure period", () => {
    const bal = { cents: 60000, status: "scheduled", scheduledFor: at("2027-03-13T21:00:00Z"), cureDeadline: null, declined: false };
    const b = { ...base, confirmedAt: at("2027-01-05T15:00:00Z"), deadlineAt: at("2027-01-06T15:00:00Z"), agreementDone: true, idDone: true, balance: bal };
    expect(dueNotices(b, at("2027-03-09T21:00:00Z"))).toEqual([]);
    expect(dueNotices(b, at("2027-03-11T21:00:00Z"))).toEqual(["balance_upcoming"]);
    expect(dueNotices({ ...b, confirmedAt: at("2027-03-11T12:00:00Z") }, at("2027-03-11T21:00:00Z"))).toEqual([]);
    const failed = { ...b, balance: { ...bal, status: "retrying", declined: true, cureDeadline: at("2027-03-16T21:00:00Z") } };
    expect(dueNotices(failed, at("2027-03-14T10:00:00Z"))).toEqual(["balance_failed"]);
    expect(dueNotices(failed, at("2027-03-17T10:00:00Z"))).toEqual([]);
  });
  it("check-in day from 8 AM CT (not for same-day bookings); cancellation when cancelled", () => {
    const b = { ...base, agreementDone: true, idDone: true };
    expect(dueNotices(b, at("2027-04-12T12:30:00Z"))).toEqual([]);          // 7:30 AM CDT
    expect(dueNotices(b, at("2027-04-12T13:05:00Z"))).toEqual(["checkin_day"]); // 8:05 AM CDT
    expect(dueNotices({ ...b, confirmedAt: at("2027-04-12T12:00:00Z") }, at("2027-04-12T13:05:00Z"))).toEqual([]);
    expect(dueNotices({ ...b, state: "cancelled" }, at("2027-04-05T13:05:00Z"))).toEqual(["cancellation"]);
  });
  it("content: the right button, the missing steps, no private details", () => {
    const r1 = noticeEmail(noticeContent("paperwork_reminder_1", { ...base, agreementDone: true }, "https://x/stay/abc"));
    expect(r1.text).toContain("Verify your ID");
    expect(r1.text).not.toContain("Sign the rental agreement");
    expect(r1.text).toContain("https://x/stay/abc");
    const ci = noticeEmail(noticeContent("checkin_day", { ...base, agreementDone: true, idDone: true }, "https://x/stay/abc"));
    expect(ci.text).toContain("Open my guest portal");
    const cx = noticeEmail(noticeContent("cancellation", { ...base, state: "cancelled", refundedCents: 123456 }, null));
    expect(cx.text).toContain("$1,234.56");
    for (const k of ["paperwork_reminder_1", "paperwork_reminder_2", "checkin_day", "cancellation"] as const)
      expect(noticeEmail(noticeContent(k, base, "https://x/stay/abc")).html).not.toMatch(/door code|wi-?fi password|street/i);
    const fail = noticeEmail(noticeContent("balance_failed", { ...base, balance: { cents: 60000, status: "retrying", scheduledFor: null, cureDeadline: at("2027-03-16T21:00:00Z"), declined: true } }, null));
    expect(fail.text).toMatch(/never email card details/);
  });
});

const ENV = { GUEST_EMAILS: "on", RESEND_API_KEY: "re_test", GUEST_TEXTS: "on", TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+18885550100" } as any;
const okFetch = () => vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("twilio") ? { sid: "SM1" } : { id: "em_1" }), { status: 200 }));

describe("notice sweep (database)", () => {
  it("skips bookings without a sent confirmation email; then sends the reminder once by email, and by text only if the confirmation text went out", async () => {
    await book("PH-NOT001");
    const [b] = await db.query<any>(`SELECT id, confirmed_at, verification_deadline_at FROM bookings WHERE booking_ref = 'PH-NOT001'`);
    const f0 = okFetch();
    expect(await sweepGuestNotices(db, "https://pearlheightshomes.com", new Date(Date.parse(b.confirmed_at) + 13 * 3600e3), ENV, f0 as any)).toMatchObject({ checked: 0 });
    await db.query(`INSERT INTO guest_messages (booking_id, kind, channel, status) VALUES ($1, 'confirmation', 'email', 'sent')`, [b.id]);
    const conf = new Date(b.confirmed_at);
    await db.query(`UPDATE bookings SET verification_deadline_at = $2, verification_rule = '24h' WHERE id = $1`, [b.id, new Date(conf.getTime() + 24 * 3600e3).toISOString()]);
    const later = new Date(conf.getTime() + 13 * 3600e3);
    const f = okFetch();
    expect(await sweepGuestNotices(db, "https://pearlheightshomes.com", later, ENV, f as any)).toMatchObject({ sent: 1, failed: 0 });
    expect((f.mock.calls[0] as any)[0]).toBe("https://api.resend.com/emails");
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).subject).toMatch(/^Reminder: your booking steps for 752 Myrtle/);
    expect(await sweepGuestNotices(db, "https://pearlheightshomes.com", later, ENV, f as any)).toMatchObject({ sent: 0 });
    // Opted-in guest (confirmation text sent): the final reminder also goes by text.
    await db.query(`INSERT INTO guest_messages (booking_id, kind, channel, status) VALUES ($1, 'confirmation', 'sms', 'sent')`, [b.id]);
    const f2 = okFetch();
    expect(await sweepGuestNotices(db, "https://pearlheightshomes.com", new Date(conf.getTime() + 22.5 * 3600e3), ENV, f2 as any)).toMatchObject({ sent: 2 });
    expect(f2.mock.calls.map((c: any) => c[0].includes("twilio") ? "sms" : "email").sort()).toEqual(["email", "sms"]);
  });
  it("check-in day goes by email, and by text to opted-in guests", async () => {
    await book("PH-NOT001");
    const [b] = await db.query<any>(`SELECT id FROM bookings WHERE booking_ref = 'PH-NOT001'`);
    await db.query(`INSERT INTO guest_messages (booking_id, kind, channel, status) VALUES ($1, 'confirmation', 'email', 'sent'), ($1, 'confirmation', 'sms', 'sent')`, [b.id]);
    await db.query(`UPDATE verifications SET agreement_status = 'signed', id_status = 'verified' WHERE booking_id = $1`, [b.id]);
    const f = okFetch();
    expect(await sweepGuestNotices(db, "https://pearlheightshomes.com", new Date("2027-04-12T13:05:00Z"), ENV, f as any)).toMatchObject({ sent: 2 });
    const sms = (f.mock.calls as any[]).find((c) => c[0].includes("twilio"));
    expect(new URLSearchParams(sms[1].body.toString()).get("Body")).toMatch(/^Pearl Heights Homes: Welcome! Check-in at 752 Myrtle is after 4:00 PM today\..*\/stay\/.*Reply STOP to opt out\.$/);
  });
  it("does nothing while GUEST_EMAILS is off", async () => {
    await book("PH-NOT001");
    const f = okFetch();
    expect(await sweepGuestNotices(db, "https://x", new Date("2030-01-01"), {} as any, f as any)).toEqual({ checked: 0, sent: 0, failed: 0 });
    expect(f).not.toHaveBeenCalled();
  });
});
