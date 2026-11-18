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
  deadlineText: string;
  thingsToKnow: { title: string; items: string[] }[];
  /** "demo" = the sample portal (paperwork kept in the browser); "booking" = a real booking (paperwork saved on the server). */
  mode: "demo" | "booking";
  /** Real bookings: paperwork already recorded on the server (any device). */
  done?: { signedOn?: string; signedName?: string; signDoc?: string; verifiedOn?: string };
}

const fmtCT = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

/** Portal data for a home + dates + party (shared by the demo and real bookings). */
export function buildStay(o: { token: string; code: string; homeKey: string; checkIn: string; checkOut: string; adults: number; children: number;
  holder: string; paidAt: Date; deadline?: Date | null; mode: StayData["mode"]; done?: StayData["done"] }): StayData {
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
  };
}

export function demoStay(now = new Date()): StayData {
  const checkIn = addDaysISO(todayChicago(now), 24), checkOut = addDaysISO(checkIn, 3);
  const paidAt = new Date(now.getTime() - 60 * 60 * 1000); // "booked an hour ago"
  return buildStay({ token: "demo", code: "PH-TEST-0001", homeKey: "752", checkIn, checkOut, adults: 2, children: 2, holder: "Test Guest", paidAt, mode: "demo" });
}
