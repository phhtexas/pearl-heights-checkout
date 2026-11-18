import { NextResponse } from "next/server";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { getDb } from "@/db/client";
import { getProperty } from "@/domain/properties";
import { bookingAttempt } from "@/services/bookingFlow";
import { getAdapters, getLedger } from "@/server/adapters";
import { parseCheckout, ValidationError, redact } from "@/server/validate";
import { readSession, withSession } from "@/server/session";
import { DbLedger } from "@/db/ledger";
import type { MockFailure } from "@/adapters/mock";
import { consentRecord } from "@/domain/consent";
import { sendPurchase } from "@/services/metaCapi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };
const newRef = () => "PH-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

export async function POST(req: Request) {
  // Same-origin only (basic CSRF protection; rate limiting is a separate gate).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const rl = await checkLimit(getDb(), req, LIMITS.checkout);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const session = readSession(req);
  try {
    const b = await req.json();
    const input = parseCheckout(b);
    const { ledger } = getLedger(process.env, session.id);

    // Persisted quote acceptance: the guest must be paying for the exact saved quote, before it expires.
    const q = await ledger.getQuote(input.quoteId);
    const same = q && q.propertyKey === input.property && q.checkIn === input.checkIn && q.checkOut === input.checkOut
      && q.adults === input.adults && q.children === input.children && q.infants === input.infants
      && (q.quote.plan.split ? "split" : "full") === input.payPlan;
    // Quote ownership: only the browser session that requested the quote may pay for it.
    if (q && q.sessionId && q.sessionId !== session.id) return NextResponse.json({ error: "Your price check expired. Please see your total again." }, { status: 400, headers: noStore });
    if (!q || !same) return NextResponse.json({ error: "Your stay details changed. Please see your total again." }, { status: 400, headers: noStore });
    if (q.total !== input.acceptedTotal) return NextResponse.json({ error: "Your total doesn't match the price we showed. Please see your total again." }, { status: 400, headers: noStore });
    if (q.expiresAt.getTime() < Date.now()) return NextResponse.json({ ok: false, reason: "quote_expired", guestMessage: "Your 15-minute price hold expired. Please check your total again." }, { status: 409, headers: noStore });

    const { hosp, pay, mode } = getAdapters((b.simulate ?? "none") as MockFailure, process.env, session.id);
    const bookingRef = newRef();
    const now = new Date();
    const request = { ...input, property: getProperty(input.property), bookingRef, now, lockedQuote: q.quote, consent: consentRecord(now) };
    const view = await ledger.runAttempt(input.attemptKey, q, bookingRef, async () => {
      const outcome = await bookingAttempt(ledger instanceof DbLedger ? ledger : null, q, request, hosp, pay);
      console.info("checkout", bookingRef, outcome.state, outcome.log.join(" | "));
      return outcome;
    });
    getAdapters("none", process.env, session.id); // reset simulated failure
    if ((view as { ok?: boolean }).ok) await afterBooking(req, b, input, q.quote, (view as { bookingRef?: string }).bookingRef ?? bookingRef);
    return withSession(NextResponse.json({ mode, ...view }, { headers: noStore }), session);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    console.error("checkout error", redact(String((e as Error).message)));
    return NextResponse.json({ error: "Something went wrong. No charge was made." }, { status: 500, headers: noStore });
  }
}

/**
 * Ad tracking after a confirmed booking (Oscar, Nov 18): saves first-party attribution (utm tags, click ids, landing
 * page) on the booking, and, if the guest accepted cookies, sends the server-side Meta "Purchase" event with the booking
 * value (before taxes) so Meta can report bookings and ROAS. Never blocks or fails the booking.
 */
async function afterBooking(req: Request, b: any, input: { property: string; checkIn: string; checkOut: string; adults: number; children: number; guest: { email: string; phone: string } }, quote: { total: number; tax: number; nights: number }, bookingRef: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = b?.analytics ?? {};
  const str = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const attrib = a.attribution && typeof a.attribution === "object"
    ? Object.fromEntries(Object.entries(a.attribution as Record<string, unknown>).filter(([k]) => /^(utm_(source|medium|campaign|content|term)|fbclid|gclid|landing|referrer|at)$/.test(k)).map(([k, v]) => [k, str(v)]))
    : null;
  const db = getDb();
  let sent: string = a.consent === true ? "skipped" : "no-consent";
  try {
    if (a.consent === true) {
      sent = await sendPurchase({
        bookingRef, property: input.property, valueCents: quote.total - quote.tax, nights: quote.nights, adults: input.adults, children: input.children,
        checkIn: input.checkIn, checkOut: input.checkOut, email: input.guest.email, phone: input.guest.phone,
        clientIp: (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || undefined, userAgent: req.headers.get("user-agent") ?? undefined,
        fbp: str(a.fbp), fbc: str(a.fbc), url: str(a.url, 500),
      });
    }
    if (db) await db.query(`UPDATE bookings SET attribution = $2::jsonb, ad_events_sent_at = CASE WHEN $3 THEN now() ELSE ad_events_sent_at END WHERE booking_ref = $1`,
      [bookingRef, attrib ? JSON.stringify(attrib) : null, sent === "sent"]);
    console.info("[capi] booking", bookingRef, sent);
  } catch (e) { console.error("afterBooking", redact(String((e as Error).message))); }
}
