-- 0003 one active payment attempt per quote (ChatGPT note 82): the attempt that holds the lease is the only one
-- allowed to touch Stripe or Hospitable for this quote. Released when it finishes; never auto-released while
-- its attempt is still running (a crashed attempt goes to reconciliation instead of being retried blindly).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS active_attempt text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lease_until timestamptz;
