import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { getAdapters, realHospitable } from "@/server/adapters";
import { envForLivemode } from "@/server/mode";
import { CANCEL_REASONS, cancelBooking, cancelPreview, type HostCancelReason } from "@/services/cancelBooking";

/**
 * Host cancel tool (audit F3). Signed-in host only.
 * GET ?reason=guest|host|verification_missed -> what the policy refunds (nothing changes).
 * POST { reason, confirmRef } -> cancels, refunds and frees the dates; repeat to finish a step that failed.
 * The booking's own Stripe mode is used (live bookings: live keys; test bookings: test keys).
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };
const isReason = (r: unknown): r is HostCancelReason => typeof r === "string" && r in CANCEL_REASONS;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  if (!db || !(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const reason = new URL(req.url).searchParams.get("reason") ?? "guest";
  if (!isReason(reason)) return NextResponse.json({ error: "Unknown reason" }, { status: 400, headers: noStore });
  const p = await cancelPreview(db, (await params).id, reason);
  return p ? NextResponse.json({ preview: p, reasons: CANCEL_REASONS }, { headers: noStore }) : NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const host = db ? await currentHost() : null;
  if (!db || !host) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = (await params).id;
  let b: { reason?: unknown; confirmRef?: unknown } = {};
  try { b = await req.json(); } catch { /* bad body */ }
  if (!isReason(b.reason)) return NextResponse.json({ error: "Choose a reason." }, { status: 400, headers: noStore });
  const pre = await cancelPreview(db, id, b.reason);
  if (!pre) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (String(b.confirmRef ?? "").trim().toUpperCase() !== pre.ref) return NextResponse.json({ error: `Type the booking code ${pre.ref} to confirm.` }, { status: 400, headers: noStore });
  const env = envForLivemode(pre.livemode);
  let pay;
  try { pay = getAdapters("none", env).pay; } catch (e) { return NextResponse.json({ error: `Payments unavailable: ${(e as Error).message}` }, { status: 503, headers: noStore }); }
  const hosp = realHospitable(env, pre.livemode);
  const out = await cancelBooking(db, id, { reason: b.reason, by: host, pay, hosp });
  return NextResponse.json({ ...out, preview: await cancelPreview(db, id, b.reason) }, { headers: noStore });
}
