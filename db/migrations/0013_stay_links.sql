-- 0013 (Oscar, Nov 17): private stay-page links, one or more per booking (confirmation screen now, email later).
-- Only a SHA-256 hash of each link token is stored; the token itself is shown once and never saved.
-- Links stop working 3 days after check-out (Oscar, Nov 14) or when revoked.
CREATE TABLE IF NOT EXISTS stay_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  token_hash  text NOT NULL UNIQUE,
  channel     text NOT NULL CHECK (channel IN ('confirmation', 'email', 'host')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS stay_links_booking ON stay_links (booking_id);
-- Paperwork status the stay page needs (verifications already has agreement_* and id_*): the SignWell document.
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS signwell_document_id text;
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS agreement_signed_name text;
