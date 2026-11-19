import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { listDetails, renderMessage, saveDetails, unknownPlaceholders } from "@/services/checkinDetails";

/**
 * Host inbox: each home's check-in details (audit F1). Signed-in host only. GET lists the 5 homes; POST saves one
 * home and returns a preview filled for a sample guest. Contents are never logged.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };
const SAMPLE = { firstName: "Alex", lastName: "Sample", phone: "(210) 555-0142", bookingRef: "PH-SAMPLE" };

export async function GET() {
  const db = getDb();
  if (!db || !(await currentHost())) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  return NextResponse.json({ homes: await listDetails(db) }, { headers: noStore });
}

export async function POST(req: Request) {
  const db = getDb();
  const host = db ? await currentHost() : null;
  if (!db || !host) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  let b: { home?: unknown; address?: unknown; message?: unknown; preview?: unknown } = {};
  try { b = await req.json(); } catch { /* bad body */ }
  const home = String(b.home ?? ""), address = String(b.address ?? ""), message = String(b.message ?? "");
  const sampleIn = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), sampleOut = new Date(Date.now() + 17 * 864e5).toISOString().slice(0, 10);
  const preview = renderMessage(message, address.trim(), { ...SAMPLE, checkIn: sampleIn, checkOut: sampleOut, propertyKey: home });
  if (b.preview === true) return NextResponse.json({ preview, unknown: unknownPlaceholders(message) }, { headers: noStore });
  try { await saveDetails(db, home, { address, message }, host); }
  catch { return NextResponse.json({ error: "Couldn't save. Please try again." }, { status: 400, headers: noStore }); }
  return NextResponse.json({ ok: true, preview, unknown: unknownPlaceholders(message) }, { headers: noStore });
}
