import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { hostOf, modeForHost } from "@/server/mode";
import { alertGuestInquiry, alertHostInquiry, createInquiry, parseInquiry } from "@/services/inquiries";

/**
 * A question before booking, from a home's page (Oscar, Nov 19). Saves the conversation, alerts the host, and returns
 * the guest's private conversation link. Nothing is booked or charged.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Messages aren't available right now. Please email bookings@pearlheightshomes.com." }, { status: 503, headers: noStore });
  const rl = await checkLimit(db, req, LIMITS.inquiryNew);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const b = await req.json().catch(() => null);
  // Hidden field people never see or fill; automated form fillers do. Pretend it worked.
  if (b?.website) return NextResponse.json({ ok: true }, { headers: noStore });
  const n = parseInquiry(b);
  if (typeof n === "string") return NextResponse.json({ error: n }, { status: 400, headers: noStore });
  const livemode = modeForHost(hostOf(req)) === "live";
  const { id, token } = await createInquiry(db, n, livemode);
  const site = new URL(req.url).origin;
  const host = await alertHostInquiry(db, id, n.body, site, true);
  const guest = await alertGuestInquiry(db, id, n.body, site, "received");
  console.info("[inquiry] new", id.slice(0, 8), n.property, "host:", host, "guest:", guest);
  return NextResponse.json({ ok: true, url: `/m/${token}`, emailed: guest === "sent" }, { headers: noStore });
}
