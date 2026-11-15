import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { handleStripeEvent, verifyStripeEvent, WebhookSignatureError } from "@/server/stripeWebhook";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/** Stripe webhook endpoint (test mode). Not registered in Stripe until STRIPE_WEBHOOK_SECRET is set after review. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const db = getDb();
  if (!secret || !db) return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  const raw = await req.text(); // raw body: verified before any parsing
  let event;
  try {
    event = verifyStripeEvent(raw, req.headers.get("stripe-signature"), secret);
  } catch (e) {
    if (e instanceof WebhookSignatureError) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
    throw e;
  }
  if (event.livemode && process.env.CHECKOUT_MODE !== "live") return NextResponse.json({ received: true, ignored: "livemode" }, { headers: noStore });
  try {
    const result = await handleStripeEvent(db, event);
    return NextResponse.json({ received: true, result }, { headers: noStore });
  } catch {
    console.error("webhook processing failed; Stripe will retry");
    return NextResponse.json({ error: "Retry" }, { status: 500, headers: noStore });
  }
}
