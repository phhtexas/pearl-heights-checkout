import type { Db } from "../db/client";
import { getProperty } from "../domain/properties";
import { chicagoInstant, formatChicagoDateTime, todayChicago } from "../domain/time";
import { issueStayLink } from "./stayLinks";
import { emailEnabled, noticeEmail, sendEmail, type NoticeContent } from "./email";
import { sendSms, smsEnabled, toE164 } from "./sms";

/**
 * Follow-up guest notices after the confirmation (Oscar, Nov 18). Each is sent at most once per booking and channel
 * (guest_messages unique row), from the maintenance cron. All are OFF unless GUEST_EMAILS=on (texts: GUEST_TEXTS=on, and
 * only to guests whose confirmation text went out, i.e. who ticked the booking-text box). Never the address, door codes
 * or Wi-Fi: the private stay link carries those once the paperwork is done.
 *
 *  Texts go out for the paperwork reminders and check-in day (at most 4 texts per booking, with the confirmation).
 *  - paperwork_reminder_1: agreement or ID still missing halfway to the deadline (24h rule: 12 h after booking;
 *    2h rules: 1 h after booking). Email + text.
 *  - paperwork_reminder_2: still missing 2 h before a 24h-rule deadline. Email + text.
 *  - balance_upcoming: split plans, 3 days before the second charge (skipped if they booked inside that window).
 *  - balance_failed: the second charge was declined; states the 72-hour cure deadline (Booking Terms §6).
 *  - balance_approval: the bank asked the guest to approve the second charge (F17): button to approve on the stay page.
 *  - balance_paid: the second charge went through. Our own receipt (Oscar, Nov 20: Stripe's receipt emails stay off; the
 *    booking confirmation and the cancellation email already carry the first payment and refunds).
 *  - checkin_day: 8:00 AM CT on check-in day: portal button (or the paperwork button if still not done). Email + text.
 *  - cancellation: booking cancelled; refund amount when Stripe has recorded it.
 */
export type NoticeKind = "paperwork_reminder_1" | "paperwork_reminder_2" | "balance_upcoming" | "balance_failed" | "balance_approval" | "balance_paid" | "checkin_day" | "cancellation";

const ACTIVE = new Set(["confirmed", "verified", "access_released"]);
const CANCELLED = new Set(["cancelled", "cancelled_unverified", "closed"]);
const H = 3_600_000;

export interface NoticeRow {
  id: string; ref: string; state: string; confirmedAt: Date; deadlineAt: Date | null; rule: string | null;
  propertyKey: string; checkIn: string; checkOut: string; firstName: string; email: string; phone: string;
  agreementDone: boolean; idDone: boolean; textedConfirmation: boolean;
  balance: { cents: number; status: string; scheduledFor: Date | null; cureDeadline: Date | null; declined: boolean } | null;
  refundedCents: number;
}

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dayOf = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric" });
export function shortRange(a: string, b: string) {
  const d = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  return a.slice(0, 7) === b.slice(0, 7) ? `${d(a, { month: "short", day: "numeric" })}–${d(b, { day: "numeric" })}` : `${d(a, { month: "short", day: "numeric" })} – ${d(b, { month: "short", day: "numeric" })}`;
}

/** Which notices are due for one booking right now (pure: easy to test). */
export function dueNotices(r: NoticeRow, now: Date): NoticeKind[] {
  const out: NoticeKind[] = [];
  const t = now.getTime();
  if (ACTIVE.has(r.state)) {
    const done = r.agreementDone && r.idDone;
    if (!done && r.deadlineAt && t < r.deadlineAt.getTime()) {
      const first = r.rule === "24h" ? 12 * H : 1 * H;
      // The final reminder replaces the first if both are due at once (e.g. the cron was down): never two in a row.
      if (r.rule === "24h" && t >= r.deadlineAt.getTime() - 2 * H) out.push("paperwork_reminder_2");
      else if (t >= r.confirmedAt.getTime() + first) out.push("paperwork_reminder_1");
    }
    const b = r.balance;
    if (b && b.status === "scheduled" && b.scheduledFor) {
      const due = b.scheduledFor.getTime();
      if (t < due && t >= due - 72 * H && r.confirmedAt.getTime() < due - 72 * H) out.push("balance_upcoming");
    }
    if (b && b.declined && b.status === "retrying" && b.cureDeadline && t < b.cureDeadline.getTime()) out.push("balance_failed");
    if (b && b.status === "requires_action" && b.cureDeadline && t < b.cureDeadline.getTime()) out.push("balance_approval");
    if (b && b.status === "paid") out.push("balance_paid");
    const eight = chicagoInstant(r.checkIn, 8).getTime();
    if (todayChicago(now) === r.checkIn && t >= eight && r.confirmedAt.getTime() < chicagoInstant(r.checkIn, 0).getTime()) out.push("checkin_day");
  }
  if (CANCELLED.has(r.state)) out.push("cancellation");
  return out;
}

