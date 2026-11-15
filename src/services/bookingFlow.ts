import type { HospitableAdapter, PaymentsAdapter } from "../adapters/types";
import type { DbLedger, SavedQuote } from "../db/ledger";
import { CheckoutOptions, CheckoutOutcome, CheckoutRequest, PreSideEffectError, PROCESSING_MESSAGE, runCheckout } from "./checkout";

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
  if (!ledger) return runCheckout(req, hosp, pay, opts).catch((e) => { if (e instanceof PreSideEffectError) return retryable(e); throw e; });
  let bookingId: string;
  try {
    bookingId = await ledger.startBooking(req, q);
  } catch (e) {
    return retryable(e as Error); // nothing external has happened
  }
  let outcome: CheckoutOutcome;
  try {
    outcome = await runCheckout(req, hosp, pay, opts);
  } catch (e) {
    if (e instanceof PreSideEffectError) { await ledger.closeBooking(bookingId, "closed"); return retryable(e); }
    throw e; // unclassified: runAttempt queues it for reconciliation (found by booking ref)
  }
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
  } catch (e) {
    return { ok: false, state: "needs_reconciliation", reason: "processing", guestMessage: PROCESSING_MESSAGE,
      log: [...outcome.log, `needs_reconciliation: booking not recorded after capture (${(e as Error).name})`],
      reconcile: { stage: "record_booking", bookingRef: req.bookingRef, paymentIntentId: outcome.paymentIntentId, reservationId: outcome.reservationId,
        bookingId, confirmed: { state: outcome.state, verification } } };
  }
  // Price-lock audit never blocks or changes the booking; a failed write raises an ops alert in the logs.
  if (outcome.priceLock) {
    try {
      await ledger.auditPriceLock(bookingId, { bookingRef: req.bookingRef, quoteId: q.id, ...outcome.priceLock, at: req.now });
    } catch (e) {
      console.error("OPS_ALERT price_lock_audit_failed", req.bookingRef, (e as Error).name);
    }
  }
  return outcome;
}

/** Before any authorization or reservation: tell the guest nothing was charged and let them try again. */
function retryable(e: Error): CheckoutOutcome {
  return { ok: false, state: "checkout_started", reason: "retryable_error",
    guestMessage: "We couldn't reach our booking system just now. No charge was made. Please try again in a moment.",
    log: [`retryable before any side effect: ${e.name}: ${e.message}`.slice(0, 200)] };
}
