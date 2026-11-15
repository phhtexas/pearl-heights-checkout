import { flexibleCutoff, isNonRefundableBooking, NON_REFUNDABLE_WINDOW_DAYS } from "./quote";
import { GRACE_HOURS, HALF_REFUND_DAYS, halfRefundCutoff, PROCESSING_FEE_RATE, RefundResult } from "./refunds";
import { addHours, checkInInstant, formatChicagoDateTime } from "./time";

/**
 * Guest-facing cancellation policy for ONE stay, generated from the same constants and cutoff
 * functions that computeRefund() uses (ChatGPT note 131 f5), so the words can never drift from the math.
 */
export interface PolicyRow {
  tier: RefundResult["tier"];
  /** The row applies to cancellations before this instant (absent = until check-in). */
  until?: string;          // ISO
  untilText?: string;      // "Sunday, December 6, 2026, 4:00 PM CT"
  when: string;
  outcome: string;
}
export interface StayPolicy { nonRefundable: boolean; rows: PolicyRow[]; footer: string[] }

const pct = Math.round(PROCESSING_FEE_RATE * 100);

export function stayPolicy(checkIn: string, bookedAt: Date): StayPolicy {
  const footer = [
    "If we cancel because the rental agreement and ID check aren't completed in time or don't match, everything you paid is refunded.",
    "All times are Central Time, measured against the 4:00 PM check-in.",
  ];
  if (isNonRefundableBooking(checkIn, bookedAt)) {
    return {
      nonRefundable: true,
      rows: [{ tier: "non_refundable", when: `Booked ${NON_REFUNDABLE_WINDOW_DAYS} days or less before check-in`,
        outcome: "Paid in full and non-refundable, including the damage waiver." }],
      footer,
    };
  }
  const grace = addHours(bookedAt, GRACE_HOURS);
  const flex = flexibleCutoff(checkIn), half = halfRefundCutoff(checkIn), ci = checkInInstant(checkIn);
  const row = (tier: PolicyRow["tier"], until: Date | undefined, when: string, outcome: string): PolicyRow =>
    ({ tier, when, outcome, ...(until ? { until: until.toISOString(), untilText: formatChicagoDateTime(until) } : {}) });
  const rows: PolicyRow[] = [
    row("grace_24h", grace, `Within ${GRACE_HOURS} hours of booking`, "Everything back, no fee."),
  ];
  // Later tiers only appear if they still start after the grace window ends.
  if (flex > grace) rows.push(row("30_plus", flex, "30 days or more before check-in", `Everything back minus a ${pct}% processing fee. Any scheduled payment is cancelled.`));
  if (half > grace) rows.push(row("14_to_29", half, `${HALF_REFUND_DAYS} to 29 days before check-in`, "50% of the stay back, plus the damage waiver."));
  rows.push(row("under_14", ci, `Less than ${HALF_REFUND_DAYS} days before check-in`, "No refund except the damage waiver."));
  return { nonRefundable: false, rows, footer };
}
