// Questions before booking and 24-hour special offers (Oscar, Nov 19). PGlite with all migrations.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db/client";
import { MockHospitable } from "../src/adapters/mock";
import { getProperty } from "../src/domain/properties";
import { buildQuote, discountForTotal, QuoteError } from "../src/domain/quote";
import { runMigrations } from "../scripts/migrate.mjs";
import {
  activeOffer, addInquiryMessage, alertGuestInquiry, alertHostInquiry, createInquiry, createOffer, inquiryForToken, inquiryInbox,
  listInquiryMessages, markInquiryRead, markOfferUsed, offerForCheckout, offerUrl, parseInquiry, withdrawOffer,
} from "../src/services/inquiries";

function wrap(pg: PGlite): Db {
  return {
    async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
    async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
  };
}
const NOW = new Date("2026-11-20T18:00:00Z");
let db: Db;
beforeEach(async () => { db = wrap(new PGlite()); await runMigrations(db, undefined, () => {}); });

const FORM = { property: "752", checkIn: "2027-04-12", checkOut: "2027-04-15", adults: 2, children: 1, infants: 0, quotedTotal: 150000,
  name: "Jamie Rivera", email: "jamie@example.com", message: "Is the crib available? Any chance of a better rate?" };
const STAY = { property: "752", checkIn: "2027-04-12", checkOut: "2027-04-15", adults: 2, children: 1, infants: 0 };
const mailer = () => {
  const sent: { to: string; subject: string; text: string }[] = [];
  const f = (async (_u: string, init: any) => { const b = JSON.parse(init.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text }); return new Response(JSON.stringify({ id: "em_1" }), { status: 200 }); }) as typeof fetch;
  return { sent, f };
};

async function input(adults = 2, children = 1) {
  const p = getProperty("752"), h = new MockHospitable();
  const cal = await h.getCalendar(p.hospitableUuid, STAY.checkIn, STAY.checkOut);
  return { property: p, checkIn: STAY.checkIn, checkOut: STAY.checkOut, adults, children, infants: 0, now: NOW,
    nightlyRates: Object.fromEntries(cal.filter((d) => d.date < STAY.checkOut).map((d) => [d.date, d.price])) };
}

describe("form validation", () => {
  it("dates are optional; half a date range is dropped; name, email and message are required", () => {
    const ok = parseInquiry(FORM);
    expect(typeof ok).toBe("object");
    const noDates = parseInquiry({ ...FORM, checkIn: null, checkOut: null });
    expect(noDates).toMatchObject({ checkIn: null, checkOut: null, quotedTotal: null });
    expect(parseInquiry({ ...FORM, checkOut: null })).toMatchObject({ checkIn: null, checkOut: null });
    expect(parseInquiry({ ...FORM, checkOut: "2027-04-10" })).toMatchObject({ checkIn: null });
    expect(parseInquiry({ ...FORM, name: " " })).toBe("Please add your name.");
    expect(parseInquiry({ ...FORM, email: "nope" })).toMatch(/valid email/);
    expect(parseInquiry({ ...FORM, message: "" })).toMatch(/write a message/);
    expect(parseInquiry({ ...FORM, property: "nope" })).toBe("Please choose a home.");
  });
});

describe("conversation", () => {
  it("saves the question, opens by private link only, and tracks unread on both sides", async () => {
    const n = parseInquiry(FORM) as any;
    const { id, token } = await createInquiry(db, n, false, NOW);
    expect((await inquiryForToken(db, token, NOW))?.id).toBe(id);
    expect(await inquiryForToken(db, token + "x", NOW)).toBeNull();
    expect(await inquiryForToken(db, token, new Date(NOW.getTime() + 200 * 864e5))).toBeNull(); // expired
    // Only the hash is stored.
    const [row] = await db.query<any>(`SELECT token_hash FROM inquiry_links`);
    expect(row.token_hash).not.toBe(token);
    let [inbox] = await inquiryInbox(db);
    expect(inbox).toMatchObject({ id, guestName: "Jamie Rivera", unread: 1, lastSender: "guest", livemode: false });
    await markInquiryRead(db, id, "host", NOW);
    await addInquiryMessage(db, id, "host", "Yes! The crib is there.", new Date(NOW.getTime() + 60_000));
    [inbox] = await inquiryInbox(db);
    expect(inbox).toMatchObject({ unread: 0, lastSender: "host", lastBody: "Yes! The crib is there." });
    expect((await listInquiryMessages(db, id)).map((m) => m.sender)).toEqual(["guest", "host"]);
  });

  it("host alert: TEST tag on the test site, grouped while unread, again once read", async () => {
    const { id } = await createInquiry(db, parseInquiry(FORM) as any, false, NOW);
    const m = mailer(), env = { RESEND_API_KEY: "re_x" } as any;
    expect(await alertHostInquiry(db, id, FORM.message, "https://x.test", true, env, m.f, NOW)).toBe("sent:email");
    expect(m.sent[0]!.subject).toMatch(/^TEST · New question from Jamie: 752 Myrtle, Apr 12–15/);
    expect(m.sent[0]!.text).toContain("saw $1,500 total");
    expect(m.sent[0]!.text).toContain("/host/i/" + id);
    await addInquiryMessage(db, id, "guest", "Also, parking?", new Date(NOW.getTime() + 60_000));
    expect(await alertHostInquiry(db, id, "Also, parking?", "https://x.test", false, env, m.f, new Date(NOW.getTime() + 60_000))).toBe("grouped");
    await markInquiryRead(db, id, "host", new Date(NOW.getTime() + 120_000));
    await addInquiryMessage(db, id, "guest", "Thanks!", new Date(NOW.getTime() + 180_000));
    expect(await alertHostInquiry(db, id, "Thanks!", "https://x.test", false, env, m.f, new Date(NOW.getTime() + 180_000))).toBe("sent:email");
    expect(await alertHostInquiry(db, id, "x", "https://x.test", false, {} as any, m.f, NOW)).toBe("off");
  });

  it("guest emails only with GUEST_EMAILS on; each email carries a fresh working link", async () => {
    const { id } = await createInquiry(db, parseInquiry(FORM) as any, false, NOW);
    const m = mailer();
    expect(await alertGuestInquiry(db, id, "x", "https://x.test", "received", { RESEND_API_KEY: "re_x" } as any, m.f, NOW)).toBe("off");
    expect(await alertGuestInquiry(db, id, "x", "https://x.test", "received", { RESEND_API_KEY: "re_x", GUEST_EMAILS: "on" } as any, m.f, NOW)).toBe("sent");
    const link = m.sent[0]!.text.match(/https:\/\/x\.test\/m\/(\S+)/)![1]!;
    expect((await inquiryForToken(db, link, NOW))?.id).toBe(id);
    expect(m.sent[0]!.to).toBe("jamie@example.com");
  });
});

