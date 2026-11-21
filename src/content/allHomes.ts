import { HOMES } from "./homes";
import { PROPERTIES } from "../domain/properties";

/**
 * Card data for the All Homes page (mockups A and B). Everything comes from the approved home content (homes.ts)
 * except BEST_FIT and PARKING, which are short labels proposed for Oscar's review (sources noted).
 */
export interface HomeCard {
  key: string; slug: string; title: string; area: string;
  guests: number; bedrooms: number; beds: number; baths: number;
  rating?: { value: number; count: number };
  photos: { src: string; alt: string }[];
  points: string[]; bestFit: string; parking: string; reviewQuote?: { name: string; text: string };
  /** Filter tags for mockup E chips, derived from the listing (see homeTags). */
  tags: string[];
}

/** One honest "best fit" label per home (Oscar's brief; PROPOSED, needs his OK). */
export const BEST_FIT: Record<string, string> = {
  "736": "Best for large families",        // sleeps 10, 5 bedrooms (homes.ts capacity)
  "752": "Walk to the Pearl",              // highlight "Walk to the Pearl"
  indianola: "Best for downtown events",   // highlight "Walk downtown" (Alamodome, Tower, Convention Center)
  edgewood: "Single-level home",           // amenity "Single-level home, no stairs"
  claywell: "Best for Alamo Heights",      // title "Large Family Home in the Heart of Alamo Heights"
};
/** Short parking line from each home's parking FAQ answer. */
const PARKING: Record<string, string> = {
  "736": "3 cars, gated",
  "752": "4 cars (3 gated)",
  indianola: "3 cars (2 gated)",
  edgewood: "4 cars + Tesla charger",
  claywell: "3+ cars",
};
/** Order on the page: biggest first, then by location story. */
const ORDER = ["736", "752", "indianola", "edgewood", "claywell"];

/** Filter tags from listing facts: highlights, amenities and area (nothing hand-typed). */
export function homeTags(key: string): string[] {
  const h = HOMES[key]!;
  const hl = h.highlights.map((x) => x.title);
  const items = [...h.amenityGroups.flatMap((g) => g.items), ...h.topAmenities];
  const t: string[] = [];
  if (hl.includes("Walk to the Pearl")) t.push("pearl");
  if (hl.includes("Walk downtown")) t.push("downtown");
  if (h.neighborhood === "Alamo Heights") t.push("alamo");
  if (items.some((i) => /^single-level home, no stairs$/i.test(i))) t.push("level");
  if (hl.includes("Ready for little ones")) t.push("kids");
  return t;
}

const short = (t: string, n = 150) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n)).replace(/[\s.,;:!—-]+$/, "") + "…");

export function homeCards(): HomeCard[] {
  return ORDER.map((key) => {
    const h = HOMES[key]!;
    const p = PROPERTIES.find((x) => x.key === key)!;
    const best = h.reviews.find((r) => (r.rating ?? 5) === 5 && r.text.length > 80);
    return {
      key, slug: h.slug, title: h.title, area: h.neighborhood,
      guests: p.maxGuests, bedrooms: h.capacity.bedrooms, beds: h.capacity.beds, baths: h.capacity.baths,
      rating: h.rating ? { value: h.rating.value, count: h.rating.count } : undefined,
      photos: h.photos.slice(0, 4).map((x) => ({ src: h.photoBase + x.id + ".jpg", alt: x.alt })),
      points: h.highlights.slice(0, 3).map((x) => x.title),
      bestFit: BEST_FIT[key]!, parking: PARKING[key]!,
      reviewQuote: best ? { name: best.name, text: short(best.text) } : undefined,
      tags: homeTags(key),
    };
  });
}

/* ---------- Mockup C additions (Oscar, Nov 16: Airbnb-style sections; everything sourced) ---------- */

