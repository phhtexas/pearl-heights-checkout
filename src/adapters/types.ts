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
    code: string; accommodationCents: Cents; cleaningCents: Cents; note: string;
  }): Promise<{ reservationId: string }>;
  cancelReservation(reservationId: string): Promise<void>;
  /** Reconciliation: find a reservation by our booking ref (the reservation code). null = none exists. */
  findReservationByCode(code: string): Promise<string | null>;
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
  capture(paymentIntentId: string): Promise<void>;
  voidAuthorization(paymentIntentId: string): Promise<void>;
  /** Reconciliation: current status of a PaymentIntent. */
  status(paymentIntentId: string): Promise<PaymentStatus>;
  /** Reconciliation: PaymentIntents created for a booking ref (metadata.booking_ref). */
  findByRef(bookingRef: string): Promise<string[]>;
}

export class AdapterError extends Error {
  constructor(message: string, public readonly code: string) { super(message); }
}
