import { HOMES } from "./homes";

/**
 * Guides (Oscar, Nov 18): neighborhood guides that answer the questions families ask Google and AI assistants, each
 * linking to the homes it covers. Every fact comes from the approved home content (homes.ts, which carries the
 * listing source for each line); nothing about third-party places beyond what the listings say (names + drive/walk times).
 * `approved: false` = draft: shown on the Vercel test site only; pearlheightshomes.com returns 404 until Oscar approves.
 */
export interface Guide {
  slug: string;
  approved: boolean;
  title: string;
  description: string;      // search/AI summary, ~150 characters
  updated: string;          // YYYY-MM-DD
  heroHome: string;         // HOMES key for the photo
  intro: string[];
  homes: { key: string; fit: string; points: string[] }[];
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  quotes: { home: string; reviewer: string }[]; // real guest reviews, looked up from homes.ts (never written for us)
  faq: { q: string; a: string }[];
}

export const GUIDES: Guide[] = [
  {
    slug: "pearl-with-kids",
    approved: false,
    title: "Staying near the Pearl with kids",
    description: "Two family homes in Tobin Hill, about a 3-minute walk to the Pearl and the River Walk, with playrooms, cribs and fenced backyards.",
    updated: "2026-11-18",
    heroHome: "752",
    intro: [
      "The Pearl and the Museum Reach of the River Walk are a short walk from our two homes in Tobin Hill: about 3 minutes on foot from each one.", // 736 + 752 highlights "Walk to the Pearl"
      "We're Oscar & Fernanda, parents of two young kids, and we set up both homes for families with babies and little ones: a play area, a crib, a high chair and child-safe touches, all on one level with no stairs inside.",
    ],
    homes: [
      {
        key: "736",
        fit: "Best for bigger families and groups of up to 10",
        points: [
          "5 bedrooms, 3.5 baths, sleeps 10",
          "Playroom with toys and books; crib, pack-n-play, high chair and baby bath kept at the home and set up on request",
          "Fenced backyard with lounge seating and string lights",
          "Free parking behind the car gate for up to 3 cars, plus street parking",
        ],
      },
      {
        key: "752",
        fit: "Best for families of up to 8",
        points: [
          "3 bedrooms plus a sofa bed, 2 full baths, sleeps 8",
          "Bonus room that works as a kids' play area; crib, pack 'n play, high chair and baby bath on request",
          "Fenced backyard with patio seating",
          "Free parking for 4 cars on the property, plus street parking",
        ],
      },
    ],
    sections: [
      {
        heading: "What both homes have for little ones",
        bullets: [
          "One level, no stairs inside",
          "Children's books and toys for ages 0–2 and 2–5",
          "Children's dinnerware, outlet covers and table corner guards",
          "A full kitchen and a washer and dryer in the home",
          "A dedicated workspace if a parent needs to work",
        ],
      },
      {
        heading: "Family outings a short drive away",
        paragraphs: [
          "From either home, the San Antonio Zoo, the DoSeum and the Witte Museum are about a 5 to 7 minute drive, and from 752 Myrtle the McNay Art Museum is in the same range.", // 736 location: ~5 min; 752 location: 5–7 min incl. McNay
        ],
      },
      {
        heading: "Good to know before you book",
        bullets: [
          "Check-in after 4:00 PM, check-out before 10:00 AM, with self check-in",
          "Quiet hours are 10 PM to 8 AM; no parties, events or pets",
          "Two exterior security cameras at each home (car gate and front door); no cameras inside",
          "The exact address is shared after your booking is confirmed and your rental agreement and ID check are complete",
        ],
      },
    ],
    quotes: [
      { home: "752", reviewer: "Hannah" },
      { home: "736", reviewer: "Rebecca" },
    ],
    faq: [
      { q: "How far are the homes from the Pearl?", a: "Both are about a 3-minute walk to the Pearl and the River Walk." },
      { q: "Do you have a crib and a high chair?", a: "Yes. Both homes have a crib, a pack 'n play, a high chair and a baby bath. Tell us what you'd like set up before you arrive." },
      { q: "Which home is bigger?", a: "736 Myrtle sleeps 10 in 5 bedrooms with 3.5 baths. 752 Myrtle sleeps 8 in 3 bedrooms plus a sofa bed, with 2 full baths." },
      { q: "Is there parking?", a: "Yes, free parking at both: up to 3 cars behind the gate at 736 Myrtle and 4 cars at 752 Myrtle, plus free street parking." },
    ],
  },
];

/** The real review text for a quote (throws at build time if the review isn't in the approved content). */
export function guideQuote(q: Guide["quotes"][number]) {
  const r = HOMES[q.home]!.reviews.find((x) => x.name === q.reviewer);
  if (!r) throw new Error(`Guide quote not found: ${q.home}/${q.reviewer}`);
  return { ...r, home: HOMES[q.home]! };
}

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