/** Amenities ALL five homes have (checked against each home's amenity list; a test re-checks it). */
export const EVERY_HOME: { icon: string; label: string; match: RegExp }[] = [
  { icon: "kitchen", label: "Full kitchen", match: /^full kitchen/ },
  { icon: "wifi", label: "Wifi", match: /wifi/ },
  { icon: "parking", label: "Free parking", match: /^free (driveway |gated )?parking/ },
  { icon: "ac", label: "Central air", match: /^central air conditioning$/ },
  { icon: "washer", label: "Washer and dryer", match: /^(free )?washer and (free )?dryer/ },
  { icon: "yard", label: "Fenced backyard", match: /^private, fully fenced backyard$/ },
  { icon: "crib", label: "Crib and high chair on request", match: /crib/ },
  { icon: "key", label: "Self check-in", match: /^self check-in/ },
];

/** Questions every home answers the same way: copied from the listing FAQ (736) and the approved cancellation summary. */
export function sharedFaq(cancellation: string[]): { q: string; a: string }[] {
  const f = (q: string) => HOMES["736"]!.faq.find((x) => x.q === q)!.a;
  return [
    { q: "Why book direct?", a: f("Why book direct?") },
    { q: "What happens after I book?", a: f("What happens after I book?") },
    { q: "What are check-in and check-out times?", a: "Check-in is after 4:00 PM and check-out is before 10:00 AM at every home, with self check-in." },
    { q: "Can I cancel?", a: cancellation.join("\n") },
    { q: "Is there a damage waiver?", a: f("Is there a damage waiver?") },
    { q: "Can I pay in two parts?", a: f("Can I pay in two parts?") },
    { q: "Are pets allowed?", a: "No pets at any of our homes." },
  ];
}

/** Approximate map point per home: the listing map's center, which is set apart from the house (never the address). */
export function mapPoints(): { key: string; lat: number; lon: number }[] {
  return ORDER.map((key) => {
    const [w, s, e, n] = HOMES[key]!.location.mapBbox!.split(",").map(Number) as [number, number, number, number];
    return { key, lat: (s + n) / 2, lon: (w + e) / 2 };
  });
}

/** Real 5-star guest reviews, two per reviewed home, newest first in each home's list. */
/**
 * Trip snippets for the reviews shown on All Homes (Oscar, Nov 17: "Group trip", "Stayed with kids", "Stayed one week").
 * Source: each review's Hospitable reservation (nights, and guest counts only). Rules: any children or infants -> "Stayed
 * with kids"; otherwise 4+ adults -> "Group trip"; plus the exact number of nights. Checked Nov 17, 2026.
 */
const TRIP: Record<string, { nights: number; party?: "kids" | "group" }> = {
  "736|Tia": { nights: 3, party: "kids" },
  "736|Rebecca": { nights: 2, party: "kids" },
  "752|Connie": { nights: 6, party: "kids" },
  "752|Jodie": { nights: 4, party: "group" },
  "indianola|Sandra": { nights: 4, party: "kids" },
  "indianola|Xiaoshan": { nights: 3 },
  "edgewood|Mark": { nights: 2, party: "kids" },
  "edgewood|Patti": { nights: 4 },
};
export const tripTags = (t?: { nights: number; party?: "kids" | "group" }): string[] => !t ? [] : [
  ...(t.party === "kids" ? ["Stayed with kids"] : t.party === "group" ? ["Group trip"] : []),
  t.nights >= 7 && t.nights < 14 ? "Stayed one week" : t.nights >= 14 ? `Stayed ${Math.round(t.nights / 7)} weeks` : `Stayed ${t.nights} night${t.nights === 1 ? "" : "s"}`,
];

export function guestReviews(): { name: string; when: string; text: string; home: string; key: string; tags: string[] }[] {
  return ORDER.flatMap((key) => HOMES[key]!.reviews.filter((r) => (r.rating ?? 5) === 5 && r.text.length > 90).slice(0, 2)
    .map((r) => ({ name: r.name, when: r.when, text: short(r.text, 230), home: HOMES[key]!.title, key, tags: tripTags(TRIP[`${key}|${r.name}`]) })));
}
