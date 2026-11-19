-- 0018 (Oscar, Nov 19): live payments on pearlheightshomes.com while the test site stays in Stripe test mode.
-- Each quote records which Stripe mode it belongs to; bookings, payments and jobs inherit it through the quote, so the
-- maintenance runs, refunds, ID checks and agreements always use the matching keys. Everything before this is test.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false;
