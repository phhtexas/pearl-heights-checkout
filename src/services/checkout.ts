import { HospitableAdapter, PaymentsAdapter, AdapterError } from "../adapters/types";
import { BookingState, BookingEvent, transition } from "../domain/bookingState";
import { Property } from "../domain/properties";
import { buildQuote, Quote } from "../domain/quote";
import { verificationDeadline, VerificationDeadline } from "../domain/verification";
import { BookingStore } from "./bookingStore";

export interface CheckoutRequest {
  property: Property;
  checkIn: string; checkOut: string;
  adults: number; children: number; infants: number;
  payPlan?: "full" | "split";
  /** The saved quote the guest accepted, still inside its 15-minute price lock (route checks expiry). */
  lockedQuote?: Quote;
  guest: { firstName: string; lastName: string; email: string; phone: string };
  bookingRef: string;
  acceptedTotal: number; // the total the guest saw and accepted (cents)
  paymentMethodId?: string; // Stripe PaymentMethod from the browser (test/live)
  now: Date;
}

export type CheckoutOutcome =
  | { ok: true; state: BookingState; quote: Quote; reservationId: string; paymentIntentId: string; verification: VerificationDeadline; log: string[] }
  | { ok: false; state: BookingState; reason: "price_changed" | "dates_taken" | "card_declined" | "authentication_required" | "unsupported_method" | "reservation_failed" | "capture_failed" | "processing" | "retryable_error";
      guestMessage: string; newTotal?: number; log: string[]; reconcile?: Reconcile };

/** IDs needed to finish or unwind a checkout that stopped after a side effect. No guest PII. */
export interface Reconcile {
  stage: "authorize_unknown" | "reservation_unknown" | "void_failed" | "block_unconfirmed" | "capture_unknown" | "cancel_failed" | "record_booking" | "unknown";
  /** IDs known at the point of failure; reconciliation finds missing ones by booking ref. */
  bookingRef: string; paymentIntentId?: string; reservationId?: string; bookingId?: string;
  /** Present when payment was captured: what the confirmed booking needs (for record_booking recovery). */
  confirmed?: { state: BookingState; verification: { deadline: string; deadlineText: string; rule: string; mustCompleteBeforeAccess: boolean } };
}

export const PROCESSING_MESSAGE = "We're still confirming your booking. Please don't pay again: we'll email you as soon as it's confirmed, usually within minutes.";

/** Bounded fresh polling for the reservation block before capture (ChatGPT note 85). ~10.5 s total by default. */
export interface CheckoutOptions { blockCheckDelaysMs?: number[]; sleep?: (ms: number) => Promise<void> }
const DEFAULT_BLOCK_DELAYS = [0, 500, 1000, 1500, 2000, 2500, 3000];

const HOLD_NOTE = " No charge was completed. Your bank may show a temporary hold for a few days until it is released.";

/**
 * Payment-to-booking flow (build spec, section 3):
 * recheck availability -> authorize (hold) -> create Hospitable reservation (booking ref as code)
 * -> confirm the dates are blocked -> capture. Failures roll back so a guest is never charged without a booking
 * and a booking never exists without a payment.
 */
/** Same booking ref = same outcome: a double click or retried request never charges or books twice. */
export function runCheckoutOnce(req: CheckoutRequest, hosp: HospitableAdapter, pay: PaymentsAdapter, store: BookingStore): Promise<CheckoutOutcome> {
  return store.once(req.bookingRef, () => runCheckout(req, hosp, pay));
}

/** Thrown only when nothing external has happened yet (no authorization, no reservation): safe to retry. */
export class PreSideEffectError extends Error {}

/** Adapter error codes that are definite answers ("no"); anything else after a call may mean it happened. */
const DEFINITE_AUTH_FAIL = new Set(["card_declined", "authentication_required", "unsupported_method"]);
const DEFINITE_RESERVATION_FAIL = new Set(["unavailable", "duplicate_code", "rejected"]);
const code = (e: unknown) => (e instanceof AdapterError ? e.code : "unknown");

