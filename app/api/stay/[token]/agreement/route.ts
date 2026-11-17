import { NextResponse } from "next/server";
import { demoStay } from "@/content/stayDemo";
import { agreementHtml } from "@/services/esign/agreement";
import { ESignUnavailable, createSigningDocument, getDocumentStatus } from "@/services/esign/signwell";

/**
 * Guest portal: rental agreement signing through SignWell (embedded). Phase 1 serves only the TEST portal
 * (/stay/demo): every document is created in SignWell test mode (not billed, not legally binding) for a sample
 * reservation and a test email. Real reservations will load from the database by token and use live mode.
 * POST  -> creates the agreement and returns the embedded signing URL.
 * GET ?doc=<id> -> asks SignWell whether that document is completed (the browser's "completed" event isn't trusted).
 */
export const dynamic = "force-dynamic";
const SANDBOX = () => process.env.NEXT_PUBLIC_SANDBOX === "true";
const noStore = { "Cache-Control": "no-store" };

// Best-effort throttle per server instance (test documents aren't billed, but keep the demo from being abused).
const hits = new Map<string, number[]>();
function throttled(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > 6;
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token !== "demo" || !SANDBOX()) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (throttled(req)) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers: noStore });
  let name = "";
  try { name = String((await req.json())?.name ?? "").trim(); } catch { /* bad body */ }
  if (name.length < 1 || name.length > 80 || /[<>{}\[\]]/.test(name)) return NextResponse.json({ error: "Please enter your full name." }, { status: 400, headers: noStore });
  const stay = demoStay();
  try {
    const html = agreementHtml({
      bookingId: stay.code, propertyKey: stay.home.key, holder: { name, email: "test-guest@example.com" },
      checkIn: stay.checkIn, checkOut: stay.checkOut, guests: { adults: stay.guests.adults, children: stay.guests.children, infants: 0 },
      price: { total: "TEST $0.00", paidNow: "TEST $0.00" }, testMode: true,
    });
    const doc = await createSigningDocument({ name: `TEST Rental Agreement ${stay.code}`, html, signer: { name, email: "test-guest@example.com" }, testMode: true, redirectUrl: `${new URL(req.url).origin}/stay/${token}?signed=1`, metadata: { token, booking: stay.code, holder: stay.holder } });
    return NextResponse.json({ documentId: doc.documentId, url: doc.embeddedSigningUrl, testMode: true }, { headers: noStore });
  } catch (e) {
    if (e instanceof ESignUnavailable) return NextResponse.json({ error: "Signing isn't set up yet.", fallback: true }, { status: 503, headers: noStore });
    console.error("[stay/agreement] create failed", (e as Error).message);
    return NextResponse.json({ error: "We couldn't open the agreement. Please try again." }, { status: 502, headers: noStore });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = new URL(req.url).searchParams.get("doc") ?? "";
  if (token !== "demo" || !SANDBOX() || !/^[0-9a-f-]{36}$/i.test(doc)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  try {
    const s = await getDocumentStatus(doc);
    if (s.metadata?.token !== token || !s.testMode) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
    // The name the guest typed in the agreement's "Full legal name" field; nameEdited flags a change from the booking.
    const legalName = s.completed ? s.legalName : undefined;
    const nameEdited = !!legalName && !!s.metadata?.holder && legalName.toLowerCase() !== String(s.metadata.holder).trim().toLowerCase();
    return NextResponse.json({ completed: s.completed, status: s.status, signedAt: s.completed ? s.signedAt : undefined, legalName, nameEdited }, { headers: noStore });
  } catch (e) {
    if (e instanceof ESignUnavailable) return NextResponse.json({ error: "Signing isn't set up yet.", fallback: true }, { status: 503, headers: noStore });
    console.error("[stay/agreement] status failed", (e as Error).message);
    return NextResponse.json({ error: "We couldn't check the agreement." }, { status: 502, headers: noStore });
  }
}
