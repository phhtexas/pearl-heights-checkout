-- Where a booking came from (Oscar, Nov 18: ROAS per campaign). First-party only: utm_* tags, fbclid/gclid,
-- landing page, referrer host. No personal data. Kept with the booking record (same retention as bookings).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attribution jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ad_events_sent_at timestamptz;
