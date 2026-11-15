import Stripe from "stripe";
import type { Db } from "../db/client";

/**
 * Stripe webhooks (test mode). ChatGPT note 89 requirements:
 *  - The signature is verified against the RAW request body before anything is parsed (Stripe.webhooks.constructEvent,
 *    5-minute tolerance). STRIPE_WEBHOOK_SECRET is server-only.
 *  - The event id is inserted once (UNIQUE(source, external_event_id)) before any effect. A replay of a processed
 *    event is acknowledged without effects; an event whose processing failed is processed again on Stripe's retry.
 *  - Effects are order-safe: a payment status is applied only if the event is newer (Stripe 'created') than the last
 *    status applied, so an old event arriving late never overwrites a newer state. Webhooks never charge, capture,
 *    void or cancel anything: they record facts and wake reconciliation, which decides.
 *  - Only a minimal summary is stored (type, object id, status, amount, created): no customer details.
 */
export class WebhookSignatureError extends Error { name = "WebhookSignatureError"; }

export function verifyStripeEvent(rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new WebhookSignatureError("missing signature");
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
  } catch {
    throw new WebhookSignatureError("bad signature");
  }
}

type Summary = { type: string; objectId: string | null; status: string | null; amount: number | null; created: Date; bookingRef: string | null; paymentIntentId: string | null };

function summarize(e: Stripe.Event): Summary {
  const o = e.data.object as unknown as Record<string, any>;
  const pi = e.type.startsWith("payment_intent.") ? o.id : typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id ?? null;
  return { type: e.type, objectId: typeof o.id === "string" ? o.id : null, status: typeof o.status === "string" ? o.status : null,
    amount: typeof o.amount === "number" ? o.amount : null, created: new Date(e.created * 1000),
    bookingRef: typeof o.metadata?.booking_ref === "string" ? o.metadata.booking_ref : null, paymentIntentId: pi };
}

/** Our payment status for a Stripe event, given the payment kind. null = no status change. */
function statusFor(s: Summary, kind: string): string | null {
  switch (s.type) {
    case "payment_intent.succeeded": return kind === "scheduled" ? "paid" : "captured";
    case "payment_intent.amount_capturable_updated": return kind === "initial" ? "authorized" : null;
    case "payment_intent.canceled": return "voided";
    case "payment_intent.payment_failed": return kind === "scheduled" ? "retrying" : null;
    case "charge.refunded": return "refunded";
    default: return null;
  }
}
/** Same-second ties: the more final state wins. */
const RANK: Record<string, number> = { authorized: 1, retrying: 1, scheduled: 0, voided: 2, failed_final: 2, captured: 3, paid: 3, refunded: 4 };

export type WebhookResult = "processed" | "duplicate" | "ignored";

export async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<WebhookResult> {
  const s = summarize(event);
  await db.query(
    `INSERT INTO webhook_events (source, external_event_id, payload, event_type, object_id, event_created)
     VALUES ('stripe', $1, $2, $3, $4, $5) ON CONFLICT (source, external_event_id) DO NOTHING`,
    [event.id, JSON.stringify({ type: s.type, object: s.objectId, status: s.status, amount: s.amount }), s.type, s.objectId, s.created.toISOString()]);
  const [row] = await db.query<{ processed_at: string | null }>(`SELECT processed_at FROM webhook_events WHERE source = 'stripe' AND external_event_id = $1`, [event.id]);
  if (row?.processed_at) return "duplicate";

  let result: WebhookResult = "ignored";
  try {
    if (s.paymentIntentId) {
      const pays = await db.query<{ id: string; kind: string; status: string; status_event_at: string | null; booking_id: string }>(
        `SELECT id, kind, status, status_event_at, booking_id FROM payments WHERE stripe_payment_intent_id = $1`, [s.paymentIntentId]);
      for (const p of pays) {
        const next = statusFor(s, p.kind);
        if (!next) continue;
        // Order-safe: apply only if newer than what we applied last (ties: more final state wins).
        const applied = await db.query(
          `UPDATE payments SET status = $2, status_event_at = $3
           WHERE id = $1 AND (status_event_at IS NULL OR status_event_at < $3 OR (status_event_at = $3 AND $4::int > $5::int)) RETURNING id`,
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
      await db.query(`INSERT INTO audit_log (booking_id, actor, action, after) VALUES ($1, 'stripe', 'dispute_opened', $2)`, [p?.booking_id ?? null, JSON.stringify({ amount: s.amount })]);
      console.error("ALERT Stripe dispute opened");
      result = "processed";
    }
    await db.query(`UPDATE webhook_events SET processed_at = now(), last_error = NULL WHERE source = 'stripe' AND external_event_id = $1`, [event.id]);
    return result;
  } catch (e) {
    await db.query(`UPDATE webhook_events SET last_error = $2 WHERE source = 'stripe' AND external_event_id = $1`, [event.id, String((e as Error).name).slice(0, 100)]);
    throw e; // 500 -> Stripe retries; the unprocessed row is processed again
  }
}
