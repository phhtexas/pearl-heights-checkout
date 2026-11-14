import { Cents, roundCents } from "./money";
import { Quote } from "./quote";
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
  | "nonpayment";           // scheduled balance still unpaid after the 3-day grace

export interface RefundInput {
  quote: Quote;
  checkIn: string;
  bookedAt: Date;
  cancelledAt: Date;
  paidSoFar: Cents;
  reason: CancelReason;
}

export interface RefundResult {
  tier: "full_no_fee" | "grace_24h" | "30_plus" | "14_to_29" | "under_14" | "after_check_in" | "nonpayment";
  retained: Cents;
  refund: Cents;
  processingFee: Cents;
  cancelScheduledPayment: boolean;
  /** Set when the guest has paid less than what the tier lets us keep. */
  shortfall?: Cents;
}

export const PROCESSING_FEE_RATE = 0.05;

export function computeRefund(i: RefundInput): RefundResult {
  const { quote, paidSoFar } = i;
  const fee = roundCents(quote.processingFeeBase * PROCESSING_FEE_RATE);
  const result = (tier: RefundResult["tier"], retainedWanted: Cents): RefundResult => {
    const retained = Math.min(retainedWanted, paidSoFar);
    return {
      tier, retained, refund: paidSoFar - retained, processingFee: tier === "full_no_fee" ? 0 : Math.min(fee, retained),
      cancelScheduledPayment: true,
      ...(retainedWanted > paidSoFar ? { shortfall: retainedWanted - paidSoFar } : {}),
    };
  };

  if (i.reason === "verification_missed" || i.reason === "host") return result("full_no_fee", 0);
  if (i.reason === "nonpayment") return result("nonpayment", fee);

  const checkIn = checkInInstant(i.checkIn);
  const hoursToCheckIn = hoursBetween(i.cancelledAt, checkIn);
  if (hoursToCheckIn <= 0) return result("after_check_in", paidSoFar);

  const hoursSinceBooking = hoursBetween(i.bookedAt, i.cancelledAt);
  if (hoursSinceBooking <= 24) return result("grace_24h", fee);

  const daysToCheckIn = hoursToCheckIn / 24;
  // Damage protection is refunded in full on any cancellation before check-in.
  const totalExProtection = quote.total - quote.protection;
  if (daysToCheckIn >= 30) return result("30_plus", fee);
  if (daysToCheckIn >= 14) return result("14_to_29", Math.round(totalExProtection / 2));
  return result("under_14", totalExProtection);
}
