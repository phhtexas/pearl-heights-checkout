/**
 * Checkout consent (Legal notes 11 + 14). The exact checkbox wording and the policy versions it covers are saved with
 * each booking, with the server's time of acceptance. Bump CONSENT_ID whenever the wording or any version changes:
 * a page still showing old wording is then refused and the guest is asked to review and check the box again.
 */
export const POLICY_VERSIONS = { bookingTerms: "1.2", rentalAgreement: "1.2", privacy: "1.2", websiteTerms: "1.2" } as const;
export const CONSENT_ID = "checkout-1.2";
export const POLICY_LINKS = { bookingTerms: "/terms", rentalAgreement: "/rental-agreement", privacy: "/privacy", websiteTerms: "/website-terms" } as const;

/** What the guest sees next to the checkbox, as plain text (the page renders the same words with links). */
export const CONSENT_TEXT =
  "I'm at least 25 and will stay at the home. I agree to the Direct Booking Terms and Cancellation Policy, the Rental Agreement and House Rules " +
  "(I'll sign it after paying) and the Website Terms, and I've read the Privacy Notice. I authorize the payments shown above.";

export interface ConsentRecord { id: string; text: string; versions: typeof POLICY_VERSIONS; acceptedAt: Date }

export const consentRecord = (acceptedAt: Date): ConsentRecord => ({ id: CONSENT_ID, text: CONSENT_TEXT, versions: POLICY_VERSIONS, acceptedAt });
