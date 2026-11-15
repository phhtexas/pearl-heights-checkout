-- 0007: Stripe webhooks (deduplicated, order-safe) and the off-session second charge.
-- webhook_events keeps only a minimal summary (type, object id, status, amount, Stripe 'created'), never the raw
-- payload with customer details; processed_at marks completion so a failed processing is retried by Stripe.
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS object_id text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS event_created timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_error text;
-- payments: Stripe customer + saved card for the second charge; the Stripe time of the last status we applied, so an
-- older (out-of-order) webhook never overwrites a newer status.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status_event_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
-- jobs: atomic claim, like reconciliation.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claim_token text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS payments_by_pi ON payments (stripe_payment_intent_id);
