import { NextResponse } from "next/server";
import { resetMockSession } from "@/server/adapters";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

/** Test-only: clears this browser's mock bookings. Refused unless CHECKOUT_MODE=mock (guards in getAdapters). */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const s = readSession(req);
  try {
    if (!s.isNew) resetMockSession(s.id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
}
