import type { Db } from "../db/client";
import { issueStayLink } from "./stayLinks";

/**
 * Booking confirmation email through Resend (Oscar, Nov 18). Sent to every direct booking (transactional: no opt-in
 * needed), once per booking. OFF unless GUEST_EMAILS=on and RESEND_API_KEY is set; the sending domain
 * (pearlheightshomes.com) must be verified in Resend first. Never the street address, door codes or Wi-Fi: only the
 * private stay link, where the guest signs and verifies ID. Resend API: POST https://api.resend.com/emails.
 */
export const EMAIL_FROM_DEFAULT = "Pearl Heights Homes <bookings@pearlheightshomes.com>";
export const REPLY_TO = "bookings@pearlheightshomes.com";

export function emailEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.GUEST_EMAILS === "on" && !!env.RESEND_API_KEY;
}

export interface ConfirmationEmailData {
  firstName: string;
  homeName: string;
  photoUrl?: string;
  bookingRef: string;
  dates: string;            // "Feb 10–13"
  guests: number;
  deadline: string;         // "Monday, February 9, 2027 at 4:00 PM CT"
  link: string;             // private stay link
  paidToday: string;        // "$1,234.56"
  balanceLine?: string;     // "$600.00 on Tue, Jan 26"
  nonRefundable: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function confirmationEmail(d: ConfirmationEmailData): { subject: string; html: string; text: string } {
  const subject = `You're booked at ${d.homeName}, ${d.dates} (${d.bookingRef})`;
  const guests = `${d.guests} ${d.guests === 1 ? "guest" : "guests"}`;
  const cancel = d.nonRefundable
    ? "This reservation is non-refundable."
    : "Free cancellation: cancel within 24 hours of booking for a full refund.";
  const paid = `Paid today: ${d.paidToday}${d.balanceLine ? ` · ${d.balanceLine}` : ""}`;

  const text = [
    `You're booked, ${d.firstName}!`,
    "Payment received. Your dates are reserved.",
    "",
    "COMPLETE YOUR REQUIRED STEPS",
    `Sign the rental agreement and verify your ID by ${d.deadline}. It takes about 2 minutes.`,
    `Complete required steps: ${d.link}`,
    "Once both are complete, you'll get your check-in details on your stay page.",
    "",
    `${d.homeName}`,
    `Booking ${d.bookingRef}`,
    `${d.dates} · ${guests}`,
    "Check-in after 4:00 PM · Check-out by 10:00 AM",
    "",
    paid,
    cancel,
    "",
    `Questions? Reply to this email or write to ${REPLY_TO}.`,
    "",
    "Pearl Heights Homes · San Antonio, Texas",
    "Keep this email. The link above opens your private stay page.",
  ].join("\n");

  const C = { ink: "#1D1D1F", dim: "#5E5E63", line: "#E3E3E6", green: "#0F6B52", soft: "#F3F7F5", bg: "#F6F6F4" };
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden">Sign the rental agreement and verify your ID by ${esc(d.deadline)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="padding:28px 28px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${C.dim}">Pearl Heights Homes</td></tr>
<tr><td style="padding:0 28px">
  <h1 style="margin:8px 0 6px;font-size:26px;line-height:1.25">You're booked, ${esc(d.firstName)}!</h1>
  <p style="margin:0 0 20px;font-size:16px;color:${C.dim}">Payment received. Your dates are reserved.</p>
</td></tr>
<tr><td style="padding:0 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border:1px solid #CFE3DA;border-radius:12px"><tr><td style="padding:20px">
    <h2 style="margin:0 0 8px;font-size:19px">Complete your required steps</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Sign the rental agreement and verify your ID by <b>${esc(d.deadline)}</b>.</p>
    <a href="${esc(d.link)}" style="display:inline-block;background:${C.green};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:10px">Complete required steps &rarr;</a>
    <p style="margin:12px 0 0;font-size:14px;color:${C.dim}">Takes about 2 minutes. Once both are complete, you'll get your check-in details on your stay page.</p>
  </td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px"><tr>
    ${d.photoUrl ? `<td width="112" style="padding:12px 0 12px 12px;vertical-align:top"><img src="${esc(d.photoUrl)}" width="100" height="100" alt="" style="display:block;width:100px;height:100px;object-fit:cover;border-radius:8px"></td>` : ""}
    <td style="padding:12px 14px;vertical-align:top;font-size:14px;line-height:1.5">
      <div style="font-size:16px;font-weight:600">${esc(d.homeName)}</div>
      <div style="color:${C.dim}">Booking ${esc(d.bookingRef)}</div>
      <div>${esc(d.dates)} · ${guests}</div>
      <div style="color:${C.dim}">Check-in after 4:00 PM · Check-out by 10:00 AM</div>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 28px 0;font-size:14px;line-height:1.6;color:${C.dim}">
  <div>${esc(paid)}</div>
  <div>${esc(cancel)}</div>
  <div>Questions? Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:${C.green}">${REPLY_TO}</a>.</div>
</td></tr>
<tr><td style="padding:24px 28px 28px;font-size:12px;color:${C.dim}">Pearl Heights Homes · San Antonio, Texas<br>Keep this email. The button above opens your private stay page.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}

/**
 * Shared layout for the follow-up notices (reminders, payment, check-in day, cancellation): same look as the
 * confirmation. `paragraphs` are plain text (escaped here); `list` renders as bullets; `button` is the one action.
 */
export interface NoticeContent {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  list?: string[];
  button?: { label: string; url: string };
  afterButton?: string[];
}

export function noticeEmail(n: NoticeContent): { subject: string; html: string; text: string } {
  const C = { ink: "#1D1D1F", dim: "#5E5E63", green: "#0F6B52", bg: "#F6F6F4" };
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(s)}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden">${esc(n.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px"><tr><td style="padding:28px">
<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${C.dim};margin-bottom:10px">Pearl Heights Homes</div>
<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3">${esc(n.heading)}</h1>
${n.paragraphs.map(p).join("\n")}
${n.list?.length ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6">${n.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}
${n.button ? `<p style="margin:6px 0 18px"><a href="${esc(n.button.url)}" style="display:inline-block;background:${C.green};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:10px">${esc(n.button.label)} &rarr;</a></p>` : ""}
${(n.afterButton ?? []).map((s) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${C.dim}">${esc(s)}</p>`).join("\n")}
<p style="margin:18px 0 0;font-size:14px;color:${C.dim}">Questions? Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:${C.green}">${REPLY_TO}</a>.</p>
<p style="margin:22px 0 0;font-size:12px;color:${C.dim}">Pearl Heights Homes · San Antonio, Texas</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [n.heading, "", ...n.paragraphs, ...(n.list ?? []).map((l) => `- ${l}`),
    ...(n.button ? ["", `${n.button.label}: ${n.button.url}`] : []), ...(n.afterButton?.length ? ["", ...n.afterButton] : []),
    "", `Questions? Reply to this email or write to ${REPLY_TO}.`, "", "Pearl Heights Homes · San Antonio, Texas"].join("\n");
  return { subject: n.subject, html, text };
}

export async function sendEmail(to: string, m: { subject: string; html: string; text: string }, idempotencyKey: string,
  env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: env.EMAIL_FROM || EMAIL_FROM_DEFAULT, to: [to], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
  if (!res.ok || !j.id) throw new Error(`resend ${res.status} ${j.name ?? ""}`.trim());
  return j.id;
}

/** Email the booking confirmation once. Idempotent per booking; never throws, never blocks the booking. */
export async function emailConfirmation(db: Db, o: Omit<ConfirmationEmailData, "link"> & { email: string; origin: string },
  env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<"off" | "duplicate" | "sent" | "failed"> {
  if (!emailEnabled(env)) return "off";
  const [b] = await db.query<{ id: string }>(`SELECT id FROM bookings WHERE booking_ref = $1 AND confirmed_at IS NOT NULL`, [o.bookingRef]);
  if (!b) return "failed";
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO guest_messages (booking_id, kind, channel) VALUES ($1, 'confirmation', 'email')
     ON CONFLICT (booking_id, kind, channel) DO NOTHING RETURNING id`, [b.id]);
  if (!row) return "duplicate";
  try {
    const token = await issueStayLink(db, { bookingRef: o.bookingRef, sessionId: "", channel: "email" });
    if (!token) throw new Error("no stay link");
    const id = await sendEmail(o.email, confirmationEmail({ ...o, link: `${o.origin}/stay/${token}` }), `confirmation-${o.bookingRef}`, env, fetchImpl);
    await db.query(`UPDATE guest_messages SET status = 'sent', provider_id = $2, sent_at = now() WHERE id = $1`, [row.id, id]);
    return "sent";
  } catch (e) {
    await db.query(`UPDATE guest_messages SET status = 'failed', error = $2 WHERE id = $1`, [row.id, String((e as Error).message).slice(0, 200)]);
    return "failed";
  }
}
