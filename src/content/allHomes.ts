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
    };
  });
}
