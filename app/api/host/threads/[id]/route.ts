import { NextResponse } from "next/server";
import { HOMES } from "@/content/homes";
import { getDb } from "@/db/client";
import { currentHost } from "@/server/host";
import { LIMITS, checkLimit, tooMany } from "@/server/rateLimit";
import { addMessage, alertGuest, cleanBody, listMessages, markRead, MAX_LEN, setReaction, threadInfo } from "@/services/stayChat";

/** One guest thread for the signed-in host. GET -> messages (marks guest messages read); POST {body} -> host reply. */
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function ctx(id: string) {
  const db = getDb();
  if (!db || !(await currentHost())) return { error: NextResponse.json({ error: "Sign in" }, { status: 401, headers: noStore }) };
  const info = await threadInfo(db, id);
  if (!info) return { error: NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore }) };
  return { db, info };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx((await params).id);
  if ("error" in c) return c.error;
  const messages = await listMessages(c.db, c.info.bookingId);
  if (messages.some((m) => m.sender === "guest" && !m.readAt)) await markRead(c.db, c.info.bookingId, "host");
  const { guestEmail: _e, ...thread } = c.info;
  const h = HOMES[c.info.propertyKey], p = h?.photos[0];
  const home = h ? { title: h.title, photo: p ? `${h.photoBase}${p.id}.jpg` : null } : null;
  return NextResponse.json({ thread, home, messages }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx((await params).id);
  if ("error" in c) return c.error;
  const lim = await checkLimit(c.db, req, LIMITS.hostApi);
  if (!lim.ok) return tooMany(lim.retryAfterS);
  const body = cleanBody(((await req.json().catch(() => ({}))) as { body?: unknown }).body);
  if (!body) return NextResponse.json({ error: `Write a reply (up to ${MAX_LEN} characters).` }, { status: 400, headers: noStore });
  await markRead(c.db, c.info.bookingId, "host");
  const message = await addMessage(c.db, c.info.bookingId, "host", body);
  const alert = await alertGuest(c.db, c.info.bookingId, body, new URL(req.url).origin);
  console.log("[chat] host reply", c.info.bookingRef, alert);
  return NextResponse.json({ message, guestEmailed: alert === "sent" }, { headers: noStore });
}

/** PATCH {id, emoji} -> the host's reaction on a guest message (emoji null removes it). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx((await params).id);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; emoji?: unknown };
  const ok = await setReaction(c.db, c.info.bookingId, String(b.id ?? ""), "host", b.emoji ?? null);
  return ok ? NextResponse.json({ ok: true }, { headers: noStore }) : NextResponse.json({ error: "Can't react to that message." }, { status: 400, headers: noStore });
}
