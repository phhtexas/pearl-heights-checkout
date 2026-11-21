import type { Db } from "../db/client";
import { getProperty } from "../domain/properties";
import type { Quote } from "../domain/quote";
import { chicagoInstant, formatChicagoDateTime, todayChicago } from "../domain/time";
import { issueStayLink } from "./stayLinks";
import { emailEnabled, noticeEmail, sendEmail, type NoticeContent } from "./email";
import { buildReceipt, buildStayCard, shortDay } from "./emailBlocks";
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
export type NoticeKind = "paperwork_reminder_1" | "paperwork_reminder_2" | "balance_upcoming" | "balance_failed" | "balance_approval" | "balance_paid" | "checkin_day" | "cancellation" | "refund_issued";

const ACTIVE = new Set(["confirmed", "verified", "access_released"]);
const CANCELLED = new Set(["cancelled", "cancelled_unverified", "closed"]);
const H = 3_600_000;

export interface NoticeRow {
  id: string; ref: string; state: string; confirmedAt: Date; deadlineAt: Date | null; rule: string | null;
  propertyKey: string; checkIn: string; checkOut: string; firstName: string; email: string; phone: string;
  agreementDone: boolean; idDone: boolean; textedConfirmation: boolean;
  balance: { cents: number; status: string; scheduledFor: Date | null; cureDeadline: Date | null; declined: boolean } | null;
  refundedCents: number;
  /** Party size for the listing card (Oscar, Nov 21). Optional for older callers and tests. */
  guests?: { adults: number; children: number; infants: number };
  /** Refund email (Oscar, Nov 21): what was paid, the planned refund, when it was issued, and the first payment (for the card). */
  /** Payment summary on the second-payment emails (Oscar, Nov 21): booked quote, first payment, card. */
  pay?: { quote: Quote | null; firstCents: number; firstAt: Date | null; balancePaidAt: Date | null; card?: string };
  refund?: { paidCents: number; plannedCents: number | null; issuedAt: Date | null; firstPaymentIntent: string | null; livemode: boolean; card?: string };
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
  // Separate refund email once Stripe has the whole planned refund (Oscar, Nov 21).
  if (CANCELLED.has(r.state) && r.refundedCents > 0 && (r.refund?.plannedCents == null || r.refundedCents >= r.refund.plannedCents)) out.push("refund_issued");
  return out;
}

/** Every guest notice carries the standard footer (Oscar, Nov 20). */
/** Payment summary for the second-payment emails: first payment, the second one in its current state, balance due. */
function secondPaymentReceipt(r: NoticeRow, second: "due" | "paid" | "declined" | "approval") {
  const q = r.pay?.quote;
  if (!q || !r.balance) return undefined;
  const card = r.pay?.card;
  const first = r.pay!.firstCents || q.plan.dueNow;
  const dueDay = r.balance.scheduledFor ? shortDay(r.balance.scheduledFor) : "";
  const pays = [{ label: `Paid ${shortDay(r.pay!.firstAt ?? r.confirmedAt)}`, cents: first, paid: true, sub: card ? `Paid with ${card}` : undefined }];
  if (second === "paid") pays.push({ label: `Paid ${shortDay(r.pay!.balancePaidAt ?? r.balance.scheduledFor ?? new Date())}`, cents: r.balance.cents, paid: true, sub: card ? `Paid with ${card}` : undefined });
  else pays.push({ label: second === "due" ? `Second payment, due ${dueDay}` : second === "declined" ? "Second payment, declined" : "Second payment, needs your approval",
    cents: r.balance.cents, paid: false, sub: card ? (second === "due" ? `Will be charged to ${card}` : `Card: ${card}`) : undefined });
  return buildReceipt(q, pays);
}
const stayOf = (r: NoticeRow) => buildStayCard({ propertyKey: r.propertyKey, checkIn: r.checkIn, checkOut: r.checkOut, ref: r.ref, ...r.guests });

/** "Sat, Nov 21, 10:15 PM CT" for subject lines. */
function shortDeadline(d: Date | null) {
  return d ? `${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} CT` : "the deadline";
}

export function noticeContent(kind: NoticeKind, r: NoticeRow, link: string | null): NoticeContent {
  return { ...noticeBody(kind, r, link), footer: { bookingRef: r.ref } };
}

