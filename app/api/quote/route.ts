import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { buildQuote, QuoteError } from "@/domain/quote";
import { getAdapters, getLedger } from "@/server/adapters";
import { parseStay, ValidationError } from "@/server/validate";
import { readSession, withSession } from "@/server/session";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const session = readSession(req);
  try {
    const s = parseStay(await req.json());
    const property = getProperty(s.property);
    const { hosp } = getAdapters("none", process.env, session.id);
    const cal = await hosp.getCalendar(property.hospitableUuid, s.checkIn, s.checkOut);
    const nights = cal.filter((d) => d.date < s.checkOut);
    if (nights.some((d) => !d.available)) return NextResponse.json({ error: "Some nights in this range are already booked." }, { status: 409, headers: noStore });
    const min = nights[0]?.minStay ?? 2;
    if (nights.length < min) return NextResponse.json({ error: `Minimum stay is ${min} nights from this date.` }, { status: 400, headers: noStore });
    const now = new Date();
    const quote = buildQuote({ ...s, property, nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])), now });
    // The quote the guest sees is saved; checkout must name it (persisted quote acceptance).
    const saved = await getLedger(process.env, session.id).ledger.saveQuote({ ...s, property: property.key }, quote, session.id, now);
    return withSession(NextResponse.json({ quote, quoteId: saved.id, expiresAt: saved.expiresAt.getTime() }, { headers: noStore }), session);
  } catch (e) {
    const status = e instanceof QuoteError || e instanceof ValidationError ? 400 : 500;
    if (status === 500) console.error("quote error", (e as Error).message);
    return NextResponse.json({ error: status === 400 ? (e as Error).message : "Something went wrong." }, { status, headers: noStore });
  }
}
