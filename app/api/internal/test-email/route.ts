import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { confirmationEmail, REPLY_TO, sendEmail } from "@/services/email";
import { HOMES } from "@/content/homes";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/**
 * Sample confirmation email (Oscar, Nov 18), so he can see how it lands in a real inbox before launch.
 * Sends ONLY to our own bookings@ inbox (never a guest), sample data only, 3 per hour, and never on pearlheightshomes.com.
 * Works whenever RESEND_API_KEY is set, independent of GUEST_EMAILS.
 */
export async function GET(req: Request) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0]!;
  if (/(^|\.)pearlheightshomes\.com$/.test(host)) return new NextResponse("Not found", { status: 404, headers: noStore });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not set" }, { status: 503, headers: noStore });
  const rl = await checkLimit(getDb(), req, LIMITS.testEmail);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const h = HOMES["claywell"]!;
  // Nov 20 redesign sample: listing card, itemized payment summary with the card used, standard footer.
  const quote = { nights: 3, lodging: 180000, extraGuestFee: 0, cleaning: 25000, protection: 7900, taxableBase: 205000, tax: 34297, taxRate: 0.1673, total: 247197,
    plan: { split: true, dueNow: 123599, scheduled: { amount: 123598, chargeAt: new Date("2027-01-11T22:00:00Z") } }, fullPlan: { split: false, dueNow: 247197 },
    nonRefundable: false, processingFeeBase: 205000 } as never;
  const m = confirmationEmail({ firstName: "Alex", homeName: "The Claywell", photoUrl: h.photoBase + h.photos[0]!.id + ".jpg", bookingRef: "PH-SAMPLE",
    dates: "Feb 10–13", guests: 4, deadline: "Monday, February 9, 2027 at 4:00 PM CT", link: "https://pearlheightshomes.com/",
    paidToday: "$1,235.99", balanceLine: "$1,235.98 on Mon, Jan 11", nonRefundable: false,
    propertyKey: "claywell", checkIn: "2027-02-10", checkOut: "2027-02-13", adults: 2, children: 2, infants: 0, quote, bookedAt: new Date(), card: "Visa\u00A0••••\u00A04242" });
  try {
    const id = await sendEmail(REPLY_TO, { ...m, subject: "[SAMPLE] " + m.subject }, `sample-${Date.now()}`);
    return NextResponse.json({ sent: true, to: REPLY_TO, id }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ sent: false, error: String((e as Error).message) }, { status: 502, headers: noStore });
  }
}
