import type { Db } from "../db/client";
import { getProperty } from "../domain/properties";
import { emailEnabled, noticeEmail, sendEmail } from "./email";
import { shortRange } from "./guestNotices";
import { hashToken, newToken } from "./stayLinks";
import { sendSms, toE164 } from "./sms";
import { HOST_ALERT_PHONE_DEFAULT, HOST_EMAIL_DEFAULT, hostTextsOn, cleanBody, MAX_LEN } from "./stayChat";

/**
 * Questions before booking (Oscar, Nov 19: "like Airbnb": guests pick dates, message us, often ask for a discount,
 * then book).
 *  - A guest writes from a home's page: name, email, message; dates and guests are optional (prefilled when picked).
 *  - It lands in the host inbox next to the stay chats, with an email alert (and a text once host texts are on).
 *  - The guest reads replies and answers on a private conversation link (shown right after sending; emailed with each
 *    reply once guest emails are on, GUEST_EMAILS).
 *  - Special offer: the host sets a new all-in total for set dates and guests. It lasts 24 hours and only works through
 *    that guest's private link; checkout recomputes it on the server, so the URL can't change the price.
 * Messages are plain text (React escapes them on screen; emails escape them).
 */
export { MAX_LEN, cleanBody };
export const OFFER_HOURS = 24;
export const LINK_DAYS = 60;
const ALERT_GAP_MS = 10 * 60_000;
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Fetch = typeof fetch;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const day = (d: unknown) => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
export const homeName = (key: string) => { try { return getProperty(key).name; } catch { return key; } };
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 });
const preview = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export interface InquiryMsg { id: string; sender: "guest" | "host"; body: string; at: string; readAt: string | null; guestReaction: null; hostReaction: null }
export interface Offer { id: string; propertyKey: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number;
  total: number; regular: number; createdAt: string; expiresAt: string; withdrawn: boolean; bookingRef: string | null; active: boolean }
export interface Inquiry { id: string; propertyKey: string; checkIn: string | null; checkOut: string | null; adults: number; children: number; infants: number;
  quotedTotal: number | null; guestName: string; guestEmail: string; livemode: boolean; createdAt: string }

const toInquiry = (r: any): Inquiry => ({ id: r.id, propertyKey: r.property_key, checkIn: day(r.check_in), checkOut: day(r.check_out),
  adults: Number(r.adults), children: Number(r.children), infants: Number(r.infants), quotedTotal: r.quoted_total_cents == null ? null : Number(r.quoted_total_cents),
  guestName: r.guest_name, guestEmail: r.guest_email, livemode: !!r.livemode, createdAt: iso(r.created_at)! });
const toMsg = (r: any): InquiryMsg => ({ id: r.id, sender: r.sender, body: r.body, at: iso(r.created_at)!, readAt: iso(r.read_at), guestReaction: null, hostReaction: null });
const toOffer = (r: any, now = new Date()): Offer => {
  const expiresAt = iso(r.expires_at)!, withdrawn = !!r.withdrawn_at, bookingRef = r.booking_ref ?? null;
  return { id: r.id, propertyKey: r.property_key, checkIn: day(r.check_in)!, checkOut: day(r.check_out)!, adults: Number(r.adults), children: Number(r.children),
    infants: Number(r.infants), total: Number(r.total_cents), regular: Number(r.regular_cents), createdAt: iso(r.created_at)!, expiresAt, withdrawn, bookingRef,
    active: !withdrawn && !bookingRef && Date.parse(expiresAt) > now.getTime() };
};

/* ---------- Guest side ---------- */

export type NewInquiry = { property: string; checkIn: string | null; checkOut: string | null; adults: number; children: number; infants: number;
  quotedTotal: number | null; name: string; email: string; body: string };

