import { NextResponse } from "next/server";
import { HOMES } from "@/content/homes";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { addInquiryMessage, alertGuestInquiry, cleanBody, getInquiry, listInquiryMessages, listOffers, markInquiryRead, MAX_LEN } from "@/services/inquiries";

/** One question-before-booking conversation for the signed-in host. GET -> messages and offers; POST {body} -> reply. */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function ctx(id: string) {
  const db = getDb();
  if (!db || !(await currentHost())) return { error: NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore }) };
  const inq = await getInquiry(db, id);
  if (!inq) return { error: NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore }) };
  return { db, inq };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx((await params).id);
  if ("error" in c) return c.error;
  const messages = await listInquiryMessages(c.db, c.inq.id);
  if (messages.some((m) => m.sender === "guest" && !m.readAt)) await markInquiryRead(c.db, c.inq.id, "host");
  const h = HOMES[c.inq.propertyKey], p = h?.photos[0];
  return NextResponse.json({ inquiry: c.inq, messages, offers: await listOffers(c.db, c.inq.id),
    home: h ? { title: h.title, photo: p ? `${h.photoBase}${p.id}.jpg` : null } : null }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx((await params).id);
  if ("error" in c) return c.error;
  const lim = await checkLimit(c.db, req, LIMITS.hostApi);
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const body = cleanBody(((await req.json().catch(() => ({}))) as { body?: unknown }).body);
  if (!body) return NextResponse.json({ error: `Write a reply (up to ${MAX_LEN} characters).` }, { status: 400, headers: noStore });
  await markInquiryRead(c.db, c.inq.id, "host");
  const message = await addInquiryMessage(c.db, c.inq.id, "host", body);
  const alert = await alertGuestInquiry(c.db, c.inq.id, body, new URL(req.url).origin, "reply");
  return NextResponse.json({ message, guestEmailed: alert === "sent" }, { headers: noStore });
}
