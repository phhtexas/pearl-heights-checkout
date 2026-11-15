-- Pearl Heights direct checkout: Postgres schema v1 (Checkout build spec, section 4).
-- Idempotent: safe to run on every deploy (scripts/migrate.mjs).
-- Money is integer cents. Times are timestamptz (UTC); guest-facing times are shown in America/Chicago.

CREATE TABLE IF NOT EXISTS guests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  version       int  NOT NULL DEFAULT 1,
  property_key  text NOT NULL,
  check_in      date NOT NULL,
  check_out     date NOT NULL,
  adults        int  NOT NULL,
  children      int  NOT NULL DEFAULT 0,
  infants       int  NOT NULL DEFAULT 0,
  line_items    jsonb NOT NULL,        -- lodging, extra guests, cleaning, protection, tax, total, plan
  total_cents   int  NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,  -- 15-minute price hold
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS bookings (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref                      text NOT NULL UNIQUE,   -- also the Hospitable reservation_code (duplicates rejected by Hospitable)
  quote_id                         uuid NOT NULL,
  quote_version                    int  NOT NULL,
  guest_id                         uuid NOT NULL REFERENCES guests(id),
  state                            text NOT NULL,
  hospitable_reservation_id        uuid UNIQUE,
  plan                             text NOT NULL CHECK (plan IN ('full', 'split')),
  verification_deadline_at         timestamptz,
  verification_rule                text CHECK (verification_rule IN ('24h', '2h', 'before_access')),
  access_instructions_released_at  timestamptz,
  promo_code                       text,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (quote_id, quote_version) REFERENCES quotes(id, version)
);

CREATE TABLE IF NOT EXISTS payments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                uuid NOT NULL REFERENCES bookings(id),
  kind                      text NOT NULL CHECK (kind IN ('initial', 'scheduled', 'refund')),
  idempotency_key           text NOT NULL UNIQUE,       -- booking_ref + ':' + kind (+ ':' + attempt for refunds)
  stripe_payment_intent_id  text UNIQUE,
  amount_cents              int  NOT NULL,
  status                    text NOT NULL,
  scheduled_for             timestamptz,
  attempts                  int  NOT NULL DEFAULT 0,
  last_error                text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- Stripe Identity: store only the result and references. Never store ID or selfie images.
CREATE TABLE IF NOT EXISTS verifications (
  booking_id                   uuid PRIMARY KEY REFERENCES bookings(id),
  agreement_status             text NOT NULL DEFAULT 'pending',
  agreement_signed_at          timestamptz,
  id_status                    text NOT NULL DEFAULT 'pending',
  id_method                    text CHECK (id_method IN ('selfie', 'document_manual')),
  stripe_verification_session  text,
  biometric_consent_at         timestamptz,
  id_checked_at                timestamptz,
  redact_after                 timestamptz,             -- check-out/cancellation + 120 days
  redacted_at                  timestamptz,
  legal_hold                   boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source             text NOT NULL CHECK (source IN ('stripe', 'hospitable', 'verification')),
  external_event_id  text NOT NULL,
  payload            jsonb NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz,
  UNIQUE (source, external_event_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,   -- reminder, deadline, second_payment, access_release, redact_id, reconcile
  booking_id  uuid REFERENCES bookings(id),
  run_at      timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  attempts    int  NOT NULL DEFAULT 0,
  last_error  text,
  UNIQUE (type, booking_id, run_at)
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (status, run_at);

CREATE TABLE IF NOT EXISTS emails (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           uuid NOT NULL REFERENCES bookings(id),
  template             text NOT NULL,
  sequence             int  NOT NULL DEFAULT 1,
  sent_at              timestamptz,
  provider_message_id  text,
  UNIQUE (booking_id, template, sequence)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  booking_id  uuid,
  actor       text NOT NULL,   -- system, guest, oscar, stripe, hospitable
  action      text NOT NULL,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

-- v2 (Nov 14, 2026): one row per checkout attempt. The browser sends a fresh attempt_key per Pay press and
-- reuses it on network retries; a repeated request returns the stored outcome instead of charging again.
CREATE TABLE IF NOT EXISTS checkout_attempts (
  attempt_key   text PRIMARY KEY,
  quote_id      uuid NOT NULL,
  quote_version int  NOT NULL,
  booking_ref   text NOT NULL UNIQUE,
  status        text NOT NULL CHECK (status IN ('running', 'done')),
  outcome       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  FOREIGN KEY (quote_id, quote_version) REFERENCES quotes(id, version)
);
-- One confirmed booking per accepted quote (a second tab cannot book the same quote twice).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_quote ON bookings (quote_id, quote_version);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS session_id text;
