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
  guest: { firstName: string; lastName: string; email: string; phone: string };
  bookingRef: string;
  acceptedTotal: number; // the total the guest saw and accepted (cents)
  paymentMethodId?: string; // Stripe PaymentMethod from the browser (test/live)
  now: Date;
}

export type CheckoutOutcome =
  | { ok: true; state: BookingState; quote: Quote; reservationId: string; paymentIntentId: string; verification: VerificationDeadline; log: string[] }
  | { ok: false; state: BookingState; reason: "price_changed" | "dates_taken" | "card_declined" | "authentication_required" | "unsupported_method" | "reservation_failed" | "capture_failed"; guestMessage: string; newTotal?: number; log: string[] };

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

export async function runCheckout(req: CheckoutRequest, hosp: HospitableAdapter, pay: PaymentsAdapter): Promise<CheckoutOutcome> {
  const log: string[] = [];
  let state: BookingState = "checkout_started";
  const step = (e: BookingEvent, msg: string) => { state = transition(state, e); log.push(`${state}: ${msg}`); };

  // 1. Re-quote from the live calendar and recheck availability.
  step("PAY_PRESSED", "recheck availability and price");
  const cal = await hosp.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut, { fresh: true });
  const nights = cal.filter((d) => d.date < req.checkOut);
  if (nights.some((d) => !d.available)) {
    step("RESERVATION_FAILED", "dates no longer available; no card touched");
    return { ok: false, state, reason: "dates_taken", guestMessage: "Those dates were just booked by someone else. No payment was attempted.", log };
  }
  const quote = buildQuote({ ...req, nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])) });
  if (quote.total !== req.acceptedTotal) {
    log.push(`price changed from ${req.acceptedTotal} to ${quote.total}; guest must accept the new total`);
    return { ok: false, state: "quote_expired", reason: "price_changed", guestMessage: "Your total changed. Please review and accept the new total.", newTotal: quote.total, log };
  }

  // 2. Authorize the amount due now (hold only).
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
    const code = (e as AdapterError).code;
    step("AUTH_FAILED", `authorization failed (${code ?? "error"}): ${(e as Error).message}`);
    if (code === "authentication_required")
      return { ok: false, state, reason: "authentication_required", guestMessage: "This card needs an extra security check from your bank, which our test checkout doesn't support yet. No charge was made. Please try a different card.", log };
    if (code === "unsupported_method")
      return { ok: false, state, reason: "unsupported_method", guestMessage: "Please pay with a credit or debit card. No charge was made.", log };
    return { ok: false, state, reason: "card_declined", guestMessage: "Your bank declined the card, so no charge was made. Please try another card.", log };
  }
  step("AUTH_OK", `card authorized ${quote.plan.dueNow}`);

  // 3. Create the reservation in Hospitable with our booking ref as the code.
  let reservationId: string;
  try {
    ({ reservationId } = await hosp.createReservation({
      propertyUuid: req.property.hospitableUuid, checkIn: req.checkIn, checkOut: req.checkOut,
      adults: req.adults, children: req.children, infants: req.infants, guest: req.guest,
      code: req.bookingRef, accommodationCents: quote.lodging + quote.extraGuestFee, cleaningCents: quote.cleaning,
      note: `Direct booking ${req.bookingRef}. Agreement + ID pending. Do not send access until verified.`,
    }));
  } catch (e) {
    await pay.voidAuthorization(pi);
    step("RESERVATION_FAILED", `reservation failed (${(e as AdapterError).code ?? "error"}); authorization voided; alert Oscar`);
    return { ok: false, state, reason: "reservation_failed", guestMessage: "We couldn't complete the booking." + HOLD_NOTE, log };
  }
  step("RESERVATION_OK", `reservation ${reservationId}`);

  // 4. Confirm the block is visible before charging (live test: under 1 second).
  const after = await hosp.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut, { fresh: true });
  if (after.filter((d) => d.date < req.checkOut).some((d) => d.available)) log.push("warning: block not yet visible; reconciliation job will re-check");

  // 5. Capture.
  step("CAPTURE_REQUESTED", "capture");
  try {
    await pay.capture(pi);
  } catch (e) {
    step("CAPTURE_FAILED", "capture failed; cancelling reservation; alert Oscar");
    await hosp.cancelReservation(reservationId);
    const reopened = await hosp.getCalendar(req.property.hospitableUuid, req.checkIn, req.checkOut, { fresh: true });
    if (reopened.filter((d) => d.date < req.checkOut).every((d) => d.available)) step("DATES_REOPENED", "dates confirmed open");
    else log.push("dates not yet open; guest sees 'cancellation is being completed' until the calendar confirms");
    return { ok: false, state, reason: "capture_failed", guestMessage: "Your payment didn't go through, so this booking was cancelled." + HOLD_NOTE, log };
  }
  step("CAPTURE_OK", "payment captured; send confirmation + receipt; schedule verification jobs");

  return { ok: true, state, quote, reservationId, paymentIntentId: pi, verification: verificationDeadline(req.now, req.checkIn), log };
}
