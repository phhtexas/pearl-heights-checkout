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
  getCalendar(propertyUuid: string, start: string, end: string): Promise<CalendarDay[]>;
  /** Creates a manual reservation. `code` is our booking ref; Hospitable rejects duplicates. */
  createReservation(input: {
    propertyUuid: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number;
    guest: { firstName: string; lastName: string; email: string; phone?: string };
    code: string; accommodationCents: Cents; cleaningCents: Cents; note: string;
  }): Promise<{ reservationId: string }>;
  cancelReservation(reservationId: string): Promise<void>;
}

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
}

export class AdapterError extends Error {
  constructor(message: string, public readonly code: string) { super(message); }
}
