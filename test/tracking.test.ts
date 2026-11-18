// Ad tracking (Oscar, Nov 18): server booking event to Meta (hashed contact only, value before taxes, dedup id).
import { describe, expect, it, vi } from "vitest";
import { capiBody, capiEnabled, normPhone, sendPurchase } from "../src/services/metaCapi";

const ev = { bookingRef: "PH-ABC123", property: "claywell", valueCents: 318000 + 35000 + 7900, nights: 4, adults: 2, children: 2,
  checkIn: "2026-12-23", checkOut: "2026-12-27", email: " Ana@Example.com ", phone: "(210) 555-0100", fbp: "fb.1.1.2", at: new Date("2026-11-18T18:00:00Z") };

describe("Meta Conversions API purchase", () => {
  it("hashes email and phone, carries value, nights and the booking ref as event id", () => {
    const b = capiBody(ev);
    const d = b.data[0]!;
    expect(d.event_id).toBe("PH-ABC123");
    expect(d.custom_data).toMatchObject({ currency: "USD", value: 3609, content_ids: ["claywell"], num_items: 4, order_id: "PH-ABC123" });
    expect(d.user_data.em[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(b)).not.toContain("ana@example.com");
    expect(JSON.stringify(b)).not.toContain("5550100");
    expect(normPhone("(210) 555-0100")).toBe("12105550100");
    expect(b).not.toHaveProperty("test_event_code");
  });
  it("only sends in live mode, or with a Meta test code; never without pixel id and token", () => {
    expect(capiEnabled({ CHECKOUT_MODE: "test" } as any).on).toBe(false);
    expect(capiEnabled({ CHECKOUT_MODE: "test", NEXT_PUBLIC_META_PIXEL_ID: "1", META_CAPI_TOKEN: "t" } as any).on).toBe(false);
    expect(capiEnabled({ CHECKOUT_MODE: "test", NEXT_PUBLIC_META_PIXEL_ID: "1", META_CAPI_TOKEN: "t", META_TEST_EVENT_CODE: "TEST1" } as any)).toEqual({ on: true, testCode: "TEST1" });
    expect(capiEnabled({ CHECKOUT_MODE: "live", NEXT_PUBLIC_META_PIXEL_ID: "1", META_CAPI_TOKEN: "t" } as any)).toEqual({ on: true });
  });
  it("posts to the pixel's events endpoint and reports failures without throwing", async () => {
    const env = { CHECKOUT_MODE: "live", NEXT_PUBLIC_META_PIXEL_ID: "761", META_CAPI_TOKEN: "tok" } as any;
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendPurchase(ev, env, ok as any)).toBe("sent");
    expect((ok.mock.calls[0] as any)[0]).toContain("graph.facebook.com/v21.0/761/events");
    const bad = vi.fn(async () => new Response("nope", { status: 400 }));
    expect(await sendPurchase(ev, env, bad as any)).toBe("failed");
    expect(await sendPurchase(ev, { CHECKOUT_MODE: "test" } as any, ok as any)).toBe("skipped");
  });
});
