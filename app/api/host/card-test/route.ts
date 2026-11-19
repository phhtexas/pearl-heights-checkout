import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { envForMode } from "@/server/mode";
import { StripePayments, assertLiveKeys } from "@/adapters/stripe";

/**
 * Supervised LIVE card test (Oscar, Nov 19), signed-in host only, before the launch switch. With Oscar's own card it runs
 * the real booking money path in Stripe LIVE mode, for $1 each:
 *  1. authorize $1 with the card saved for later (as on a split booking), 2. capture it, 3. charge $1 off-session to the
 *  saved card (the second payment), 4. refund both. Every step is reported, so a failing permission on the restricted
 *  key (rk_live_) shows up here and not on a guest's booking. Nothing is written to bookings.
 * GET -> the live publishable key. POST {paymentMethodId, name, email} -> runs the steps.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  try { return NextResponse.json({ publishableKey: assertLiveKeys(envForMode("live")).publishable }, { headers: noStore }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503, headers: noStore }); }
}

export async function POST(req: Request) {
  if (!(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const lim = await checkLimit(getDb(), req, LIMITS.testEmail); // 3 per hour
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const b = (await req.json().catch(() => ({}))) as { paymentMethodId?: string; name?: string; email?: string };
  if (!/^pm_[A-Za-z0-9]{8,64}$/.test(b.paymentMethodId ?? "")) return NextResponse.json({ error: "No card" }, { status: 400, headers: noStore });
  const env = envForMode("live");
  let secret: string;
  try { secret = assertLiveKeys(env).secret; } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503, headers: noStore }); }
  const stripe = new Stripe(secret, { maxNetworkRetries: 2 });
  const pay = new StripePayments(stripe);
  const run = `livetest-${Date.now()}`;
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const meta = { live_card_test: "true", note: "Pearl Heights live card test, refunded" };
  const step = async <T,>(name: string, f: () => Promise<T>): Promise<T | null> => {
    try { const r = await f(); steps.push({ step: name, ok: true }); return r; }
    catch (e) { const x = e as { code?: string; message?: string }; steps.push({ step: name, ok: false, detail: `${x.code ?? ""} ${String(x.message ?? "").slice(0, 160)}`.trim() }); return null; }
  };
  const first = await step("Authorize $1 and save the card", () => pay.authorize({ amount: 100, idempotencyKey: `${run}-a`, description: "Pearl Heights live card test (refunded)",
    savePaymentMethod: true, paymentMethodId: b.paymentMethodId, customer: { name: String(b.name ?? "Card test").slice(0, 80), email: String(b.email ?? "").slice(0, 120) || "bookings@pearlheightshomes.com" }, metadata: meta }));
  const pis: string[] = [];
  if (first) {
    pis.push(first.paymentIntentId);
    const captured = await step("Capture the $1", () => pay.capture(first.paymentIntentId));
    const saved = captured !== null ? await step("Find the saved card", async () => { const s = await pay.savedMethod(first.paymentIntentId); if (!s) throw new Error("no saved card"); return s; }) : null;
    if (saved) {
      const second = await step("Charge $1 to the saved card (like the second payment)", () => pay.chargeSaved({ ...saved, amount: 100, idempotencyKey: `${run}-b`, description: "Pearl Heights live card test (refunded)", metadata: meta }));
      if (second) pis.push(second.paymentIntentId);
    }
    if (captured === null) await step("Release the $1 hold", () => pay.voidAuthorization(first.paymentIntentId));
  }
  for (const [i, id] of pis.entries()) {
    const st = await stripe.paymentIntents.retrieve(id).catch(() => null);
    if (st?.status === "succeeded") await step(`Refund charge ${i + 1}`, () => stripe.refunds.create({ payment_intent: id, metadata: meta }, { idempotencyKey: `${run}-r${i}` }));
  }
  console.info("[live card test]", JSON.stringify(steps));
  return NextResponse.json({ ok: steps.every((s) => s.ok), steps }, { headers: noStore });
}
