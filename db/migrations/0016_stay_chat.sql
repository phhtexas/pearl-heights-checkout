-- 0016 (Oscar, Nov 19): guest chat on the stay page, answered from a private host inbox.
-- One thread per booking. Guests write from their stay link; Oscar replies from /host (email sign-in link).
CREATE TABLE IF NOT EXISTS stay_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  sender      text NOT NULL CHECK (sender IN ('guest', 'host')),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz              -- when the other side first saw it
);
CREATE INDEX IF NOT EXISTS stay_chat_booking ON stay_chat_messages (booking_id, created_at);
-- Alerts (host: "new guest message"; guest: "Oscar replied") are grouped: at most one per thread and side every few minutes.
CREATE TABLE IF NOT EXISTS stay_chat_alerts (
  booking_id    uuid NOT NULL REFERENCES bookings(id),
  audience      text NOT NULL CHECK (audience IN ('host', 'guest')),
  last_sent_at  timestamptz NOT NULL,
  PRIMARY KEY (booking_id, audience)
);
-- Host sign-in: a one-time link (15 minutes) emailed to the host address, then a 90-day session cookie.
-- Only SHA-256 hashes of both tokens are stored.
CREATE TABLE IF NOT EXISTS host_login_tokens (
  token_hash  text PRIMARY KEY,
  email       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE TABLE IF NOT EXISTS host_sessions (
  token_hash  text PRIMARY KEY,
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
