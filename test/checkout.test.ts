import { describe, expect, it } from "vitest";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { runCheckout, CheckoutRequest } from "../src/services/checkout";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";

const NOW = new Date("2026-11-14T20:00:00Z");
const edgewood = getProperty("edgewood");

async function request(hosp: MockHospitable, ref: string, overrides: Partial<CheckoutRequest> = {}): Promise<CheckoutRequest> {
  const base = { property: edgewood, checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0, now: NOW, payPlan: "split" as const };
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

  it("cancels Hospitable's check-in message, and still books if that call fails", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const calls: string[] = [];
    (h as any).cancelCheckinMessages = async (id: string) => { calls.push(id); return 1; };
    const r = await runCheckout(await request(h, "PH-MSG1"), h, p);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["mock-res-PH-MSG1"]);
    expect(r.log.some((l) => l.includes("check-in messages cancelled: 1"))).toBe(true);

    const h2 = new MockHospitable(), p2 = new MockPayments();
    (h2 as any).cancelCheckinMessages = async () => { throw Object.assign(new Error("x"), { code: "upstream_error" }); };
    const r2 = await runCheckout(await request(h2, "PH-MSG2"), h2, p2);
    expect(r2.ok).toBe(true);
    expect(r2.log.some((l) => l.includes("sweep will retry"))).toBe(true);
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

  it("15-minute price lock: honors the locked quote when the live price moved", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const req = await request(h, "PH-LOCK1");
    // Build a "locked" quote $10 cheaper than live, accepted by the guest.
    const live = buildQuote({ ...req, nightlyRates: Object.fromEntries((await h.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut)).filter((d) => d.date < req.checkOut).map((d) => [d.date, d.price])) });
    const lq = { ...live, total: live.total - 1000, plan: { ...live.plan, dueNow: live.plan.dueNow - 1000 } };
    const r = await runCheckout({ ...req, acceptedTotal: lq.total, lockedQuote: lq }, h, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.total).toBe(lq.total);
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

describe("3-D Secure (Oscar, Nov 19: fix before launch)", () => {
  it("returns the bank check to the browser, then books with that same hold once the guest passes it", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    p.needsBankCheck = true;
    const first = await runCheckout(await request(h, "PH-3DS1", { quoteId: "q-1" }), h, p);
    expect(first).toMatchObject({ ok: false, reason: "authentication_required", action: { clientSecret: "pi_mock_PH-3DS1:initial_secret_mock" } });
    // Nothing reserved yet; the dates are still free.
    expect((await h.getCalendar(edgewood.hospitableUuid, "2027-04-05", "2027-04-06")).every((d) => d.available)).toBe(true);
    p.needsBankCheck = false;
    // Guest hasn't finished the check: no booking, no second prompt.
    const early = await runCheckout(await request(h, "PH-3DS2", { quoteId: "q-1", authorizedPaymentIntentId: "pi_mock_PH-3DS1:initial" }), h, p);
    expect(early).toMatchObject({ ok: false, reason: "authentication_required" });
    expect((early as { action?: unknown }).action).toBeUndefined();
    p.completeBankCheck("pi_mock_PH-3DS1:initial");
    // A different quote can't use this hold.
    expect(await runCheckout(await request(h, "PH-3DS3", { quoteId: "q-OTHER", authorizedPaymentIntentId: "pi_mock_PH-3DS1:initial" }), h, p))
      .toMatchObject({ ok: false, reason: "card_declined" });
    const done = await runCheckout(await request(h, "PH-3DS4", { quoteId: "q-1", authorizedPaymentIntentId: "pi_mock_PH-3DS1:initial" }), h, p);
    expect(done.ok).toBe(true);
    expect(p.intents.get("pi_mock_PH-3DS1:initial")?.status).toBe("captured");
    // Once captured, the hold can't be reused for another booking.
    expect(await runCheckout(await request(new MockHospitable(), "PH-3DS5", { quoteId: "q-1", authorizedPaymentIntentId: "pi_mock_PH-3DS1:initial" }), new MockHospitable(), p))
      .toMatchObject({ ok: false });
  });
});
