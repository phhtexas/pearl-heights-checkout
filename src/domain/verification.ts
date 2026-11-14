import { addHours, checkInInstant, hoursBetween } from "./time";

/**
 * Verification deadline (approved by Oscar, Nov 14, 2026):
 *  - booked 48h+ before check-in: agreement + ID due 24h after payment
 *  - booked under 48h: due 2h after payment
 *  - booked under 2h: must be finished before any address or access is released; no promise of immediate entry
 */
export interface VerificationDeadline {
  deadline: Date;
  rule: "24h" | "2h" | "before_access";
  mustCompleteBeforeAccess: boolean;
}

export function verificationDeadline(paidAt: Date, checkInISO: string): VerificationDeadline {
  const hours = hoursBetween(paidAt, checkInInstant(checkInISO));
  if (hours >= 48) return { deadline: addHours(paidAt, 24), rule: "24h", mustCompleteBeforeAccess: false };
  if (hours >= 2) return { deadline: addHours(paidAt, 2), rule: "2h", mustCompleteBeforeAccess: false };
  return { deadline: addHours(paidAt, 2), rule: "before_access", mustCompleteBeforeAccess: true };
}

/** ID data in Stripe is redacted 120 days after check-out or cancellation, unless a hold applies. */
export const ID_REDACTION_DAYS = 120;
