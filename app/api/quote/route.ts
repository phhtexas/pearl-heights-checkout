import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { buildQuote, QuoteError } from "@/domain/quote";
import { getAdapters } from "@/server/adapters";
import { parseStay, ValidationError } from "@/server/validate";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  try {
    const s = parseStay(await req.json());
    const property = getProperty(s.property);
    const { hosp } = getAdapters();
    const cal = await hosp.getCalendar(property.hospitableUuid, s.checkIn, s.checkOut);
    const nights = cal.filter((d) => d.date < s.checkOut);
    if (nights.some((d) => !d.available)) return NextResponse.json({ error: "Some nights in this range are already booked." }, { status: 409, headers: noStore });
    const min = nights[0]?.minStay ?? 2;
    if (nights.length < min) return NextResponse.json({ error: `Minimum stay is ${min} nights from this date.` }, { status: 400, headers: noStore });
    const quote = buildQuote({ ...s, property, nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])), now: new Date() });
    return NextResponse.json({ quote, expiresAt: Date.now() + 15 * 60_000 }, { headers: noStore });
  } catch (e) {
    const status = e instanceof QuoteError || e instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? (e as Error).message : "Something went wrong." }, { status, headers: noStore });
  }
}
