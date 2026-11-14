/**
 * Booking state machine (Checkout build spec, section 3).
 * Every state change goes through `transition`, which rejects anything not listed here.
 */
export type BookingState =
  | "quote_created" | "quote_expired" | "checkout_started" | "payment_authorizing"
  | "failed_authorization" | "reservation_creating" | "failed_reservation" | "reservation_created"
  | "capturing" | "cancelling_after_capture_fail" | "confirmed" | "verified" | "access_released"
  | "cancelled_unverified" | "cancelled" | "completed" | "closed";

export type BookingEvent =
  | "QUOTE_EXPIRED" | "REQUOTED" | "DETAILS_SUBMITTED" | "PAY_PRESSED" | "AUTH_FAILED" | "AUTH_OK"
  | "RESERVATION_FAILED" | "RESERVATION_OK" | "CAPTURE_REQUESTED" | "CAPTURE_FAILED" | "CAPTURE_OK"
  | "DATES_REOPENED" | "VERIFIED" | "DEADLINE_MISSED" | "ACCESS_SENT" | "CANCELLED" | "CHECKED_OUT"
  | "RETRY" | "CLOSE";

const T: Record<BookingState, Partial<Record<BookingEvent, BookingState>>> = {
  quote_created: { QUOTE_EXPIRED: "quote_expired", DETAILS_SUBMITTED: "checkout_started" },
  quote_expired: { REQUOTED: "quote_created" },
  checkout_started: { PAY_PRESSED: "payment_authorizing", QUOTE_EXPIRED: "quote_expired" },
  payment_authorizing: { AUTH_OK: "reservation_creating", AUTH_FAILED: "failed_authorization", RESERVATION_FAILED: "failed_reservation" },
  failed_authorization: { RETRY: "checkout_started" },
  reservation_creating: { RESERVATION_OK: "reservation_created", RESERVATION_FAILED: "failed_reservation" },
  failed_reservation: { CLOSE: "closed" },
  reservation_created: { CAPTURE_REQUESTED: "capturing" },
  capturing: { CAPTURE_OK: "confirmed", CAPTURE_FAILED: "cancelling_after_capture_fail" },
  cancelling_after_capture_fail: { DATES_REOPENED: "closed" },
  confirmed: { VERIFIED: "verified", DEADLINE_MISSED: "cancelled_unverified", CANCELLED: "cancelled" },
  verified: { ACCESS_SENT: "access_released", CANCELLED: "cancelled" },
  access_released: { CHECKED_OUT: "completed", CANCELLED: "cancelled" },
  cancelled_unverified: { CLOSE: "closed" },
  cancelled: { CLOSE: "closed" },
  completed: {},
  closed: {},
};

export class InvalidTransition extends Error {}

export function transition(from: BookingState, event: BookingEvent): BookingState {
  const to = T[from][event];
  if (!to) throw new InvalidTransition(`${event} is not allowed from ${from}`);
  return to;
}

export const canTransition = (from: BookingState, event: BookingEvent): boolean => T[from][event] != null;
