import { NextResponse } from "next/server";
import { HOMES } from "@/content/homes";
import { getDb } from "@/db/client";
import { checkLimit, LIMITS, tooMany } from "@/server/rateLimit";
import { activeOffer, addInquiryMessage, alertHostInquiry, cleanBody, inquiryForToken, listInquiryMessages, markInquiryRead, MAX_LEN, offerUrl } from "@/services/inquiries";

/** The guest's private conversation (GET: messages and any active special offer; POST {body}: a new message). */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex" };

async function ctx(token: string) {
  const db = getDb();
  const inq = db ? await inquiryForToken(db, token).catch(() => null) : null;
  return db && inq ? { db, inq } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const c = await ctx(token);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const messages = await listInquiryMessages(c.db, c.inq.id);
  if (messages.some((m) => m.sender === "host" && !m.readAt)) await markInquiryRead(c.db, c.inq.id, "guest");
  const o = await activeOffer(c.db, c.inq.id);
  const h = HOMES[c.inq.propertyKey], p = h?.photos[0];
  const { guestEmail: _e, ...inquiry } = c.inq;
  return NextResponse.json({
    inquiry, messages,
    home: h ? { title: h.title, slug: h.slug ?? null, photo: p ? `${h.photoBase}${p.id}.jpg` : null } : null,
    offer: o ? { total: o.total, regular: o.regular, checkIn: o.checkIn, checkOut: o.checkOut, adults: o.adults, children: o.children, infants: o.infants, expiresAt: o.expiresAt, url: offerUrl(o, token) } : null,
  }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const c = await ctx((await params).token);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const rl = await checkLimit(c.db, req, LIMITS.inquirySend);
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const body = cleanBody(((await req.json().catch(() => ({}))) as { body?: unknown }).body);
  if (!body) return NextResponse.json({ error: `Write a message (up to ${MAX_LEN} characters).` }, { status: 400, headers: noStore });
  await markInquiryRead(c.db, c.inq.id, "guest");
  const message = await addInquiryMessage(c.db, c.inq.id, "guest", body);
  await alertHostInquiry(c.db, c.inq.id, body, new URL(req.url).origin, false);
  return NextResponse.json({ message }, { headers: noStore });
}
