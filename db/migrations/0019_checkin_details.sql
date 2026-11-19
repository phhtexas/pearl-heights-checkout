-- 0019 (Oscar, Nov 19, audit F1): real check-in details for direct bookings.
-- Each home's Hospitable "Check-in Inst." message (pasted by Oscar in the host inbox, placeholders kept) and street
-- address. Kept only here, never in the code or on a public page. The stay page shows the address after both
-- paperwork steps and the full message from 8:00 AM CT on check-in day, live bookings only.
CREATE TABLE IF NOT EXISTS checkin_details (
  property_key  text PRIMARY KEY,
  address       text NOT NULL DEFAULT '',
  message       text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text
);
-- When the host was told which 4-digit door code to set for this booking (once per booking).
ALTER TABLE verifications ADD COLUMN IF NOT EXISTS door_alert_at timestamptz;
