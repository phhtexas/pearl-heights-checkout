-- 0011: checkout consent evidence (Legal notes 11 + 14). Each booking keeps the consent id, the exact wording the guest
-- accepted, the policy versions it covered and the server time of acceptance. promo_code was never used (removed).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consent_id          text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consent_text        text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS policy_versions     jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz;
ALTER TABLE bookings DROP COLUMN IF EXISTS promo_code;