function noticeBody(kind: NoticeKind, r: NoticeRow, link: string | null): NoticeContent {
  const home = getProperty(r.propertyKey).name, dates = shortRange(r.checkIn, r.checkOut);
  const deadline = r.deadlineAt ? formatChicagoDateTime(r.deadlineAt) : "";
  const missing = [...(r.agreementDone ? [] : ["Sign the rental agreement"]), ...(r.idDone ? [] : ["Verify your ID"])];
  const steps = { label: "Complete required steps", url: link ?? "" };
  switch (kind) {
    case "paperwork_reminder_1":
    case "paperwork_reminder_2": {
      // Oscar, Nov 21: #4 looks like the confirmation (amber IMPORTANT box); #5, the final one, uses the red urgent box.
      const final = kind === "paperwork_reminder_2";
      const todo = missing.length === 2 ? "Sign the rental agreement and verify your ID" : missing[0] ?? "Complete your steps";
      return {
        subject: final ? "Final reminder: your booking steps are due in 2 hours" : `Reminder: finish your booking steps by ${shortDeadline(r.deadlineAt)}`,
        preheader: `About 2 minutes: ${missing.join(" and ").toLowerCase()}.`,
        heading: final ? `Almost there, ${r.firstName}` : `A quick reminder, ${r.firstName}`,
        subheading: final ? "Your booking steps are due in about 2 hours." : "Your booking steps aren't finished yet.",
        paragraphs: [],
        cta: { title: "Complete your required steps", text: `${todo} by `, bold: deadline, button: steps,
          note: "Takes about 2 minutes. If both aren't done by the deadline, we may cancel your booking with a full refund.",
          important: !final, urgent: final },
        stay: buildStayCard({ propertyKey: r.propertyKey, checkIn: r.checkIn, checkOut: r.checkOut, ref: r.ref, ...r.guests }),
      };
    }
    // Oscar, Nov 21: second-payment emails show the listing card and the full payment summary (with the card).
    case "balance_upcoming": {
      const card = r.pay?.card;
      return {
        subject: `Your second payment is scheduled for ${dayOf(r.balance!.scheduledFor!)}`,
        preheader: `${usd(r.balance!.cents)} will be charged to ${card ?? "the card you used at checkout"}.`,
        heading: "Your second payment is coming up",
        subheading: `Hi ${r.firstName}, here's what to expect.`,
        paragraphs: [`On ${dayOf(r.balance!.scheduledFor!)} we'll charge ${usd(r.balance!.cents)} to ${card ?? "the card you used at checkout"}. No action is needed.`,
          "If you'd like to use a different card, reply to this email before then and we'll send you a secure Stripe link. Please never email card details."],
        stay: stayOf(r), receipt: secondPaymentReceipt(r, "due"),
      };
    }
    case "balance_failed":
      return {
        subject: "Action needed: your second payment didn't go through",
        preheader: `Please reply by ${formatChicagoDateTime(r.balance!.cureDeadline!)} to keep your reservation.`,
        heading: `Hi ${r.firstName}, we need your help`,
        subheading: "Your bank declined your second payment.",
        paragraphs: [],
        cta: { title: "Your second payment didn't go through", text: `Your bank declined the ${usd(r.balance!.cents)} payment. We'll try the card again. To keep your reservation, reply to this email by `,
          bold: formatChicagoDateTime(r.balance!.cureDeadline!), button: { label: "Reply to us", url: `mailto:bookings@pearlheightshomes.com?subject=${encodeURIComponent(`Second payment for ${r.ref}`)}` },
          note: "We'll send you a secure Stripe link to update your card or pay the balance. Please never email card details.", important: true },
        stay: stayOf(r), receipt: secondPaymentReceipt(r, "declined"),
      };
    case "balance_approval":
      return {
        subject: "Action needed: approve your second payment",
        preheader: `Please approve it by ${formatChicagoDateTime(r.balance!.cureDeadline!)}.`,
        heading: `Hi ${r.firstName}, your bank needs a quick OK`,
        subheading: "Your second payment hasn't been charged yet.",
        paragraphs: [],
        cta: { title: "Approve your second payment", text: `Your bank wants you to confirm the ${usd(r.balance!.cents)} payment. To keep your reservation, approve it by `,
          bold: formatChicagoDateTime(r.balance!.cureDeadline!), button: { label: "Pay second payment", url: link ?? "" },
          note: "It takes about a minute and goes through your bank's usual check.", important: true },
        stay: stayOf(r), receipt: secondPaymentReceipt(r, "approval"),
      };
    case "balance_paid": {
      const card = r.pay?.card;
      const when = (r.pay?.balancePaidAt ?? new Date()).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric" });
      return {
        subject: "Payment received: your stay is paid in full",
        preheader: `We received your second payment of ${usd(r.balance!.cents)}.`,
        heading: "Your stay is paid in full",
        subheading: `Hi ${r.firstName}, your second payment went through.`,
        paragraphs: [],
        refundBox: { title: "Paid in full", rows: [["Payment date", when], ["Amount", usd(r.balance!.cents)], ...(card ? [["Charged to", card] as [string, string]] : [])],
          note: "Nothing more is due for this booking." },
        stay: stayOf(r), receipt: secondPaymentReceipt(r, "paid"),
      };
    }
    case "checkin_day": {
      const done = r.agreementDone && r.idDone;
      return done ? {
        subject: `Welcome! Your check-in details for ${home} are ready`,
        preheader: "Check-in is after 4:00 PM today.",
        heading: `Today's the day, ${r.firstName}!`,
        paragraphs: [`Your stay at ${home} starts today. Check-in is after 4:00 PM and check-out is by 10:00 AM on your last day.`,
          "Your address, entry instructions and Wi-Fi are on your private stay page."],
        button: { label: "Open my stay page", url: link ?? "" },
      } : {
        subject: `Check-in today: finish your booking steps to get your details`,
        preheader: "Your check-in details unlock once both steps are done.",
        heading: `Check-in is today, ${r.firstName}`,
        paragraphs: [`Your stay at ${home} starts today (check-in after 4:00 PM). Your address and entry instructions unlock on your private stay page once these are done:`],
        list: missing, button: steps, afterButton: ["It takes about 2 minutes."],
      };
    }
    case "cancellation":
      return {
        subject: `Your booking ${r.ref} at ${home} is cancelled`,
        preheader: r.refundedCents > 0 ? `Your refund of ${usd(r.refundedCents)} has been issued.` : "Your cancellation details.",
        heading: "Your booking is cancelled",
        paragraphs: [`Hi ${r.firstName}, your booking ${r.ref} at ${home} (${dates}) has been cancelled.`,
          r.refundedCents > 0
            ? `Your refund of ${usd(r.refundedCents)} has been issued. We'll send you a separate email with the refund details.`
            : "Any refund due under our cancellation policy goes back to your original payment method. Refunds usually appear within 5–10 business days, depending on your bank.",
          "Any scheduled payment for this booking has been cancelled."],
      };
    case "refund_issued": {
      // Oscar, Nov 21 (modelled on a retailer refund email): refund box, the cancelled booking, refund details.
      const f = r.refund;
      const paid = f?.paidCents || r.refundedCents;
      const kept = Math.max(0, paid - r.refundedCents);
      const when = new Date(f?.issuedAt ?? Date.now()).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric" });
      return {
        subject: `Your refund for booking ${r.ref} was issued`,
        preheader: `We refunded ${usd(r.refundedCents)}${f?.card ? ` to your ${f.card.replace(/\u00A0••••\u00A0/, " ending in ")}` : ""}.`,
        heading: "Your refund was issued",
        subheading: `Hi ${r.firstName}, we've refunded your booking.`,
        paragraphs: [],
        refundBox: { rows: [["Refund date", when], ["Refund total", usd(r.refundedCents)], ...(f?.card ? [["Refunded to", f.card] as [string, string]] : [])],
          note: "Refunds usually appear within 5–10 business days, depending on your bank. If you don't see it after that, check with your bank first, then reply to this email." },
        stayTitle: "Your cancelled booking",
        stay: buildStayCard({ propertyKey: r.propertyKey, checkIn: r.checkIn, checkOut: r.checkOut, ref: r.ref, ...r.guests }),
        receipt: { title: "Refund details", totalLabel: "Refund total (USD)", lines: [["Total paid", usd(paid)], ...(kept > 0 ? [["Kept under the cancellation policy", `−${usd(kept)}`] as [string, string]] : [])],
          total: usd(r.refundedCents), payments: [] },
      };
    }
  }
}

