// Live payments on pearlheightshomes.com (Oscar, Nov 19): the mode is chosen per host; test and live never mix.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import type { Db } from "../src/db/client";
import { DbLedger } from "../src/db/ledger";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { bookingAttempt } from "../src/services/bookingFlow";
import { runDueSecondCharges } from "../src/services/secondCharge";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { runMigrations } from "../scripts/migrate.mjs";
import { envForMode, envForRequest, modeForHost } from "../src/server/mode";
import { assertLiveKeys, StripePayments } from "../src/adapters/stripe";
import { getAdapters, publicConfig } from "../src/server/adapters";
import { middleware } from "../middleware";

const ENV = {
  CHECKOUT_MODE: "test", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_LIVE_SECRET_KEY: "rk_live_x", STRIPE_LIVE_PUBLISHABLE_KEY: "pk_live_x", STRIPE_LIVE_WEBHOOK_SECRET: "whsec_live",
} as unknown as NodeJS.ProcessEnv;
const on = { ...ENV, LIVE_CHECKOUT: "on" } as unknown as NodeJS.ProcessEnv;

describe("mode per host", () => {
  it("the real domain is live only with LIVE_CHECKOUT=on; the test site is always test", () => {
    expect(modeForHost("pearlheightshomes.com", ENV)).toBe("test");
    expect(modeForHost("pearlheightshomes.com", on)).toBe("live");
    expect(modeForHost("www.pearlheightshomes.com", on)).toBe("live");
    expect(modeForHost("pearl-heights-checkout.vercel.app", on)).toBe("test");
  });
  it("live settings swap in the STRIPE_LIVE_* values; test settings are unchanged", () => {
    const L = envForMode("live", ENV);
    expect([L.CHECKOUT_MODE, L.STRIPE_SECRET_KEY, L.STRIPE_PUBLISHABLE_KEY, L.STRIPE_WEBHOOK_SECRET]).toEqual(["live", "rk_live_x", "pk_live_x", "whsec_live"]);
    expect(envForMode("test", ENV)).toBe(ENV);
    const r = new Request("https://pearl-heights-checkout.vercel.app/api/config", { headers: { host: "pearl-heights-checkout.vercel.app" } });
    expect(envForRequest(r, on).STRIPE_SECRET_KEY).toBe("sk_test_x");
  });
  it("live accepts only live keys (restricted rk_live_ is fine) and shows the live publishable key", () => {
    expect(assertLiveKeys(envForMode("live", ENV)).secret).toBe("rk_live_x");
    expect(() => assertLiveKeys(envForMode("live", { ...ENV, STRIPE_LIVE_SECRET_KEY: "sk_test_x" } as unknown as NodeJS.ProcessEnv))).toThrow(/LIVE secret/);
    expect(publicConfig(envForMode("live", ENV))).toEqual({ mode: "live", publishableKey: "pk_live_x" });
    expect(() => StripePayments.fromEnv({ ...ENV, STRIPE_SECRET_KEY: "rk_live_x" } as unknown as NodeJS.ProcessEnv)).toThrow(/TEST/);
  });
  it("live adapters refuse to start until the launch gates and the Hospitable token are in place", () => {
    expect(() => getAdapters("none", envForMode("live", ENV))).toThrow(/Live mode blocked/);
    const gates = { ...ENV, TAX_RATES_CONFIRMED: "true", STRIPE_CHECKLIST_PASSED: "true", ATTORNEY_APPROVED: "true" } as unknown as NodeJS.ProcessEnv;
    expect(() => getAdapters("none", envForMode("live", gates))).toThrow(/HOSPITABLE_API_TOKEN/);
  });
});

