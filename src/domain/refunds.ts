import { Cents, roundCents } from "./money";
import { flexibleCutoff, isNonRefundableBooking, Quote } from "./quote";
import { addDaysISO, chicagoInstant } from "./time";
import { checkInInstant, hoursBetween } from "./time";

/**
 * Cancellation & refund policy (draft Terms, revision 3, decided by Oscar Nov 14, 2026).
 * Tax treatment of the processing fee is PENDING the accountant: this module returns
 * what Pearl Heights keeps before tax adjustments; the tax split is done elsewhere once confirmed.
 */
export type CancelReason =
  | "guest"                 // guest cancels
  | "verification_missed"   // agreement + ID not done by the deadline
  | "host"                  // Pearl Heights cancels (not for a breach)
  | "nonpayment";           // scheduled balance still unpaid after the 72-hour cure period

export interface RefundInput {
  quote: Quote;
  checkIn: string;
  bookedAt: Date;
  cancelledAt: Date;
  paidSoFar: Cents;
  reason: CancelReason;
}

export interface RefundResult {
  tier: "full_no_fee" | "grace_24h" | "non_refundable" | "30_plus" | "14_to_29" | "under_14" | "check_in_day" | "after_check_in" | "nonpayment";
  retained: Cents;
  refund: Cents;
  processingFee: Cents;
  cancelScheduledPayment: boolean;
  /** Set when the guest has paid less than what the tier lets us keep. */
  shortfall?: Cents;
}

export const PROCESSING_FEE_RATE = 0.05;
/** Full refund window after booking (refundable bookings only). */
export const GRACE_HOURS = 24;
/** Below this many days before check-in, nothing is refunded except the damage waiver. */
export const HALF_REFUND_DAYS = 14;
/** From this instant the 50% tier ends and only the damage waiver is refunded. */
/** Waivo refunds a waiver only on a request received before the check-in DATE (Terms section 2): from 12:00 AM CT
 *  on check-in day nothing is refundable, waiver included. */
export const checkInDayStart = (checkIn: string): Date => chicagoInstant(checkIn, 0);
export const halfRefundCutoff = (checkIn: string): Date => checkInInstant(addDaysISO(checkIn, -HALF_REFUND_DAYS));

export function computeRefund(i: RefundInput): RefundResult {
  const { quote, paidSoFar } = i;
  const fee = roundCents(quote.processingFeeBase * PROCESSING_FEE_RATE);
  const result = (tier: RefundResult["tier"], retainedWanted: Cents): RefundResult => {
    const retained = Math.min(retainedWanted, paidSoFar);
    return {
      tier, retained, refund: paidSoFar - retained, processingFee: tier === "full_no_fee" || tier === "grace_24h" || tier === "non_refundable" ? 0 : Math.min(fee, retained),
      cancelScheduledPayment: true,
      ...(retainedWanted > paidSoFar ? { shortfall: retainedWanted - paidSoFar } : {}),
    };
  };

  if (i.reason === "verification_missed" || i.reason === "host") return result("full_no_fee", 0);
  if (i.reason === "nonpayment") return result("nonpayment", fee);

  const checkIn = checkInInstant(i.checkIn);
  const hoursToCheckIn = hoursBetween(i.cancelledAt, checkIn);
  if (hoursToCheckIn <= 0) return result("after_check_in", paidSoFar);

  // Booked 7 days or less before check-in: non-refundable, damage waiver included (Oscar, Nov 15).
  if (isNonRefundableBooking(i.checkIn, i.bookedAt)) return result("non_refundable", paidSoFar);

  // First 24 hours (bookings made 8+ days out): everything back, no fee, waiver included (Oscar, Nov 15).
  const hoursSinceBooking = hoursBetween(i.bookedAt, i.cancelledAt);
  if (hoursSinceBooking <= GRACE_HOURS) return result("grace_24h", 0);

  // Damage protection is refunded in full on any cancellation before check-in.
  const totalExProtection = quote.total - quote.protection;
  // 30+ tier ends at the exact instant the second payment is charged (4:00 PM CT, 30 days out).
  if (i.cancelledAt.getTime() < flexibleCutoff(i.checkIn).getTime()) return result("30_plus", fee);
  if (i.cancelledAt.getTime() < halfRefundCutoff(i.checkIn).getTime()) return result("14_to_29", Math.round(totalExProtection / 2));
  if (i.cancelledAt.getTime() >= checkInDayStart(i.checkIn).getTime()) return result("check_in_day", paidSoFar);
  return result("under_14", totalExProtection);
}
