-- 0008 (ChatGPT note 95)
-- Webhook processing claim: only one delivery of an event may run its effects at a time.
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS claim_token text;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
-- Crash-safe one-time effects keyed by the external event id.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS external_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS audit_once_per_external_event ON audit_log (actor, external_event_id, action) WHERE external_event_id IS NOT NULL;
-- Refunds are cumulative facts (Stripe charge.amount_refunded), applied monotonically.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_cents int NOT NULL DEFAULT 0;
-- Second charge: definite card declines counted separately from idempotency keys used.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS decline_count int NOT NULL DEFAULT 0;
