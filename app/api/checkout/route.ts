import { NextResponse } from "next/server";
import { getProperty } from "@/domain/properties";
import { runCheckoutOnce } from "@/services/checkout";
import { getAdapters } from "@/server/adapters";
import { parseCheckout, ValidationError, redact } from "@/server/validate";
import type { MockFailure } from "@/adapters/mock";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const newRef = () => "PH-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

export async function POST(req: Request) {
  // Same-origin only (basic CSRF protection; real deployment adds rate limiting at the edge).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  try {
    const b = await req.json();
    const input = parseCheckout(b);
    const { hosp, pay, store, mode } = getAdapters((b.simulate ?? "none") as MockFailure);
    const outcome = await runCheckoutOnce({
      ...input, property: getProperty(input.property), bookingRef: input.bookingRef ?? newRef(), now: new Date(),
    }, hosp, pay, store);
    getAdapters("none"); // reset simulated failure
    return NextResponse.json({ mode, ...outcome }, { headers: noStore });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    console.error("checkout error", redact(String((e as Error).message)));
    return NextResponse.json({ error: "Something went wrong. No charge was made." }, { status: 500, headers: noStore });
  }
}
