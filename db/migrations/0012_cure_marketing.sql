-- 0012 (Legal notes 11, 14): 72-hour cure period for a declined second payment, and optional marketing consent.
-- Cure period: starts at the FIRST decline and never moves (Booking Terms V1.2 §6).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS first_decline_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cure_deadline_at timestamptz;
-- Marketing consent (Website Terms V1.2 §7): separate, optional, never a condition of booking. One row per channel
-- per consent, with the exact wording and the contact it covers; revocations are kept (revoked_at) so we never re-add.
CREATE TABLE IF NOT EXISTS marketing_consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id     uuid NOT NULL REFERENCES guests(id),
  booking_id   uuid REFERENCES bookings(id),
  channel      text NOT NULL CHECK (channel IN ('email', 'sms')),
  contact      text NOT NULL,          -- the email address or mobile number the consent covers
  consent_id   text NOT NULL,
  consent_text text NOT NULL,
  accepted_at  timestamptz NOT NULL,
  revoked_at   timestamptz,
  revoked_how  text
);
CREATE INDEX IF NOT EXISTS marketing_consents_contact ON marketing_consents (channel, contact);
