-- 0002 checkout attempts, one booking per quote, quote session.
-- reuses it on network retries; a repeated request returns the stored outcome instead of charging again.
CREATE TABLE IF NOT EXISTS checkout_attempts (
  attempt_key   text PRIMARY KEY,
  quote_id      uuid NOT NULL,
  quote_version int  NOT NULL,
  booking_ref   text NOT NULL UNIQUE,
  status        text NOT NULL CHECK (status IN ('running', 'done')),
  outcome       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  FOREIGN KEY (quote_id, quote_version) REFERENCES quotes(id, version)
);
-- One confirmed booking per accepted quote (a second tab cannot book the same quote twice).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_quote ON bookings (quote_id, quote_version);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS session_id text;
