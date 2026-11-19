-- 0020 (Oscar, Nov 19, from his wife's test): guests with kids can ask for the crib and high chair at checkout.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS baby_gear boolean NOT NULL DEFAULT false;
