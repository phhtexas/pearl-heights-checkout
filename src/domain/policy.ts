import { flexibleCutoff, isNonRefundableBooking, NON_REFUNDABLE_WINDOW_DAYS } from "./quote";
import { checkInDayStart, GRACE_HOURS, HALF_REFUND_DAYS, halfRefundCutoff, PROCESSING_FEE_RATE, RefundResult } from "./refunds";
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

/**
 * @param bookedAt the actual booking time (confirmation, portal, emails) or, before payment, the quote time.
 * @param opts.exactGrace false before payment (note 135): the 24-hour end is shown as "within 24 hours after booking",
 *   because the real booked_at is only known once payment succeeds.
 */
export function stayPolicy(checkIn: string, bookedAt: Date, opts: { exactGrace?: boolean } = {}): StayPolicy {
  const exactGrace = opts.exactGrace ?? true;
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
  const flex = flexibleCutoff(checkIn), half = halfRefundCutoff(checkIn), day = checkInDayStart(checkIn), ci = checkInInstant(checkIn);
  const row = (tier: PolicyRow["tier"], until: Date | undefined, when: string, outcome: string): PolicyRow =>
    ({ tier, when, outcome, ...(until ? { until: until.toISOString(), untilText: formatChicagoDateTime(until) } : {}) });
  const rows: PolicyRow[] = [
    exactGrace
      ? row("grace_24h", grace, `Within ${GRACE_HOURS} hours of booking`, "Everything back, no fee.")
      : { tier: "grace_24h", until: grace.toISOString(), when: `Within ${GRACE_HOURS} hours after booking`, outcome: "Everything back, no fee." },
  ];
  // Later tiers only appear if they still start after the grace window ends.
  if (flex > grace) rows.push(row("30_plus", flex, "30 days or more before check-in", `Everything back minus a ${pct}% processing fee. Any scheduled payment is cancelled.`));
  if (half > grace) rows.push(row("14_to_29", half, `${HALF_REFUND_DAYS} to 29 days before check-in`, "50% of the stay back, plus the damage waiver."));
  rows.push(row("under_14", day, `Less than ${HALF_REFUND_DAYS} days before check-in, until the day before`, "No refund except the damage waiver."));
  rows.push(row("check_in_day", ci, "On check-in day", "No refund."));
  return { nonRefundable: false, rows, footer };
}

/** Date-free summary for listing pages, from the same constants as computeRefund(). */
export function policyOverview(): string[] {
  return [
    `Booked more than ${NON_REFUNDABLE_WINDOW_DAYS} days before check-in: cancel within ${GRACE_HOURS} hours after booking for everything back, no fee.`,
    `After that: 30 days or more before check-in, everything back minus a ${pct}% processing fee; ${HALF_REFUND_DAYS} to 29 days before, 50% of the stay plus the damage waiver; less than ${HALF_REFUND_DAYS} days before, the damage waiver only (until the day before check-in).`,
    `Booked ${NON_REFUNDABLE_WINDOW_DAYS} days or less before check-in: paid in full and non-refundable.`,
    "Your exact dates and amounts are shown before you pay.",
  ];
}
