# Pearl Heights direct checkout

Custom direct-booking checkout for Pearl Heights Homes (PR Portfolio Properties LLC, dba Pearl Heights Homes).
Guests book on `book.pearlheightshomes.com`; reservations are created in Hospitable and paid through Stripe.

Status: **test checkout** (`CHECKOUT_MODE=test`): Stripe test mode (cards only), real Hospitable calendar (read-only), fake reservations, Neon Postgres. No live keys exist.

Run locally: `npm install`, `CHECKOUT_MODE=mock npm run dev`, open http://localhost:3000.
Tests: `npm test` (unit + PGlite database tests), `npm run typecheck`, `npm run build`.
E2E (Playwright, local): `CHECKOUT_MODE=mock ALLOW_MOCK=true npx next start -p 3100`, then `node e2e/calendar-switch.mjs` and `node e2e/full-flow.mjs`.

## Database migrations

`db/migrations/NNNN_name.sql` are applied in order by `scripts/migrate.mjs` before every Vercel build. Each runs in one
transaction: `pg_advisory_xact_lock`, then a DO block that re-checks `schema_migrations` while holding the lock and only
then runs the statements and records version + SHA-256 checksum. Concurrent deploys apply each migration once; migrations
do not need to be idempotent. Editing an applied file fails the build: add a new migration instead.

## Data retention

See `docs/RETENTION.md` (proposed schedule; purge job not built yet).

## Reconciliation

A checkout that stops after a payment or reservation exists (booking not recorded after capture, or reservation block never visible) is stored as `checkout_attempts.status = 'needs_reconciliation'` with the Stripe/Hospitable IDs (no guest PII); the quote stays locked and the guest sees "processing, don't pay again". `DbLedger.reconcile()` resolves it by ID (confirm, or capture, or cancel + void). The scheduled runner is part of the jobs gate.

## Hospitable client controls

Server-only token (`HOSPITABLE_API_TOKEN`, sensitive), fixed base URL `https://public.api.hospitable.com/v2`, validated
UUID/dates, 8 s timeout, at most 2 retries on 429/5xx/network (300 ms, 900 ms), response schema validation (ISO date,
integer cents, USD, boolean status), errors carry only a status code, nothing upstream is logged. Browsing uses a 60 s
cache; quotes and the pre-payment recheck always read fresh. Reservations are never written in test mode.

Guards: a production build refuses mock adapters unless `ALLOW_MOCK=true` (private demo only). `CHECKOUT_MODE=live` refuses to start until `TAX_RATES_CONFIRMED`, `STRIPE_CHECKLIST_PASSED` and `ATTORNEY_APPROVED` are all `true`. The 5%-below-Airbnb claim is not implemented.

## What's in place

| Area | File | Rule source |
| --- | --- | --- |
| Properties, fees, provisional tax | `src/domain/properties.ts` | Hospitable + Airbnb settings, Nov 14, 2026 |
| Quote and 50/50 payment plan | `src/domain/quote.ts` | Blueprint + Oscar's decisions |
| Cancellation refunds | `src/domain/refunds.ts` | Terms draft revision 3 |
| Verification deadlines (24 h / 2 h / before access) | `src/domain/verification.ts` | Oscar, Nov 14, 2026 |
| Booking state machine | `src/domain/bookingState.ts` | Checkout build spec, section 3 |
| Database (versioned migrations) | `db/migrations/*.sql`, `scripts/migrate.mjs` | Build spec section 4; ChatGPT notes 69, 78, 82 |
| Durable quotes, attempts, quote lease, booking records | `src/db/ledger.ts` | ChatGPT notes 78, 82 |
| Stripe test mode (cards only, manual capture) | `src/adapters/stripe.ts`, `app/StripeCard.tsx` | ChatGPT notes 75-78 |
| Hospitable calendar, read-only | `src/adapters/hospitableCalendar.ts` | Oscar, Nov 14: real calendar, fake bookings |
| Payment-to-booking flow with rollback | `src/services/checkout.ts` | Build spec section 3 |
| Mock Hospitable + Stripe | `src/adapters/mock.ts` | Behaves like the live test of Nov 14 (duplicate codes rejected, instant block) |
| API routes | `app/api/*` | calendar, quote, checkout |
| Guest screens | `app/page.tsx` | Approved mockup |
| Tests | `test/*.test.ts` | `npm test` |

## Still provisional

- Tax rates and the tax base (accountant), including tax on the 5% cancellation fee.
- Waivo terms and purchase timing.
- Business mailing address on receipts.

## Next

1. Real adapters for test mode: Hospitable (calendar, reservation, cancel), Stripe (PaymentIntent manual capture, SetupIntent, Identity), email.
3. Durable jobs: reminders, deadline, second payment, access release, ID redaction (120 days), reconciliation.
4. GA4 + Meta events with booking-ref deduplication.

Secrets are entered by Oscar in Vercel project settings. Never commit them. See `.env.example`.
