import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { paperworkFor, type PaperworkCtx } from "@/server/stay";
import { recordIdVerified } from "@/services/stayLinks";
import { IdentityUnavailable, createIdSession, getIdState } from "@/services/identity";

/**
 * Guest portal: ID check through Stripe Identity: the TEST portal (/stay/demo), and real bookings while checkout runs in
 * test mode (Oscar, Nov 17; result saved on the booking). Stripe
 * TEST keys, so no real ID is needed (Stripe's test flow lets you pick the outcome) and nothing is billed.
 * POST -> creates a verification session; returns its client secret for Stripe.js (and the hosted URL as a fallback).
 * GET ?vs=<id> -> the session's status, read from Stripe (the browser's result alone isn't trusted).
 */
export const dynamic = "force-dynamic";
/** What ties a Stripe verification session to this portal: "demo", or the booking's internal id (never the link token). */
const owner = (c: PaperworkCtx) => (c.kind === "demo" ? "demo" : c.row.bookingId);
const noStore = { "Cache-Control": "no-store" };

const hits = new Map<string, number[]>();
function throttled(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > 6;
}

const unavailable = (e: unknown) => {
  const msg = (e as Error)?.message ?? "";
  // No key, or Identity not yet activated on the Stripe account: the sandbox falls back to the simulated check.
  if (e instanceof IdentityUnavailable || /identity|not (been )?activated|application/i.test(msg)) {
    console.error("[stay/identity] unavailable", msg.slice(0, 200));
    return NextResponse.json({ error: "ID check isn't set up yet.", fallback: true }, { status: 503, headers: noStore });
  }
  return null;
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await paperworkFor(token);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (ctx.kind === "booking" && ctx.row.idCheckedAt) return NextResponse.json({ error: "Your ID is already verified." }, { status: 409, headers: noStore });
  if (throttled(req)) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers: noStore });
  try {
    const s = await createIdSession({ metadata: { stay: owner(ctx), booking: ctx.stay.code }, returnUrl: `${new URL(req.url).origin}/stay/${token}?id=done` });
    return NextResponse.json({ sessionId: s.id, clientSecret: s.clientSecret, url: s.url }, { headers: noStore });
  } catch (e) {
    const u = unavailable(e); if (u) return u;
    console.error("[stay/identity] create failed", (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "We couldn't start the ID check." }, { status: 502, headers: noStore });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const vs = new URL(req.url).searchParams.get("vs") ?? "";
  const ctx = /^vs_[A-Za-z0-9]{8,64}$/.test(vs) ? await paperworkFor(token) : null;
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  try {
    const s = await getIdState(vs);
    if ((s.metadata?.stay ?? (s.metadata?.token === "demo" ? "demo" : undefined)) !== owner(ctx) || !s.testMode) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
    if (s.status === "verified" && ctx.kind === "booking") {
      const db = getDb();
      if (db) await recordIdVerified(db, ctx.row.bookingId, { sessionId: vs, checkedAt: new Date().toISOString(), checkoutISO: ctx.row.checkOut });
    }
    return NextResponse.json({ status: s.status, lastError: s.lastError }, { headers: noStore });
  } catch (e) {
    const u = unavailable(e); if (u) return u;
    console.error("[stay/identity] status failed", (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "We couldn't check your ID status." }, { status: 502, headers: noStore });
  }
}
