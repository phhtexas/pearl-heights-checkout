/**
 * Checkout consent (Legal notes 11 + 14). The exact checkbox wording and the policy versions it covers are saved with
 * each booking, with the server's time of acceptance. Bump CONSENT_ID whenever the wording or any version changes:
 * a page still showing old wording is then refused and the guest is asked to review and check the box again.
 */
export const POLICY_VERSIONS = { bookingTerms: "1.2", rentalAgreement: "1.2", privacy: "1.2", websiteTerms: "1.2" } as const;
export const CONSENT_ID = "checkout-1.3"; // 1.3 (Nov 17): "payments" -> "payment(s)"
export const POLICY_LINKS = { bookingTerms: "/terms", rentalAgreement: "/rental-agreement", privacy: "/privacy", websiteTerms: "/website-terms" } as const;

/** What the guest sees next to the checkbox, as plain text (the page renders the same words with links). */
export const CONSENT_TEXT =
  "I'm at least 25 and will stay at the home. I agree to the Direct Booking Terms and Cancellation Policy, the Rental Agreement and House Rules " +
  "(I'll sign it after paying) and the Website Terms, and I've read the Privacy Notice. I authorize the payment(s) shown above.";

export interface ConsentRecord { id: string; text: string; versions: typeof POLICY_VERSIONS; acceptedAt: Date }

export const consentRecord = (acceptedAt: Date): ConsentRecord => ({ id: CONSENT_ID, text: CONSENT_TEXT, versions: POLICY_VERSIONS, acceptedAt });

/**
 * Optional marketing consent (Website Terms V1.2 §7, Privacy Notice §9): two separate boxes, unchecked by default, never a
 * condition of booking. The saved wording names Pearl Heights Homes and the exact number (texts) or address (email).
 * Nothing is sent yet: guest messages stay off until that gate opens.
 */
export const MARKETING_CONSENT_ID = "marketing-1.2";
export const marketingEmailText = (email: string) =>
  `Optional: email me news, availability and offers from Pearl Heights Homes at ${email}. I can unsubscribe anytime.`;
export const MARKETING_SMS_LINKS = "See the Website Terms and Privacy Notice.";
export const marketingSmsBody = (phone: string) =>
  `Optional: text me recurring marketing offers from Pearl Heights Homes at ${phone}, including by automated technology. ` +
  `Consent is not a condition of booking. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help.`;
export const marketingSmsText = (phone: string) => `${marketingSmsBody(phone)} ${MARKETING_SMS_LINKS}`;
