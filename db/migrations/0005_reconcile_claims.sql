-- 0005 (ChatGPT note 87): reconciliation workers claim one attempt atomically before any external call.
-- status 'reconciling' + claim token/expiry; a crashed worker's claim expires and can be reclaimed explicitly.
ALTER TABLE checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_status_check;
ALTER TABLE checkout_attempts ADD CONSTRAINT checkout_attempts_status_check CHECK (status IN ('running', 'done', 'needs_reconciliation', 'reconciling'));
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS claim_token text;
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS reconcile_attempts int NOT NULL DEFAULT 0;
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS last_error text;
DROP INDEX IF EXISTS attempts_needing_reconciliation;
CREATE INDEX IF NOT EXISTS attempts_needing_reconciliation ON checkout_attempts (created_at) WHERE status IN ('needs_reconciliation', 'reconciling');
-- Idempotent audit for one-time events.
CREATE UNIQUE INDEX IF NOT EXISTS audit_once ON audit_log (booking_id, action) WHERE action IN ('booking_confirmed', 'reconciled');
