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
  /** Present only when the second charge (30 days before check-in) is at least 7 days after booking (check-in 37+ days away). */
  splitPlan?: PaymentPlan;
  /** Booked 7 days or less before the 4:00 PM check-in: pay in full, non-refundable (Oscar, Nov 15). */
  nonRefundable: boolean;
  /** Base for the 5% cancellation processing fee: nights + extra guests + cleaning, before taxes. */
  processingFeeBase: Cents;
  /** A host's special offer applied to this quote (Oscar, Nov 19): the regular total and the offer it came from. */
  specialOffer?: { id: string; regularTotal: Cents; savings: Cents };
}

export class QuoteError extends Error {}

const FULL_PAYMENT_WINDOW_DAYS = 30;
export const NON_REFUNDABLE_WINDOW_DAYS = 7;
/** Split is offered only when the balance date is at least this far after booking (Oscar, Nov 19, after Perplexity QA PX-T29). */
export const SPLIT_MIN_LEAD_DAYS = 7;

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
  // Split only when the second charge (at the cutoff instant) is at least SPLIT_MIN_LEAD_DAYS after booking, so a guest
  // is never charged the balance hours after paying the first half.
  if (!nonRefundable && q.now.getTime() + SPLIT_MIN_LEAD_DAYS * 86_400_000 <= cutoff.getTime()) {
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

/**
 * Special offers (Oscar, Nov 19): the host sets a new all-in total. The saving comes off the nightly rate (before
 * taxes), so taxes are still charged on what the guest pays. Returns the nightly discount that makes the total equal
 * the target (to the cent when the rounding of taxes allows, otherwise the closest total below it), or 0 when the
 * regular total is already at or under the target.
 */
export function discountForTotal(q: QuoteInput, target: Cents): Cents {
  const base = buildQuote({ ...q, nightlyDiscount: 0 });
  if (base.total <= target) return 0;
  const minTotal = base.total - base.lodging - roundCents(base.lodging * base.taxRate) - 1;
  if (target < minTotal) throw new QuoteError("That total is lower than the cleaning, damage waiver and taxes alone.");
  const totalWith = (d: Cents) => buildQuote({ ...q, nightlyDiscount: d }).total;
  let d = Math.min(base.lodging, Math.max(0, Math.round((base.total - target) / (1 + base.taxRate))));
  for (let i = 0; i < 6 && totalWith(d) > target && d < base.lodging; i++) d++;
  for (let i = 0; i < 6 && d > 0 && totalWith(d - 1) <= target; i++) d--;
  return d;
}
