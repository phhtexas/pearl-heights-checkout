import { NextResponse } from "next/server";
import { agreementHtml } from "@/services/esign/agreement";
import { ESignUnavailable, createSigningDocument, getDocumentStatus } from "@/services/esign/signwell";
import { getDb } from "@/db/client";
import { paperworkFor, type PaperworkCtx } from "@/server/stay";
import { recordAgreementSigned, recordSigningDocument } from "@/services/stayLinks";
import { formatChicagoDateTime } from "@/domain/time";

/**
 * Guest portal: rental agreement signing through SignWell (embedded).
 *  - /stay/demo (sandbox builds): a sample reservation.
 *  - Test bookings: the booking's own details in a SignWell TEST document (not billed, not binding) with a test email.
 *  - Live bookings (paid on pearlheightshomes.com): a real document to the guest's email, with the urgent contact.
 *  On completion the signature is saved on the booking (verifications), so it shows on any device.
 * The stay-link token is never sent to SignWell; documents are tied to the booking by an internal id in metadata.
 * POST  -> creates the agreement and returns the embedded signing URL.
 * GET ?doc=<id> -> asks SignWell whether that document is completed (the browser's "completed" event isn't trusted).
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const TEST_EMAIL = "test-guest@example.com";
const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
/** What ties a SignWell document to this portal: "demo", or the booking's internal id. */
const owner = (c: PaperworkCtx) => (c.kind === "demo" ? "demo" : c.row.bookingId);
/** Live bookings (paid on pearlheightshomes.com) get a real, binding SignWell document sent to the guest's own email. */
const isLive = (c: PaperworkCtx) => c.kind === "booking" && c.row.livemode;

// Best-effort throttle per server instance (test documents aren't billed, but keep the endpoint from being abused).
const hits = new Map<string, number[]>();
function throttled(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > 6;
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await paperworkFor(token);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  if (ctx.kind === "booking" && ctx.row.agreementSignedAt) return NextResponse.json({ error: "Your agreement is already signed." }, { status: 409, headers: noStore });
  if (throttled(req)) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers: noStore });
  let name = "";
  try { name = String((await req.json())?.name ?? "").trim(); } catch { /* bad body */ }
  if (ctx.kind === "booking") name = name || ctx.stay.holder;
  if (name.length < 1 || name.length > 80 || /[<>{}\[\]]/.test(name)) return NextResponse.json({ error: "Please enter your full name." }, { status: 400, headers: noStore });
  const stay = ctx.stay;
  const price = ctx.kind === "booking"
    ? { total: money(ctx.row.totalCents), paidNow: ctx.row.paidNowCents == null ? money(ctx.row.totalCents) : money(ctx.row.paidNowCents),
        // Split bookings (Perplexity PX-F1, Nov 19): the agreement states the scheduled balance and when it is charged.
        ...(ctx.row.balance ? { balance: money(ctx.row.balance.cents), balanceDate: formatChicagoDateTime(new Date(ctx.row.balance.dueAt)) } : {}) }
    : { total: "TEST $0.00", paidNow: "TEST $0.00" };
  const live = isLive(ctx);
  const email = live && ctx.kind === "booking" ? ctx.row.guestEmail : TEST_EMAIL;
  try {
    const html = agreementHtml({
      bookingId: stay.code, propertyKey: stay.home.key, holder: { name, email },
      checkIn: stay.checkIn, checkOut: stay.checkOut, guests: { adults: stay.guests.adults, children: stay.guests.children, infants: ctx.kind === "booking" ? ctx.row.infants : 0 },
      price, testMode: !live,
    });
    const doc = await createSigningDocument({
      name: `${live ? "" : "TEST "}Rental Agreement ${stay.code}`, html, signer: { name, email }, testMode: !live,
      redirectUrl: `${new URL(req.url).origin}/stay/${token}?signed=1`,
      metadata: { stay: owner(ctx), booking: stay.code, holder: stay.holder },
    });
    if (ctx.kind === "booking") { const db = getDb(); if (db) await recordSigningDocument(db, ctx.row.bookingId, doc.documentId).catch(() => undefined); }
    return NextResponse.json({ documentId: doc.documentId, url: doc.embeddedSigningUrl, testMode: !live }, { headers: noStore });
  } catch (e) {
    if (e instanceof ESignUnavailable) return NextResponse.json({ error: "Signing isn't set up yet.", fallback: true }, { status: 503, headers: noStore });
    console.error("[stay/agreement] create failed", (e as Error).message);
    return NextResponse.json({ error: "We couldn't open the agreement. Please try again." }, { status: 502, headers: noStore });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = new URL(req.url).searchParams.get("doc") ?? "";
  const ctx = /^[0-9a-f-]{36}$/i.test(doc) ? await paperworkFor(token) : null;
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  try {
    const s = await getDocumentStatus(doc);
    if ((s.metadata?.stay ?? (s.metadata?.token === "demo" ? "demo" : undefined)) !== owner(ctx) || s.testMode === isLive(ctx)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
    // The name the guest typed in the agreement's "Full legal name" field; nameEdited flags a change from the booking.
    const legalName = s.completed ? s.legalName : undefined;
    const nameEdited = !!legalName && !!s.metadata?.holder && legalName.toLowerCase() !== String(s.metadata.holder).trim().toLowerCase();
    if (s.completed && ctx.kind === "booking") {
      const db = getDb();
      if (db) await recordAgreementSigned(db, ctx.row.bookingId, { documentId: doc, signedAt: s.signedAt ?? new Date().toISOString(), signedName: legalName ?? ctx.stay.holder });
    }
    return NextResponse.json({ completed: s.completed, status: s.status, signedAt: s.completed ? s.signedAt : undefined, legalName, nameEdited }, { headers: noStore });
  } catch (e) {
    if (e instanceof ESignUnavailable) return NextResponse.json({ error: "Signing isn't set up yet.", fallback: true }, { status: 503, headers: noStore });
    console.error("[stay/agreement] status failed", (e as Error).message);
    return NextResponse.json({ error: "We couldn't check the agreement." }, { status: 502, headers: noStore });
  }
}
