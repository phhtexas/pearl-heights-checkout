import { NextResponse } from "next/server";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { getDb } from "@/db/client";
import { PROPERTIES } from "@/domain/properties";
import { buildQuote } from "@/domain/quote";
import { getAdapters } from "@/server/adapters";
import { readSession, withSession } from "@/server/session";
import { earliestCheckIn } from "@/domain/time";

/**
 * All Homes search: for the dates and guests, each home's exact total (taxes and the $79 damage waiver included)
 * or why it can't be booked. Read-only: no quote is saved; the home's own page makes the real quote at checkout.
 */
export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const rl = await checkLimit(getDb(), req, LIMITS.calendar);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const u = new URL(req.url);
  const checkIn = u.searchParams.get("checkIn") ?? "", checkOut = u.searchParams.get("checkOut") ?? "";
  const adults = Math.max(1, Math.min(20, Number(u.searchParams.get("adults")) || 1));
  const children = Math.max(0, Math.min(20, Number(u.searchParams.get("children")) || 0));
  if (!ISO.test(checkIn) || !ISO.test(checkOut) || checkOut <= checkIn) return NextResponse.json({ error: "Choose a check-in and a later check-out." }, { status: 400, headers: noStore });
  if (checkIn < earliestCheckIn(new Date())) return NextResponse.json({ error: "Please choose a later check-in date." }, { status: 400, headers: noStore });
  const session = readSession(req);
  const { hosp } = getAdapters("none", process.env, session.id);
  const now = new Date();
  const homes = await Promise.all(PROPERTIES.map(async (p) => {
    try {
      if (adults + children > p.maxGuests) return { key: p.key, ok: false, reason: `Sleeps ${p.maxGuests}` };
      const cal = await hosp.getCalendar(p.hospitableUuid, checkIn, checkOut);
      const nights = cal.filter((d) => d.date < checkOut);
      if (!nights.length || nights.some((d) => !d.available)) return { key: p.key, ok: false, reason: "Booked for these dates" };
      if (nights[0]?.closedForCheckin) return { key: p.key, ok: false, reason: "No check-in that day" };
      if (cal.find((d) => d.date === checkOut)?.closedForCheckout) return { key: p.key, ok: false, reason: "No check-out that day" };
      const min = nights[0]?.minStay ?? 2;
      if (nights.length < min) return { key: p.key, ok: false, reason: `${min}-night minimum` };
      const q = buildQuote({ property: p, checkIn, checkOut, adults, children, infants: 0, payPlan: "full", nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])), now });
      return { key: p.key, ok: true, total: q.total, nights: q.nights };
    } catch (e) {
      console.error("availability", p.key, (e as Error).message);
      return { key: p.key, ok: false, reason: "Check the home's page" };
    }
  }));
  return withSession(NextResponse.json({ checkIn, checkOut, adults, children, homes }, { headers: noStore }), session);
}
