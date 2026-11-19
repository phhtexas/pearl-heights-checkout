import { HOMES } from "@/content/homes";
import { houseGuide } from "@/content/houseGuides";
import { verificationDeadline } from "@/domain/verification";
import { addDaysISO, formatChicagoDateTime, todayChicago } from "@/domain/time";

/**
 * Guest portal TEST reservation (Oscar, Nov 17: "build the portal now with test data").
 * Everything here is sample data for design review: no real guest, no real address, Wi-Fi or door code ever appears.
 * Real portals will load the reservation from our database by an unguessable token; only "demo" exists for now.
 */
export interface StayData {
  token: string;
  code: string;
  home: { key: string; slug: string; title: string; neighborhood: string; photo: string; photoAlt: string; guestsMax: number };
  checkIn: string; checkOut: string; nights: number;
  guests: { adults: number; children: number };
  holder: string;
  paidAtText: string;
  /** When the booking was confirmed (ISO), for the chat's "Booking confirmed" line. */
  paidAtISO: string;
  deadlineText: string;
  thingsToKnow: { title: string; items: string[] }[];
  /** "demo" = the sample portal (paperwork kept in the browser); "booking" = a real booking (paperwork saved on the server). */
  mode: "demo" | "booking";
  /** Real bookings: paperwork already recorded on the server (any device). */
  done?: { signedOn?: string; signedName?: string; signDoc?: string; verifiedOn?: string };
  /** Payments card (Perplexity PX-F8, Nov 19): what was paid and, for split bookings, the balance and its status. */
  payments?: StayPayments;
}
export interface StayPayments {
  totalText: string; paidText: string; paidOnText: string;
  balance?: { amountText: string; dueText: string; state: "scheduled" | "paid" | "attention" | "approve" | "cancelled" };
}

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
/** Payments card data from stored amounts (cents) and the second payment's status. */
export function stayPayments(o: { totalCents: number; paidNowCents: number; paidAt: Date; balance?: { cents: number; dueAt: Date; status: string } | null }): StayPayments {
  const state = (st: string): NonNullable<StayPayments["balance"]>["state"] =>
    st === "paid" ? "paid" : st === "scheduled" ? "scheduled" : st === "requires_action" ? "approve" : /refund|cancel/.test(st) ? "cancelled" : "attention";
  return {
    totalText: usd(o.totalCents), paidText: usd(o.paidNowCents), paidOnText: fmtCT(o.paidAt),
    ...(o.balance ? { balance: { amountText: usd(o.balance.cents), dueText: formatChicagoDateTime(o.balance.dueAt), state: state(o.balance.status) } } : {}),
  };
}

const fmtCT = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

/** Portal data for a home + dates + party (shared by the demo and real bookings). */
export function buildStay(o: { token: string; code: string; homeKey: string; checkIn: string; checkOut: string; adults: number; children: number;
  holder: string; paidAt: Date; deadline?: Date | null; mode: StayData["mode"]; done?: StayData["done"]; payments?: StayPayments }): StayData {
  const h = HOMES[o.homeKey]!;
  const p = h.photos[0]!;
  const nights = Math.round((Date.parse(o.checkOut) - Date.parse(o.checkIn)) / 864e5);
  const deadlineText = o.deadline ? formatChicagoDateTime(o.deadline) : verificationDeadline(o.paidAt, o.checkIn).deadlineText;
  return {
    token: o.token, code: o.code,
    home: { key: h.key, slug: h.slug, title: h.title, neighborhood: h.neighborhood, photo: `${h.photoBase}${p.id}.jpg`, photoAlt: p.alt, guestsMax: h.capacity.guests },
    checkIn: o.checkIn, checkOut: o.checkOut, nights,
    guests: { adults: o.adults, children: o.children },
    holder: o.holder,
    paidAtText: fmtCT(o.paidAt),
    paidAtISO: o.paidAt.toISOString(),
    deadlineText,
    // House guide (Oscar, Nov 17): check-in and house rules from the listing (source of truth), then the home's Guest
    // Book topics (houseGuides.ts), then safety from the listing.
    thingsToKnow: [
      ...h.thingsToKnow.filter((t) => t.title !== "Safety and property"),
      ...houseGuide(h.key),
      ...h.thingsToKnow.filter((t) => t.title === "Safety and property"),
    ],
    mode: o.mode,
    ...(o.done ? { done: o.done } : {}),
    ...(o.payments ? { payments: o.payments } : {}),
  };
}

export function demoStay(now = new Date()): StayData {
  const checkIn = addDaysISO(todayChicago(now), 24), checkOut = addDaysISO(checkIn, 3);
  const paidAt = new Date(now.getTime() - 60 * 60 * 1000); // "booked an hour ago"
  // Sample split booking: half paid now, half 30 days before check-in (the sample check-in is 24 days out, so the
  // sample balance shows as already paid).
  const payments = stayPayments({ totalCents: 184_250, paidNowCents: 92_125, paidAt, balance: { cents: 92_125, dueAt: new Date(paidAt.getTime() + 864e5), status: "paid" } });
  return buildStay({ token: "demo", code: "PH-TEST-0001", homeKey: "752", checkIn, checkOut, adults: 2, children: 2, holder: "Test Guest", paidAt, mode: "demo", payments });
}