/** Validates the form. Returns an error message for the guest, or the clean input. */
export function parseInquiry(b: any): NewInquiry | string {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const property = s(b?.property, 40);
  try { getProperty(property); } catch { return "Please choose a home."; }
  const name = s(b?.name, 80), email = s(b?.email, 120), body = cleanBody(b?.message);
  if (!name) return "Please add your name.";
  if (!EMAIL.test(email)) return "Please add a valid email so we can reply.";
  if (!body) return `Please write a message (up to ${MAX_LEN} characters).`;
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  let checkIn = date(b?.checkIn), checkOut = date(b?.checkOut);
  if (!checkIn || !checkOut || checkOut <= checkIn) { checkIn = null; checkOut = null; }
  const n = (v: unknown, min: number, max: number, d: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : d);
  const quotedTotal = Number.isInteger(b?.quotedTotal) && b.quotedTotal > 0 && b.quotedTotal < 100_000_000 && checkIn ? b.quotedTotal : null;
  return { property, checkIn, checkOut, adults: n(b?.adults, 1, 20, 2), children: n(b?.children, 0, 20, 0), infants: n(b?.infants, 0, 6, 0), quotedTotal, name, email, body };
}

/** A new private link for the guest (60 days, or 3 days after check-out if later). Only its hash is stored. */
async function issueLink(db: Db, inq: { id: string; checkOut: string | null }, now: Date): Promise<string> {
  const token = newToken();
  const until = Math.max(now.getTime() + LINK_DAYS * 864e5, inq.checkOut ? Date.parse(inq.checkOut + "T23:59:59Z") + 3 * 864e5 : 0);
  await db.query(`INSERT INTO inquiry_links (token_hash, inquiry_id, expires_at) VALUES ($1, $2, $3)`, [hashToken(token), inq.id, new Date(until).toISOString()]);
  return token;
}

