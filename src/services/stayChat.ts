import type { Db } from "../db/client";
import { getProperty } from "../domain/properties";
import { emailEnabled, noticeEmail, sendEmail } from "./email";
import { shortRange } from "./guestNotices";
import { hashToken, newToken } from "./stayLinks";
import { sendSms, toE164 } from "./sms";

/**
 * Guest chat on the stay page (Oscar, Nov 19: "like Airbnb", a thread per booking; we get a notification on the phone
 * and reply back in the portal chat; replies come from a host inbox on the site, signed in with an email link).
 *  - Guests write from their stay link (only while the link works: until 3 days after check-out).
 *  - Each guest message alerts the host by email (HOST_ALERT_EMAIL, default bookings@), grouped per thread: no second
 *    alert while an earlier one is still unread and less than ALERT_GAP_MS old.
 *  - A host reply emails the guest "Oscar replied" with a fresh stay link, only when guest emails are on (GUEST_EMAILS,
 *    off until launch), grouped the same way. The guest always sees replies on the stay page.
 *  - Message text is stored and shown as plain text (React escapes it; email bodies escape it).
 */
export const MAX_LEN = 2000;
export const ALERT_GAP_MS = 10 * 60_000;
export const HOST_EMAIL_DEFAULT = "bookings@pearlheightshomes.com";

/** Airbnb's reaction set (Airbnb Help article 3558, and the Airbnb app as Oscar showed it, Nov 19: 😊 ❤️ 👍 👏 🤣). */
export const REACTIONS = ["😊", "❤️", "👍", "👏", "🤣"] as const;
export type Reaction = (typeof REACTIONS)[number];
export interface ChatMessage { id: string; sender: "guest" | "host"; body: string; at: string; readAt: string | null; guestReaction: Reaction | null; hostReaction: Reaction | null }
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const toMsg = (r: any): ChatMessage => ({ id: r.id, sender: r.sender, body: r.body, at: iso(r.created_at)!, readAt: iso(r.read_at), guestReaction: r.guest_reaction ?? null, hostReaction: r.host_reaction ?? null });
const COLS = "id, sender, body, created_at, read_at, guest_reaction, host_reaction";

/**
 * Sets (or clears, with null) `by`'s reaction on a message in this thread (any message, as in the Airbnb app).
 * Returns false if the message isn't in the thread or the emoji isn't one of Airbnb's five.
 */
export async function setReaction(db: Db, bookingId: string, messageId: string, by: "guest" | "host", emoji: unknown): Promise<boolean> {
  if (emoji !== null && !REACTIONS.includes(emoji as Reaction)) return false;
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return false;
  const col = by === "guest" ? "guest_reaction" : "host_reaction";
  const rows = await db.query(`UPDATE stay_chat_messages SET ${col} = $3 WHERE id = $1 AND booking_id = $2 RETURNING 1`, [messageId, bookingId, emoji]);
  return rows.length > 0;
}

/** Trim, normalise line breaks, cap blank lines; null if empty or too long. */
export function cleanBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t && t.length <= MAX_LEN ? t : null;
}

export async function listMessages(db: Db, bookingId: string): Promise<ChatMessage[]> {
  const rows = await db.query(`SELECT ${COLS} FROM stay_chat_messages WHERE booking_id = $1 ORDER BY created_at, id`, [bookingId]);
  return rows.map(toMsg);
}

export async function addMessage(db: Db, bookingId: string, sender: "guest" | "host", body: string, now = new Date()): Promise<ChatMessage> {
  const [r] = await db.query(`INSERT INTO stay_chat_messages (booking_id, sender, body, created_at) VALUES ($1, $2, $3, $4)
    RETURNING ${COLS}`, [bookingId, sender, body, now.toISOString()]);
  return toMsg(r);
}

/** Marks the other side's messages as read by `reader`. */
export async function markRead(db: Db, bookingId: string, reader: "guest" | "host", now = new Date()) {
  await db.query(`UPDATE stay_chat_messages SET read_at = $3 WHERE booking_id = $1 AND sender <> $2 AND read_at IS NULL`, [bookingId, reader, now.toISOString()]);
}

/** Claims the alert slot for this thread and side; false when one went out recently and is still unread. */
async function claimAlert(db: Db, bookingId: string, audience: "host" | "guest", now: Date): Promise<boolean> {
  const sender = audience === "host" ? "guest" : "host";
  const rows = await db.query(
    `INSERT INTO stay_chat_alerts (booking_id, audience, last_sent_at) VALUES ($1, $2, $3)
     ON CONFLICT (booking_id, audience) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at
       WHERE stay_chat_alerts.last_sent_at < $4
          OR NOT EXISTS (SELECT 1 FROM stay_chat_messages m WHERE m.booking_id = $1 AND m.sender = $5 AND m.read_at IS NULL
                          AND m.created_at < $3 AND m.created_at >= stay_chat_alerts.last_sent_at)
     RETURNING 1`,
    [bookingId, audience, now.toISOString(), new Date(now.getTime() - ALERT_GAP_MS).toISOString(), sender]);
  return rows.length > 0;
}

