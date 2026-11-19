import type { Db } from "../db/client";
import { issueStayLink } from "./stayLinks";

/**
 * Booking texts through Twilio (Oscar, Nov 18). OFF unless GUEST_TEXTS=on and the Twilio settings are present
 * (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM = our verified toll-free number in +1 format).
 * Transactional only: about the guest's own booking, to the number they gave at checkout. Never the address,
 * door codes or Wi-Fi; only the private stay link. Twilio API: POST /2010-04-01/Accounts/{sid}/Messages.json.
 */
export function smsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.GUEST_TEXTS === "on" && !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && /^\+1\d{10}$/.test(env.TWILIO_FROM ?? "");
}

/** US numbers only: 10 digits, or 11 starting with 1. Anything else is not texted. */
export function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10 && /^[2-9]/.test(d)) return "+1" + d;
  if (d.length === 11 && d.startsWith("1") && /^[2-9]/.test(d[1]!)) return "+" + d;
  return null;
}

export function confirmationText(o: { homeName: string; dates: string; deadline: string; link: string }) {
  return `Pearl Heights Homes: You're booked at ${o.homeName}, ${o.dates}! ` +
    `Complete your required steps (about 2 min) by ${o.deadline}: ${o.link} Reply STOP to opt out.`;
}

export async function sendSms(to: string, body: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const sid = env.TWILIO_ACCOUNT_SID!, auth = Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM!, Body: body }), signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  if (!res.ok || !j.sid) throw new Error(`twilio ${res.status} ${j.code ?? ""}`.trim());
  return j.sid;
}

/**
 * Text the booking confirmation once. Idempotent per booking (guest_messages unique row); never throws, never blocks
 * the booking. Returns what happened for the log.
 */
export async function textConfirmation(db: Db, o: { bookingRef: string; phone: string; homeName: string; dates: string; deadline: string; origin: string },
  env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<"off" | "bad_number" | "duplicate" | "sent" | "failed"> {
  if (!smsEnabled(env)) return "off";
  const to = toE164(o.phone);
  if (!to) return "bad_number";
  const [b] = await db.query<{ id: string }>(`SELECT id FROM bookings WHERE booking_ref = $1 AND confirmed_at IS NOT NULL`, [o.bookingRef]);
  if (!b) return "failed";
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO guest_messages (booking_id, kind, channel, to_last4) VALUES ($1, 'confirmation', 'sms', $2)
     ON CONFLICT (booking_id, kind, channel) DO NOTHING RETURNING id`, [b.id, to.slice(-4)]);
  if (!row) return "duplicate";
  try {
    const token = await issueStayLink(db, { bookingRef: o.bookingRef, sessionId: "", channel: "sms" });
    if (!token) throw new Error("no stay link");
    const id = await sendSms(to, confirmationText({ homeName: o.homeName, dates: o.dates, deadline: o.deadline, link: `${o.origin}/stay/${token}` }), env, fetchImpl);
    await db.query(`UPDATE guest_messages SET status = 'sent', provider_id = $2, sent_at = now() WHERE id = $1`, [row.id, id]);
    return "sent";
  } catch (e) {
    await db.query(`UPDATE guest_messages SET status = 'failed', error = $2 WHERE id = $1`, [row.id, String((e as Error).message).slice(0, 200)]);
    return "failed";
  }
}
