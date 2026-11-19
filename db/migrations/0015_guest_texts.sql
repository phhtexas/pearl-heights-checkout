-- 0015 (Oscar, Nov 18): booking confirmation by text (Twilio). One row per booking + kind + channel, so a retry can
-- never text a guest twice. Only the last 4 digits of the number are kept here; the stay link sent by text is its own
-- stay_links row (channel 'sms'), stored as a hash like the others.
ALTER TABLE stay_links DROP CONSTRAINT IF EXISTS stay_links_channel_check;
ALTER TABLE stay_links ADD CONSTRAINT stay_links_channel_check CHECK (channel IN ('confirmation', 'email', 'host', 'sms'));
CREATE TABLE IF NOT EXISTS guest_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id),
  kind         text NOT NULL,              -- 'confirmation' (later: 'paperwork_reminder')
  channel      text NOT NULL CHECK (channel IN ('sms', 'email')),
  to_last4     text,
  provider_id  text,                       -- Twilio message SID
  status       text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  UNIQUE (booking_id, kind, channel)
);
