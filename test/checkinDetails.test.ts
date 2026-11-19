// Check-in details (audit F1, Oscar Nov 19): placeholders, release rules, door-code alert. PGlite with all migrations.
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
import { issueStayLink, loadStay, recordAgreementSigned, recordIdVerified } from "../src/services/stayLinks";
import { arrivalFor, maybeDoorCodeAlert, renderMessage, saveDetails, getDetails, listDetails, unknownPlaceholders, releaseAt } from "../src/services/checkinDetails";

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
  return { quote };
}


const TEMPLATE = "Hi %guest_first_name%,\nAddress: %listing_full_address%\nDoor code: %guest_phone_last4% then the check mark.\nGate: 0000.\nDates: %check_in% - %check_out% (%nights%). In %check_in_hour%, out %check_out_hour%.\nGuide: https://example.com/guide %unknown_code%";
const GUEST = { firstName: "Ana", lastName: "Guest", phone: "(210) 555-0100", checkIn: "2027-04-12", checkOut: "2027-04-14", bookingRef: "PH-STAY01", propertyKey: "752" };
const DETAILS = { propertyKey: "752", address: "1 Sample St, San Antonio, TX", message: TEMPLATE, updatedAt: "2026-11-19T00:00:00Z" };

describe("check-in details", () => {
  it("fills Hospitable placeholders; door code is the last 4 digits of the phone; unknown placeholders are dropped", () => {
    const m = renderMessage(TEMPLATE, DETAILS.address, GUEST);
    expect(m).toContain("Hi Ana,");
    expect(m).toContain("Door code: 0100 then");
    expect(m).toContain("Address: 1 Sample St, San Antonio, TX");
    expect(m).toContain("(2 nights)");
    expect(m).toContain("In 4:00 PM, out 10:00 AM");
    expect(m).not.toMatch(/%[a-z_]+%/);
    expect(unknownPlaceholders(TEMPLATE)).toEqual(["%unknown_code%"]);
  });

  it("release rules: nothing before paperwork, nothing real for test bookings, address after paperwork, full message from 8 AM CT on check-in day", () => {
    const at = (iso: string) => new Date(iso);
    expect(arrivalFor({ livemode: true, paperworkDone: false, details: DETAILS, guest: GUEST, now: at("2027-04-12T15:00:00Z") })).toEqual({ state: "locked" });
    expect(arrivalFor({ livemode: false, paperworkDone: true, details: DETAILS, guest: GUEST, now: at("2027-04-12T15:00:00Z") })).toEqual({ state: "test" });
    expect(arrivalFor({ livemode: true, paperworkDone: true, details: null, guest: GUEST })).toEqual({ state: "missing" });
    expect(arrivalFor({ livemode: true, paperworkDone: true, details: { ...DETAILS, message: "" }, guest: GUEST })).toEqual({ state: "missing" });
    const before = arrivalFor({ livemode: true, paperworkDone: true, details: DETAILS, guest: GUEST, now: new Date(releaseAt("2027-04-12").getTime() - 1000) });
    expect(before.state).toBe("address");
    expect(JSON.stringify(before)).not.toContain("0100"); // no door code before check-in morning
    expect(JSON.stringify(before)).not.toContain("Gate");
    expect(releaseAt("2027-04-12").toISOString()).toBe("2027-04-12T13:00:00.000Z"); // 8:00 AM CDT
    const morning = arrivalFor({ livemode: true, paperworkDone: true, details: DETAILS, guest: GUEST, now: releaseAt("2027-04-12") });
    expect(morning.state).toBe("full");
    expect(morning.state === "full" && morning.message).toContain("Door code: 0100");
    expect(arrivalFor({ livemode: true, paperworkDone: true, details: DETAILS, guest: GUEST, now: at("2027-04-18T06:00:00Z") }).state).toBe("address"); // long after check-out
  });

  it("host saves details per home; only known homes", async () => {
    await saveDetails(db, "752", { address: " 1 Sample St ", message: TEMPLATE }, "host@example.com");
    expect(await getDetails(db, "752")).toMatchObject({ address: "1 Sample St", message: TEMPLATE });
    await saveDetails(db, "752", { address: "2 Sample St", message: "x" }, "host@example.com");
    expect((await getDetails(db, "752"))!.address).toBe("2 Sample St");
    await expect(saveDetails(db, "nope", { address: "a", message: "b" }, "h")).rejects.toThrow();
    const all = await listDetails(db);
    expect(all.map((h) => h.propertyKey).sort()).toEqual(["736", "752", "claywell", "edgewood", "indianola"]);
  });

  it("door-code alert goes to the host once, only after BOTH paperwork steps, and retries if the email failed", async () => {
    await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const id = (await loadStay(db, t, NOW))!.bookingId;
    const sent: any[] = [];
    let fail = true;
    const fetchImpl = (async (_u: string, init: any) => {
      if (fail) return new Response("{}", { status: 500 });
      sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { RESEND_API_KEY: "re_test", HOST_ALERT_EMAIL: "host@example.com" } as unknown as NodeJS.ProcessEnv;
    await recordAgreementSigned(db, id, { documentId: "11111111-2222-4333-8444-555555555555", signedAt: "2026-11-15T10:00:00Z", signedName: "Ana Guest" });
    fail = false;
    expect(await maybeDoorCodeAlert(db, id, env, fetchImpl)).toBe(false); // ID not verified yet
    await recordIdVerified(db, id, { sessionId: "vs_test123456", checkedAt: "2026-11-15T10:05:00Z", checkoutISO: "2027-04-14" });
    fail = true;
    expect(await maybeDoorCodeAlert(db, id, env, fetchImpl)).toBe(false); // email failed: unclaimed for a retry
    fail = false;
    expect(await maybeDoorCodeAlert(db, id, env, fetchImpl)).toBe(true);
    expect(await maybeDoorCodeAlert(db, id, env, fetchImpl)).toBe(false); // never twice
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["host@example.com"]);
    expect(sent[0].subject).toMatch(/^TEST · Set door code 0100 · /); // test booking, phone 2105550100
    expect(sent[0].text).toContain("PH-STAY01");
  });

  it("no door-code alert for a home whose message uses one fixed code", async () => {
    await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const id = (await loadStay(db, t, NOW))!.bookingId;
    await saveDetails(db, "752", { address: "1 Sample St", message: "Hi %guest_first_name%, the code is 0000 for everyone." }, "h");
    await recordAgreementSigned(db, id, { documentId: "11111111-2222-4333-8444-555555555555", signedAt: "2026-11-15T10:00:00Z", signedName: "Ana Guest" });
    await recordIdVerified(db, id, { sessionId: "vs_test123456", checkedAt: "2026-11-15T10:05:00Z", checkoutISO: "2027-04-14" });
    const sent: unknown[] = [];
    const fetchImpl = (async (_u: string, init: any) => { sent.push(init); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    expect(await maybeDoorCodeAlert(db, id, { RESEND_API_KEY: "re_test" } as unknown as NodeJS.ProcessEnv, fetchImpl)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("fixed-code home + crib requested: the host is still asked to set up the crib and high chair", async () => {
    await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const id = (await loadStay(db, t, NOW))!.bookingId;
    await db.query(`UPDATE bookings SET baby_gear = true WHERE id = $1`, [id]);
    expect((await loadStay(db, t, NOW))!.babyGear).toBe(true);
    await saveDetails(db, "752", { address: "1 Sample St", message: "Same code 0000 for everyone." }, "h");
    await recordAgreementSigned(db, id, { documentId: "11111111-2222-4333-8444-555555555555", signedAt: "2026-11-15T10:00:00Z", signedName: "Ana Guest" });
    await recordIdVerified(db, id, { sessionId: "vs_test123456", checkedAt: "2026-11-15T10:05:00Z", checkoutISO: "2027-04-14" });
    const sent: any[] = [];
    const fetchImpl = (async (_u: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "em_2" }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await maybeDoorCodeAlert(db, id, { RESEND_API_KEY: "re_test" } as unknown as NodeJS.ProcessEnv, fetchImpl)).toBe(true);
    expect(sent[0].subject).toMatch(/^TEST · Set up crib and high chair · /);
    expect(sent[0].text).toContain("set up the crib and high chair");
    expect(sent[0].text).not.toContain("door code");
  });
});
