// Real bookings -> private stay page links (Oscar, Nov 17), on PGlite with all migrations (incl. 0013_stay_links).
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
import { hashToken, issueStayLink, linkExpiry, loadStay, looksLikeToken, recordAgreementSigned, recordIdVerified, recordSigningDocument } from "../src/services/stayLinks";

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

describe("stay links", () => {
  it("issues a link only to the session that booked; the DB keeps only the hash", async () => {
    await book();
    expect(await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "someone-else", channel: "confirmation", now: NOW })).toBeNull();
    expect(await issueStayLink(db, { bookingRef: "PH-NOPE01", sessionId: "sess-A", channel: "confirmation", now: NOW })).toBeNull();
    const t = await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW });
    expect(t && looksLikeToken(t)).toBe(true);
    const rows = await db.query<any>(`SELECT token_hash, expires_at FROM stay_links`);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(t!));
    expect(JSON.stringify(rows)).not.toContain(t!);
    expect(new Date(rows[0].expires_at).toISOString()).toBe(linkExpiry("2027-04-14").toISOString());
  });
  it("loads the booking from a live link; unknown, expired and revoked links load nothing", async () => {
    const { quote } = await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const s = await loadStay(db, t, NOW);
    expect(s).toMatchObject({ bookingRef: "PH-STAY01", propertyKey: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 1, firstName: "Ana", totalCents: quote.total, agreementSignedAt: null, idCheckedAt: null });
    expect(await loadStay(db, "x".repeat(43), NOW)).toBeNull();
    expect(await loadStay(db, "demo", NOW)).toBeNull();
    expect(await loadStay(db, t, new Date("2027-04-18T06:00:00Z"))).toBeNull(); // after check-out + 3 days
    await db.query(`UPDATE stay_links SET revoked_at = now()`);
    expect(await loadStay(db, t, NOW)).toBeNull();
  });
  it("saves paperwork once, so it shows on any device; repeated polling adds no audit rows", async () => {
    await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const id = (await loadStay(db, t, NOW))!.bookingId;
    await recordSigningDocument(db, id, "11111111-2222-4333-8444-555555555555");
    for (let i = 0; i < 3; i++) {
      await recordAgreementSigned(db, id, { documentId: "11111111-2222-4333-8444-555555555555", signedAt: "2026-11-15T10:00:00Z", signedName: "Ana M. Guest" });
      await recordIdVerified(db, id, { sessionId: "vs_test123456", checkedAt: "2026-11-15T10:05:00Z", checkoutISO: "2027-04-14" });
    }
    const s = (await loadStay(db, t, NOW))!;
    expect(s).toMatchObject({ agreementSignedName: "Ana M. Guest", idStatus: "verified", stripeSession: "vs_test123456" });
    expect(s.agreementSignedAt).not.toBeNull();
    const audit = await db.query<any>(`SELECT action FROM audit_log WHERE booking_id = $1 AND action IN ('agreement_signed','id_verified')`, [id]);
    expect(audit).toHaveLength(2);
    const v = (await db.query<any>(`SELECT redact_after FROM verifications WHERE booking_id = $1`, [id]))[0];
    expect(new Date(v.redact_after).toISOString().slice(0, 10)).toBe("2027-08-12");
  });
});

describe("ID redaction after 120 days (Privacy Notice §4, §10)", () => {
  it("redacts the Stripe session once when due, deletes our reference, skips legal holds, retries failures", async () => {
    const { redactDueVerifications } = await import("../src/services/idRedaction");
    await book();
    const t = (await issueStayLink(db, { bookingRef: "PH-STAY01", sessionId: "sess-A", channel: "confirmation", now: NOW }))!;
    const id = (await loadStay(db, t, NOW))!.bookingId;
    await recordIdVerified(db, id, { sessionId: "vs_test123456", checkedAt: "2026-11-15T10:05:00Z", checkoutISO: "2027-04-14" });
    const calls: [string, boolean][] = [];
    const ok = async (s: string, live: boolean) => { calls.push([s, live]); };
    expect(await redactDueVerifications(db, new Date("2027-08-01T00:00:00Z"), ok)).toMatchObject({ due: 0 }); // not yet due
    await db.query(`UPDATE verifications SET legal_hold = true`);
    expect(await redactDueVerifications(db, new Date("2027-08-13T00:00:00Z"), ok)).toMatchObject({ due: 0 }); // hold
    await db.query(`UPDATE verifications SET legal_hold = false`);
    expect(await redactDueVerifications(db, new Date("2027-08-13T00:00:00Z"), async () => { throw new Error("stripe down"); })).toMatchObject({ due: 1, failed: 1 });
    expect(await redactDueVerifications(db, new Date("2027-08-13T00:00:00Z"), ok)).toMatchObject({ due: 1, redacted: 1 });
    expect(calls).toEqual([["vs_test123456", false]]);
    const v = (await db.query<any>(`SELECT stripe_verification_session, redacted_at FROM verifications WHERE booking_id = $1`, [id]))[0];
    expect(v.stripe_verification_session).toBeNull();
    expect(v.redacted_at).not.toBeNull();
    expect(await redactDueVerifications(db, new Date("2027-09-01T00:00:00Z"), ok)).toMatchObject({ due: 0 }); // once
  });
});
