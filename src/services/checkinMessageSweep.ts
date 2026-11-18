import type { Db } from "../db/client";
import type { HospitableAdapter } from "../adapters/types";

/**
 * Safety net for "door codes only on our stay page" (Oscar, Nov 18). Checkout already cancels Hospitable's check-in
 * message right after creating the reservation; this re-checks direct bookings arriving in the next 3 days, in case
 * that call failed or Hospitable rescheduled the message (e.g. after a date change). Runs once an hour from the
 * maintenance cron. Cancelling is idempotent: already-cancelled or sent messages are skipped.
 */
const ACTIVE = ["confirmed", "verified", "access_released", "reservation_created", "capturing", "needs_reconciliation"];

export async function sweepCheckinMessages(db: Db, hosp: HospitableAdapter, now = new Date()): Promise<{ checked: number; cancelled: number; failed: number }> {
  const out = { checked: 0, cancelled: 0, failed: 0 };
  if (!hosp.cancelCheckinMessages) return out;
  const rows = await db.query<{ ref: string; rid: string }>(
    `SELECT b.reservation_ref AS ref, b.hospitable_reservation_id::text AS rid
       FROM bookings b JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version
      WHERE b.hospitable_reservation_id IS NOT NULL AND b.state = ANY($1)
        AND q.check_in BETWEEN ($2::date) AND ($2::date + 3)`,
    [ACTIVE, now.toISOString().slice(0, 10)],
  );
  for (const r of rows) {
    out.checked++;
    try { out.cancelled += await hosp.cancelCheckinMessages(r.rid); }
    catch { out.failed++; console.error("[hospitable] ALERT check-in message sweep failed", r.ref); }
  }
  return out;
}