describe("special offers", () => {
  it("the discount comes off the nights so the all-in total matches the offer (taxes still charged)", async () => {
    const q = await input();
    const regular = buildQuote(q).total;
    for (const target of [regular - 10_000, regular - 12_345, Math.round(regular * 0.8)]) {
      const d = discountForTotal(q, target);
      const t = buildQuote({ ...q, nightlyDiscount: d }).total;
      expect(t).toBeLessThanOrEqual(target);
      expect(target - t).toBeLessThanOrEqual(1);
    }
    expect(discountForTotal(q, regular + 100)).toBe(0);
    expect(() => discountForTotal(q, 1000)).toThrow(QuoteError);
  });

  it("works only through the guest's link, for the offered home and dates, at most the offered guests, same mode, within 24 hours, once", async () => {
    const { id, token } = await createInquiry(db, parseInquiry(FORM) as any, false, NOW);
    const inq = (await inquiryForToken(db, token, NOW))!;
    const regular = buildQuote(await input()).total;
    const o = await createOffer(db, inq, { checkIn: STAY.checkIn, checkOut: STAY.checkOut, adults: 2, children: 1, infants: 0, total: regular - 20_000, regular }, "oscar@x", new Date(NOW.getTime() + 60_000));
    expect(o.active).toBe(true);
    expect(Date.parse(o.expiresAt) - NOW.getTime()).toBe(24 * 3600_000 + 60_000);
    const msgs = await listInquiryMessages(db, id);
    expect(msgs.at(-1)!.body).toMatch(/^Special offer: \$[\d,.]+ total for 752 Myrtle, Apr 12–15, 3 guests \(regular price/);
    expect(offerUrl(o, token)).toContain(`offer=${token}`);

    const at = new Date(NOW.getTime() + 3600_000);
    expect((await offerForCheckout(db, token, STAY, false, at))?.id).toBe(o.id);
    expect(await offerForCheckout(db, "not-the-guest-link-0000000000", STAY, false, at)).toBeNull();
    expect(await offerForCheckout(db, token, STAY, true, at)).toBeNull(); // live checkout, test offer
    expect(await offerForCheckout(db, token, { ...STAY, checkOut: "2027-04-16" }, false, at)).toBeNull();
    expect(await offerForCheckout(db, token, { ...STAY, property: "736" }, false, at)).toBeNull();
    expect(await offerForCheckout(db, token, { ...STAY, adults: 4 }, false, at)).toBeNull();
    expect((await offerForCheckout(db, token, { ...STAY, children: 0 }, false, at))?.id).toBe(o.id); // fewer guests is fine
    expect(await offerForCheckout(db, token, STAY, false, new Date(NOW.getTime() + 25 * 3600_000))).toBeNull(); // expired

    await markOfferUsed(db, o.id, "PH-OFFER1");
    expect(await offerForCheckout(db, token, STAY, false, at)).toBeNull();
    expect(await activeOffer(db, id, at)).toBeNull();
  });

  it("a new offer replaces the old one; withdrawing ends it and says so in the conversation", async () => {
    const { id, token } = await createInquiry(db, parseInquiry(FORM) as any, false, NOW);
    const inq = (await inquiryForToken(db, token, NOW))!;
    const base = { checkIn: STAY.checkIn, checkOut: STAY.checkOut, adults: 2, children: 1, infants: 0, regular: 200_000 };
    const a = await createOffer(db, inq, { ...base, total: 180_000 }, "oscar@x", NOW);
    const b = await createOffer(db, inq, { ...base, total: 170_000 }, "oscar@x", new Date(NOW.getTime() + 1000));
    expect((await activeOffer(db, id, NOW))?.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
    expect(await withdrawOffer(db, id, "oscar@x", new Date(NOW.getTime() + 2000))).toBe(true);
    expect(await activeOffer(db, id, NOW)).toBeNull();
    expect((await listInquiryMessages(db, id)).at(-1)!.body).toBe("We withdrew the special offer.");
    expect(await withdrawOffer(db, id, "oscar@x", new Date(NOW.getTime() + 3000))).toBe(false);
  });
});
