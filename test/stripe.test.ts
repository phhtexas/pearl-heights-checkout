import { describe, expect, it } from "vitest";
import { StripePayments, assertTestKeys } from "../src/adapters/stripe";
import { getAdapters, publicConfig } from "../src/server/adapters";

function fakeStripe(behavior: { status?: string; cardError?: boolean; authErrorThrown?: boolean; pmType?: string } = {}) {
  const calls: any[] = [];
  const pis = new Map<string, string>();
  const stripe: any = {
    paymentMethods: { retrieve: async (id: string) => { calls.push(["pm", id]); return { id, type: behavior.pmType ?? "card" }; } },
    customers: { create: async (p: any, o: any) => { calls.push(["customer", p, o]); return { id: "cus_1" }; } },
    paymentIntents: {
      create: async (p: any, o: any) => {
        calls.push(["create", p, o]);
        if (behavior.cardError) throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError" });
        if (behavior.authErrorThrown) { pis.set("pi_auth", "requires_payment_method"); throw Object.assign(new Error("auth"), { type: "StripeCardError", code: "authentication_required", payment_intent: { id: "pi_auth" } }); }
        const id = "pi_fake0000" + calls.length; pis.set(id, behavior.status ?? "requires_capture"); return { id, status: pis.get(id), client_secret: id + "_secret_x" };
      },
      capture: async (id: string, _p: any, o: any) => { calls.push(["capture", id, o]); pis.set(id, "succeeded"); return { id, status: "succeeded" }; },
      cancel: async (id: string) => { calls.push(["cancel", id]); pis.set(id, "canceled"); return { id, status: "canceled" }; },
      retrieve: async (id: string) => ({ id, status: pis.get(id), amount: 45290, capture_method: "manual", metadata: { quote_id: "q-1", booking_ref: "PH-OLD001" } }),
      update: async (id: string, p: any) => { calls.push(["update", id, p]); return { id }; },
    },
  };
  return { stripe, calls };
}
const input = { amount: 45290, idempotencyKey: "PH-ABC123:initial", description: "test", savePaymentMethod: true, paymentMethodId: "pm_card_visa",
  customer: { name: "T G", email: "t@example.com", phone: "2105550100" }, metadata: { booking_ref: "PH-ABC123" } };

describe("Stripe test-mode adapter", () => {
  it("authorizes with manual capture, server confirm, idempotency key and saved card for split payments", async () => {
    const { stripe, calls } = fakeStripe();
    const r = await new StripePayments(stripe).authorize(input);
    expect(r.paymentIntentId).toMatch(/^pi_/);
    const [, p, o] = calls.find((c) => c[0] === "create");
    expect(p).toMatchObject({ amount: 45290, currency: "usd", capture_method: "manual", confirm: true, payment_method: "pm_card_visa", customer: "cus_1", setup_future_usage: "off_session", allowed_payment_method_types: ["card"] });
    expect(o.idempotencyKey).toBe("PH-ABC123:initial");
    expect(calls.find((c) => c[0] === "customer")[2].idempotencyKey).toBe("PH-ABC123:initial:customer");
  });
  it("pay-in-full does not create a customer or save the card", async () => {
    const { stripe, calls } = fakeStripe();
    await new StripePayments(stripe).authorize({ ...input, savePaymentMethod: false });
    expect(calls.some((c) => c[0] === "customer")).toBe(false);
    expect(calls.find((c) => c[0] === "create")[1].setup_future_usage).toBeUndefined();
  });
  it("maps a declined card to card_declined", async () => {
    const { stripe } = fakeStripe({ cardError: true });
    await expect(new StripePayments(stripe).authorize(input)).rejects.toMatchObject({ code: "card_declined" });
  });
  it("3-D Secure (requires_action) hands the bank check to the browser: client secret returned, nothing cancelled or captured", async () => {
    const { stripe, calls } = fakeStripe({ status: "requires_action" });
    await expect(new StripePayments(stripe).authorize(input)).rejects.toMatchObject({ code: "authentication_required", action: { clientSecret: expect.stringMatching(/^pi_fake\d+_secret_x$/) } });
    expect(calls.some((c) => c[0] === "cancel" || c[0] === "capture")).toBe(false);
  });
  it("after the bank check, adopts the hold only if it matches the quote and amount, relabelled with the new booking ref", async () => {
    const { stripe, calls } = fakeStripe({ status: "requires_capture" });
    const s = new StripePayments(stripe);
    const { paymentIntentId } = await s.authorize(input);
    expect(await s.adoptAuthorized(paymentIntentId, { amount: 45290, quoteId: "q-1", bookingRef: "PH-NEW001", description: "d" })).toEqual({ paymentIntentId });
    expect(calls.find((c) => c[0] === "update")[2].metadata).toMatchObject({ booking_ref: "PH-NEW001", quote_id: "q-1" });
    await expect(s.adoptAuthorized(paymentIntentId, { amount: 100, quoteId: "q-1", bookingRef: "PH-NEW002", description: "d" })).rejects.toMatchObject({ code: "card_declined" });
    await expect(s.adoptAuthorized(paymentIntentId, { amount: 45290, quoteId: "q-2", bookingRef: "PH-NEW002", description: "d" })).rejects.toMatchObject({ code: "card_declined" });
    const pending = fakeStripe({ status: "requires_action" });
    const s2 = new StripePayments(pending.stripe);
    const e = await s2.authorize(input).catch((x) => x);
    await expect(s2.adoptAuthorized(e.action.paymentIntentId, { amount: 45290, quoteId: "q-1", bookingRef: "PH-NEW003", description: "d" })).rejects.toMatchObject({ code: "authentication_required" });
  });
  it("3-D Secure raised as an error is cancelled and reported as authentication_required", async () => {
    const { stripe, calls } = fakeStripe({ authErrorThrown: true });
    await expect(new StripePayments(stripe).authorize(input)).rejects.toMatchObject({ code: "authentication_required" });
    expect(calls.some((c) => c[0] === "cancel" && c[1] === "pi_auth")).toBe(true);
  });
  it("rejects any payment method other than card or Link before creating a PaymentIntent", async () => {
    for (const t of ["us_bank_account", "affirm", "cashapp", "klarna", "amazon_pay"]) {
      const { stripe, calls } = fakeStripe({ pmType: t });
      await expect(new StripePayments(stripe).authorize(input)).rejects.toMatchObject({ code: "unsupported_method" });
      expect(calls.some((c) => c[0] === "create")).toBe(false);
    }
  });
  it("refuses without card details", async () => {
    const { stripe } = fakeStripe();
    await expect(new StripePayments(stripe).authorize({ ...input, paymentMethodId: undefined })).rejects.toMatchObject({ code: "card_declined" });
  });
  it("capture and void", async () => {
    const { stripe, calls } = fakeStripe();
    const s = new StripePayments(stripe);
    const a = await s.authorize(input); await s.capture(a.paymentIntentId);
    expect(calls.find((c) => c[0] === "capture")[2].idempotencyKey).toBe(`${a.paymentIntentId}:capture`);
    const b = await s.authorize({ ...input, idempotencyKey: "PH-ABC124:initial" }); await s.voidAuthorization(b.paymentIntentId);
    expect(calls.filter((c) => c[0] === "cancel")).toHaveLength(1);
    await s.voidAuthorization(a.paymentIntentId); // already captured: no cancel
    expect(calls.filter((c) => c[0] === "cancel")).toHaveLength(1);
  });
});

