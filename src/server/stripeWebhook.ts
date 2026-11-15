import Stripe from "stripe";
import type { Db } from "../db/client";

/**
 * Stripe webhooks (test mode). ChatGPT notes 89 and 95:
 *  - Signature verified against the RAW body (bounded at 1 MB by the route) before parsing; 300 s tolerance.
 *  - The event row is inserted once; effects run only for the holder of an atomic, expiring processing claim
 *    (UPDATE ... RETURNING with a token). A concurrent duplicate delivery returns "in_progress" without effects;
 *    a failure releases the claim so Stripe's retry processes it; processed_at is written only by the claim holder.
 *  - Every effect is idempotent: status updates are ordered by Stripe 'created'; refunds are cumulative amounts applied
 *    monotonically; one-time audit rows carry the Stripe event id under a unique index.
 *  - Only a minimal summary is stored. Webhooks never capture, void, cancel, refund or charge.
 */
export class WebhookSignatureError extends Error { name = "WebhookSignatureError"; }
export const WEBHOOK_CLAIM_S = 60;
/** Hard limit on the public webhook body, enforced while reading the stream (note 95). */
export const MAX_WEBHOOK_BYTES = 1_000_000;

export function verifyStripeEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new WebhookSignatureError("missing signature");
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
  } catch {
    throw new WebhookSignatureError("bad signature");
  }
}

type Summary = { type: string; objectId: string | null; status: string | null; amount: number | null; amountRefunded: number | null; fullyRefunded: boolean;
  created: Date; bookingRef: string | null; paymentIntentId: string | null };

function summarize(e: Stripe.Event): Summary {
  const o = e.data.object as unknown as Record<string, any>;
  const pi = e.type.startsWith("payment_intent.") ? o.id : typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id ?? null;
  const amount = typeof o.amount === "number" ? o.amount : null;
  const amountRefunded = typeof o.amount_refunded === "number" ? o.amount_refunded : null;
  return { type: e.type, objectId: typeof o.id === "string" ? o.id : null, status: typeof o.status === "string" ? o.status : null, amount, amountRefunded,
    fullyRefunded: o.refunded === true || (amount != null && amountRefunded != null && amount > 0 && amountRefunded >= amount),
    created: new Date(e.created * 1000), bookingRef: typeof o.metadata?.booking_ref === "string" ? o.metadata.booking_ref : null, paymentIntentId: pi };
}

/** Our payment status for a payment-intent event. Refunds are handled separately (cumulative amounts). */
function statusFor(s: Summary, kind: string): string | null {
  switch (s.type) {
    case "payment_intent.succeeded": return kind === "scheduled" ? "paid" : "captured";
    case "payment_intent.amount_capturable_updated": return kind === "initial" ? "authorized" : null;
    case "payment_intent.canceled": return "voided";
    default: return null;
  }
}
/** Same-second ties: the more final state wins. */
const RANK: Record<string, number> = { scheduled: 0, authorized: 1, retrying: 1, requires_action: 1, manual_review: 1, voided: 2, failed_final: 2,
  captured: 3, paid: 3, partially_refunded: 4, refunded: 5 };

export type WebhookResult = "processed" | "duplicate" | "in_progress" | "ignored";