export function noticeContent(kind: NoticeKind, r: NoticeRow, link: string | null): NoticeContent {
  const home = getProperty(r.propertyKey).name, dates = shortRange(r.checkIn, r.checkOut);
  const deadline = r.deadlineAt ? formatChicagoDateTime(r.deadlineAt) : "";
  const missing = [...(r.agreementDone ? [] : ["Sign the rental agreement"]), ...(r.idDone ? [] : ["Verify your ID"])];
  const steps = { label: "Complete required steps", url: link ?? "" };
  switch (kind) {
    case "paperwork_reminder_1":
    case "paperwork_reminder_2": {
      const final = kind === "paperwork_reminder_2";
      return {
        subject: final ? `Final reminder: finish your booking steps by ${deadline}` : `Reminder: your booking steps for ${home} are due ${deadline}`,
        preheader: `About 2 minutes: ${missing.join(" and ").toLowerCase()}.`,
        heading: final ? `Almost there, ${r.firstName}` : `A quick reminder, ${r.firstName}`,
        paragraphs: [`Your stay at ${home} (${dates}, booking ${r.ref}) still needs ${missing.length === 1 ? "one step" : "two steps"}, due by ${deadline}:`],
        list: missing, button: steps,
        afterButton: ["It takes about 2 minutes. Once both are complete, your check-in details will be in your guest portal."],
      };
    }
    case "balance_upcoming":
      return {
        subject: `Your second payment for ${home} is scheduled for ${dayOf(r.balance!.scheduledFor!)}`,
        preheader: `${usd(r.balance!.cents)} will be charged to the card you used at checkout.`,
        heading: "Your second payment is coming up",
        paragraphs: [`Hi ${r.firstName}, the second payment of ${usd(r.balance!.cents)} for your stay at ${home} (${dates}, booking ${r.ref}) will be charged on ${dayOf(r.balance!.scheduledFor!)} to the card you used at checkout.`,
          "No action is needed. If you'd like to use a different card, reply to this email before then and we'll send you a secure Stripe link. Please never email card details."],
      };
    case "balance_failed":
      return {
        subject: `Action needed: your second payment for ${home} didn't go through`,
        preheader: `Please contact us by ${formatChicagoDateTime(r.balance!.cureDeadline!)}.`,
        heading: "Your second payment didn't go through",
        paragraphs: [`Hi ${r.firstName}, your bank declined the ${usd(r.balance!.cents)} payment for your stay at ${home} (${dates}, booking ${r.ref}). We'll try the card again.`,
          `To keep your reservation, please reply to this email by ${formatChicagoDateTime(r.balance!.cureDeadline!)} and we'll send a secure Stripe link to update your payment method or pay the balance. Please never email card details.`],
      };
    case "balance_approval":
      return {
        subject: `Action needed: approve your second payment for ${home}`,
        preheader: `Please approve it by ${formatChicagoDateTime(r.balance!.cureDeadline!)}.`,
        heading: "Your bank asked you to approve a payment",
        paragraphs: [`Hi ${r.firstName}, your bank wants you to confirm the ${usd(r.balance!.cents)} second payment for your stay at ${home} (${dates}, booking ${r.ref}). Nothing has been charged yet.`,
          `To keep your reservation, please open your guest portal and tap Approve payment by ${formatChicagoDateTime(r.balance!.cureDeadline!)}. It takes a minute and goes through your bank's usual check.`],
        button: { label: "Approve payment", url: link ?? "" },
      };
    case "balance_paid":
      return {
        subject: `Payment received: your stay at ${home} is paid in full`,
        preheader: `We received your second payment of ${usd(r.balance!.cents)}.`,
        heading: "Your second payment went through",
        paragraphs: [`Hi ${r.firstName}, we received your second payment of ${usd(r.balance!.cents)} for your stay at ${home} (${dates}, booking ${r.ref}), charged to the card you used at checkout.`,
          "Your booking is now paid in full. Nothing more is due."],
        button: { label: "View my stay", url: link ?? "" },
        afterButton: ["Keep this email as your receipt for the second payment."],
      };
    case "checkin_day": {
      const done = r.agreementDone && r.idDone;
      return done ? {
        subject: `Welcome! Your check-in details for ${home} are ready`,
        preheader: "Check-in is after 4:00 PM today.",
        heading: `Today's the day, ${r.firstName}!`,
        paragraphs: [`Your stay at ${home} starts today. Check-in is after 4:00 PM and check-out is by 10:00 AM on your last day.`,
          "Your address, entry instructions and Wi-Fi are in your guest portal."],
        button: { label: "Open my guest portal", url: link ?? "" },
      } : {
        subject: `Check-in today: finish your booking steps to get your details`,
        preheader: "Your check-in details unlock once both steps are done.",
        heading: `Check-in is today, ${r.firstName}`,
        paragraphs: [`Your stay at ${home} starts today (check-in after 4:00 PM). Your address and entry instructions unlock in your guest portal once these are done:`],
        list: missing, button: steps, afterButton: ["It takes about 2 minutes."],
      };
    }
    case "cancellation":
      return {
        subject: `Your booking ${r.ref} at ${home} is cancelled`,
        preheader: r.refundedCents > 0 ? `We've refunded ${usd(r.refundedCents)}.` : "Your cancellation details.",
        heading: "Your booking is cancelled",
        paragraphs: [`Hi ${r.firstName}, your booking ${r.ref} at ${home} (${dates}) has been cancelled.`,
          r.refundedCents > 0
            ? `We've refunded ${usd(r.refundedCents)} to your original payment method. Refunds usually appear within 5–10 business days, depending on your bank.`
            : "Any refund due under our cancellation policy goes back to your original payment method. Refunds usually appear within 5–10 business days, depending on your bank.",
          "Any scheduled payment for this booking has been cancelled."],
      };
  }
}