describe("launch switch on the real domain (middleware)", () => {
  const req = (url: string, host = "pearlheightshomes.com") => new NextRequest(new URL(url, `https://${host}`), { headers: { host } });
  it("with LIVE_CHECKOUT=on: checkout, stay pages and the host inbox open; Reserve stays on our checkout; test paths stay closed", () => {
    const prev = process.env.LIVE_CHECKOUT;
    process.env.LIVE_CHECKOUT = "on";
    try {
      expect(middleware(req("/?home=edgewood&checkIn=2026-12-23&checkOut=2026-12-26")).headers.get("x-middleware-next")).toBe("1");
      for (const p of ["/api/checkout", "/stay/abc", "/api/stay/abc/messages", "/host", "/api/host/threads"]) expect(middleware(req(p)).status).toBe(200);
      for (const p of ["/api/mock/reset", "/preview/confirmation", "/api/internal/test-email"]) expect(middleware(req(p)).status).toBe(404);
      expect(middleware(req("/")).headers.get("x-middleware-rewrite")).toContain("/all-homes/f");
    } finally { if (prev === undefined) delete process.env.LIVE_CHECKOUT; else process.env.LIVE_CHECKOUT = prev; }
  });
});

const wrap = (pg: PGlite): Db => ({
  async query(text, params = []) { return (await pg.query(text, params as any[])).rows as any; },
  async tx(st) { return pg.transaction(async (t) => { const out: any[][] = []; for (const [text, p] of st) out.push((await t.query(text, p as any[])).rows as any[]); return out; }); },
});
const NOW = new Date("2026-11-14T20:00:00Z");
let db: Db, ledger: DbLedger;
beforeEach(async () => { db = wrap(new PGlite()); await runMigrations(db, undefined, () => {}); ledger = new DbLedger(db, 5); });

async function splitBooking(p: MockPayments, ref: string, livemode: boolean, checkIn: string) {
  const h = new MockHospitable(), prop = getProperty("752");
  const stay = { property: "752", checkIn, checkOut: checkIn.replace(/-(\d\d)$/, (_m, d) => "-" + String(Number(d) + 2).padStart(2, "0")), adults: 2, children: 0, infants: 0 };
  const cal = await h.getCalendar(prop.hospitableUuid, stay.checkIn, stay.checkOut);
  const quote = buildQuote({ payPlan: "split", ...stay, property: prop, now: NOW, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  const saved = await ledger.saveQuote(stay, quote, "s", NOW, livemode);
  expect((await ledger.getQuote(saved.id))!.livemode).toBe(livemode);
  const o = await bookingAttempt(ledger, saved, { ...stay, property: prop, now: NOW, bookingRef: ref, acceptedTotal: quote.total,
    guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" } }, h, p, { blockCheckDelaysMs: [0], sleep: async () => {} });
  expect(o.ok).toBe(true);
}

describe("bookings remember their mode", () => {
  it("second charges run with the matching keys: the test run never touches a live booking and vice versa", async () => {
    const testPay = new MockPayments(), livePay = new MockPayments();
    await splitBooking(testPay, "PH-TST001", false, "2027-04-12");
    await splitBooking(livePay, "PH-LIV001", true, "2027-05-10");
    await db.query(`UPDATE jobs SET run_at = now() - interval '1 minute' WHERE type = 'second_payment'`);
    expect(await runDueSecondCharges(db, testPay, 10, false)).toMatchObject({ due: 1, paid: 1 });
    expect(await runDueSecondCharges(db, livePay, 10, true)).toMatchObject({ due: 1, paid: 1 });
    expect([...testPay.intents.keys()].some((k) => k.includes("PH-LIV001"))).toBe(false);
    expect([...livePay.intents.keys()].some((k) => k.includes("PH-TST001"))).toBe(false);
  });
  it("reconciliation picks up only its own mode", async () => {
    const q = await ledger.saveQuote({ property: "752", checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 0, infants: 0 },
      buildQuote({ payPlan: "full", property: getProperty("752"), checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 0, infants: 0, now: NOW, nightlyRates: { "2027-04-12": 50000, "2027-04-13": 50000 } }), "s", NOW, true);
    await db.query(`INSERT INTO checkout_attempts (attempt_key, quote_id, quote_version, booking_ref, status) VALUES ('11111111-1111-4111-8111-111111111111', $1, $2, 'PH-LIV002', 'needs_reconciliation')`, [q.id, q.version]);
    expect(await ledger.pendingReconciliation(10, false)).toEqual([]);
    expect(await ledger.pendingReconciliation(10, true)).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});

