import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { readSession } from "@/server/session";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { issueStayLink } from "@/services/stayLinks";

/**
 * Confirmation screen -> the guest's private stay page (Oscar, Nov 17: real bookings, step 1).
 * Only the browser session that requested the booking's quote gets a link; each call issues a fresh link (older ones
 * keep working until they expire). Needs the database; without it (mock previews) there is no link.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Not available" }, { status: 404, headers: noStore });
  const rl = await checkLimit(db, req, LIMITS.checkout);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  let bookingRef = "";
  try { bookingRef = String((await req.json())?.bookingRef ?? ""); } catch { /* bad body */ }
  if (!/^[A-Z0-9-]{4,40}$/.test(bookingRef)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const session = readSession(req);
  const token = await issueStayLink(db, { bookingRef, sessionId: session.id, channel: "confirmation" }).catch((e) => { console.error("stay-link", (e as Error).message); return null; });
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  return NextResponse.json({ url: `/stay/${token}` }, { headers: noStore });
}
