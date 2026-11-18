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
  sections: { heading: string; paragraphs?: string[]; bullets?: string[]; steps?: { when: string; text: string }[] }[];
  quotes: { home: string; reviewer: string }[]; // real guest reviews, looked up from homes.ts (never written for us)
  faq: { q: string; a: string }[];
  /** Public sources for facts about places beyond our homes (shown at the bottom of the guide). */
  sources: { label: string; url: string; read: string }[];
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
        heading: "Walk to the Pearl and leave the car at home",
        paragraphs: [
          "Both homes have free parking, and the Pearl is about a 3-minute walk, so you can skip Pearl's parking entirely. That helps on weekends: Pearl's surface lots are free on weekday mornings and early afternoons, but they charge a flat rate after 3 PM on weekdays and all day on Saturdays and Sundays, and the garages charge by the hour. Rates change, so check Pearl's parking page before you drive.", // atpearl.com/home/parking (page updated Feb 2025, read Nov 18)
        ],
      },
      {
        heading: "Weekends at the Pearl",
        paragraphs: [
          "On Saturdays the Pearl holds its farmers and ranchers market, and on Sundays an artisan market. Both are open-air and held rain or shine. Market hours are listed on Pearl's events calendar, so check it for the weekend you're here.",
          "Pullman Market at the Pearl is open every day from 8 AM, until 9 PM Sunday to Thursday and until 10 PM on Fridays and Saturdays.", // atpearl.com/weekend-market (read Nov 18)
        ],
      },
      {
        heading: "The River Walk from your door",
        paragraphs: [
          "Both homes are a few minutes' walk from the Museum Reach, the northern stretch of the River Walk. Families who stayed with toddlers tell us they walked to the Pearl or the River Walk every morning.", // Hannah (752 review, Aug 2026)
          "To ride a boat, GO RIO's narrated river cruises board downtown, at the Rivercenter, Historia and Aztec docks, and leave about every 15 minutes, 10 AM to 10 PM most of the year. GO RIO also runs a river shuttle with stops along the River Walk, including the Museum Reach.",
        ],
      },
      {
        heading: "A morning at Brackenridge Park",
        paragraphs: [
          "The San Antonio Zoo, the DoSeum (San Antonio's children's museum) and the Witte Museum are all about a 5 to 7 minute drive from either home. They sit in and around Brackenridge Park, which also has the Japanese Tea Garden, playgrounds and the San Antonio River running through it. From 752 Myrtle, the McNay Art Museum is in the same drive range.",
        ],
      },
      {
        heading: "A simple day with little ones",
        steps: [
          { when: "Morning", text: "Walk to the Pearl, about 3 minutes away (on a Saturday, the farmers market is on)." },
          { when: "Late morning", text: "Drive about 5 to 7 minutes to the Zoo or the DoSeum in the Brackenridge Park area." },
          { when: "Afternoon", text: "Head back for naps, the playroom and the fenced backyard." },
          { when: "Evening", text: "Walk the Museum Reach of the River Walk and have dinner at one of the Pearl's restaurants, a few minutes from home." },
        ],
      },
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
      { q: "Do we need to pay for parking at the Pearl?", a: "Not if you walk: the Pearl is about 3 minutes from both homes. If you drive, Pearl's surface lots are free on weekdays before 3 PM and charge after that and on weekends." },
      { q: "When is the Pearl farmers market?", a: "Saturdays, with an artisan market on Sundays. Check Pearl's events calendar for that weekend's hours." },
    ],
    sources: [
      { label: "Pearl: Parking", url: "https://atpearl.com/home/parking/", read: "2026-11-18" },
      { label: "Pearl: Weekend Market", url: "https://atpearl.com/weekend-market/", read: "2026-11-18" },
      { label: "Pearl: Farmers Market events calendar", url: "https://events.atpearl.com/series/farmers-market/", read: "2026-11-18" },
      { label: "GO RIO: Visitor information", url: "https://goriocruises.com/visitor-information", read: "2026-11-18" },
      { label: "GO RIO: FAQ", url: "https://www.goriocruises.com/faq/", read: "2026-11-18" },
      { label: "Brackenridge Park Conservancy: Things to see and do", url: "https://www.brackenridgepark.org/visit-the-park/things-to-see-and-do", read: "2026-11-18" },
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
