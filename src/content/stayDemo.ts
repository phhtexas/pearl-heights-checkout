import { HOMES } from "@/content/homes";
import { verificationDeadline } from "@/domain/verification";
import { addDaysISO, todayChicago } from "@/domain/time";

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
}

export function demoStay(now = new Date()): StayData {
  const h = HOMES["752"]!;
  const checkIn = addDaysISO(todayChicago(now), 24), checkOut = addDaysISO(checkIn, 3);
  const paidAt = new Date(now.getTime() - 60 * 60 * 1000); // "booked an hour ago"
  const d = verificationDeadline(paidAt, checkIn);
  const p = h.photos[0]!;
  return {
    token: "demo", code: "PH-TEST-0001",
    home: { key: h.key, slug: h.slug, title: h.title, neighborhood: h.neighborhood, photo: `${h.photoBase}${p.id}.jpg`, photoAlt: p.alt, guestsMax: h.capacity.guests },
    checkIn, checkOut, nights: 3,
    guests: { adults: 2, children: 2 },
    holder: "Test Guest",
    paidAtText: new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(paidAt),
    deadlineText: d.deadlineText,
    // House rules and check-in facts come from the home's listing content (sourced in homeSources.ts).
    thingsToKnow: h.thingsToKnow.filter((t) => t.title !== "Safety and property").concat(h.thingsToKnow.filter((t) => t.title === "Safety and property")),
  };
}
