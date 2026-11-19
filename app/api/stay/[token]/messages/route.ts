import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { bookingForToken } from "@/server/stay";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { addMessage, alertHost, cleanBody, listMessages, markRead, MAX_LEN, setReaction } from "@/services/stayChat";

/**
 * Guest chat (Oscar, Nov 19). GET -> the thread (and marks host replies as read); POST {body} -> adds a guest message and
 * alerts the host. Only for a real, live stay link; the sample portal (/stay/demo) keeps its messages in the browser.
 */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb(), row = db ? await bookingForToken(token) : null;
  if (!db || !row) return notFound();
  const messages = await listMessages(db, row.bookingId);
  if (messages.some((m) => m.sender === "host" && !m.readAt)) await markRead(db, row.bookingId, "guest");
  return NextResponse.json({ messages }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb(), row = db ? await bookingForToken(token) : null;
  if (!db || !row) return notFound();
  const lim = await checkLimit(db, req, LIMITS.chatSend);
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const body = cleanBody(((await req.json().catch(() => ({}))) as { body?: unknown }).body);
  if (!body) return NextResponse.json({ error: `Please write a message (up to ${MAX_LEN} characters).` }, { status: 400, headers: noStore });
  const message = await addMessage(db, row.bookingId, "guest", body);
  const alert = await alertHost(db, row.bookingId, body, new URL(req.url).origin);
  console.log("[chat] guest message", row.bookingRef, alert);
  return NextResponse.json({ message }, { headers: noStore });
}

/** PATCH {id, emoji} -> the guest's reaction on one of our messages (emoji null removes it). Airbnb's five only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb(), row = db ? await bookingForToken(token) : null;
  if (!db || !row) return notFound();
  const lim = await checkLimit(db, req, LIMITS.chatSend);
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; emoji?: unknown };
  const ok = await setReaction(db, row.bookingId, String(b.id ?? ""), "guest", b.emoji ?? null);
  return ok ? NextResponse.json({ ok: true }, { headers: noStore }) : NextResponse.json({ error: "Can't react to that message." }, { status: 400, headers: noStore });
}
