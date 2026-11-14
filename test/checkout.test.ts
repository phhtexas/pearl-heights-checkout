import { describe, expect, it } from "vitest";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { runCheckout, CheckoutRequest } from "../src/services/checkout";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";

const NOW = new Date("2026-11-14T20:00:00Z");
const edgewood = getProperty("edgewood");

async function request(hosp: MockHospitable, ref: string, overrides: Partial<CheckoutRequest> = {}): Promise<CheckoutRequest> {
  const base = { property: edgewood, checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0, now: NOW };
  const cal = await hosp.getCalendar(edgewood.hospitableUuid, base.checkIn, base.checkOut);
  const q = buildQuote({ ...base, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < base.checkOut).map((d) => [d.date, d.price])) });
  return { ...base, guest: { firstName: "Test", lastName: "Guest", email: "t@example.com", phone: "2105550100" }, bookingRef: ref, acceptedTotal: q.total, ...overrides };
}

describe("checkout orchestration (mock Hospitable + Stripe)", () => {
  it("books, blocks the dates and captures on the happy path", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const r = await runCheckout(await request(h, "PH-OK1"), h, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).toBe("confirmed");
    expect(p.intents.get(r.paymentIntentId)?.status).toBe("captured");
    const cal = await h.getCalendar(edgewood.hospitableUuid, "2027-04-05", "2027-04-06");
    expect(cal.every((d) => !d.available)).toBe(true);
    expect(r.verification.rule).toBe("24h");
  });

  it("stops before touching the card when the dates were just taken", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const req = await request(h, "PH-TAKEN");
    h.blockDates(edgewood.hospitableUuid, ["2027-04-05"]);
    const r = await runCheckout(req, h, p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("dates_taken");
    expect(p.intents.size).toBe(0);
  });

  it("asks the guest to accept a changed price instead of charging silently", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const req = await request(h, "PH-PRICE", { acceptedTotal: 1 });
    const r = await runCheckout(req, h, p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("price_changed");
    expect(p.intents.size).toBe(0);
  });

  it("creates no reservation when the card is declined", async () => {
    const h = new MockHospitable(), p = new MockPayments("card_declined");
    const r = await runCheckout(await request(h, "PH-DECL"), h, p);
    expect(r.ok).toBe(false);
    const cal = await h.getCalendar(edgewood.hospitableUuid, "2027-04-05", "2027-04-06");
    expect(cal.every((d) => d.available)).toBe(true);
  });

  it("voids the hold when Hospitable fails", async () => {
    const h = new MockHospitable("reservation_fails"), p = new MockPayments();
    const r = await runCheckout(await request(h, "PH-RESV"), h, p);
    expect(r.ok).toBe(false);
    expect([...p.intents.values()][0]?.status).toBe("voided");
  });

  it("cancels the reservation and reopens the dates when capture fails", async () => {
    const h = new MockHospitable(), p = new MockPayments("capture_fails");
    const r = await runCheckout(await request(h, "PH-CAP"), h, p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.state).toBe("closed");
    const cal = await h.getCalendar(edgewood.hospitableUuid, "2027-04-05", "2027-04-06");
    expect(cal.every((d) => d.available)).toBe(true);
  });

  it("never double-books on a retried booking ref (Hospitable rejects duplicate codes)", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const first = await runCheckout(await request(h, "PH-DUP"), h, p);
    expect(first.ok).toBe(true);
    const req2 = await request(new MockHospitable(), "PH-DUP"); // same ref, fresh quote
    const second = await runCheckout(req2, h, p);
    expect(second.ok).toBe(false);
  });
});