export async function runCheckout(req: CheckoutRequest, hosp: HospitableAdapter, pay: PaymentsAdapter, opts: CheckoutOptions = {}): Promise<CheckoutOutcome> {
  const log: string[] = [];
  let state: BookingState = "checkout_started";
  const step = (e: BookingEvent, msg: string) => { state = transition(state, e); log.push(`${state}: ${msg}`); };
  const processing = (stage: Reconcile["stage"], ids: { paymentIntentId?: string; reservationId?: string }, why: string): CheckoutOutcome => {
    log.push(`needs_reconciliation (${stage}): ${why}`);
    return { ok: false, state: "needs_reconciliation", reason: "processing", guestMessage: PROCESSING_MESSAGE, log, reconcile: { stage, bookingRef: req.bookingRef, ...ids } };
  };

  // 1. Re-quote from the live calendar and recheck availability. Nothing external has happened yet.
  step("PAY_PRESSED", "recheck availability and price");
  let nights: Awaited<ReturnType<HospitableAdapter["getCalendar"]>>, quote: Quote;
  try {
    const cal = await hosp.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut, { fresh: true });
    nights = cal.filter((d) => d.date < req.checkOut);
    if (nights.some((d) => !d.available)) {
      step("RESERVATION_FAILED", "dates no longer available; no card touched");
      return { ok: false, state, reason: "dates_taken", guestMessage: "Those dates were just booked by someone else. No payment was attempted.", log };
    }
    quote = buildQuote({ ...req, nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])) });
  } catch (e) {
    throw new PreSideEffectError(`recheck failed (${code(e)})`);
  }
  // 15-minute price lock: a live price change inside the lock does not change what the guest pays.
  if (quote.total !== req.acceptedTotal && req.lockedQuote && req.lockedQuote.total === req.acceptedTotal
      && req.lockedQuote.plan.split === quote.plan.split) {
    log.push(`live price ${quote.total} differs; honoring locked quote ${req.lockedQuote.total}`);
    quote = req.lockedQuote;
  }
  if (quote.total !== req.acceptedTotal) {
    log.push(`price changed from ${req.acceptedTotal} to ${quote.total}; guest must accept the new total`);
    return { ok: false, state: "quote_expired", reason: "price_changed", guestMessage: "Your total changed. Please review and accept the new total.", newTotal: quote.total, log };
  }

  // 2. Authorize the amount due now (hold only). A definite decline is final; anything else may have created a hold.
  let pi: string;
  try {
    ({ paymentIntentId: pi } = await pay.authorize({
      amount: quote.plan.dueNow, idempotencyKey: `${req.bookingRef}:initial`,
      description: `${req.property.name} ${req.checkIn} to ${req.checkOut} (${req.bookingRef})`, savePaymentMethod: quote.plan.split,
      paymentMethodId: req.paymentMethodId,
      customer: { name: `${req.guest.firstName} ${req.guest.lastName}`, email: req.guest.email, phone: req.guest.phone },
      metadata: { booking_ref: req.bookingRef, property: req.property.key, check_in: req.checkIn, check_out: req.checkOut },
    }));
  } catch (e) {
    const c = code(e);
    if (!DEFINITE_AUTH_FAIL.has(c)) return processing("authorize_unknown", {}, `authorization outcome unknown (${c})`);
    step("AUTH_FAILED", `authorization failed (${c})`);
    if (c === "authentication_required")
      return { ok: false, state, reason: "authentication_required", guestMessage: "This card needs an extra security check from your bank, which our test checkout doesn't support yet. No charge was made. Please try a different card.", log };
    if (c === "unsupported_method")
      return { ok: false, state, reason: "unsupported_method", guestMessage: "Please pay with a credit or debit card. No charge was made.", log };
    return { ok: false, state, reason: "card_declined", guestMessage: "Your bank declined the card, so no charge was made. Please try another card.", log };
  }
  step("AUTH_OK", `card authorized ${quote.plan.dueNow}`);

  // 3. Create the reservation with our booking ref as the code (Hospitable rejects duplicate codes, so it can be
  //    found again by code). A definite rejection voids the hold; an unclear failure goes to reconciliation.
  let reservationId: string;
  try {
    ({ reservationId } = await hosp.createReservation({
      propertyUuid: req.property.hospitableUuid, checkIn: req.checkIn, checkOut: req.checkOut,
      adults: req.adults, children: req.children, infants: req.infants, guest: req.guest,
      code: req.bookingRef, accommodationCents: quote.lodging + quote.extraGuestFee, cleaningCents: quote.cleaning,
      note: `Direct booking ${req.bookingRef}. Agreement + ID pending. Do not send access until verified.`,
    }));
  } catch (e) {
    const c = code(e);
    if (!DEFINITE_RESERVATION_FAIL.has(c)) return processing("reservation_unknown", { paymentIntentId: pi }, `reservation outcome unknown (${c})`);
    try { await pay.voidAuthorization(pi); }
    catch (ve) { return processing("void_failed", { paymentIntentId: pi }, `reservation rejected (${c}); void failed (${code(ve)})`); }
    step("RESERVATION_FAILED", `reservation rejected (${c}); authorization voided; alert Oscar`);
    return { ok: false, state, reason: "reservation_failed", guestMessage: "We couldn't complete the booking." + HOLD_NOTE, log };
  }
  step("RESERVATION_OK", `reservation ${reservationId}`);

  // 4. Confirm the block is visible before charging (bounded fresh polling). If it never shows, or the check
  //    itself fails, do NOT capture: reconciliation captures or unwinds by ID.
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let blocked = false;
  try {
    for (const delay of opts.blockCheckDelaysMs ?? DEFAULT_BLOCK_DELAYS) {
      if (delay) await sleep(delay);
      const after = await hosp.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut, { fresh: true });
      if (after.filter((d) => d.date < req.checkOut).every((d) => !d.available)) { blocked = true; break; }
    }
  } catch (e) {
    return processing("block_unconfirmed", { paymentIntentId: pi, reservationId }, `block check failed (${code(e)})`);
  }
  if (!blocked) {
    step("BLOCK_UNCONFIRMED", "reservation created but block not visible; not capturing");
    return processing("block_unconfirmed", { paymentIntentId: pi, reservationId }, "block never visible");
  }

  // 5. Capture. A definite capture failure unwinds (cancel reservation + void); anything unclear is reconciled.
  step("CAPTURE_REQUESTED", "capture");
  try {
    await pay.capture(pi);
  } catch (e) {
    const c = code(e);
    if (c !== "capture_failed") return processing("capture_unknown", { paymentIntentId: pi, reservationId }, `capture outcome unknown (${c})`);
    step("CAPTURE_FAILED", "capture failed; cancelling reservation; alert Oscar");
    try { await hosp.cancelReservation(reservationId); }
    catch (ce) { return processing("cancel_failed", { paymentIntentId: pi, reservationId }, `cancel after capture failure failed (${code(ce)})`); }
    try { await pay.voidAuthorization(pi); }
    catch (ve) { return processing("void_failed", { paymentIntentId: pi }, `void after capture failure failed (${code(ve)})`); }
    try {
      const reopened = await hosp.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut, { fresh: true });
      if (reopened.filter((d) => d.date < req.checkOut).every((d) => d.available)) step("DATES_REOPENED", "dates confirmed open");
      else log.push("dates not yet open; reconciliation job keeps checking");
    } catch { log.push("reopen check failed; reservation already cancelled and hold voided"); }
    return { ok: false, state, reason: "capture_failed", guestMessage: "Your payment didn't go through, so this booking was cancelled." + HOLD_NOTE, log };
  }
  step("CAPTURE_OK", "payment captured; send confirmation + receipt; schedule verification jobs");

  return { ok: true, state, quote, reservationId, paymentIntentId: pi, verification: verificationDeadline(req.now, req.checkIn), log };
}
