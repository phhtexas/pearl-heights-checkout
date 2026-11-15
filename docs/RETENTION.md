# Data retention and purge schedule (ChatGPT note 85, P1)

Status: **PROPOSED**. Periods marked "decision" need Oscar's confirmation (and the accountant/attorney where noted).
Purging runs as a daily job (the `jobs` table); the job itself is not built yet and is a launch gate.

| Data | Where | Kept for | Then |
|---|---|---|---|
| Quotes with no booking (incl. browser session id) | `quotes` | 30 days after expiry | deleted |
| Checkout attempts with no confirmed booking | `checkout_attempts` | 90 days | deleted |
| Internal attempt logs (state log, IDs) on confirmed bookings | `checkout_attempts.outcome.internal` | 90 days after check-out | trimmed to `{ state, booking_ref }` |
| Guests whose booking never confirmed | `guests`, `bookings` (state ≠ confirmed) | 30 days | deleted |
| Guests of confirmed bookings: name, email, phone | `guests` | 7 years after check-out (tax/accounting records), **decision: accountant** | deleted; booking keeps totals only |
| Bookings, payments, audit log (amounts, dates, IDs) | `bookings`, `payments`, `audit_log` | 7 years after check-out, **decision: accountant** | deleted |
| Webhook payloads | `webhook_events.payload` | 90 days after processing | payload deleted; id + processed_at kept for deduplication |
| Emails sent (template, time, provider id; no body) | `emails` | same as booking | deleted with booking |
| ID / selfie images | **never stored by us** (Stripe Identity only) | n/a | n/a |
| Stripe Identity verification data | Stripe | redacted 120 days after check-out or cancellation, unless `legal_hold` | `verifications.redacted_at` set |
| Server logs (Vercel) | Vercel | Vercel plan default; logs carry no email/phone (`redact()`) | — |

Exceptions: an open dispute, chargeback, damage claim or legal hold pauses deletion for that booking until it closes.
