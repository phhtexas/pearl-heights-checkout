# Pearl Heights direct checkout

Custom direct-booking checkout for Pearl Heights Homes (PR Portfolio Properties LLC, dba Pearl Heights Homes).
Guests book on `book.pearlheightshomes.com`; reservations are created in Hospitable and paid through Stripe.

Status: **core logic only** (no live integrations yet). Nothing here can charge a card or create a reservation.

## What's in place

| Area | File | Rule source |
| --- | --- | --- |
| Properties, fees, provisional tax | `src/domain/properties.ts` | Hospitable + Airbnb settings, Nov 14, 2026 |
| Quote and 50/50 payment plan | `src/domain/quote.ts` | Blueprint + Oscar's decisions |
| Cancellation refunds | `src/domain/refunds.ts` | Terms draft revision 3 |
| Verification deadlines (24 h / 2 h / before access) | `src/domain/verification.ts` | Oscar, Nov 14, 2026 |
| Booking state machine | `src/domain/bookingState.ts` | Checkout build spec, section 3 |
| Database | `db/schema.sql` | Checkout build spec, section 4 |
| Tests | `test/domain.test.ts` | `npm test` |

## Still provisional

- Tax rates and the tax base (accountant), including tax on the 5% cancellation fee.
- Waivo terms and purchase timing.
- Business mailing address on receipts.

## Next

1. Next.js app (mobile checkout screens from the approved mockup).
2. Adapters with a mock mode: Hospitable (calendar, reservation, cancel), Stripe (PaymentIntent manual capture, SetupIntent, Identity), email.
3. Durable jobs: reminders, deadline, second payment, access release, ID redaction (120 days), reconciliation.
4. GA4 + Meta events with booking-ref deduplication.

Secrets are entered by Oscar in Vercel project settings. Never commit them. See `.env.example`.
