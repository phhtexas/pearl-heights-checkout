import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { bookingForToken } from "@/server/stay";
import { arrivalFor, getDetails, maybeDoorCodeAlert } from "@/services/checkinDetails";

/**
 * Guest portal: real check-in details for a booking (audit F1, Oscar Nov 19). Decided on the server every time:
 * nothing is sent before both paperwork steps; the address after that; the full check-in message (door code, gate
 * code, Wi-Fi) from 8:00 AM CT on check-in day; test bookings get no real details. Never cached.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex" };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const row = db ? await bookingForToken(token) : null;
  if (!db || !row) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const paperworkDone = !!row.agreementSignedAt && !!row.idCheckedAt && row.idStatus === "verified";
  // If the host's door-code email failed earlier, try again (claimed once in the database).
  if (paperworkDone) await maybeDoorCodeAlert(db, row.bookingId).catch(() => false);
  const details = paperworkDone && row.livemode ? await getDetails(db, row.propertyKey).catch(() => null) : null;
  const a = arrivalFor({
    livemode: row.livemode, paperworkDone, details,
    guest: { firstName: row.firstName, lastName: row.lastName, phone: row.guestPhone, checkIn: row.checkIn, checkOut: row.checkOut, bookingRef: row.bookingRef, propertyKey: row.propertyKey },
  });
  return NextResponse.json(a, { headers: noStore });
}
