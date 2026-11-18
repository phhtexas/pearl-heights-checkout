import { createHash } from "node:crypto";

/**
 * Meta Conversions API: the server-side copy of the booking ("Purchase") event (Oscar, Nov 18).
 * Same event_id as the browser Pixel event (the booking ref), so Meta counts it once (dedup window 48 h).
 * Sent only when the guest accepted cookies, the pixel id and token are set, and either checkout is live or a
 * Meta test-event code is set (so test bookings land in Events Manager > Test events, never in real reporting).
 * Email and phone are SHA-256 hashed before they leave our server, as Meta requires; nothing else personal is sent.
 */
export interface PurchaseEvent {
  bookingRef: string; property: string; valueCents: number; nights: number; adults: number; children: number;
  checkIn: string; checkOut: string; email: string; phone: string;
  clientIp?: string; userAgent?: string; fbp?: string; fbc?: string; url?: string; at?: Date;
}

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export const normEmail = (e: string) => e.trim().toLowerCase();
/** Digits only with country code (US default), as Meta expects. */
export const normPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? "1" + d : d; };
const clean = (v: string | undefined, max = 300) => (v && /^[\x20-\x7e]+$/.test(v) ? v.slice(0, max) : undefined);

export function capiBody(e: PurchaseEvent, testCode?: string) {
  return {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor((e.at ?? new Date()).getTime() / 1000),
      event_id: e.bookingRef,
      action_source: "website",
      event_source_url: clean(e.url, 500),
      user_data: {
        em: [sha(normEmail(e.email))], ph: [sha(normPhone(e.phone))],
        client_ip_address: clean(e.clientIp, 64), client_user_agent: clean(e.userAgent, 400), fbp: clean(e.fbp), fbc: clean(e.fbc),
      },
      custom_data: {
        currency: "USD", value: Math.round(e.valueCents) / 100, content_ids: [e.property], content_type: "product",
        num_items: e.nights, checkin_date: e.checkIn, checkout_date: e.checkOut, num_adults: e.adults, num_children: e.children, order_id: e.bookingRef,
      },
    }],
    ...(testCode ? { test_event_code: testCode } : {}),
  };
}

export function capiEnabled(env: NodeJS.ProcessEnv = process.env): { on: boolean; testCode?: string } {
  if (!env.NEXT_PUBLIC_META_PIXEL_ID || !env.META_CAPI_TOKEN) return { on: false };
  if ((env.CHECKOUT_MODE ?? "mock") === "live") return { on: true };
  return env.META_TEST_EVENT_CODE ? { on: true, testCode: env.META_TEST_EVENT_CODE } : { on: false };
}

export async function sendPurchase(e: PurchaseEvent, env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<"sent" | "skipped" | "failed"> {
  const cfg = capiEnabled(env);
  if (!cfg.on) return "skipped";
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(env.NEXT_PUBLIC_META_PIXEL_ID!)}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN!)}`;
  try {
    const r = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(capiBody(e, cfg.testCode)), signal: AbortSignal.timeout(4000) });
    if (!r.ok) { console.error("[capi] purchase failed", r.status, (await r.text()).slice(0, 200)); return "failed"; }
    return "sent";
  } catch (err) { console.error("[capi] purchase error", (err as Error).message.slice(0, 120)); return "failed"; }
}
