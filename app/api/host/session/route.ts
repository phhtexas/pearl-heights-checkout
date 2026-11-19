import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { HOST_COOKIE, SESSION_TTL_MS, endSession, redeemLoginToken } from "@/services/stayChat";

/**
 * Host inbox sign-in, step 2: POST {token} (from the emailed link, after a tap on "Sign in", so email scanners that
 * open links can't use it up) -> 90-day HttpOnly session cookie. DELETE -> signs out.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Sign-in isn't available." }, { status: 503, headers: noStore });
  const lim = await checkLimit(db, req, LIMITS.hostLogin);
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const token = String(((await req.json().catch(() => ({}))) as { token?: unknown }).token ?? "");
  const session = await redeemLoginToken(db, token);
  if (!session) return NextResponse.json({ error: "This sign-in link has expired or was already used. Request a new one." }, { status: 400, headers: noStore });
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(HOST_COOKIE, session, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  return res;
}

export async function DELETE() {
  const db = getDb();
  const c = (await cookies()).get(HOST_COOKIE)?.value;
  if (db) await endSession(db, c).catch(() => {});
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(HOST_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
