/**
 * Urgent property contact (Oscar, Legal note 9): shown only to verified guests in the portal and the signed agreement,
 * never on public pages. Server-only: import it only from server code (a test checks no page or client file does).
 * URGENT_CONTACT_PHONE in Vercel overrides the default.
 */
export const urgentContact = (env: Record<string, string | undefined> = process.env): string =>
  env.URGENT_CONTACT_PHONE?.trim() || "(210) 400-2540 (call or text; verified guests only)";
