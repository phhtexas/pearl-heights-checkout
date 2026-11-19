import type { CheckoutOutcome } from "../services/checkout";

/**
 * The only checkout fields a guest's browser receives (ChatGPT review, note 71 item 2).
 * No state log, reservation IDs, payment IDs or internal alerts.
 */
export type GuestView =
  | { ok: true; bookingRef: string; verification: { deadlineText: string; mustCompleteBeforeAccess: boolean } }
  | { ok: false; reason: Extract<CheckoutOutcome, { ok: false }>["reason"] | "in_progress" | "error"; guestMessage: string; newTotal?: number;
      /** 3-D Secure only: the client secret the browser needs for the bank check (no other payment detail). */
      action?: { clientSecret: string } };

export function guestView(o: CheckoutOutcome, bookingRef: string): GuestView {
  if (o.ok) return { ok: true, bookingRef, verification: { deadlineText: o.verification.deadlineText, mustCompleteBeforeAccess: o.verification.mustCompleteBeforeAccess } };
  // Never expose reconcile IDs or logs.
  return { ok: false, reason: o.reason, guestMessage: o.guestMessage, ...(o.newTotal !== undefined ? { newTotal: o.newTotal } : {}), ...(o.action ? { action: o.action } : {}) };
}
