import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { hostOf, PUBLIC_HOSTS } from "@/server/mode";
import { handleStripeEvent, MAX_WEBHOOK_BYTES, readBodyLimited, verifyStripeEvent, WebhookSignatureError } from "@/server/stripeWebhook";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/**
 * Stripe webhook endpoint. The LIVE endpoint is registered at https://pearlheightshomes.com/api/webhooks/stripe and is
 * verified with STRIPE_LIVE_WEBHOOK_SECRET; every other host is the TEST endpoint (STRIPE_WEBHOOK_SECRET). An event is
 * accepted only if its livemode matches the endpoint, so test and live events can never be mixed up.
 */
export async function POST(req: Request) {
  const liveEndpoint = PUBLIC_HOSTS.has(hostOf(req));
  const secret = liveEndpoint ? process.env.STRIPE_LIVE_WEBHOOK_SECRET : process.env.STRIPE_WEBHOOK_SECRET;
  const db = getDb();
  if (!secret || !db) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  const raw = await readBodyLimited(req, MAX_WEBHOOK_BYTES); // raw body: bounded, then verified before any parsing
  if (raw === null) return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: noStore });
  let event;
  try {
    event = verifyStripeEvent(raw, req.headers.get("stripe-signature"), secret);
  } catch (e) {
    if (e instanceof WebhookSignatureError) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
    throw e;
  }
  if (!!event.livemode !== liveEndpoint) return NextResponse.json({ received: true, ignored: event.livemode ? "livemode" : "testmode" }, { headers: noStore });
  try {
    const result = await handleStripeEvent(db, event);
    return NextResponse.json({ received: true, result }, { headers: noStore });
  } catch {
    console.error("webhook processing failed; Stripe will retry");
    return NextResponse.json({ error: "Retry" }, { status: 500, headers: noStore });
  }
}
