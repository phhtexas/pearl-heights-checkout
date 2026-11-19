import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { bookingForToken } from "@/server/stay";
import { getAdapters, publicConfig } from "@/server/adapters";
import { envForLivemode } from "@/server/mode";

/**
 * F17: the guest approves a second payment their bank flagged. GET returns the PaymentIntent's client secret (only
 * while it waits for approval) and the publishable key for the booking's Stripe mode; the browser runs the bank check
 * with Stripe.js. POST re-reads the PaymentIntent from Stripe (the browser's word alone isn't trusted) and records it
 * as paid. The webhook records it too; both are idempotent.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };

async function ctx(token: string) {
  const db = getDb();
  const row = db ? await bookingForToken(token) : null;
  if (!db || !row) return null;
  const [p] = await db.query<any>(`SELECT id, status, stripe_payment_intent_id AS pi FROM payments WHERE booking_id = $1 AND kind = 'scheduled'`, [row.bookingId]);
  const env = envForLivemode(row.livemode);
  return { db, row, p, env, pay: getAdapters("none", env).pay };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const c = await ctx((await params).token).catch(() => null);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (!c.p?.pi || c.p.status !== "requires_action" || !c.pay.intentAction) return NextResponse.json({ state: c.p?.status ?? "none" }, { headers: noStore });
  const a = await c.pay.intentAction(c.p.pi).catch(() => null);
  if (!a?.clientSecret) return NextResponse.json({ state: a?.status ?? "unknown" }, { headers: noStore });
  return NextResponse.json({ state: "requires_action", clientSecret: a.clientSecret, publishableKey: publicConfig(c.env).publishableKey }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const c = await ctx((await params).token).catch(() => null);
  if (!c?.p?.pi || !c.pay.intentAction) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const a = await c.pay.intentAction(c.p.pi).catch(() => null);
  if (a?.status !== "succeeded") return NextResponse.json({ paid: false, state: a?.status ?? "unknown" }, { headers: noStore });
  await c.db.tx([
    [`UPDATE payments SET status = 'paid', status_event_at = COALESCE(status_event_at, now()), last_error = NULL WHERE id = $1 AND status <> 'paid'`, [c.p.id]],
    [`UPDATE jobs SET status = 'done', last_error = 'approved by guest' WHERE booking_id = $1 AND type = 'second_payment' AND status <> 'done'`, [c.row.bookingId]],
    [`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $1, 'guest', 'second_payment_paid', $2::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = 'second_payment_paid')`, [c.row.bookingId, JSON.stringify({ approved_by_guest: true })]],
  ]);
  return NextResponse.json({ paid: true }, { headers: noStore });
}