export interface ThreadInfo { bookingId: string; bookingRef: string; propertyKey: string; checkIn: string; checkOut: string; guestName: string; guestEmail: string;
  guests?: number; confirmedAt?: string; agreementSigned?: boolean; idVerified?: boolean; babyGear?: boolean }
const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function threadInfo(db: Db, bookingId: string): Promise<ThreadInfo | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  const [r] = await db.query<any>(
    `SELECT b.id, b.booking_ref, b.confirmed_at, b.baby_gear, q.property_key, q.check_in, q.check_out, q.adults, q.children, q.infants,
            g.first_name, g.last_name, g.email, v.agreement_signed_at, v.id_status
       FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version JOIN guests g ON g.id = b.guest_id
       LEFT JOIN verifications v ON v.booking_id = b.id
      WHERE b.id = $1 AND b.confirmed_at IS NOT NULL`, [bookingId]);
  return r ? { bookingId: r.id, bookingRef: r.booking_ref, propertyKey: r.property_key, checkIn: day(r.check_in), checkOut: day(r.check_out),
    guestName: `${r.first_name} ${r.last_name}`.trim(), guestEmail: r.email,
    guests: Number(r.adults) + Number(r.children) + Number(r.infants ?? 0), confirmedAt: iso(r.confirmed_at)!,
    agreementSigned: !!r.agreement_signed_at, idVerified: r.id_status === "verified", babyGear: !!r.baby_gear } : null;
}

export interface InboxRow extends ThreadInfo { lastBody: string; lastSender: "guest" | "host"; lastAt: string; unread: number }
/** Every thread with at least one message, newest activity first. */
export async function inbox(db: Db): Promise<InboxRow[]> {
  const rows = await db.query<any>(
    `SELECT b.id, b.booking_ref, q.property_key, q.check_in, q.check_out, g.first_name, g.last_name, g.email,
            l.body AS last_body, l.sender AS last_sender, l.created_at AS last_at,
            (SELECT count(*) FROM stay_chat_messages u WHERE u.booking_id = b.id AND u.sender = 'guest' AND u.read_at IS NULL) AS unread
       FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version JOIN guests g ON g.id = b.guest_id
       JOIN LATERAL (SELECT body, sender, created_at FROM stay_chat_messages m WHERE m.booking_id = b.id ORDER BY created_at DESC, id DESC LIMIT 1) l ON true
      ORDER BY l.created_at DESC LIMIT 200`);
  return rows.map((r) => ({ bookingId: r.id, bookingRef: r.booking_ref, propertyKey: r.property_key, checkIn: day(r.check_in), checkOut: day(r.check_out),
    guestName: `${r.first_name} ${r.last_name}`.trim(), guestEmail: r.email, lastBody: r.last_body, lastSender: r.last_sender, lastAt: iso(r.last_at)!, unread: Number(r.unread) }));
}

const homeName = (key: string) => { try { return getProperty(key).name; } catch { return key; } };
const preview = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function hostAlertEmail(t: ThreadInfo, body: string, url: string) {
  const first = t.guestName.split(" ")[0] || "A guest";
  return noticeEmail({
    subject: `New message from ${first}: ${homeName(t.propertyKey)}, ${shortRange(t.checkIn, t.checkOut)}`,
    preheader: preview(body),
    heading: `${t.guestName} sent a message`,
    paragraphs: [`${homeName(t.propertyKey)} · ${shortRange(t.checkIn, t.checkOut)} · ${t.bookingRef}`, body],
    button: { label: "Reply in the host inbox", url },
    afterButton: ["Reply from the host inbox so the answer shows in the guest's chat. Replying to this email won't reach them."],
  });
}

export function guestReplyEmail(t: ThreadInfo, body: string, url: string) {
  const first = t.guestName.split(" ")[0] || "there";
  return noticeEmail({
    subject: `New message about your stay at ${homeName(t.propertyKey)}`,
    preheader: preview(body),
    heading: `Hi ${first}, you have a new message`,
    paragraphs: [`Oscar & Fernanda replied about your stay (${shortRange(t.checkIn, t.checkOut)}, ${t.bookingRef}):`, body],
    button: { label: "Open your stay page", url },
    afterButton: ["You can reply on your stay page."],
  });
}

type Fetch = typeof fetch;
/** Host text alerts (Oscar, Nov 19: Twilio approved): on with HOST_TEXT_ALERTS=on and the Twilio settings. Server-only number. */
export const HOST_ALERT_PHONE_DEFAULT = "+12104002540";
export function hostTextsOn(env: NodeJS.ProcessEnv = process.env) {
  return env.HOST_TEXT_ALERTS === "on" && !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && /^\+1\d{10}$/.test(env.TWILIO_FROM ?? "");
}
export function hostAlertText(t: ThreadInfo, body: string, url: string) {
  const first = t.guestName.split(" ")[0] || "A guest";
  // Plain characters only (no en dash, curly quotes or ellipsis), so the text stays in the cheaper GSM encoding.
  const gsm = (x: string) => x.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, "...");
  return gsm(`Pearl Heights: new message from ${first} (${homeName(t.propertyKey)}, ${shortRange(t.checkIn, t.checkOut)}): "${preview(body, 90)}" Reply: ${url}`);
}

