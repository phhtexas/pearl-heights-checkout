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
/** Logo at the top right of every email (Oscar, Nov 20). PNG (some mail apps can't show WebP), 2x for sharp phones. */
const LOGO_URL = "https://pearlheightshomes.com/brand/logo-email.png";
const logoImg = `<a href="https://pearlheightshomes.com/" style="text-decoration:none"><img src="${LOGO_URL}" width="80" height="70" alt="Pearl Heights Homes" style="display:block;border:0;width:80px;height:70px"></a>`;
const IG_ICON = "https://pearlheightshomes.com/brand/instagram-email.png";
/** Headline on the left, logo on the right of the same row (Oscar, Nov 20). */
const headRow = (left: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding-right:12px">${left}</td><td valign="middle" align="right" width="80" style="width:80px">${logoImg}</td></tr></table>`;

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
<tr><td style="padding:24px 28px 20px">${headRow(`<h1 style="margin:0 0 6px;font-size:26px;line-height:1.25">You're booked, ${esc(d.firstName)}!</h1>
  <p style="margin:0;font-size:16px;color:${C.dim}">Payment received. Your dates are reserved.</p>`)}</td></tr>
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
  /** Primary call to action in a highlighted box under the headline (Oscar, Nov 20), like the confirmation email's. */
  cta?: { title: string; text: string; button: { label: string; url: string }; note?: string };
  /** Stay card (Oscar, Nov 20): listing name (never the street address), area, and labeled rows (Check-in, Check-out...). */
  stay?: { home: string; area: string; rows: [label: string, value: string][] };
  /** Payment summary (Oscar, Nov 20, like an itemized receipt): price lines, total, then what was paid and what's due. */
  receipt?: { lines: [label: string, amount: string][]; total: string; note?: string; payments: [label: string, amount: string][]; due?: [label: string, amount: string] };
  /** Full footer (Oscar, Nov 20): contact, site links, Instagram, about-this-email and the legal line. */
  footer?: { bookingRef?: string };
}

const SITE_URL = "https://pearlheightshomes.com";
const FOOTER_LINKS: [string, string][] = [["Our homes", "/"], ["About us", "/about"], ["Cancellation policy", "/policies/cancellation"], ["Terms", "/terms"], ["Privacy", "/privacy"]];

