import type { HospitableAdapter, PaymentsAdapter } from "../adapters/types";
import type { DbLedger, SavedQuote } from "../db/ledger";
import { CheckoutOptions, CheckoutOutcome, CheckoutRequest, PROCESSING_MESSAGE, runCheckout } from "./checkout";

/**
 * The work of one checkout attempt with durable records (ChatGPT note 85):
 *  1. save the guest + a pending booking BEFORE any side effect;
 *  2. run the payment/reservation flow;
 *  3. after capture, confirm the booking in one transaction. If that write fails, the result is NOT success:
 *     it becomes 'processing' with the IDs needed for reconciliation (no guest PII), and the quote stays locked.
 * With no database (mock demos) it is just runCheckout.
 */
export async function bookingAttempt(ledger: DbLedger | null, q: SavedQuote, req: CheckoutRequest, hosp: HospitableAdapter, pay: PaymentsAdapter,
  opts: CheckoutOptions = {}): Promise<CheckoutOutcome> {
  if (!ledger) return runCheckout(req, hosp, pay, opts);
  const bookingId = await ledger.startBooking(req, q); // throws before any side effect -> nothing to undo
  const outcome = await runCheckout(req, hosp, pay, opts);
  if (!outcome.ok) {
    if (outcome.reconcile) return { ...outcome, reconcile: { ...outcome.reconcile, bookingId } };
    await ledger.closeBooking(bookingId, outcome.state);
    return outcome;
  }
  const verification = { deadline: outcome.verification.deadline.toISOString(), deadlineText: outcome.verification.deadlineText,
    rule: outcome.verification.rule, mustCompleteBeforeAccess: outcome.verification.mustCompleteBeforeAccess };
  try {
    await ledger.confirmBooking(bookingId, q, { bookingRef: req.bookingRef, state: outcome.state, reservationId: outcome.reservationId,
      paymentIntentId: outcome.paymentIntentId, verification });
    return outcome;
  } catch (e) {
    return { ok: false, state: "needs_reconciliation", reason: "processing", guestMessage: PROCESSING_MESSAGE,
      log: [...outcome.log, `needs_reconciliation: booking not recorded after capture (${(e as Error).name})`],
      reconcile: { stage: "record_booking", bookingRef: req.bookingRef, paymentIntentId: outcome.paymentIntentId, reservationId: outcome.reservationId,
        bookingId, confirmed: { state: outcome.state, verification } } };
  }
}
