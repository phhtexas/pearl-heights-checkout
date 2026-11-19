// Booking confirmation texts (Oscar, Nov 18): off by default, US numbers only, sent once per booking, stay link only.
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
import { confirmationText, smsEnabled, textConfirmation, toE164 } from "../src/services/sms";

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

async function book(ref = "PH-SMS001", session = "sess-A") {
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


const ENV = { GUEST_TEXTS: "on", TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+18885550100" } as any;
const twilioOk = () => vi.fn(async () => new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }));
const o = { bookingRef: "PH-SMS001", phone: "(210) 555-0100", homeName: "752 Myrtle", dates: "Apr 12–14", deadline: "Friday, November 13, 2026 at 2:00 PM CT", origin: "https://pearlheightshomes.com" };

describe("booking confirmation texts", () => {
  it("stays off unless GUEST_TEXTS=on and Twilio is configured", () => {
    expect(smsEnabled({} as any)).toBe(false);
    expect(smsEnabled({ ...ENV, GUEST_TEXTS: "" })).toBe(false);
    expect(smsEnabled({ ...ENV, TWILIO_FROM: "8885550100" })).toBe(false);
    expect(smsEnabled(ENV)).toBe(true);
  });
  it("texts US numbers only", () => {
    expect(toE164("(210) 555-0100")).toBe("+12105550100");
    expect(toE164("1-210-555-0100")).toBe("+12105550100");
    expect(toE164("+44 20 7946 0958")).toBeNull();
    expect(toE164("555-0100")).toBeNull();
  });
  it("the text has the home, dates, deadline, the link and STOP, and nothing private", () => {
    const t = confirmationText({ homeName: "752 Myrtle", dates: "Apr 12–14", deadline: "Fri 2 PM CT", link: "https://x/stay/abc" });
    expect(t).toMatch(/^Pearl Heights Homes: You're booked at 752 Myrtle, Apr 12–14!/);
    expect(t).toContain("https://x/stay/abc");
    expect(t).toContain("Reply STOP to opt out.");
    expect(t).not.toMatch(/code|wi-?fi|password|address/i);
  });
  it("sends once per booking through Twilio, with a fresh stay link; a retry doesn't text again", async () => {
    await book("PH-SMS001");
    const f = twilioOk();
    expect(await textConfirmation(db, o, ENV, f as any)).toBe("sent");
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json");
    const form = new URLSearchParams(init.body.toString());
    expect(form.get("To")).toBe("+12105550100");
    expect(form.get("From")).toBe("+18885550100");
    expect(form.get("Body")).toMatch(/https:\/\/pearlheightshomes\.com\/stay\/[A-Za-z0-9_-]{40,}/);
    expect(await textConfirmation(db, o, ENV, f as any)).toBe("duplicate");
    expect(f).toHaveBeenCalledTimes(1);
    const [row] = await db.query<any>(`SELECT status, to_last4, provider_id FROM guest_messages`);
    expect(row).toMatchObject({ status: "sent", to_last4: "0100", provider_id: "SM123" });
    const links = await db.query<any>(`SELECT channel FROM stay_links WHERE channel = 'sms'`);
    expect(links.length).toBe(1);
  });
  it("a Twilio error is recorded and never thrown; off means nothing is sent", async () => {
    await book("PH-SMS001");
    const bad = vi.fn(async () => new Response(JSON.stringify({ code: 21211, message: "invalid" }), { status: 400 }));
    expect(await textConfirmation(db, o, ENV, bad as any)).toBe("failed");
    const [row] = await db.query<any>(`SELECT status, error FROM guest_messages`);
    expect(row.status).toBe("failed");
    const f = twilioOk();
    expect(await textConfirmation(db, { ...o, bookingRef: "PH-NOPE" }, {} as any, f as any)).toBe("off");
    expect(f).not.toHaveBeenCalled();
  });
});