export function checkinText(r: NoticeRow, link: string) {
  const home = getProperty(r.propertyKey).name;
  return r.agreementDone && r.idDone
    ? `Pearl Heights Homes: Welcome! Check-in at ${home} is after 4:00 PM today. Your address and entry details are in your guest portal: ${link} Reply STOP to opt out.`
    : `Pearl Heights Homes: Check-in at ${home} is today. Sign your agreement and verify your ID to unlock your check-in details (about 2 min): ${link} Reply STOP to opt out.`;
}

export function reminderText(r: NoticeRow, link: string) {
  return `Pearl Heights Homes: Reminder: sign your rental agreement and verify your ID for ${getProperty(r.propertyKey).name} by ${formatChicagoDateTime(r.deadlineAt!)} (about 2 min): ${link} Reply STOP to opt out.`;
}

export async function loadNoticeRows(db: Db, now: Date): Promise<NoticeRow[]> {
  const rows = await db.query<any>(
    `SELECT b.id, b.booking_ref, b.state, b.confirmed_at, b.verification_deadline_at, b.verification_rule,
            q.property_key, q.check_in, q.check_out, g.first_name, g.email, g.phone,
            v.agreement_status, v.id_status,
            (SELECT m.status FROM guest_messages m WHERE m.booking_id = b.id AND m.kind = 'confirmation' AND m.channel = 'sms') AS sms_status,
            sp.amount_cents AS bal_cents, sp.status AS bal_status, sp.scheduled_for, sp.cure_deadline_at, sp.first_decline_at,
            (SELECT COALESCE(SUM(p.refunded_cents), 0) FROM payments p WHERE p.booking_id = b.id) AS refunded
       FROM bookings b
       JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version
       JOIN guests g ON g.id = b.guest_id
       LEFT JOIN verifications v ON v.booking_id = b.id
       LEFT JOIN payments sp ON sp.booking_id = b.id AND sp.kind = 'scheduled'
      WHERE b.confirmed_at IS NOT NULL AND q.check_out >= ($1::date - 1)
        -- Only bookings whose confirmation email went out: test bookings made before emails were on never get notices.
        AND EXISTS (SELECT 1 FROM guest_messages c WHERE c.booking_id = b.id AND c.kind = 'confirmation' AND c.channel = 'email' AND c.status = 'sent')`, [now.toISOString().slice(0, 10)]);
  const d = (v: any) => (v == null ? null : new Date(v));
  const day = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  return rows.map((x) => ({
    id: x.id, ref: x.booking_ref, state: x.state, confirmedAt: new Date(x.confirmed_at), deadlineAt: d(x.verification_deadline_at), rule: x.verification_rule,
    propertyKey: x.property_key, checkIn: day(x.check_in), checkOut: day(x.check_out), firstName: x.first_name, email: x.email, phone: x.phone,
    agreementDone: x.agreement_status === "signed", idDone: x.id_status === "verified", textedConfirmation: x.sms_status === "sent",
    balance: x.bal_status == null ? null : { cents: Number(x.bal_cents), status: x.bal_status, scheduledFor: d(x.scheduled_for), cureDeadline: d(x.cure_deadline_at), declined: x.first_decline_at != null },
    refundedCents: Number(x.refunded),
  }));
}

