-- 0006 (ChatGPT note 89): eventual consistency. One empty lookup is not proof of absence.
-- next_reconcile_at schedules delayed re-checks with backoff + jitter; negative_checks counts "not found" results;
-- items that exceed the attempt/age limits go to 'manual_review' (alert), never a hot loop.
ALTER TABLE checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_status_check;
ALTER TABLE checkout_attempts ADD CONSTRAINT checkout_attempts_status_check CHECK (status IN ('running', 'done', 'needs_reconciliation', 'reconciling', 'manual_review'));
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS next_reconcile_at timestamptz;
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS negative_checks int NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS attempts_needing_reconciliation;
CREATE INDEX IF NOT EXISTS attempts_needing_reconciliation ON checkout_attempts (next_reconcile_at, created_at) WHERE status IN ('needs_reconciliation', 'reconciling');