/** After a guest message: alert the host by email and, when on, by text (grouped per thread). Never throws. */
export async function alertHost(db: Db, bookingId: string, body: string, origin: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: Fetch = fetch, now = new Date()) {
  try {
    const email = !!env.RESEND_API_KEY, text = hostTextsOn(env);
    if (!email && !text) return "off";
    const t = await threadInfo(db, bookingId);
    if (!t || !(await claimAlert(db, bookingId, "host", now))) return "grouped";
    const url = `${origin}/host/t/${bookingId}`, out: string[] = [];
    if (email) {
      try { await sendEmail(env.HOST_ALERT_EMAIL || HOST_EMAIL_DEFAULT, hostAlertEmail(t, body, url), `chat-host-${bookingId}-${now.getTime()}`, env, fetchImpl); out.push("email"); }
      catch (e) { console.error("[chat] host alert email failed", (e as Error).message.slice(0, 200)); }
    }
    if (text) {
      try { await sendSms(toE164(env.HOST_ALERT_PHONE || "") ?? HOST_ALERT_PHONE_DEFAULT, hostAlertText(t, body, url), env, fetchImpl); out.push("text"); }
      catch (e) { console.error("[chat] host alert text failed", (e as Error).message.slice(0, 200)); }
    }
    return out.length ? "sent:" + out.join("+") : "failed";
  } catch (e) { console.error("[chat] host alert failed", (e as Error).message.slice(0, 200)); return "failed"; }
}

/** After a host reply: email the guest a link back to the chat (grouped; only with guest emails on). Never throws. */
export async function alertGuest(db: Db, bookingId: string, body: string, origin: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: Fetch = fetch, now = new Date()) {
  try {
    if (!emailEnabled(env)) return "off";
    const t = await threadInfo(db, bookingId);
    if (!t || !(await claimAlert(db, bookingId, "guest", now))) return "grouped";
    // A fresh stay link for this email (links are stored only as hashes, so existing ones can't be reused).
    const [b] = await db.query<any>(`SELECT expires_at FROM stay_links WHERE booking_id = $1 AND revoked_at IS NULL ORDER BY expires_at DESC LIMIT 1`, [bookingId]);
    if (!b || new Date(b.expires_at).getTime() <= now.getTime()) return "expired";
    const token = newToken();
    await db.query(`INSERT INTO stay_links (booking_id, token_hash, channel, expires_at) VALUES ($1, $2, 'email', $3)`, [bookingId, hashToken(token), iso(b.expires_at)]);
    await sendEmail(t.guestEmail, guestReplyEmail(t, body, `${origin}/stay/${token}#messages`), `chat-guest-${bookingId}-${now.getTime()}`, env, fetchImpl);
    return "sent";
  } catch (e) { console.error("[chat] guest alert failed", (e as Error).message.slice(0, 200)); return "failed"; }
}

/* ---------- Host sign-in (email link) ---------- */
export const LOGIN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 90 * 864e5;
export const HOST_COOKIE = "ph_host";

export function hostEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.HOST_EMAILS || HOST_EMAIL_DEFAULT).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Issues a one-time sign-in token if `email` is a host address; null otherwise (the caller answers the same either way). */
export async function issueLoginToken(db: Db, email: string, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!hostEmails(env).includes(e)) return null;
  const token = newToken();
  await db.query(`INSERT INTO host_login_tokens (token_hash, email, expires_at) VALUES ($1, $2, $3)`, [hashToken(token), e, new Date(now.getTime() + LOGIN_TTL_MS).toISOString()]);
  return token;
}

export function loginEmail(url: string) {
  return noticeEmail({
    subject: "Your Pearl Heights host inbox sign-in link",
    preheader: "This link works once, for 15 minutes.",
    heading: "Sign in to the host inbox",
    paragraphs: ["Tap the button on the phone or computer you want to use. You'll stay signed in there for 90 days."],
    button: { label: "Sign in", url },
    afterButton: ["The link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email."],
  });
}

/** Uses a sign-in token (once, unexpired) and opens a session; returns the session token or null. */
export async function redeemLoginToken(db: Db, token: string, now = new Date()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const [r] = await db.query<any>(`UPDATE host_login_tokens SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING email`,
    [hashToken(token), now.toISOString()]);
  if (!r) return null;
  const session = newToken();
  await db.query(`INSERT INTO host_sessions (token_hash, email, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
    [hashToken(session), r.email, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString()]);
  return session;
}

export async function hostForSession(db: Db, session: string | undefined, env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<string | null> {
  if (!session || !/^[A-Za-z0-9_-]{40,64}$/.test(session)) return null;
  const [r] = await db.query<any>(`SELECT email FROM host_sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`, [hashToken(session), now.toISOString()]);
  return r && hostEmails(env).includes(r.email) ? r.email : null;
}

export async function endSession(db: Db, session: string | undefined) {
  if (session) await db.query(`UPDATE host_sessions SET revoked_at = now() WHERE token_hash = $1`, [hashToken(session)]);
}
