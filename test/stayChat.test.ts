// Guest chat on the stay page + host inbox (Oscar, Nov 19), on PGlite with all migrations (incl. 0016_stay_chat).
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
import { setReaction, addMessage, alertGuest, alertHost, cleanBody, hostAlertText, hostForSession, inbox, issueLoginToken, listMessages, markRead, redeemLoginToken, threadInfo, ALERT_GAP_MS } from "../src/services/stayChat";

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

async function book(ref = "PH-CHAT01") {
  const h = new MockHospitable(), p = new MockPayments();
  const stay = { property: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(p752.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ payPlan: "split", ...stay, property: p752, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "sess-A", NOW);
  const req: CheckoutRequest = { ...stay, property: p752, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "Ana", lastName: "Guest", email: "ana@example.com", phone: "2105550100" } };
  await ledger.runAttempt("12121212-1212-4121-8121-121212121212", saved, ref, () => bookingAttempt(ledger, saved, req, h, p, fast));
  const t = (await issueStayLink(db, { bookingRef: ref, sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
  return (await loadStay(db, t, NOW))!.bookingId;
}

function fakeFetch() {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: any) => {
    calls.push({ url, body: init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : JSON.parse(init.body) });
    return new Response(JSON.stringify(url.includes("twilio") ? { sid: "SM1" } : { id: "em_" + calls.length }), { status: 201 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ENV = { RESEND_API_KEY: "re_test" } as unknown as NodeJS.ProcessEnv;

describe("guest chat", () => {
  it("cleans message text: trims, keeps line breaks, rejects empty and too long", () => {
    expect(cleanBody("  hi\r\nthere\n\n\n\nok ")).toBe("hi\nthere\n\nok");
    expect(cleanBody("   ")).toBeNull();
    expect(cleanBody(42)).toBeNull();
    expect(cleanBody("x".repeat(2001))).toBeNull();
  });

  it("keeps one thread per booking; each side's read marks only the other side's messages", async () => {
    const id = await book();
    await addMessage(db, id, "guest", "Can we check in early?", NOW);
    await addMessage(db, id, "host", "Yes, 2 PM works.", new Date(NOW.getTime() + 60_000));
    await markRead(db, id, "host", NOW);
    const m = await listMessages(db, id);
    expect(m.map((x) => [x.sender, x.body, !!x.readAt])).toEqual([["guest", "Can we check in early?", true], ["host", "Yes, 2 PM works.", false]]);
    const [row] = await inbox(db);
    expect(row).toMatchObject({ bookingId: id, guestName: "Ana Guest", lastSender: "host", lastBody: "Yes, 2 PM works.", unread: 0, propertyKey: "752" });
  });

  it("alerts the host once per burst of unread messages, by email (and by text only when switched on)", async () => {
    const id = await book();
    const { f, calls } = fakeFetch();
    await addMessage(db, id, "guest", "Hi!", NOW);
    expect(await alertHost(db, id, "Hi!", "https://test.example", ENV, f, NOW)).toBe("sent:email");
    await addMessage(db, id, "guest", "One more thing", new Date(NOW.getTime() + 60_000));
    expect(await alertHost(db, id, "One more thing", "https://test.example", ENV, f, new Date(NOW.getTime() + 60_000))).toBe("grouped");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.to).toEqual(["bookings@pearlheightshomes.com"]);
    expect(calls[0]!.body.html).toContain(`https://test.example/host/t/${id}`);
    // Host reads the thread -> the next guest message alerts again right away.
    await markRead(db, id, "host", new Date(NOW.getTime() + 120_000));
    const later = new Date(NOW.getTime() + 180_000);
    await addMessage(db, id, "guest", "Thanks", later);
    const textEnv = { ...ENV, HOST_TEXT_ALERTS: "on", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", TWILIO_FROM: "+18444485500" } as unknown as NodeJS.ProcessEnv;
    expect(await alertHost(db, id, "Thanks", "https://test.example", textEnv, f, later)).toBe("sent:email+text");
    const sms = calls.find((c) => c.url.includes("twilio"))!;
    expect(sms.body.To).toBe("+12104002540");
    expect(sms.body.Body).toContain("Thanks");
    // Still unread but older than the gap -> alert again.
    const much = new Date(later.getTime() + ALERT_GAP_MS + 1000);
    await addMessage(db, id, "guest", "Hello?", much);
    expect(await alertHost(db, id, "Hello?", "https://test.example", ENV, f, much)).toBe("sent:email");
  });

  it("reactions: Airbnb's five only, one per side per message, removable", async () => {
    const id = await book(), other = "00000000-0000-4000-8000-000000000000";
    const g = await addMessage(db, id, "guest", "Early check-in?", NOW);
    const h = await addMessage(db, id, "host", "Yes!", new Date(NOW.getTime() + 1000));
    expect(await setReaction(db, id, h.id, "guest", "👍")).toBe(true);
    expect(await setReaction(db, id, h.id, "guest", "❤️")).toBe(true);      // replaces
    expect(await setReaction(db, id, g.id, "host", "🤣")).toBe(true);
    expect(await setReaction(db, id, h.id, "guest", "🔥")).toBe(false);      // not in the set
    expect(await setReaction(db, id, h.id, "guest", "😂")).toBe(false);      // not Airbnb's laugh
    expect(await setReaction(db, other, h.id, "guest", "👍")).toBe(false);   // another booking's thread
    let m = await listMessages(db, id);
    expect(m.map((x) => [x.guestReaction, x.hostReaction])).toEqual([[null, "🤣"], ["❤️", null]]);
    expect(await setReaction(db, id, h.id, "guest", null)).toBe(true);
    m = await listMessages(db, id);
    expect(m[1]!.guestReaction).toBeNull();
  });

  it("host alert text names the guest, home and dates and links to the thread", async () => {
    const id = await book();
    const t = (await threadInfo(db, id))!;
    const s = hostAlertText(t, "x".repeat(300), "https://h/t/1");
    expect(s).toMatch(/^Pearl Heights: new message from Ana \(/);
    expect(s).toContain("https://h/t/1");
    expect(s.length).toBeLessThan(260);
    expect(s).not.toMatch(/[\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/); // GSM-safe: no en dash, curly quotes or ellipsis
  });

  it("emails the guest about a reply only when guest emails are on, with a fresh working stay link", async () => {
    const id = await book();
    const { f, calls } = fakeFetch();
    expect(await alertGuest(db, id, "Yes!", "https://test.example", ENV, f, NOW)).toBe("off");
    const on = { ...ENV, GUEST_EMAILS: "on" } as unknown as NodeJS.ProcessEnv;
    expect(await alertGuest(db, id, "Yes!", "https://test.example", on, f, NOW)).toBe("sent");
    expect(calls[0]!.body.to).toEqual(["ana@example.com"]);
    const link = /https:\/\/test\.example\/stay\/([A-Za-z0-9_-]+)#messages/.exec(calls[0]!.body.text)![1]!;
    expect((await loadStay(db, link, NOW))!.bookingId).toBe(id);
  });
});

describe("host sign-in", () => {
  it("emails links only to host addresses; a link works once and opens a session", async () => {
    expect(await issueLoginToken(db, "someone@example.com", {} as any, NOW)).toBeNull();
    const t = (await issueLoginToken(db, " Bookings@PearlHeightsHomes.com ", {} as any, NOW))!;
    expect(t).toBeTruthy();
    const s = (await redeemLoginToken(db, t, NOW))!;
    expect(await redeemLoginToken(db, t, NOW)).toBeNull();
    expect(await hostForSession(db, s, {} as any, NOW)).toBe("bookings@pearlheightshomes.com");
    expect(await hostForSession(db, "y".repeat(43), {} as any, NOW)).toBeNull();
    expect(await hostForSession(db, s, {} as any, new Date(NOW.getTime() + 91 * 864e5))).toBeNull();
    // Removing an address from HOST_EMAILS ends its sessions.
    expect(await hostForSession(db, s, { HOST_EMAILS: "other@example.com" } as any, NOW)).toBeNull();
  });
  it("sign-in links expire after 15 minutes", async () => {
    const t = (await issueLoginToken(db, "bookings@pearlheightshomes.com", {} as any, NOW))!;
    expect(await redeemLoginToken(db, t, new Date(NOW.getTime() + 16 * 60_000))).toBeNull();
  });
});