describe("key guards", () => {
  it("test mode refuses live or missing keys", () => {
    expect(() => assertTestKeys({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PUBLISHABLE_KEY: "pk_test_x" } as any)).toThrow(/TEST secret/);
    expect(() => assertTestKeys({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_live_x" } as any)).toThrow(/TEST publishable/);
    expect(() => assertTestKeys({} as any)).toThrow();
    expect(() => getAdapters("none", { CHECKOUT_MODE: "test", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PUBLISHABLE_KEY: "pk_live_x" } as any, "s-guard-aaaaaaaaaaaa")).toThrow();
  });
  it("the browser only ever receives the publishable key", () => {
    const c = publicConfig({ CHECKOUT_MODE: "test", STRIPE_SECRET_KEY: "sk_test_secret", STRIPE_PUBLISHABLE_KEY: "pk_test_pub" } as any);
    expect(c).toEqual({ mode: "test", publishableKey: "pk_test_pub" });
    expect(JSON.stringify(publicConfig({ CHECKOUT_MODE: "mock", STRIPE_SECRET_KEY: "sk_test_secret" } as any))).not.toContain("sk_");
  });
});

describe("3-D Secure through the full checkout", () => {
  it("no reservation and no capture until the bank check; the guest is asked to confirm, not told it was declined", async () => {
    const { MockHospitable } = await import("../src/adapters/mock");
    const { runCheckout } = await import("../src/services/checkout");
    const { getProperty } = await import("../src/domain/properties");
    const { buildQuote } = await import("../src/domain/quote");
    const { stripe, calls } = fakeStripe({ status: "requires_action" });
    const h = new MockHospitable();
    const property = getProperty("edgewood");
    const stay = { property, checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0, payPlan: "split" as const, now: new Date("2026-11-14T20:00:00Z") };
    const cal = await h.getCalendar(property.hospitableUuid, stay.checkIn, stay.checkOut);
    const q = buildQuote({ ...stay, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
    const r = await runCheckout({ ...stay, guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" }, bookingRef: "PH-3DS001", acceptedTotal: q.total, paymentMethodId: "pm_card_threeDSecure2Required", quoteId: "q-1" }, h, new StripePayments(stripe));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("authentication_required");
    expect(r.action?.clientSecret).toMatch(/_secret_/);
    expect(r.guestMessage).toMatch(/bank needs to confirm/);
    expect(r.guestMessage).not.toMatch(/declined/);
    expect(calls.find((c) => c[0] === "create")[1].metadata).toMatchObject({ quote_id: "q-1", booking_ref: "PH-3DS001" });
    expect(calls.some((c) => c[0] === "capture")).toBe(false);
    expect(h.reservationCount).toBe(0);
  });
});
