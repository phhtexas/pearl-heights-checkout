import { CONSENT_ID } from "@/domain/consent";
/** Request validation for API routes. Prices are never taken from the client; only selections are. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REF = /^PH-[A-Z0-9]{6}$/;

export class ValidationError extends Error {}

const int = (v: unknown, name: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new ValidationError(`${name} must be a whole number from ${min} to ${max}.`);
  return v;
};
const date = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) throw new ValidationError(`${name} must be a date (YYYY-MM-DD).`);
  return v;
};

const payPlan = (v: unknown): "full" | "split" => {
  if (v == null || v === "full") return "full";
  if (v === "split") return "split";
  throw new ValidationError("Choose how you want to pay.");
};

export function parseStay(b: any) {
  const checkIn = date(b?.checkIn, "Check-in"), checkOut = date(b?.checkOut, "Check-out");
  if (checkOut <= checkIn) throw new ValidationError("Check-out must be after check-in.");
  return {
    property: String(b?.property ?? ""),
    checkIn, checkOut,
    adults: int(b?.adults, "Adults", 1, 20),
    children: int(b?.children ?? 0, "Children", 0, 20),
    infants: int(b?.infants ?? 0, "Infants", 0, 6),
    payPlan: payPlan(b?.payPlan),
  };
}

export function parseCheckout(b: any) {
  const stay = parseStay(b);
  const g = b?.guest ?? {};
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const guest = { firstName: s(g.firstName, 60), lastName: s(g.lastName, 60), email: s(g.email, 120), phone: s(g.phone, 30) };
  if (!guest.firstName || !guest.lastName) throw new ValidationError("Enter the main guest's first and last name.");
  if (!EMAIL.test(guest.email)) throw new ValidationError("Enter a valid email so we can send your confirmation.");
  if (guest.phone.replace(/\D/g, "").length < 10) throw new ValidationError("Enter a mobile number with area code.");
  if (b?.agreed !== true) throw new ValidationError("Please check the box to accept the terms and payment authorization.");
  if (b?.consentId !== CONSENT_ID) throw new ValidationError("Our terms were updated. Please refresh the page, review them and check the box again.");
  const acceptedTotal = int(b?.acceptedTotal, "Accepted total", 1, 100_000_000);
  if (b?.bookingRef != null && !REF.test(String(b.bookingRef))) throw new ValidationError("Invalid booking reference.");
  if (b?.paymentMethodId != null && !/^pm_[A-Za-z0-9_]{6,64}$/.test(String(b.paymentMethodId))) throw new ValidationError("Invalid payment details. Please re-enter your card.");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(String(b?.quoteId ?? ""))) throw new ValidationError("Your price check is missing. Please go back and see your total again.");
  if (!UUID.test(String(b?.attemptKey ?? ""))) throw new ValidationError("Invalid request. Please refresh and try again.");
  // Optional marketing consent: only a literal true counts; anything else is "no".
  const marketing = { email: b?.marketingEmail === true, sms: b?.marketingSms === true };
  return { ...stay, guest, acceptedTotal, marketing, bookingRef: b?.bookingRef as string | undefined, paymentMethodId: b?.paymentMethodId as string | undefined,
    quoteId: String(b.quoteId), attemptKey: String(b.attemptKey) };
}

/** Logs must never carry guest PII. */
export const redact = (s: string): string =>
  s.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]").replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");
