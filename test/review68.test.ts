// Tests requested in ChatGPT code review (note 68).
import { describe, expect, it } from "vitest";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { runCheckout, runCheckoutOnce, CheckoutRequest } from "../src/services/checkout";
import { MemoryBookingStore } from "../src/services/bookingStore";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { computeRefund } from "../src/domain/refunds";
import { getAdapters, launchGateErrors } from "../src/server/adapters";
import { parseCheckout, redact, ValidationError } from "../src/server/validate";

const NOW = new Date("2026-11-14T20:00:00Z");
const edgewood = getProperty("edgewood");
const rates = (from: string, to: string, c: number) => {
  const o: Record<string, number> = {};
  for (let d = new Date(from + "T00:00:00Z"); d < new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) o[d.toISOString().slice(0, 10)] = c;
  return o;
};
async function req(h: MockHospitable, ref: string): Promise<CheckoutRequest> {
  const base = { property: edgewood, checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0, now: NOW };
  const cal = await h.getCalendar(edgewood.hospitableUuid, base.checkIn, base.checkOut);
  const q = buildQuote({ payPlan: "split",  ...base, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < base.checkOut).map((d) => [d.date, d.price])) });
  return { ...base, guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" }, bookingRef: ref, acceptedTotal: q.total };
}

describe("concurrency and repeats", () => {
  it("two guests racing for the same dates: exactly one booking, the other is not charged", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const [a, b] = await Promise.all([runCheckout(await req(h, "PH-RACE01"), h, p), runCheckout(await req(h, "PH-RACE02"), h, p)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const captured = [...p.intents.values()].filter((i) => i.status === "captured");
    expect(captured).toHaveLength(1);
    expect([...p.intents.values()].filter((i) => i.status === "authorized")).toHaveLength(0); // loser's hold voided
  });

  it("a repeated/double-clicked request with the same ref returns the first result and charges once", async () => {
    const h = new MockHospitable(), p = new MockPayments(), store = new MemoryBookingStore();
    const r1 = await req(h, "PH-TWICE1");
    const [x, y] = await Promise.all([runCheckoutOnce(r1, h, p, store), runCheckoutOnce(r1, h, p, store)]);
    const z = await runCheckoutOnce(r1, h, p, store);
    expect(x).toBe(y);
    expect(z).toBe(x);
    expect(x.ok).toBe(true);
    expect(p.intents.size).toBe(1);
  });
});

describe("capture failure where the cancellation stays BLOCKED", () => {
  it("does not tell the system the dates are open until the calendar confirms it", async () => {
    const h = new MockHospitable(), p = new MockPayments("capture_fails");
    h.cancelSlow = true;
    const r = await runCheckout(await req(h, "PH-SLOW01"), h, p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.state).toBe("cancelling_after_capture_fail"); // reconciliation job keeps polling; guest sees "being completed"
    expect(r.log.some((l) => l.includes("dates not yet open"))).toBe(true);
  });
});

describe("scheduled second payment: DST and month boundaries (4 PM Central, 30 days before check-in)", () => {
  const charge = (checkIn: string) =>
    buildQuote({ payPlan: "split",  property: edgewood, checkIn, checkOut: checkInPlus(checkIn, 2), adults: 2, children: 0, infants: 0, now: NOW, nightlyRates: rates(checkIn, checkInPlus(checkIn, 2), 30000) }).plan.scheduled!.chargeAt.toISOString();
  it("crosses into a month with 31 days", () => expect(charge("2027-03-31")).toBe("2027-03-01T22:00:00.000Z")); // CST
  it("day before spring-forward is still CST (DST starts Mar 14, 2027)", () => expect(charge("2027-04-12")).toBe("2027-03-13T22:00:00.000Z"));
  it("lands after spring-forward (CDT)", () => expect(charge("2027-04-20")).toBe("2027-03-21T21:00:00.000Z"));
  it("lands in February from March", () => expect(charge("2027-03-02")).toBe("2027-01-31T22:00:00.000Z"));
  it("straddles the November fall-back", () => expect(charge("2027-12-05")).toBe("2027-11-05T21:00:00.000Z")); // still CDT on Nov 5
});

describe("Indianola refunds with and without extra guests (fee base includes extra-guest charges)", () => {
  const indianola = getProperty("indianola");
  const make = (adults: number) =>
    buildQuote({ payPlan: "split",  property: indianola, checkIn: "2027-03-01", checkOut: "2027-03-04", adults, children: 0, infants: 0, now: NOW, nightlyRates: rates("2027-03-01", "2027-03-04", 50000) });
  for (const adults of [4, 6]) {
    it(`${adults} guests: 5% fee = 5% of nights + extra guests + cleaning`, () => {
      const q = make(adults);
      const expectedBase = 150000 + Math.max(0, adults - 4) * 3000 * 3 + 29000;
      expect(q.processingFeeBase).toBe(expectedBase);
      const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt: NOW, cancelledAt: new Date("2027-01-15T18:00:00Z"), paidSoFar: q.plan.dueNow, reason: "guest" });
      expect(r.processingFee).toBe(Math.round(expectedBase * 0.05));
      expect(r.refund).toBe(q.plan.dueNow - Math.round(expectedBase * 0.05));
    });
  }
});

describe("guards", () => {
  it("production refuses mock adapters unless explicitly allowed", () => {
    expect(() => getAdapters("none", { NODE_ENV: "production", CHECKOUT_MODE: "mock" } as any)).toThrow(/not allowed in production/);
    expect(() => getAdapters("none", { NODE_ENV: "production", CHECKOUT_MODE: "mock", ALLOW_MOCK: "true" } as any)).not.toThrow();
    expect(() => getAdapters("none", { NODE_ENV: "production", VERCEL_ENV: "preview", CHECKOUT_MODE: "mock" } as any)).not.toThrow();
    expect(() => getAdapters("none", { NODE_ENV: "production", VERCEL_ENV: "production", CHECKOUT_MODE: "mock" } as any)).toThrow(/not allowed in production/);
  });
  it("live mode is blocked until taxes, Stripe checklist and attorney are confirmed", () => {
    expect(launchGateErrors({} as any)).toHaveLength(3);
    expect(() => getAdapters("none", { CHECKOUT_MODE: "live" } as any)).toThrow(/Live mode blocked/);
  });
  it("validation rejects bad input and never accepts a client-supplied price", () => {
    const good = { property: "edgewood", checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, guest: { firstName: "A", lastName: "B", email: "a@b.co", phone: "2105550100" }, agreed: true, consentId: "checkout-1.2", acceptedTotal: 100, price: 1, quoteId: "00000000-0000-4000-8000-000000000001", attemptKey: "00000000-0000-4000-8000-000000000002" };
    expect(parseCheckout(good)).not.toHaveProperty("price");
    expect(() => parseCheckout({ ...good, checkIn: "04/05/2027" })).toThrow(ValidationError);
    expect(() => parseCheckout({ ...good, adults: 2.5 })).toThrow(ValidationError);
    expect(() => parseCheckout({ ...good, agreed: false })).toThrow(ValidationError);
    expect(() => parseCheckout({ ...good, bookingRef: "x" })).toThrow(ValidationError);
  });
  it("logs redact email and phone", () => {
    expect(redact("fail for maria@example.com +1 (210) 555-0100")).toBe("fail for [email] [phone]");
  });
});

function checkInPlus(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
