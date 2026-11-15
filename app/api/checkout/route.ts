import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { runCheckout } from "@/services/checkout";
import { getAdapters, getLedger } from "@/server/adapters";
import { parseCheckout, ValidationError, redact } from "@/server/validate";
import { readSession, withSession } from "@/server/session";
import { DbLedger } from "@/db/ledger";
import type { MockFailure } from "@/adapters/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };
const newRef = () => "PH-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

export async function POST(req: Request) {
  // Same-origin only (basic CSRF protection; rate limiting is a separate gate).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const session = readSession(req);
  try {
    const b = await req.json();
    const input = parseCheckout(b);
    const { ledger } = getLedger(process.env, session.id);

    // Persisted quote acceptance: the guest must be paying for the exact saved quote, before it expires.
    const q = await ledger.getQuote(input.quoteId);
    const same = q && q.propertyKey === input.property && q.checkIn === input.checkIn && q.checkOut === input.checkOut
      && q.adults === input.adults && q.children === input.children && q.infants === input.infants;
    if (!q || !same) return NextResponse.json({ error: "Your stay details changed. Please see your total again." }, { status: 400, headers: noStore });
    if (q.total !== input.acceptedTotal) return NextResponse.json({ error: "Your total doesn't match the price we showed. Please see your total again." }, { status: 400, headers: noStore });
    if (q.expiresAt.getTime() < Date.now()) return NextResponse.json({ ok: false, reason: "quote_expired", guestMessage: "Your 15-minute price hold expired. Please check your total again." }, { status: 409, headers: noStore });

    const { hosp, pay, mode } = getAdapters((b.simulate ?? "none") as MockFailure, process.env, session.id);
    const bookingRef = newRef();
    const request = { ...input, property: getProperty(input.property), bookingRef, now: new Date() };
    const view = await ledger.runAttempt(input.attemptKey, q, bookingRef, async () => {
      const outcome = await runCheckout(request, hosp, pay);
      console.info("checkout", bookingRef, outcome.state, outcome.log.join(" | "));
      if (outcome.ok && ledger instanceof DbLedger) {
        try { await ledger.recordBooking(request, q, outcome); }
        catch (e) { console.error("ALERT booking captured but not recorded", bookingRef, redact(String((e as Error).message))); }
      }
      return outcome;
    });
    getAdapters("none", process.env, session.id); // reset simulated failure
    return withSession(NextResponse.json({ mode, ...view }, { headers: noStore }), session);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    console.error("checkout error", redact(String((e as Error).message)));
    return NextResponse.json({ error: "Something went wrong. No charge was made." }, { status: 500, headers: noStore });
  }
}
