-- 0021 (Oscar, Nov 19): questions before booking, like Airbnb inquiries, and 24-hour special offers.
-- A guest messages us from a home's page (dates and guests optional). We reply from the host inbox; the guest reads
-- and answers on a private conversation link. We can send a special offer: a new total for set dates and guests,
-- good for 24 hours, that only works through that guest's private link.
CREATE TABLE IF NOT EXISTS inquiries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_key   text NOT NULL,
  check_in       date,
  check_out      date,
  adults         int NOT NULL DEFAULT 0,
  children       int NOT NULL DEFAULT 0,
  infants        int NOT NULL DEFAULT 0,
  quoted_total_cents int,                 -- the total the guest saw on the page when they wrote (if any)
  guest_name     text NOT NULL,
  guest_email    text NOT NULL,
  livemode       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  host_alert_at  timestamptz,             -- last "new message" alert to the host (grouped)
  guest_alert_at timestamptz              -- last "we replied" email to the guest (grouped; only with guest emails on)
);
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  uuid NOT NULL REFERENCES inquiries(id),
  sender      text NOT NULL CHECK (sender IN ('guest', 'host')),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX IF NOT EXISTS inquiry_messages_thread ON inquiry_messages (inquiry_id, created_at);
-- The guest's private links (only SHA-256 hashes are stored; each email can carry a fresh one).
CREATE TABLE IF NOT EXISTS inquiry_links (
  token_hash  text PRIMARY KEY,
  inquiry_id  uuid NOT NULL REFERENCES inquiries(id),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS special_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id    uuid NOT NULL REFERENCES inquiries(id),
  property_key  text NOT NULL,
  check_in      date NOT NULL,
  check_out     date NOT NULL,
  adults        int NOT NULL,
  children      int NOT NULL DEFAULT 0,
  infants       int NOT NULL DEFAULT 0,
  total_cents   int NOT NULL CHECK (total_cents > 0),
  regular_cents int NOT NULL,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  withdrawn_at  timestamptz,
  booking_ref   text                      -- set once a booking used it
);
CREATE INDEX IF NOT EXISTS special_offers_inquiry ON special_offers (inquiry_id, created_at);
