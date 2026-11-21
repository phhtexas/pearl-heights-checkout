import { HOMES } from "../content/homes";
import { getProperty } from "../domain/properties";
import type { Quote } from "../domain/quote";

/**
 * Building blocks shared by the booking emails (Oscar, Nov 20): the stay card (listing name, never the street address;
 * full check-in/out dates) and the itemized payment summary. Used by the confirmation and the follow-up notices.
 */
export type StayCard = { home: string; area: string; photo?: string; rows: [label: string, value: string][] };
export type Receipt = { lines: [label: string, amount: string][]; total: string; note?: string; payments: [label: string, amount: string, sub?: string][]; due?: [label: string, amount: string] };

const BRANDS: Record<string, string> = { amex: "Amex", visa: "Visa", mastercard: "Mastercard", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay" };
/** "Amex •••• 3425" from Stripe's card brand and last 4. */
export const cardLabel = (c: { brand: string; last4: string } | null | undefined) =>
  c ? `${BRANDS[c.brand] ?? c.brand.charAt(0).toUpperCase() + c.brand.slice(1)}\u00A0••••\u00A0${c.last4}` : undefined; // non-breaking: never split on phones

export const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const shortDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });

/** "Tuesday, January 26, 2027 @ 4:00 PM" (Oscar, Nov 20: spell the day out so it's clear). */
export function longDayAt(iso: string, time: string) {
  return `${new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })} @ ${time}`;
}

export const listingTitle = (propertyKey: string) => HOMES[propertyKey]?.title ?? getProperty(propertyKey).name;

export function buildStayCard(o: { propertyKey: string; checkIn: string; checkOut: string; ref: string; adults?: number; children?: number; infants?: number; withPhoto?: boolean }): StayCard {
  const h = HOMES[o.propertyKey];
  const guests = (o.adults ?? 0) + (o.children ?? 0);
  const who = guests ? `${guests} ${guests === 1 ? "guest" : "guests"}${o.infants ? ` + ${o.infants} ${o.infants === 1 ? "infant" : "infants"}` : ""}` : "";
  return {
    home: listingTitle(o.propertyKey),
    area: h ? `${h.neighborhood}, San Antonio, Texas` : "San Antonio, Texas",
    photo: o.withPhoto && h?.photos[0] ? h.photoBase + h.photos[0].id + ".jpg" : undefined,
    rows: [["Check-in", longDayAt(o.checkIn, "4:00 PM")], ["Check-out", longDayAt(o.checkOut, "10:00 AM")], ...(who ? [["Guests", who] as [string, string]] : []), ["Booking", o.ref]],
  };
}

/** Itemized summary from the booked quote, then each payment (paid or due), refunds, and the balance still due. */
export function buildReceipt(q: Quote, payments: { label: string; cents: number; paid: boolean; sub?: string }[], refundedCents = 0, extraNote?: string): Receipt {
  const lines: [string, string][] = [[`${q.nights} ${q.nights === 1 ? "night" : "nights"}`, usd(q.lodging)]];
  if (q.extraGuestFee > 0) lines.push(["Extra guests", usd(q.extraGuestFee)]);
  lines.push(["Cleaning", usd(q.cleaning)], ["Damage waiver ($5,000 coverage)", usd(q.protection)], ["Taxes", usd(q.tax)]);
  const rows: [string, string, string?][] = payments.map((p) => [p.label, usd(p.cents), p.sub]);
  if (refundedCents > 0) rows.push(["Refunded", `−${usd(refundedCents)}`]);
  const paid = payments.filter((p) => p.paid).reduce((a, p) => a + p.cents, 0);
  const notes = [q.specialOffer ? `Includes your special offer: ${usd(q.specialOffer.savings)} off the regular total of ${usd(q.specialOffer.regularTotal)}.` : "", extraNote ?? ""].filter(Boolean);
  return { lines, total: usd(q.total), payments: rows, due: ["Balance due", usd(Math.max(0, q.total - paid))], note: notes.join(" ") || undefined };
}
