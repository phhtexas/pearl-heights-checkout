import { afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const handled = vi.fn(async () => "processed");
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/stripeWebhook", async (orig) => ({ ...(await orig<typeof import("../src/server/stripeWebhook")>()), handleStripeEvent: handled }));
const route = await import("../app/api/webhooks/stripe/route");
const SECRET = "whsec_test_" + "b".repeat(24);
const raw = JSON.stringify({ id: "evt_1", object: "event", type: "payment_intent.succeeded", created: 1, livemode: false, data: { object: { id: "pi_1" } } });
const post = (body: string, sig?: string) => route.POST(new Request("https://x.test/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }));
afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; delete process.env.STRIPE_LIVE_WEBHOOK_SECRET; handled.mockClear(); });

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

describe("POST /api/webhooks/stripe body limit (note 95)", () => {
  it("oversized unsigned and signed bodies -> 413 no-store, nothing processed", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const huge = JSON.stringify({ id: "evt_big", object: "event", type: "x", created: 1, livemode: false, data: { object: { pad: "a".repeat(1_100_000) } } });
    for (const sig of [undefined, Stripe.webhooks.generateTestHeaderString({ payload: huge, secret: SECRET })]) {
      const chunked = new ReadableStream({ start(c) { const b = new TextEncoder().encode(huge); for (let i = 0; i < b.length; i += 65536) c.enqueue(b.slice(i, i + 65536)); c.close(); } });
      const r = await route.POST(new Request("https://x.test/api/webhooks/stripe", { method: "POST", body: chunked, duplex: "half", headers: sig ? { "stripe-signature": sig } : {} } as any));
      expect(r.status).toBe(413);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect(handled).not.toHaveBeenCalled();
  });
});

describe("live endpoint on pearlheightshomes.com (Oscar, Nov 19)", () => {
  const LIVE = "whsec_live_" + "c".repeat(24);
  const at = (host: string, body: string, secret: string) => route.POST(new Request(`https://${host}/api/webhooks/stripe`, { method: "POST", body,
    headers: { host, "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) } }));
  const live = raw.replace('"livemode":false', '"livemode":true');
  it("verifies with the LIVE secret and processes live events", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET; process.env.STRIPE_LIVE_WEBHOOK_SECRET = LIVE;
    expect((await at("pearlheightshomes.com", live, SECRET)).status).toBe(400); // test secret is wrong here
    const r = await at("pearlheightshomes.com", live, LIVE);
    expect(r.status).toBe(200);
    expect(handled).toHaveBeenCalledTimes(1);
  });
  it("ignores a test event at the live endpoint, and a live event at the test endpoint", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET; process.env.STRIPE_LIVE_WEBHOOK_SECRET = LIVE;
    expect(await (await at("pearlheightshomes.com", raw, LIVE)).json()).toMatchObject({ ignored: "testmode" });
    expect(await (await at("pearl-heights-checkout.vercel.app", live, SECRET)).json()).toMatchObject({ ignored: "livemode" });
    expect(handled).not.toHaveBeenCalled();
  });
});
