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

export function parseStay(b: any) {
  const checkIn = date(b?.checkIn, "Check-in"), checkOut = date(b?.checkOut, "Check-out");
  if (checkOut <= checkIn) throw new ValidationError("Check-out must be after check-in.");
  return {
    property: String(b?.property ?? ""),
    checkIn, checkOut,
    adults: int(b?.adults, "Adults", 1, 20),
    children: int(b?.children ?? 0, "Children", 0, 20),
    infants: int(b?.infants ?? 0, "Infants", 0, 6),
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
  if (b?.agreed !== true) throw new ValidationError("Please accept the house rules, cancellation policy and payment authorization.");
  const acceptedTotal = int(b?.acceptedTotal, "Accepted total", 1, 100_000_000);
  if (b?.bookingRef != null && !REF.test(String(b.bookingRef))) throw new ValidationError("Invalid booking reference.");
  return { ...stay, guest, acceptedTotal, bookingRef: b?.bookingRef as string | undefined };
}

/** Logs must never carry guest PII. */
export const redact = (s: string): string =>
  s.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]").replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");