function ctaBox(c: NonNullable<NoticeContent["cta"]>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#F3F7F5;border:1px solid #D7E6DF;border-radius:12px"><tr><td style="padding:20px">
<div style="font-size:19px;font-weight:700;margin:0 0 6px">${esc(c.title)}</div>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55">${esc(c.text)}</p>
<a href="${esc(c.button.url)}" style="display:inline-block;background:#0F6B52;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:10px">${esc(c.button.label)} &rarr;</a>
${c.note ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:#5E5E63">${esc(c.note)}</p>` : ""}
</td></tr></table>`;
}

function stayCard(st: NonNullable<NoticeContent["stay"]>) {
  const rows = st.rows.map(([k, v], i) => `<tr><td style="padding:10px 0;${i ? "border-top:1px solid #ECEBE8;" : ""}font-size:13px;color:#5E5E63;width:96px;vertical-align:top">${esc(k)}</td><td style="padding:10px 0;${i ? "border-top:1px solid #ECEBE8;" : ""}font-size:15px;font-weight:600;line-height:1.4">${esc(v)}</td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border:1px solid #E3E3E6;border-radius:12px"><tr><td style="padding:16px 18px">
<div style="font-size:17px;font-weight:700;line-height:1.35">${esc(st.home)}</div><div style="font-size:14px;color:#5E5E63;margin:2px 0 8px">${esc(st.area)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
}

function receiptBlock(r: NonNullable<NoticeContent["receipt"]>) {
  const row = (k: string, v: string, strong = false) => `<tr><td style="padding:7px 0;font-size:15px;${strong ? "font-weight:700;" : ""}">${esc(k)}</td><td align="right" style="padding:7px 0;font-size:15px;white-space:nowrap;${strong ? "font-weight:700;" : ""}">${esc(v)}</td></tr>`;
  const rule = `<tr><td colspan="2" style="padding:6px 0"><div style="border-top:1px solid #E3E3E6;height:1px;line-height:1px">&nbsp;</div></td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;background:#F7F6F3;border-radius:12px"><tr><td style="padding:20px 18px">
<div style="font-size:17px;font-weight:700;margin:0 0 8px">Payment summary</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${r.lines.map(([k, v]) => row(k, v)).join("")}${rule}${row("Total (USD)", r.total, true)}
${r.payments.length ? `${rule}${r.payments.map(([k, v]) => row(k, v)).join("")}` : ""}${r.due ? row(r.due[0], r.due[1], true) : ""}</table>
${r.note ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#5E5E63">${esc(r.note)}</p>` : ""}
</td></tr></table>`;
}

function fullFooter(f: NonNullable<NoticeContent["footer"]>, year: number) {
  const small = (t: string, b: string) => `<p style="margin:0 0 12px;font-size:12px;line-height:1.55;color:#6B6B70"><b style="color:#3A3A3E">${esc(t)}</b><br>${esc(b)}</p>`;
  return `<tr><td style="padding:24px 28px 8px;border-top:1px solid #ECEBE8">
<div style="font-size:16px;font-weight:700;margin:0 0 4px">Questions about your stay?</div>
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#5E5E63">Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:#0F6B52">${REPLY_TO}</a>. Oscar &amp; Fernanda usually reply within an hour.</p>
<p style="margin:0 0 6px;font-size:14px;line-height:2">${FOOTER_LINKS.map(([t, u]) => `<a href="${SITE_URL}${u}" style="display:inline-block;margin-right:18px;color:#1D1D1F;font-weight:600;text-decoration:none;white-space:nowrap">${t}</a>`).join("")}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr>
<td valign="middle" style="padding-right:8px"><a href="https://www.instagram.com/pearlheightshomes" style="text-decoration:none"><img src="${IG_ICON}" width="24" height="24" alt="Instagram" style="display:block;border:0;width:24px;height:24px"></a></td>
<td valign="middle" style="font-size:14px"><a href="https://www.instagram.com/pearlheightshomes" style="color:#0F6B52;text-decoration:none">Follow us on Instagram @pearlheightshomes</a></td></tr></table>
<a href="${SITE_URL}/" style="text-decoration:none"><img src="${LOGO_URL}" width="64" height="56" alt="Pearl Heights Homes" style="display:block;border:0;width:64px;height:56px"></a>
</td></tr>
<tr><td style="padding:16px 12px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEEBE5;border-radius:12px"><tr><td style="padding:18px 16px 20px">
${small("About this email", `This is a service message about your booking${f.bookingRef ? ` ${f.bookingRef}` : ""}. You'll receive booking emails like this one even if you've unsubscribed from our promotional emails.`)}
${small("Your booking record", "Pearl Heights Homes keeps the official record of your booking and payments. If anything in this email doesn't match what you expected, reply and we'll sort it out.")}
<p style="margin:0;font-size:11px;line-height:1.55;color:#8A8A8F;text-transform:uppercase;letter-spacing:.03em">© ${year} PR Portfolio Properties LLC, doing business as Pearl Heights Homes · San Antonio, Texas</p>
</td></tr></table></td></tr>`;
}

export function noticeEmail(n: NoticeContent): { subject: string; html: string; text: string } {
  const C = { ink: "#1D1D1F", dim: "#5E5E63", green: "#0F6B52", bg: "#F6F6F4" };
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(s)}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden">${esc(n.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px"><tr><td style="padding:28px">
<div style="margin:0 0 14px">${headRow(`<h1 style="margin:0;font-size:23px;line-height:1.3">${esc(n.heading)}</h1>`)}</div>
${n.paragraphs.map(p).join("\n")}
${n.cta ? ctaBox(n.cta) : ""}
${n.stay ? stayCard(n.stay) : ""}
${n.list?.length ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6">${n.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}
${n.button ? `<p style="margin:6px 0 18px"><a href="${esc(n.button.url)}" style="display:inline-block;background:${C.green};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:10px">${esc(n.button.label)} &rarr;</a></p>` : ""}
${(n.afterButton ?? []).map((s) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${C.dim}">${esc(s)}</p>`).join("\n")}
${n.receipt ? receiptBlock(n.receipt) : ""}
${n.footer ? "" : `<p style="margin:18px 0 0;font-size:14px;color:${C.dim}">Questions? Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:${C.green}">${REPLY_TO}</a>.</p>
<p style="margin:22px 0 0;font-size:12px;color:${C.dim}">Pearl Heights Homes · San Antonio, Texas</p>`}
</td></tr>${n.footer ? fullFooter(n.footer, new Date().getFullYear()) : ""}</table></td></tr></table></body></html>`;
  const text = [n.heading, "", ...n.paragraphs,
    ...(n.cta ? ["", n.cta.title, n.cta.text, `${n.cta.button.label}: ${n.cta.button.url}`, ...(n.cta.note ? [n.cta.note] : [])] : []),
    ...(n.stay ? ["", n.stay.home, n.stay.area, ...n.stay.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(n.list ?? []).map((l) => `- ${l}`),
    ...(n.button ? ["", `${n.button.label}: ${n.button.url}`] : []), ...(n.afterButton?.length ? ["", ...n.afterButton] : []),
    ...(n.receipt ? ["", "PAYMENT SUMMARY", ...n.receipt.lines.map(([k, v]) => `${k}: ${v}`), `Total (USD): ${n.receipt.total}`,
      ...n.receipt.payments.map(([k, v]) => `${k}: ${v}`), ...(n.receipt.due ? [`${n.receipt.due[0]}: ${n.receipt.due[1]}`] : []), ...(n.receipt.note ? [n.receipt.note] : [])] : []),
    "", `Questions? Reply to this email or write to ${REPLY_TO}.`,
    ...(n.footer ? ["", `Our homes: ${SITE_URL}`, `Cancellation policy: ${SITE_URL}/policies/cancellation`, "",
      `This is a service message about your booking${n.footer.bookingRef ? ` ${n.footer.bookingRef}` : ""}.`,
      `© ${new Date().getFullYear()} PR Portfolio Properties LLC, doing business as Pearl Heights Homes · San Antonio, Texas`] : ["", "Pearl Heights Homes · San Antonio, Texas"])].join("\n");
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
