import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getProperty } from "@/domain/properties";
import { buildQuote, discountForTotal, QuoteError } from "@/domain/quote";
import { earliestCheckIn } from "@/domain/time";
import { getAdapters } from "@/server/adapters";
import { currentHost } from "@/server/host";
import { envForLivemode } from "@/server/mode";
import { stayInput } from "@/server/pricing";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { parseStay, ValidationError } from "@/server/validate";
import { alertGuestInquiry, createOffer, getInquiry, withdrawOffer } from "@/services/inquiries";

/**
 * Special offer (Oscar, Nov 19). POST {checkIn, checkOut, adults, children, infants, total?}:
 *  - without `total`: the regular all-in price for that stay (live rates, availability checked), to show the host;
 *  - with `total` (cents): sends a 24-hour offer at that total to this guest only.
 * DELETE withdraws the active offer.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function ctx(req: Request, id: string) {
  const db = getDb();
  const host = db ? await currentHost() : null;
  if (!db || !host) return { error: NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore }) };
  const lim = await checkLimit(db, req, LIMITS.hostApi);
  if (!lim.ok) return { error: tooMany(lim.retryAfterS) };
  const inq = await getInquiry(db, id);
  if (!inq) return { error: NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore }) };
  return { db, host, inq };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(req, (await params).id);
  if ("error" in c) return c.error;
  const b = await req.json().catch(() => ({}));
  try {
    const s = parseStay({ ...b, property: c.inq.propertyKey, payPlan: "full" });
    const property = getProperty(c.inq.propertyKey);
    const now = new Date();
    if (s.checkIn < earliestCheckIn(now)) return NextResponse.json({ error: "That check-in date has passed or is too soon." }, { status: 400, headers: noStore });
    const { hosp } = getAdapters("none", envForLivemode(c.inq.livemode));
    const input = await stayInput(hosp, property, s, now);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: input.status, headers: noStore });
    const regular = buildQuote(input).total;
    if (b.total == null) return NextResponse.json({ regular }, { headers: noStore });
    const total = Number(b.total);
    if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: "Enter the new total." }, { status: 400, headers: noStore });
    if (total >= regular) return NextResponse.json({ error: "The offer total must be lower than the regular price." }, { status: 400, headers: noStore });
    const d = discountForTotal(input, total);
    const exact = buildQuote({ ...input, nightlyDiscount: d }).total; // what checkout will charge (taxes can shift it by a cent)
    const offer = await createOffer(c.db, c.inq, { checkIn: s.checkIn, checkOut: s.checkOut, adults: s.adults, children: s.children, infants: s.infants, total: exact, regular }, c.host, now);
    const alert = await alertGuestInquiry(c.db, c.inq.id, "We sent you a special offer. It's good for 24 hours.", new URL(req.url).origin, "reply");
    return NextResponse.json({ offer, guestEmailed: alert === "sent" }, { headers: noStore });
  } catch (e) {
    if (e instanceof QuoteError || e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    console.error("[offer] error", (e as Error).message.slice(0, 200));
    return NextResponse.json({ error: "Something went wrong." }, { status: 500, headers: noStore });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(req, (await params).id);
  if ("error" in c) return c.error;
  return NextResponse.json({ withdrawn: await withdrawOffer(c.db, c.inq.id, c.host) }, { headers: noStore });
}