export function checkinText(r: NoticeRow, link: string) {
  const home = getProperty(r.propertyKey).name;
  return r.agreementDone && r.idDone
    ? `Pearl Heights Homes: Welcome! Check-in at ${home} is after 4:00 PM today. Your address and entry details are on your private stay page: ${link} Reply STOP to opt out.`
    : `Pearl Heights Homes: Check-in at ${home} is today. Sign your agreement and verify your ID to unlock your check-in details (about 2 min): ${link} Reply STOP to opt out.`;
}

export function reminderText(r: NoticeRow, link: string) {
  return `Pearl Heights Homes: Reminder: sign your rental agreement and verify your ID for ${getProperty(r.propertyKey).name} by ${formatChicagoDateTime(r.deadlineAt!)} (about 2 min): ${link} Reply STOP to opt out.`;
}

export async function loadNoticeRows(db: Db, now: Date): Promise<NoticeRow[]> {
  const rows = await db.query<any>(
    `SELECT b.id, b.booking_ref, b.state, b.confirmed_at, b.verification_deadline_at, b.verification_rule,
            q.property_key, q.check_in, q.check_out, q.adults, q.children, q.infants, q.livemode, g.first_name, g.email, g.phone,
            (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p WHERE p.booking_id = b.id AND p.kind IN ('initial', 'scheduled') AND p.stripe_payment_intent_id IS NOT NULL
               AND p.status IN ('captured', 'paid', 'partially_refunded', 'refunded')) AS paid_cents,
            (SELECT p.stripe_payment_intent_id FROM payments p WHERE p.booking_id = b.id AND p.kind = 'initial' ORDER BY p.created_at LIMIT 1) AS first_pi,
            (SELECT p.amount_cents FROM payments p WHERE p.booking_id = b.id AND p.kind = 'initial' ORDER BY p.created_at LIMIT 1) AS first_cents,
            (SELECT p.created_at FROM payments p WHERE p.booking_id = b.id AND p.kind = 'initial' ORDER BY p.created_at LIMIT 1) AS first_at,
            q.line_items, sp.status_event_at AS bal_event_at,
            (SELECT MAX(a.at) FROM audit_log a WHERE a.booking_id = b.id AND a.action = 'refund_issued') AS refund_at,
            (SELECT a.after->>'refund' FROM audit_log a WHERE a.booking_id = b.id AND a.action = 'host_cancel_planned' ORDER BY a.id DESC LIMIT 1) AS planned_refund,
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
    guests: { adults: Number(x.adults ?? 0), children: Number(x.children ?? 0), infants: Number(x.infants ?? 0) },
    pay: { quote: x.line_items == null ? null : (typeof x.line_items === "string" ? JSON.parse(x.line_items) : x.line_items) as Quote,
      firstCents: Number(x.first_cents ?? 0), firstAt: d(x.first_at) ?? new Date(x.confirmed_at), balancePaidAt: x.bal_status === "paid" ? d(x.bal_event_at) : null },
    refund: { paidCents: Number(x.paid_cents ?? 0), plannedCents: x.planned_refund == null ? null : Number(x.planned_refund), issuedAt: d(x.refund_at),
      firstPaymentIntent: x.first_pi ?? null, livemode: !!x.livemode },
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

export async function sweepGuestNotices(db: Db, origin: string, now = new Date(), env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch,
  /** Card brand + last 4 for the refund email, from Stripe in the booking's mode. Optional: the email works without it. */
  cardFor?: (livemode: boolean, paymentIntentId: string) => Promise<string | undefined>): Promise<NoticeCounts> {
  const c: NoticeCounts = { checked: 0, sent: 0, failed: 0 };
  if (!emailEnabled(env)) return c;
  for (const r of await loadNoticeRows(db, now)) {
    c.checked++;
    for (const kind of dueNotices(r, now)) {
      const needsLink = kind !== "cancellation" && kind !== "refund_issued" && kind !== "balance_upcoming" && kind !== "balance_failed";
      const link = async () => {
        const token = await issueStayLink(db, { bookingRef: r.ref, sessionId: "", channel: "email", now });
        if (!token) throw new Error("no stay link");
        return `${origin}/stay/${token}`;
      };
      if (cardFor && r.refund?.firstPaymentIntent && (kind === "refund_issued" || kind.startsWith("balance_")) && !r.refund.card) {
        r.refund.card = await cardFor(r.refund.livemode, r.refund.firstPaymentIntent).catch(() => undefined);
        if (r.pay) r.pay.card = r.refund.card;
      }
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
