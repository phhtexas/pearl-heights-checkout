import { Cents } from "../domain/money";

export interface CalendarDay {
  date: string;        // YYYY-MM-DD
  available: boolean;
  price: Cents;
  minStay: number;
  closedForCheckin?: boolean;
  closedForCheckout?: boolean;
}

export interface HospitableAdapter {
  /** `fresh: true` bypasses any cache (required for quote and the pre-payment recheck). */
  getCalendar(propertyUuid: string, start: string, end: string, opts?: { fresh?: boolean }): Promise<CalendarDay[]>;
  /** Creates a manual reservation. `code` is our booking ref; Hospitable rejects duplicates. */
  createReservation(input: {
    propertyUuid: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number;
    guest: { firstName: string; lastName: string; email: string; phone?: string };
    code: string; accommodationCents: Cents; cleaningCents: Cents; protectionCents?: Cents; note: string;
  }): Promise<{ reservationId: string }>;
  cancelReservation(reservationId: string): Promise<void>;
  /** Reconciliation: find a reservation by our booking ref (the reservation code). null = none exists. */
  findReservationByCode(code: string): Promise<string | null>;
  /**
   * Cancels this reservation's unsent Hospitable check-in messages (the door-code message). Oscar, Nov 18: direct guests
   * get access only on our stay page, after agreement + ID. Returns how many were cancelled. Optional: mock/read-only.
   */
  cancelCheckinMessages?(reservationId: string): Promise<number>;
}

export type PaymentStatus = "authorized" | "captured" | "voided" | "failed";

export interface PaymentsAdapter {
  /** Authorize only (manual capture). Idempotent on `idempotencyKey`. */
  authorize(input: {
    amount: Cents; idempotencyKey: string; description: string; savePaymentMethod: boolean;
    /** Stripe PaymentMethod created in the browser by the Payment Element (test/live only). */
    paymentMethodId?: string;
    customer?: { name: string; email: string; phone?: string };
    metadata?: Record<string, string>;
  }): Promise<{ paymentIntentId: string }>;
  /**
   * 3-D Secure resume: after the guest's bank check in the browser, take over that authorization for this booking.
   * Must be on hold (requires_capture) for exactly `amount`, created for the same quote; relabels it with the booking ref.
   * Throws AdapterError "authentication_required" if the check didn't complete.
   */
  adoptAuthorized(paymentIntentId: string, o: { amount: number; quoteId: string; bookingRef: string; description: string }): Promise<{ paymentIntentId: string }>;
  capture(paymentIntentId: string): Promise<void>;
  voidAuthorization(paymentIntentId: string): Promise<void>;
  /** Reconciliation: current status of a PaymentIntent. */
  status(paymentIntentId: string): Promise<PaymentStatus>;
  /** Reconciliation: PaymentIntents created for a booking ref (metadata.booking_ref). */
  findByRef(bookingRef: string): Promise<string[]>;
  /** The Stripe customer + card saved during the first payment (split plans only). */
  savedMethod(paymentIntentId: string): Promise<{ customerId: string; paymentMethodId: string } | null>;
  /**
   * Off-session charge of a saved card, captured immediately. Idempotent on `idempotencyKey`.
   * Definite outcomes: resolves { status: "succeeded" } or throws card_declined / authentication_required.
   * Any other error is ambiguous: retry later with the SAME key (Stripe returns the original result).
   */
  /** Refund part or all of a captured PaymentIntent. Idempotent on `idempotencyKey`. Host cancel tool (F3). */
  refund?(paymentIntentId: string, amount: number, idempotencyKey: string, metadata: Record<string, string>): Promise<{ refundId: string }>;
  chargeSaved(input: { customerId: string; paymentMethodId: string; amount: number; idempotencyKey: string; description: string; metadata: Record<string, string> }): Promise<{ paymentIntentId: string; status: "succeeded" }>;
}

export class AdapterError extends Error {
  /** 3-D Secure: the PaymentIntent waiting for the guest's bank check, and its client secret for the browser. */
  public action?: { paymentIntentId: string; clientSecret: string };
  constructor(message: string, public readonly code: string) { super(message); }
}
