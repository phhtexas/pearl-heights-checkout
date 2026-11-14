import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { buildQuote, QuoteError } from "@/domain/quote";
import { getAdapters } from "@/server/adapters";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const property = getProperty(b.property);
    const { hosp } = getAdapters();
    const cal = await hosp.getCalendar(property.hospitableUuid, b.checkIn, b.checkOut);
    const nights = cal.filter((d) => d.date < b.checkOut);
    if (nights.some((d) => !d.available)) return NextResponse.json({ error: "Some nights in this range are already booked." }, { status: 409 });
    const min = nights[0]?.minStay ?? 2;
    if (nights.length < min) return NextResponse.json({ error: `Minimum stay is ${min} nights from this date.` }, { status: 400 });
    const quote = buildQuote({
      property, checkIn: b.checkIn, checkOut: b.checkOut, adults: b.adults, children: b.children ?? 0, infants: b.infants ?? 0,
      nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])), now: new Date(),
    });
    return NextResponse.json({ quote, expiresAt: Date.now() + 15 * 60_000 });
  } catch (e) {
    const status = e instanceof QuoteError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
