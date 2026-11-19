import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { issueLoginToken, loginEmail } from "@/services/stayChat";
import { sendEmail } from "@/services/email";

/**
 * Host inbox sign-in, step 1: POST {email}. If it's a host address (HOST_EMAILS, default bookings@), emails a one-time
 * link. The answer is the same either way, so this can't be used to discover addresses.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Sign-in isn't available." }, { status: 503, headers: noStore });
  const lim = await checkLimit(db, req, LIMITS.hostLogin);
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const email = String(((await req.json().catch(() => ({}))) as { email?: unknown }).email ?? "").slice(0, 200);
  const token = await issueLoginToken(db, email);
  if (token && process.env.RESEND_API_KEY) {
    try { await sendEmail(email.trim().toLowerCase(), loginEmail(`${new URL(req.url).origin}/host/login?t=${token}`), `host-login-${token.slice(0, 16)}`); }
    catch (e) { console.error("[host] login email failed", (e as Error).message.slice(0, 200)); }
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
