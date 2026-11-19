import type { Db } from "@/db/client";
import { HOMES } from "@/content/homes";
import { HOST_EMAIL_DEFAULT } from "@/services/stayChat";
import { sendEmail } from "@/services/email";
import { formatChicagoDateTime } from "@/domain/time";

/**
 * F17 (Oscar, Nov 19): email the host when a second payment needs attention, once per booking and status:
 *  - requires_action: the guest's bank asked them to approve it (the guest gets an Approve button on the stay page);
 *  - failed_final: still unpaid at the end of the 72-hour window (Oscar decides whether to cancel);
 *  - manual_review: anything else the system won't retry on its own.
 * Claimed in the audit log first, so it's never sent twice; unclaimed if the email fails.
 */
const WHY: Record<string, string> = {
  requires_action: "The guest's bank asked them to approve the second payment. Nothing has been charged. They've been asked (stay page, and by email after launch) to approve it",
  failed_final: "The second payment is still unpaid at the end of the 72-hour window. Under Booking Terms §6 you can cancel the booking (host inbox > Details > Cancel booking)",
  manual_review: "The second payment needs a manual look (the system won't retry it on its own). Check it in Stripe",
};

export async function alertHostPaymentIssues(db: Db, origin: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const rows = await db.query<any>(
    `SELECT b.id, b.booking_ref, q.property_key, q.check_in, q.livemode, p.status, p.amount_cents, p.cure_deadline_at, g.first_name, g.last_name
       FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN quotes q ON q.id = b.quote_id AND q.version = b.quote_version JOIN guests g ON g.id = b.guest_id
      WHERE p.kind = 'scheduled' AND p.status IN ('requires_action', 'failed_final', 'manual_review')
        AND b.state NOT IN ('cancelled', 'cancelled_unverified', 'closed')
        AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.booking_id = b.id AND a.action = 'host_payment_alert_' || p.status)
      LIMIT 20`);
  for (const r of rows) {
    const action = `host_payment_alert_${r.status}`;
    const claimed = await db.query<any>(`INSERT INTO audit_log (booking_id, actor, action, after) SELECT $1, 'system', $2, '{}'::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE booking_id = $1 AND action = $2) RETURNING id`, [r.id, action]);
    if (!claimed.length) continue;
    const home = HOMES[r.property_key]?.title ?? r.property_key, tag = r.livemode ? "" : "TEST · ";
    const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(r.amount_cents) / 100);
    const by = r.cure_deadline_at ? ` Deadline: ${formatChicagoDateTime(new Date(r.cure_deadline_at))}.` : "";
    const subject = `${tag}Second payment needs attention · ${r.booking_ref} · ${home}`;
    const text = `${r.first_name} ${String(r.last_name).slice(0, 1)}. · booking ${r.booking_ref} · ${usd}\n\n${WHY[r.status] ?? WHY.manual_review}.${by}\n\nConversation: ${origin}/host/t/${r.id}`;
    const html = `<p>${text.split("\n\n").map((x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("</p><p>")}</p>`;
    try { await sendEmail(env.HOST_ALERT_EMAIL || HOST_EMAIL_DEFAULT, { subject, text, html }, `${action}-${r.id}`, env, fetchImpl); out.sent++; }
    catch (e) {
      await db.query(`DELETE FROM audit_log WHERE booking_id = $1 AND action = $2`, [r.id, action]).catch(() => undefined);
      console.error("[payment alert] email failed", (e as Error).message);
      out.failed++;
    }
  }
  return out;
}
