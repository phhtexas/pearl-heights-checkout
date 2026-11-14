import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { runCheckout } from "@/services/checkout";
import { getAdapters } from "@/server/adapters";
import type { MockFailure } from "@/adapters/mock";

const newRef = () => "PH-" + Math.random().toString(36).slice(2, 8).toUpperCase();

export async function POST(req: Request) {
  const b = await req.json();
  const g = b.guest ?? {};
  if (!g.firstName?.trim() || !g.lastName?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email ?? "") || String(g.phone ?? "").replace(/\D/g, "").length < 10)
    return NextResponse.json({ error: "Enter the main guest's name, a valid email and a mobile number." }, { status: 400 });
  if (!b.agreed) return NextResponse.json({ error: "Please accept the house rules, cancellation policy and payment authorization." }, { status: 400 });
  const { hosp, pay, mode } = getAdapters((b.simulate ?? "none") as MockFailure);
  const outcome = await runCheckout({
    property: getProperty(b.property), checkIn: b.checkIn, checkOut: b.checkOut,
    adults: b.adults, children: b.children ?? 0, infants: b.infants ?? 0,
    guest: { firstName: g.firstName.trim(), lastName: g.lastName.trim(), email: g.email.trim(), phone: g.phone },
    bookingRef: b.bookingRef ?? newRef(), acceptedTotal: b.acceptedTotal, now: new Date(),
  }, hosp, pay);
  getAdapters("none"); // reset simulated failure
  return NextResponse.json({ mode, ...outcome });
}
