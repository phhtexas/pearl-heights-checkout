import type { HospitableAdapter } from "@/adapters/types";
import type { Property } from "@/domain/properties";
import type { QuoteInput } from "@/domain/quote";

/**
 * Live rates and availability for a stay, checked the same way as the guest's price check (/api/quote): every night
 * free, check-in and check-out allowed, minimum stay met. Returns the quote input, or the reason it can't be priced.
 */
export async function stayInput(hosp: HospitableAdapter, property: Property, s: { checkIn: string; checkOut: string; adults: number; children: number; infants: number },
  now: Date): Promise<QuoteInput | { error: string; status: number }> {
  const cal = await hosp.getCalendar(property.hospitableUuid, s.checkIn, s.checkOut, { fresh: true });
  const nights = cal.filter((d) => d.date < s.checkOut);
  if (nights.some((d) => !d.available)) return { error: "Some nights in this range are already booked.", status: 409 };
  if (nights[0]?.closedForCheckin) return { error: "Check-in isn't available on that date.", status: 400 };
  if (cal.find((d) => d.date === s.checkOut)?.closedForCheckout) return { error: "Check-out isn't available on that date.", status: 400 };
  const min = nights[0]?.minStay ?? 2;
  if (nights.length < min) return { error: `Minimum stay is ${min} nights from this date.`, status: 400 };
  return { ...s, property, nightlyRates: Object.fromEntries(nights.map((d) => [d.date, d.price])), now };
}