export async function createInquiry(db: Db, n: NewInquiry, livemode: boolean, now = new Date()): Promise<{ id: string; token: string }> {
  const [r] = await db.query<any>(
    `INSERT INTO inquiries (property_key, check_in, check_out, adults, children, infants, quoted_total_cents, guest_name, guest_email, livemode, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [n.property, n.checkIn, n.checkOut, n.adults, n.children, n.infants, n.quotedTotal, n.name, n.email, livemode, now.toISOString()]);
  await db.query(`INSERT INTO inquiry_messages (inquiry_id, sender, body, created_at) VALUES ($1, 'guest', $2, $3)`, [r.id, n.body, now.toISOString()]);
  const token = await issueLink(db, { id: r.id, checkOut: n.checkOut }, now);
  return { id: r.id, token };
}

export async function inquiryForToken(db: Db, token: string, now = new Date()): Promise<Inquiry | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const [r] = await db.query<any>(
    `SELECT i.* FROM inquiry_links l JOIN inquiries i ON i.id = l.inquiry_id WHERE l.token_hash = $1 AND l.expires_at > $2`, [hashToken(token), now.toISOString()]);
  return r ? toInquiry(r) : null;
}

export async function getInquiry(db: Db, id: string): Promise<Inquiry | null> {
  if (!UUID.test(id)) return null;
  const [r] = await db.query<any>(`SELECT * FROM inquiries WHERE id = $1`, [id]);
  return r ? toInquiry(r) : null;
}

export async function listInquiryMessages(db: Db, id: string): Promise<InquiryMsg[]> {
  return (await db.query<any>(`SELECT id, sender, body, created_at, read_at FROM inquiry_messages WHERE inquiry_id = $1 ORDER BY created_at, id`, [id])).map(toMsg);
}

export async function addInquiryMessage(db: Db, id: string, sender: "guest" | "host", body: string, now = new Date()): Promise<InquiryMsg> {
  const [r] = await db.query<any>(`INSERT INTO inquiry_messages (inquiry_id, sender, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id, sender, body, created_at, read_at`,
    [id, sender, body, now.toISOString()]);
  return toMsg(r);
}

export async function markInquiryRead(db: Db, id: string, reader: "guest" | "host", now = new Date()) {
  await db.query(`UPDATE inquiry_messages SET read_at = $3 WHERE inquiry_id = $1 AND sender <> $2 AND read_at IS NULL`, [id, reader, now.toISOString()]);
}

/* ---------- Special offers ---------- */

export async function listOffers(db: Db, inquiryId: string, now = new Date()): Promise<Offer[]> {
  return (await db.query<any>(`SELECT * FROM special_offers WHERE inquiry_id = $1 ORDER BY created_at DESC`, [inquiryId])).map((r) => toOffer(r, now));
}
export const activeOffer = async (db: Db, inquiryId: string, now = new Date()) => (await listOffers(db, inquiryId, now)).find((o) => o.active) ?? null;

export type OfferInput = { checkIn: string; checkOut: string; adults: number; children: number; infants: number; total: number; regular: number };

/** Sends a special offer: withdraws any earlier active one, saves the new one and posts it in the conversation. */
export async function createOffer(db: Db, inq: Inquiry, o: OfferInput, by: string, now = new Date()): Promise<Offer> {
  const expires = new Date(now.getTime() + OFFER_HOURS * 3600_000);
  await db.query(`UPDATE special_offers SET withdrawn_at = $2 WHERE inquiry_id = $1 AND withdrawn_at IS NULL AND booking_ref IS NULL`, [inq.id, now.toISOString()]);
  const [r] = await db.query<any>(
    `INSERT INTO special_offers (inquiry_id, property_key, check_in, check_out, adults, children, infants, total_cents, regular_cents, created_by, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [inq.id, inq.propertyKey, o.checkIn, o.checkOut, o.adults, o.children, o.infants, o.total, o.regular, by, now.toISOString(), expires.toISOString()]);
  const guests = o.adults + o.children;
  await addInquiryMessage(db, inq.id, "host",
    `Special offer: ${usd(o.total)} total for ${homeName(inq.propertyKey)}, ${shortRange(o.checkIn, o.checkOut)}, ${guests} ${guests === 1 ? "guest" : "guests"}` +
    `${o.infants ? ` + ${o.infants} ${o.infants === 1 ? "infant" : "infants"}` : ""} (regular price ${usd(o.regular)}). It's yours for 24 hours: tap "Book with this offer" in this conversation.`, now);
  await db.query(`INSERT INTO audit_log (actor, action, after) VALUES ($1, 'special_offer_sent', $2)`, [by, JSON.stringify({ inquiry: inq.id, offer: r.id, total: o.total, regular: o.regular })]).catch(() => undefined);
  return toOffer(r, now);
}

export async function withdrawOffer(db: Db, inquiryId: string, by: string, now = new Date()): Promise<boolean> {
  const rows = await db.query(`UPDATE special_offers SET withdrawn_at = $2 WHERE inquiry_id = $1 AND withdrawn_at IS NULL AND booking_ref IS NULL AND expires_at > $2 RETURNING id`,
    [inquiryId, now.toISOString()]);
  if (rows.length) await addInquiryMessage(db, inquiryId, "host", "We withdrew the special offer.", now);
  await db.query(`INSERT INTO audit_log (actor, action, after) VALUES ($1, 'special_offer_withdrawn', $2)`, [by, JSON.stringify({ inquiry: inquiryId })]).catch(() => undefined);
  return rows.length > 0;
}

/**
 * The offer a checkout may use: the guest's private link (as `offer`) must point to an inquiry with an active offer
 * for exactly this home and dates, at most the offered guests, in the same mode (test or live).
 */
export async function offerForCheckout(db: Db, token: unknown, s: { property: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number },
  livemode: boolean, now = new Date()): Promise<Offer | null> {
  if (typeof token !== "string") return null;
  const inq = await inquiryForToken(db, token, now);
  if (!inq || inq.livemode !== livemode) return null;
  const o = await activeOffer(db, inq.id, now);
  if (!o || o.propertyKey !== s.property || o.checkIn !== s.checkIn || o.checkOut !== s.checkOut) return null;
  if (s.adults + s.children > o.adults + o.children || s.infants > o.infants) return null;
  return o;
}

export async function markOfferUsed(db: Db, offerId: string, bookingRef: string) {
  await db.query(`UPDATE special_offers SET booking_ref = $2 WHERE id = $1 AND booking_ref IS NULL`, [offerId, bookingRef]);
}

/* ---------- Host inbox ---------- */

export interface InquiryRow { id: string; propertyKey: string; checkIn: string | null; checkOut: string | null; guestName: string; livemode: boolean;
  lastBody: string; lastSender: "guest" | "host"; lastAt: string; unread: number }
export async function inquiryInbox(db: Db): Promise<InquiryRow[]> {
  const rows = await db.query<any>(
    `SELECT i.id, i.property_key, i.check_in, i.check_out, i.guest_name, i.livemode, l.body AS last_body, l.sender AS last_sender, l.created_at AS last_at,
            (SELECT count(*) FROM inquiry_messages u WHERE u.inquiry_id = i.id AND u.sender = 'guest' AND u.read_at IS NULL) AS unread
       FROM inquiries i
       JOIN LATERAL (SELECT body, sender, created_at FROM inquiry_messages m WHERE m.inquiry_id = i.id ORDER BY created_at DESC, id DESC LIMIT 1) l ON true
      ORDER BY l.created_at DESC LIMIT 200`);
  return rows.map((r) => ({ id: r.id, propertyKey: r.property_key, checkIn: day(r.check_in), checkOut: day(r.check_out), guestName: r.guest_name, livemode: !!r.livemode,
    lastBody: r.last_body, lastSender: r.last_sender, lastAt: iso(r.last_at)!, unread: Number(r.unread) }));
}

/* ---------- Alerts ---------- */

const datesText = (i: Pick<Inquiry, "checkIn" | "checkOut">) => (i.checkIn && i.checkOut ? shortRange(i.checkIn, i.checkOut) : "no dates yet");

export function hostInquiryEmail(i: Inquiry, body: string, url: string, first: boolean) {
  const g = i.adults + i.children;
  return noticeEmail({
    subject: `${i.livemode ? "" : "TEST · "}${first ? "New question" : "New message"} from ${i.guestName.split(" ")[0] || "a guest"}: ${homeName(i.propertyKey)}, ${datesText(i)}`,
    preheader: preview(body),
    heading: `${i.guestName} ${first ? "asked a question before booking" : "sent a message"}`,
    paragraphs: [`${homeName(i.propertyKey)} · ${datesText(i)}${i.checkIn ? ` · ${g} ${g === 1 ? "guest" : "guests"}` : ""}${i.quotedTotal ? ` · saw ${usd(i.quotedTotal)} total` : ""}`, body],
    button: { label: "Reply in the host inbox", url },
    afterButton: ["Reply from the host inbox so the answer shows in the guest's conversation. You can send a 24-hour special offer from there."],
  });
}

export function guestInquiryEmail(i: Inquiry, body: string, url: string, kind: "received" | "reply") {
  const first = i.guestName.split(" ")[0] || "there";
  return noticeEmail(kind === "received" ? {
    subject: `We got your message about ${homeName(i.propertyKey)}`,
    preheader: "We usually reply within an hour.",
    heading: `Thanks, ${first}`,
    paragraphs: ["We got your message and usually reply within an hour. Nothing is booked or charged.", body],
    button: { label: "Open your conversation", url },
    afterButton: ["Keep this email: the button opens your private conversation with us."],
  } : {
    subject: `Oscar & Fernanda replied about ${homeName(i.propertyKey)}`,
    preheader: preview(body),
    heading: `Hi ${first}, you have a new message`,
    paragraphs: [`Oscar & Fernanda replied about ${homeName(i.propertyKey)} (${datesText(i)}):`, body],
    button: { label: "Open your conversation", url },
    afterButton: ["You can reply in the conversation."],
  });
}

/** After a guest message: email (and text, when on) the host. Grouped: none while an alert under 10 minutes old is unread. Never throws. */
export async function alertHostInquiry(db: Db, inquiryId: string, body: string, origin: string, first: boolean, env: NodeJS.ProcessEnv = process.env, fetchImpl: Fetch = fetch, now = new Date()) {
  try {
    const email = !!env.RESEND_API_KEY, text = hostTextsOn(env);
    if (!email && !text) return "off";
    const claimed = await db.query(
      `UPDATE inquiries i SET host_alert_at = $2 WHERE i.id = $1 AND (i.host_alert_at IS NULL OR i.host_alert_at < $3
         OR NOT EXISTS (SELECT 1 FROM inquiry_messages m WHERE m.inquiry_id = i.id AND m.sender = 'guest' AND m.read_at IS NULL AND m.created_at < $2 AND m.created_at >= i.host_alert_at))
       RETURNING id`, [inquiryId, now.toISOString(), new Date(now.getTime() - ALERT_GAP_MS).toISOString()]);
    if (!claimed.length) return "grouped";
    const i = await getInquiry(db, inquiryId);
    if (!i) return "failed";
    const url = `${origin}/host/i/${inquiryId}`, out: string[] = [];
    if (email) {
      try { await sendEmail(env.HOST_ALERT_EMAIL || HOST_EMAIL_DEFAULT, hostInquiryEmail(i, body, url, first), `inq-host-${inquiryId}-${now.getTime()}`, env, fetchImpl); out.push("email"); }
      catch (e) { console.error("[inquiry] host alert email failed", (e as Error).message.slice(0, 200)); }
    }
    if (text) {
      const gsm = (x: string) => x.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
      try {
        await sendSms(toE164(env.HOST_ALERT_PHONE || "") ?? HOST_ALERT_PHONE_DEFAULT,
          gsm(`Pearl Heights: ${first ? "question" : "message"} from ${i.guestName.split(" ")[0]} (${homeName(i.propertyKey)}, ${datesText(i)}): "${preview(body, 90)}" Reply: ${url}`), env, fetchImpl);
        out.push("text");
      } catch (e) { console.error("[inquiry] host alert text failed", (e as Error).message.slice(0, 200)); }
    }
    return out.length ? "sent:" + out.join("+") : "failed";
  } catch (e) { console.error("[inquiry] host alert failed", (e as Error).message.slice(0, 200)); return "failed"; }
}

/** Guest emails (only with GUEST_EMAILS on): "we got your message" right away, and "we replied" (grouped). Never throws. */
export async function alertGuestInquiry(db: Db, inquiryId: string, body: string, origin: string, kind: "received" | "reply", env: NodeJS.ProcessEnv = process.env, fetchImpl: Fetch = fetch, now = new Date()) {
  try {
    if (!emailEnabled(env)) return "off";
    if (kind === "reply") {
      const claimed = await db.query(
        `UPDATE inquiries i SET guest_alert_at = $2 WHERE i.id = $1 AND (i.guest_alert_at IS NULL OR i.guest_alert_at < $3
           OR NOT EXISTS (SELECT 1 FROM inquiry_messages m WHERE m.inquiry_id = i.id AND m.sender = 'host' AND m.read_at IS NULL AND m.created_at < $2 AND m.created_at >= i.guest_alert_at))
         RETURNING id`, [inquiryId, now.toISOString(), new Date(now.getTime() - ALERT_GAP_MS).toISOString()]);
      if (!claimed.length) return "grouped";
    }
    const i = await getInquiry(db, inquiryId);
    if (!i) return "failed";
    const token = await issueLink(db, i, now);
    await sendEmail(i.guestEmail, guestInquiryEmail(i, body, `${origin}/m/${token}`, kind), `inq-guest-${kind}-${inquiryId}-${now.getTime()}`, env, fetchImpl);
    return "sent";
  } catch (e) { console.error("[inquiry] guest email failed", (e as Error).message.slice(0, 200)); return "failed"; }
}

/** Checkout link for an offer: the guest's own private link token carries it. */
export const offerUrl = (o: Pick<Offer, "propertyKey" | "checkIn" | "checkOut" | "adults" | "children" | "infants">, token: string) =>
  `/?${new URLSearchParams({ home: o.propertyKey, checkIn: o.checkIn, checkOut: o.checkOut, adults: String(o.adults), children: String(o.children), infants: String(o.infants), offer: token })}`;
