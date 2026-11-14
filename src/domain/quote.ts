import { Cents, roundCents } from "./money";
import { DAMAGE_PROTECTION, Property } from "./properties";
import { addDaysISO, chicagoInstant, checkInInstant, hoursBetween, nightsBetween } from "./time";

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
  plan: PaymentPlan;
  /** Base for the 5% cancellation processing fee: nights + extra guests + cleaning, before taxes. */
  processingFeeBase: Cents;
}

export class QuoteError extends Error {}

const FULL_PAYMENT_WINDOW_DAYS = 30;

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

  const daysOut = hoursBetween(q.now, checkInInstant(q.checkIn)) / 24;
  let plan: PaymentPlan;
  if (daysOut > FULL_PAYMENT_WINDOW_DAYS) {
    const dueNow = Math.round(total / 2);
    plan = {
      split: true,
      dueNow,
      scheduled: { amount: total - dueNow, chargeAt: chicagoInstant(addDaysISO(q.checkIn, -FULL_PAYMENT_WINDOW_DAYS), 10) },
    };
  } else {
    plan = { split: false, dueNow: total };
  }

  return {
    nights: nights.length, lodging, extraGuestFee, cleaning, protection,
    taxableBase, tax, taxRate: p.provisionalTaxRate, total, plan,
    processingFeeBase: lodging + extraGuestFee + cleaning,
  };
}
