import type { Db } from "../db/client";
import { envForLivemode } from "../server/mode";
import { identityClient } from "./identity";

/**
 * Privacy Notice §4 and §10 (Oscar, Nov 19: build before launch): 120 days after check-out we ask Stripe to redact the
 * guest's ID verification session (POST /v1/identity/verification_sessions/{id}/redact) and delete our own reference
 * to it. Skipped while a booking has a legal hold (verifications.legal_hold). Runs from the maintenance cron; a failed
 * call is retried on the next run. Each booking's session is redacted with the keys of the mode it was paid in.
 */
type Redactor = (sessionId: string, livemode: boolean) => Promise<void>;
const stripeRedact: Redactor = async (id, livemode) => { await identityClient(envForLivemode(livemode)).verificationSessions.redact(id); };

export async function redactDueVerifications(db: Db, now = new Date(), redact: Redactor = stripeRedact, limit = 20): Promise<{ due: number; redacted: number; failed: number }> {
  const rows = await db.query<{ booking_id: string; session: string; livemode: boolean }>(
    `SELECT v.booking_id, v.stripe_verification_session AS session, COALESCE(q.livemode, false) AS livemode
       FROM verifications v
       JOIN bookings b ON b.id = v.booking_id
       LEFT JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version
      WHERE v.redact_after <= $1 AND v.redacted_at IS NULL AND NOT v.legal_hold AND v.stripe_verification_session IS NOT NULL
      ORDER BY v.redact_after LIMIT $2`, [now.toISOString(), limit]);
  let redacted = 0, failed = 0;
  for (const r of rows) {
    try {
      if (/^vs_[A-Za-z0-9]{8,64}$/.test(r.session)) await redact(r.session, !!r.livemode);
      await db.tx([
        [`UPDATE verifications SET redacted_at = $2, stripe_verification_session = NULL, id_method = NULL WHERE booking_id = $1 AND redacted_at IS NULL`, [r.booking_id, now.toISOString()]],
        [`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'system', 'id_redacted', $2::jsonb)`, [r.booking_id, JSON.stringify({ at: now.toISOString() })]],
      ]);
      redacted++;
    } catch (e) {
      failed++;
      console.error("[id redaction] failed; will retry", r.booking_id, String((e as Error).message).slice(0, 120));
    }
  }
  return { due: rows.length, redacted, failed };
}
