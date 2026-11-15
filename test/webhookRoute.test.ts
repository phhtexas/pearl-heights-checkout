import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const handled = vi.fn(async () => "processed");
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/stripeWebhook", async (orig) => ({ ...(await orig<typeof import("../src/server/stripeWebhook")>()), handleStripeEvent: handled }));
const route = await import("../app/api/webhooks/stripe/route");
const SECRET = "whsec_test_" + "b".repeat(24);
const raw = JSON.stringify({ id: "evt_1", object: "event", type: "payment_intent.succeeded", created: 1, livemode: false, data: { object: { id: "pi_1" } } });
const post = (body: string, sig?: string) => route.POST(new Request("https://x.test/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }));
afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; handled.mockClear(); });

describe("POST /api/webhooks/stripe", () => {
  it("not configured -> 503", async () => expect((await post(raw)).status).toBe(503));
  it("bad or missing signature -> generic 400, nothing processed", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    expect((await post(raw)).status).toBe(400);
    expect((await post(raw, "t=1,v1=deadbeef")).status).toBe(400);
    expect(handled).not.toHaveBeenCalled();
  });
  it("valid signature on the raw body -> processed once", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const r = await post(raw, Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: SECRET }));
    expect(r.status).toBe(200);
    expect(handled).toHaveBeenCalledTimes(1);
  });
  it("a live-mode event is ignored outside live mode", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const live = raw.replace('"livemode":false', '"livemode":true');
    const r = await post(live, Stripe.webhooks.generateTestHeaderString({ payload: live, secret: SECRET }));
    expect(await r.json()).toMatchObject({ ignored: "livemode" });
    expect(handled).not.toHaveBeenCalled();
  });
});
