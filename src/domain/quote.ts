import { Cents, roundCents } from "./money";
import { DAMAGE_PROTECTION, Property } from "./properties";
import { addDaysISO, checkInInstant, hoursBetween, nightsBetween } from "./time";

export interface QuoteInput {
  property: Property;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  adults: number;
  children: number;
  infants: number;
  /** Nightly rates keyed by date, from Hospitable (cents). Must cover every night. */
  nightlyRates: Record<string, Cents>;
  now: Date;
  /** Validated $50 code etc. Applies to the nightly rate before taxes and fees. */
  nightlyDiscount?: Cents;
  /** Guest's choice (Oscar, Nov 15): pay in full is the default; split only when offered. */
  payPlan?: "full" | "split";
}

export interface PaymentPlan {
  split: boolean;
  dueNow: Cents;
  scheduled?: { amount: Cents; chargeAt: Date };
}

export interface Quote {
  nights: number;
  lodging: Cents;        // nightly rates minus nightly discount
  extraGuestFee: Cents;
  cleaning: Cents;
  protection: Cents;
  taxableBase: Cents;    // lodging + extra guests + cleaning (protection excluded, pending accountant)
  tax: Cents;
  taxRate: number;
  total: Cents;
  /** The plan the guest chose (falls back to full when split is not offered). */
  plan: PaymentPlan;
  fullPlan: PaymentPlan;
  /** Present only when check-in is more than 30 days away and the booking is refundable. */
  splitPlan?: PaymentPlan;
  /** Booked 7 days or less before the 4:00 PM check-in: pay in full, non-refundable (Oscar, Nov 15). */
  nonRefundable: boolean;
  /** Base for the 5% cancellation processing fee: nights + extra guests + cleaning, before taxes. */
  processingFeeBase: Cents;
}

export class QuoteError extends Error {}

const FULL_PAYMENT_WINDOW_DAYS = 30;
export const NON_REFUNDABLE_WINDOW_DAYS = 7;

/** When flexible cancellation ends and the second payment is charged: 30 days before the 4:00 PM CT check-in (Oscar, Nov 15). */
export const flexibleCutoff = (checkIn: string): Date => checkInInstant(addDaysISO(checkIn, -FULL_PAYMENT_WINDOW_DAYS));

/** Booked at or after this instant = 7 days or less before check-in = non-refundable, pay in full. */
export const nonRefundableFrom = (checkIn: string): Date => checkInInstant(addDaysISO(checkIn, -NON_REFUNDABLE_WINDOW_DAYS));

export const isNonRefundableBooking = (checkIn: string, bookedAt: Date): boolean =>
  bookedAt.getTime() >= nonRefundableFrom(checkIn).getTime();

export function buildQuote(q: QuoteInput): Quote {
  const p = q.property;
  if (q.checkOut <= q.checkIn) throw new QuoteError("Check-out must be after check-in.");
  if (q.adults < 1) throw new QuoteError("At least one adult is required.");
  const guests = q.adults + q.children; // infants are free and not counted
  if (guests > p.maxGuests) throw new QuoteError(`${p.name} sleeps ${p.maxGuests}.`);

  const nights = nightsBetween(q.checkIn, q.checkOut);
  let lodging = 0;
  for (const n of nights) {
    const rate = q.nightlyRates[n];
    if (rate == null) throw new QuoteError(`No rate for ${n}; the night may be unavailable.`);
    lodging += rate;
  }
  lodging = Math.max(0, lodging - (q.nightlyDiscount ?? 0));

  const extraGuestFee = Math.max(0, guests - p.extraGuestFrom) * p.extraGuestFee * nights.length;
  const cleaning = p.cleaningFee;
  const protection = DAMAGE_PROTECTION;
  const taxableBase = lodging + extraGuestFee + cleaning;
  const tax = roundCents(taxableBase * p.provisionalTaxRate);
  const total = taxableBase + protection + tax;

  if (hoursBetween(q.now, checkInInstant(q.checkIn)) <= 0) throw new QuoteError("Check-in time has passed for that date.");
  const nonRefundable = isNonRefundableBooking(q.checkIn, q.now);
  const fullPlan: PaymentPlan = { split: false, dueNow: total };
  let splitPlan: PaymentPlan | undefined;
  const cutoff = flexibleCutoff(q.checkIn);
  // Split only when the cutoff is still ahead (strictly): the second charge runs at the cutoff instant.
  if (!nonRefundable && q.now.getTime() < cutoff.getTime()) {
    const dueNow = Math.round(total / 2);
    splitPlan = { split: true, dueNow, scheduled: { amount: total - dueNow, chargeAt: cutoff } };
  }
  const plan = q.payPlan === "split" && splitPlan ? splitPlan : fullPlan;

  return {
    nights: nights.length, lodging, extraGuestFee, cleaning, protection,
    taxableBase, tax, taxRate: p.provisionalTaxRate, total, plan, fullPlan, ...(splitPlan ? { splitPlan } : {}), nonRefundable,
    processingFeeBase: lodging + extraGuestFee + cleaning,
  };
}