/** Claim the (booking, kind, channel) slot, run `send`, record the result. Returns false if already claimed. */
async function once(db: Db, bookingId: string, kind: string, channel: "email" | "sms", toLast4: string | null, send: () => Promise<string>): Promise<"sent" | "failed" | "duplicate"> {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO guest_messages (booking_id, kind, channel, to_last4) VALUES ($1, $2, $3, $4)
     ON CONFLICT (booking_id, kind, channel) DO NOTHING RETURNING id`, [bookingId, kind, channel, toLast4]);
  if (!row) return "duplicate";
  try {
    const id = await send();
    await db.query(`UPDATE guest_messages SET status = 'sent', provider_id = $2, sent_at = now() WHERE id = $1`, [row.id, id]);
    return "sent";
  } catch (e) {
    await db.query(`UPDATE guest_messages SET status = 'failed', error = $2 WHERE id = $1`, [row.id, String((e as Error).message).slice(0, 200)]);
    return "failed";
  }
}

export interface NoticeCounts { checked: number; sent: number; failed: number }

export async function sweepGuestNotices(db: Db, origin: string, now = new Date(), env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<NoticeCounts> {
  const c: NoticeCounts = { checked: 0, sent: 0, failed: 0 };
  if (!emailEnabled(env)) return c;
  for (const r of await loadNoticeRows(db, now)) {
    c.checked++;
    for (const kind of dueNotices(r, now)) {
      const needsLink = kind !== "cancellation" && kind !== "balance_upcoming" && kind !== "balance_failed";
      const link = async () => {
        const token = await issueStayLink(db, { bookingRef: r.ref, sessionId: "", channel: "email", now });
        if (!token) throw new Error("no stay link");
        return `${origin}/stay/${token}`;
      };
      const res = await once(db, r.id, kind, "email", null, async () => {
        const m = noticeEmail(noticeContent(kind, r, needsLink ? await link() : null));
        return sendEmail(r.email, m, `${kind}-${r.ref}`, env, fetchImpl);
      });
      if (res === "sent") c.sent++; else if (res === "failed") c.failed++;
      // Texts (reminders and check-in day): only to guests whose confirmation text went out (they ticked the box).
      if ((kind === "paperwork_reminder_1" || kind === "paperwork_reminder_2" || kind === "checkin_day") && r.textedConfirmation && smsEnabled(env)) {
        const to = toE164(r.phone);
        if (to) {
          const s = await once(db, r.id, kind, "sms", to.slice(-4), async () => {
            const token = await issueStayLink(db, { bookingRef: r.ref, sessionId: "", channel: "sms", now });
            if (!token) throw new Error("no stay link");
            const url = `${origin}/stay/${token}`;
            return sendSms(to, kind === "checkin_day" ? checkinText(r, url) : reminderText(r, url), env, fetchImpl);
          });
          if (s === "sent") c.sent++; else if (s === "failed") c.failed++;
        }
      }
    }
  }
  return c;
}
