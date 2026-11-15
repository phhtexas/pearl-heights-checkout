-- 0004 (ChatGPT note 85): a booking row is written BEFORE any payment, then confirmed after capture.
-- If anything after a side effect fails, the attempt becomes 'needs_reconciliation' with the IDs needed to finish
-- or unwind it; the quote stays locked until reconciliation resolves it.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_ref text;
DROP INDEX IF EXISTS bookings_one_per_quote;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_confirmed_per_quote ON bookings (quote_id, quote_version) WHERE confirmed_at IS NOT NULL;
ALTER TABLE checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_status_check;
ALTER TABLE checkout_attempts ADD CONSTRAINT checkout_attempts_status_check CHECK (status IN ('running', 'done', 'needs_reconciliation'));
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS reconcile jsonb;
ALTER TABLE checkout_attempts ADD COLUMN IF NOT EXISTS booking_id uuid;
CREATE INDEX IF NOT EXISTS attempts_needing_reconciliation ON checkout_attempts (created_at) WHERE status = 'needs_reconciliation';