export async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<WebhookResult> {
  const s = summarize(event);
  await db.query(
    `INSERT INTO webhook_events (source, external_event_id, payload, event_type, object_id, event_created)
     VALUES ('stripe', $1, $2, $3, $4, $5) ON CONFLICT (source, external_event_id) DO NOTHING`,
    [event.id, JSON.stringify({ type: s.type, object: s.objectId, status: s.status, amount: s.amount, amount_refunded: s.amountRefunded }), s.type, s.objectId, s.created.toISOString()]);
  const token = crypto.randomUUID();
  const claimed = await db.query(
    `UPDATE webhook_events SET claim_token = $2, claim_expires_at = now() + make_interval(secs => $3), attempts = attempts + 1
     WHERE source = 'stripe' AND external_event_id = $1 AND processed_at IS NULL AND (claim_token IS NULL OR claim_expires_at < now())
     RETURNING id`, [event.id, token, WEBHOOK_CLAIM_S]);
  if (!claimed.length) {
    const [row] = await db.query<{ processed_at: string | null }>(`SELECT processed_at FROM webhook_events WHERE source = 'stripe' AND external_event_id = $1`, [event.id]);
    return row?.processed_at ? "duplicate" : "in_progress";
  }

  let result: WebhookResult = "ignored";
  try {
    if (s.paymentIntentId) {
      const pays = await db.query<{ id: string; kind: string; status: string }>(
        `SELECT id, kind, status FROM payments WHERE stripe_payment_intent_id = $1`, [s.paymentIntentId]);
      for (const p of pays) {
        if (s.type === "charge.refunded" && s.amountRefunded != null) {
          // Cumulative and monotonic: a newer (larger) refunded amount wins regardless of delivery order.
          const refundStatus = s.fullyRefunded ? "refunded" : s.amountRefunded > 0 ? "partially_refunded" : null;
          const applied = await db.query(
            `UPDATE payments SET refunded_cents = $2,
               status = CASE WHEN $3::text IS NULL THEN status ELSE $3::text END,
               status_event_at = GREATEST(COALESCE(status_event_at, $4::timestamptz), $4::timestamptz)
             WHERE id = $1 AND ($2::int > refunded_cents OR ($2::int = refunded_cents AND $3::text = 'refunded' AND status <> 'refunded')) RETURNING id`,
            [p.id, s.amountRefunded, refundStatus, s.created.toISOString()]);
          if (applied.length) result = "processed";
          continue;
        }
        const next = statusFor(s, p.kind);
        if (!next) continue;
        // Order-safe: apply only if newer than what we applied last (ties: more final state wins); never downgrade refunds.
        const applied = await db.query(
          `UPDATE payments SET status = $2, status_event_at = $3
           WHERE id = $1 AND refunded_cents = 0
             AND (status_event_at IS NULL OR status_event_at < $3 OR (status_event_at = $3 AND $4::int > $5::int)) RETURNING id`,
          [p.id, next, s.created.toISOString(), RANK[next] ?? 0, RANK[p.status] ?? 0]);
        if (applied.length) result = "processed";
      }
      // Wake reconciliation for any queued attempt about this payment (it decides; webhooks never act on money).
      const woke = await db.query(
        `UPDATE checkout_attempts SET next_reconcile_at = now()
         WHERE status = 'needs_reconciliation' AND (reconcile ->> 'paymentIntentId' = $1 OR ($2::text IS NOT NULL AND booking_ref = $2))
         RETURNING attempt_key`, [s.paymentIntentId, s.bookingRef]);
      if (woke.length) result = "processed";
    }
    if (s.type === "charge.dispute.created") {
      const [p] = await db.query<{ booking_id: string }>(`SELECT booking_id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1`, [s.paymentIntentId]);
      const inserted = await db.query(
        `INSERT INTO audit_log (booking_id, actor, action, after, external_event_id) VALUES ($1, 'stripe', 'dispute_opened', $2, $3)
         ON CONFLICT (actor, external_event_id, action) WHERE external_event_id IS NOT NULL DO NOTHING RETURNING id`,
        [p?.booking_id ?? null, JSON.stringify({ amount: s.amount }), event.id]);
      if (inserted.length) console.error("ALERT Stripe dispute opened");
      result = "processed";
    }
    await db.query(`UPDATE webhook_events SET processed_at = now(), last_error = NULL, claim_token = NULL, claim_expires_at = NULL
                    WHERE source = 'stripe' AND external_event_id = $1 AND claim_token = $2`, [event.id, token]);
    return result;
  } catch (e) {
    await db.query(`UPDATE webhook_events SET last_error = $3, claim_token = NULL, claim_expires_at = NULL
                    WHERE source = 'stripe' AND external_event_id = $1 AND claim_token = $2`, [event.id, token, String((e as Error).name).slice(0, 100)]);
    throw e; // 500 -> Stripe retries; the released row is claimed and processed again
  }
}

/** Reads at most `max` bytes from a request body stream (chunked or not); null if it is larger. */
export async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}
