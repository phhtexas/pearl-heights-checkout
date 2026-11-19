import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/client";
import { addDaysISO, chicagoInstant } from "../domain/time";

/**
 * Private stay-page links (Oscar, Nov 17: "real bookings", step 1).
 *  - A link is /stay/<token>, where the token is 32 random bytes (base64url). Only its SHA-256 hash is stored
 *    (stay_links, migration 0013), so a database leak doesn't leak working links.
 *  - The confirmation screen can get a link only from the same browser session that requested the booking's quote.
 *  - Links stop working 3 days after check-out (Oscar, Nov 14) or when revoked.
 */
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{40,64}$/.test(t);
/** End of the third day after check-out, Central time. */
export const linkExpiry = (checkOut: string) => chicagoInstant(addDaysISO(checkOut, 3), 23, 59);

export interface StayRow {
  bookingId: string; bookingRef: string; propertyKey: string; checkIn: string; checkOut: string;
  adults: number; children: number; infants: number; firstName: string; lastName: string;
  confirmedAt: string; deadlineAt: string | null;
  agreementSignedAt: string | null; agreementSignedName: string | null; signwellDocumentId: string | null;
  idCheckedAt: string | null; idStatus: string; stripeSession: string | null;
  totalCents: number; paidNowCents: number | null; guestEmail: string; guestPhone: string;
  /** Split bookings: the second payment (amount, when it is charged, and its status: scheduled, paid, failed_final…). */
  balance: { cents: number; dueAt: string; status: string } | null;
  /** Paid in Stripe LIVE mode (pearlheightshomes.com); false = test. */
  livemode: boolean;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));
const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Issue a new link for a confirmed booking, if `sessionId` is the browser session that requested its quote. */
export async function issueStayLink(db: Db, o: { bookingRef: string; sessionId: string; channel: "confirmation" | "email" | "host" | "sms"; now?: Date }): Promise<string | null> {
  const [b] = await db.query<any>(
    `SELECT b.id, q.check_out, q.session_id FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version
     WHERE b.booking_ref = $1 AND b.confirmed_at IS NOT NULL`, [o.bookingRef]);
  if (!b) return null;
  if (o.channel === "confirmation" && (!b.session_id || b.session_id !== o.sessionId)) return null;
  const expires = linkExpiry(day(b.check_out));
  if (expires.getTime() <= (o.now ?? new Date()).getTime()) return null;
  const token = newToken();
  await db.query(`INSERT INTO stay_links (booking_id, token_hash, channel, expires_at) VALUES ($1, $2, $3, $4)`,
    [b.id, hashToken(token), o.channel, expires.toISOString()]);
  return token;
}

/** The booking behind a live link, or null (unknown, expired, revoked, or booking not confirmed). */
export async function loadStay(db: Db, token: string, now = new Date()): Promise<StayRow | null> {
  if (!looksLikeToken(token)) return null;
  const [r] = await db.query<any>(
    `SELECT b.id, b.booking_ref, b.confirmed_at, b.verification_deadline_at,
            q.property_key, q.check_in, q.check_out, q.adults, q.children, q.infants,
            q.total_cents, q.livemode, g.first_name, g.last_name, g.email, g.phone,
            (SELECT p.amount_cents FROM payments p WHERE p.booking_id = b.id AND p.kind = 'initial' LIMIT 1) AS paid_now,
            s.amount_cents AS balance_cents, s.scheduled_for AS balance_at, s.status AS balance_status,
            v.agreement_signed_at, v.agreement_signed_name, v.signwell_document_id, v.id_checked_at, v.id_status, v.stripe_verification_session
       FROM stay_links l
       JOIN bookings b ON b.id = l.booking_id
       JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version
       JOIN guests g ON g.id = b.guest_id
       LEFT JOIN verifications v ON v.booking_id = b.id
       LEFT JOIN payments s ON s.booking_id = b.id AND s.kind = 'scheduled'
      WHERE l.token_hash = $1 AND l.revoked_at IS NULL AND l.expires_at > $2 AND b.confirmed_at IS NOT NULL`,
    [hashToken(token), now.toISOString()]);
  if (!r) return null;
  return {
    bookingId: r.id, bookingRef: r.booking_ref, propertyKey: r.property_key, checkIn: day(r.check_in), checkOut: day(r.check_out),
    adults: Number(r.adults), children: Number(r.children), infants: Number(r.infants), firstName: r.first_name, lastName: r.last_name,
    confirmedAt: iso(r.confirmed_at)!, deadlineAt: iso(r.verification_deadline_at),
    agreementSignedAt: iso(r.agreement_signed_at), agreementSignedName: r.agreement_signed_name ?? null, signwellDocumentId: r.signwell_document_id ?? null,
    idCheckedAt: iso(r.id_checked_at), idStatus: r.id_status ?? "pending", stripeSession: r.stripe_verification_session ?? null,
    totalCents: Number(r.total_cents), paidNowCents: r.paid_now == null ? null : Number(r.paid_now), guestEmail: r.email, guestPhone: r.phone ?? "",
    balance: r.balance_cents == null ? null : { cents: Number(r.balance_cents), dueAt: iso(r.balance_at)!, status: String(r.balance_status) },
    livemode: !!r.livemode,
  };
}

/** Paperwork status, saved so it shows on any device. Each write is a no-op if already recorded. */
export async function recordAgreementSigned(db: Db, bookingId: string, a: { documentId: string; signedAt: string; signedName: string }) {
  await db.tx([
    [`INSERT INTO verifications (booking_id) VALUES ($1) ON CONFLICT (booking_id) DO NOTHING`, [bookingId]],
    [`UPDATE verifications SET agreement_status = 'signed', agreement_signed_at = $2, agreement_signed_name = $3, signwell_document_id = $4
       WHERE booking_id = $1 AND agreement_signed_at IS NULL`, [bookingId, a.signedAt, a.signedName, a.documentId]],
    [`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $1, 'guest', 'agreement_signed', $2::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = 'agreement_signed')`,
      [bookingId, JSON.stringify({ document: a.documentId, at: a.signedAt })]],
  ]);
}

export async function recordIdVerified(db: Db, bookingId: string, a: { sessionId: string; checkedAt: string; checkoutISO: string }) {
  // Privacy notice §4: we keep only the outcome, time and session id; redact 120 days after check-out.
  const redactAfter = new Date(Date.parse(a.checkoutISO + "T00:00:00Z") + 120 * 864e5).toISOString();
  await db.tx([
    [`INSERT INTO verifications (booking_id) VALUES ($1) ON CONFLICT (booking_id) DO NOTHING`, [bookingId]],
    [`UPDATE verifications SET id_status = 'verified', id_method = 'selfie', id_checked_at = $2, stripe_verification_session = $3, redact_after = $4
       WHERE booking_id = $1 AND id_checked_at IS NULL`, [bookingId, a.checkedAt, a.sessionId, redactAfter]],
    [`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $1, 'guest', 'id_verified', $2::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = 'id_verified')`,
      [bookingId, JSON.stringify({ session: a.sessionId, at: a.checkedAt })]],
  ]);
}

export async function recordSigningDocument(db: Db, bookingId: string, documentId: string) {
  await db.tx([
    [`INSERT INTO verifications (booking_id) VALUES ($1) ON CONFLICT (booking_id) DO NOTHING`, [bookingId]],
    [`UPDATE verifications SET signwell_document_id = $2 WHERE booking_id = $1 AND agreement_signed_at IS NULL`, [bookingId, documentId]],
  ]);
}
