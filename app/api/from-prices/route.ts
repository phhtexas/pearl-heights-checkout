import { NextResponse } from "next/server";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { getDb } from "@/db/client";
import { PROPERTIES } from "@/domain/properties";
import { buildQuote } from "@/domain/quote";
import { getAdapters } from "@/server/adapters";
import { readSession } from "@/server/session";
import { addDaysISO, earliestCheckIn } from "@/domain/time";

/**
 * All Homes "From $X / night" before dates are picked (Oscar, Nov 17, option 1).
 * For each home: the lowest per-night price over bookable stays in the next 120 days, priced exactly like checkout's
 * per-night line (nightly rates + cleaning + damage waiver, divided by nights; 2 guests; before taxes). Stays from the
 * home's minimum up to 7 nights are checked, so "from" really is the lowest a guest could see. Read-only, nothing saved.
 */
export const dynamic = "force-dynamic";
const DAYS = 120, MAX_NIGHTS = 7;

export async function GET(req: Request) {
  const rl = await checkLimit(getDb(), req, LIMITS.calendar);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const session = readSession(req);
  const { hosp } = getAdapters("none", process.env, session.id);
  const now = new Date();
  const start = earliestCheckIn(now), end = addDaysISO(start, DAYS + MAX_NIGHTS);
  const out: Record<string, number> = {};
  await Promise.all(PROPERTIES.map(async (p) => {
    try {
      const cal = await hosp.getCalendar(p.hospitableUuid, start, end);
      let best = Infinity;
      for (let i = 0; i < cal.length && i < DAYS; i++) {
        const d0 = cal[i]!;
        if (!d0.available || d0.closedForCheckin) continue;
        const min = Math.max(2, d0.minStay ?? 2);
        for (let n = min; n <= MAX_NIGHTS && i + n < cal.length; n++) {
          const nights = cal.slice(i, i + n);
          if (nights.some((d) => !d.available)) break;
          if (cal[i + n]?.closedForCheckout) continue;
          try {
            const q = buildQuote({ property: p, checkIn: d0.date, checkOut: cal[i + n]!.date, adults: 2, children: 0, infants: 0, payPlan: "full",
              nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])), now });
            const perNight = Math.round((q.lodging + q.extraGuestFee + q.cleaning + q.protection) / q.nights);
            if (perNight < best) best = perNight;
          } catch { /* not bookable as priced */ }
        }
      }
      if (Number.isFinite(best)) out[p.key] = best;
    } catch (e) { console.error("from-prices", p.key, (e as Error).message); }
  }));
  // Prices move daily, not by the second: let the CDN reuse the answer for 30 minutes.
  return NextResponse.json({ from: out }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } });
}
