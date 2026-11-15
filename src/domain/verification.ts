import { addHours, checkInInstant, formatChicagoDateTime, hoursBetween } from "./time";

/**
 * Verification deadline (approved by Oscar, Nov 14, 2026):
 *  - booked 48h+ before check-in: agreement + ID due 24h after payment
 *  - booked under 48h: due 2h after payment
 *  - booked under 2h: must be finished before any address or access is released; no promise of immediate entry
 */
export interface VerificationDeadline {
  deadline: Date;
  /** Central-time text used on screen, in the confirmation email and in records. */
  deadlineText: string;
  rule: "24h" | "2h" | "before_access";
  mustCompleteBeforeAccess: boolean;
}

export function verificationDeadline(paidAt: Date, checkInISO: string): VerificationDeadline {
  const hours = hoursBetween(paidAt, checkInInstant(checkInISO));
  const make = (h: number, rule: VerificationDeadline["rule"]): VerificationDeadline => {
    const deadline = addHours(paidAt, h);
    return { deadline, deadlineText: formatChicagoDateTime(deadline), rule, mustCompleteBeforeAccess: rule === "before_access" };
  };
  if (hours >= 48) return make(24, "24h");
  if (hours >= 2) return make(2, "2h");
  return make(2, "before_access");
}

/** ID data in Stripe is redacted 120 days after check-out or cancellation, unless a hold applies. */
export const ID_REDACTION_DAYS = 120;
