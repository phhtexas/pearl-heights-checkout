import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { getAdapters } from "@/server/adapters";
import { envForLivemode } from "@/server/mode";
import { runDueSecondCharges } from "@/services/secondCharge";

/**
 * TEST bookings only (step 16, Oscar Nov 19): run this booking's scheduled second payment now instead of waiting until
 * 30 days before check-in, through the same code the daily run uses (Stripe test mode). Refused for live bookings and
 * on pearlheightshomes.com. Signed-in host only.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const host = db ? await currentHost() : null;
  if (!db || !host) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  if (/(^|\.)pearlheightshomes\.com$/.test(new URL(req.url).hostname)) return NextResponse.json({ error: "Test site only." }, { status: 403, headers: noStore });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = (await params).id;
  const [b] = await db.query<any>(`SELECT b.booking_ref, q.livemode FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version WHERE b.id = $1`, [id]);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (b.livemode) return NextResponse.json({ error: "Live booking: the balance is only charged on its scheduled date." }, { status: 403, headers: noStore });
  const [s] = await db.query<any>(`SELECT status FROM payments WHERE booking_id = $1 AND kind = 'scheduled'`, [id]);
  if (!s) return NextResponse.json({ error: "This booking was paid in full; there's no second payment." }, { status: 400, headers: noStore });
  if (!["scheduled", "retrying"].includes(s.status)) return NextResponse.json({ status: s.status, note: `Second payment is already ${s.status}.` }, { headers: noStore });
  await db.tx([
    [`UPDATE payments SET scheduled_for = LEAST(scheduled_for, now()), next_attempt_at = CASE WHEN next_attempt_at IS NULL THEN NULL ELSE now() END WHERE booking_id = $1 AND kind = 'scheduled'`, [id]],
    [`UPDATE jobs SET run_at = now(), status = 'pending' WHERE booking_id = $1 AND type = 'second_payment' AND status IN ('pending', 'retry_scheduled')`, [id]],
    [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, $2, 'test_balance_run_now', '{}')`, [id, host]],
  ]);
  const env = envForLivemode(false);
  let counts;
  try { counts = await runDueSecondCharges(db, getAdapters("none", env).pay, 5, false); }
  catch (e) { return NextResponse.json({ error: `Run failed: ${(e as Error).message}`.slice(0, 200) }, { status: 502, headers: noStore }); }
  const [after] = await db.query<any>(`SELECT status, last_error, decline_count, cure_deadline_at FROM payments WHERE booking_id = $1 AND kind = 'scheduled'`, [id]);
  return NextResponse.json({ status: after?.status, lastError: after?.last_error ?? null, declines: after?.decline_count ?? 0, cureDeadline: after?.cure_deadline_at ?? null, counts }, { headers: noStore });
}
