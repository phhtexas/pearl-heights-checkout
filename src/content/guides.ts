import { HOMES } from "./homes";

/**
 * Guides (Oscar, Nov 18): neighborhood guides that answer the questions families ask Google and AI assistants, each
 * linking to the homes it covers. Every fact comes from the approved home content (homes.ts, which carries the
 * listing source for each line) or from the official public pages listed in `sources`.
 * Photos of places other than our homes are freely licensed Wikimedia Commons photos, always shown with the author,
 * license and a link (Creative Commons attribution terms); never photos copied from other businesses' sites.
 * `approved: false` = draft: shown on the Vercel test site only; pearlheightshomes.com returns 404 until Oscar approves.
 */
export interface GuidePhoto {
  src: string; alt: string; caption: string;
  /** Creative Commons credit; omitted for our own listing photos. */
  credit?: { author: string; license: string; licenseUrl: string; page: string };
}
const commons = (file: string, thumb: string, author: string, license: string, licenseUrl: string, alt: string, caption: string): GuidePhoto =>
  ({ src: thumb, alt, caption, credit: { author, license, licenseUrl, page: `https://commons.wikimedia.org/wiki/${file}` } });
const own = (home: string, alt: string, caption: string): GuidePhoto => {
  const h = HOMES[home]!; const p = h.photos.find((x) => x.alt === alt)!;
  return { src: h.photoBase + p.id + ".jpg", alt, caption };
};

/** Photos used in the Pearl guide (Commons metadata read Nov 18, 2026). */
const PH = {
  pearl: commons("File:PearlBreweryCurrent15.JPG", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/PearlBreweryCurrent15.JPG/1280px-PearlBreweryCurrent15.JPG",
    "Brownings", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/", "The historic Pearl brewhouse and lawn", "The Pearl, about a 3-minute walk from both homes"),
  tanks: commons("File:Storage_tanks_at_Pearl_Brewery,_San_Antonio,_Texas,_US.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Storage_tanks_at_Pearl_Brewery%2C_San_Antonio%2C_Texas%2C_US.jpg/1280px-Storage_tanks_at_Pearl_Brewery%2C_San_Antonio%2C_Texas%2C_US.jpg",
    "Clyde Charles Brown", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "Old brewery storage tanks covered in vines at the Pearl", "The old brewery tanks at the Pearl"),
  aerial: own("736", "Aerial view of the neighborhood near the Pearl", "Our neighborhood, Tobin Hill, next to the Pearl"),
  reachNight: commons("File:Lights_along_the_Museum_Reach_of_the_San_Antonio_Riverwalk.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Lights_along_the_Museum_Reach_of_the_San_Antonio_Riverwalk.jpg/1280px-Lights_along_the_Museum_Reach_of_the_San_Antonio_Riverwalk.jpg",
    "Corey Leopold", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/", "Lights along the Museum Reach of the River Walk at night", "The Museum Reach of the River Walk in the evening"),
  reachFalls: commons("File:Head_of_Navigation_of_the_Museum_Reach_of_the_San_Antonio_Riverwalk,_2013.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Head_of_Navigation_of_the_Museum_Reach_of_the_San_Antonio_Riverwalk%2C_2013.jpg/1280px-Head_of_Navigation_of_the_Museum_Reach_of_the_San_Antonio_Riverwalk%2C_2013.jpg",
    "Cohee", "CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/", "Small waterfalls on the river at the top of the Museum Reach", "The top of the Museum Reach, near the Pearl"),
  brackenridge: commons("File:Brackenridge_Low_Water_Crossing.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Brackenridge_Low_Water_Crossing.jpg/1280px-Brackenridge_Low_Water_Crossing.jpg",
    "Corey Leopold", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/", "Shaded river crossing in Brackenridge Park", "The San Antonio River in Brackenridge Park"),
  teaGarden: commons("File:San_Antonio_Japanese_Tea_Garden_2022.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/San_Antonio_Japanese_Tea_Garden_2022.jpg/1280px-San_Antonio_Japanese_Tea_Garden_2022.jpg",
    "Jouaienttoi", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "Ponds and stone paths in the Japanese Tea Garden", "The Japanese Tea Garden in Brackenridge Park"),
  witte: commons("File:Dinosaur_exhibit_in_the_Witte_Museum.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Dinosaur_exhibit_in_the_Witte_Museum.jpg/1280px-Dinosaur_exhibit_in_the_Witte_Museum.jpg",
    "Mlwmiller", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/", "Dinosaur skeleton in the Witte Museum", "A dinosaur exhibit at the Witte Museum"),
} satisfies Record<string, GuidePhoto>;

export interface Guide {
  slug: string;
  approved: boolean;
  title: string;
  description: string;      // search/AI summary, ~150 characters
  updated: string;          // YYYY-MM-DD
  hero: GuidePhoto;
  /** Swipeable photo strip under the intro. */
  gallery: GuidePhoto[];
  intro: string[];
  homes: { key: string; fit: string; points: string[] }[];
  sections: { heading: string; photo?: GuidePhoto; paragraphs?: string[]; bullets?: string[]; steps?: { when: string; text: string }[] }[];
  /** Where to eat: names and descriptions as the venue lists them (source in `sources`). */
  eat?: { heading: string; intro: string; groups: { name: string; places: { name: string; what: string; web?: string; map: string; pearl: string }[] }[]; note: string };
  /** Things to do: cards with distance from the homes. */
  todo?: { heading: string; items: { name: string; what: string; distance: string; photo?: GuidePhoto }[] };
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
    hero: PH.pearl,
    gallery: [PH.aerial, PH.tanks, PH.reachFalls, PH.reachNight, PH.brackenridge, PH.teaGarden, PH.witte],
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
        photo: PH.tanks,
        paragraphs: [
          "On Saturdays the Pearl holds its farmers and ranchers market, and on Sundays an artisan market. Both are open-air and held rain or shine. Market hours are listed on Pearl's events calendar, so check it for the weekend you're here.",
          "Pullman Market at the Pearl is open every day from 8 AM, until 9 PM Sunday to Thursday and until 10 PM on Fridays and Saturdays.", // atpearl.com/weekend-market (read Nov 18)
        ],
      },
      {
        heading: "The River Walk from your door",
        photo: PH.reachNight,
        paragraphs: [
          "Both homes are a few minutes' walk from the Museum Reach, the northern stretch of the River Walk. Families who stayed with toddlers tell us they walked to the Pearl or the River Walk every morning.", // Hannah (752 review, Aug 2026)
          "To ride a boat, GO RIO's narrated river cruises board downtown, at the Rivercenter, Historia and Aztec docks, and leave about every 15 minutes, 10 AM to 10 PM most of the year. GO RIO also runs a river shuttle with stops along the River Walk, including the Museum Reach.",
        ],
      },
      {
        heading: "A morning at Brackenridge Park",
        photo: PH.brackenridge,
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
    eat: {
      heading: "Where to eat at the Pearl",
      intro: "The Pearl has more than 30 places to eat and drink, all a few minutes' walk from both homes. A few by type of meal, with each place's own description:",
      groups: [
        { name: "Breakfast, coffee and bakeries", places: [
          { name: "Bakery Lorraine", what: "Classic French pastries", web: "https://bakerylorraine.com/", map: "https://maps.app.goo.gl/P2RCxY5vN7EeNbRL7", pearl: "https://atpearl.com/dine-and-drink/bakery-lorraine/" },
          { name: "Local Coffee Founders", what: "Coffee shop", web: "https://www.localcoffee.com/", map: "https://maps.app.goo.gl/PBK955EbRy7tuBDk8", pearl: "https://atpearl.com/dine-and-drink/local-coffee-founders/" },
          { name: "Voila Café", what: "French casual bistro", web: "https://voilacafes.com/", map: "https://maps.app.goo.gl/ZvxgJwWcFT9D46X16", pearl: "https://atpearl.com/dine-and-drink/voila-cafe/" },
          { name: "Pullman Market", what: "Specialty grocer with quick eats and dine-in spots", web: "https://www.pullmanmarket.com/", map: "https://maps.app.goo.gl/NDv3uMrCJoDPNHm46", pearl: "https://atpearl.com/dine-and-drink/pullman-market/" },
        ] },
        { name: "Quick and casual", places: [
          { name: "Henbit", what: "Smashburgers, shakes, fries", web: "https://www.bottlingdepartment.com/henbit/", map: "https://maps.app.goo.gl/Z4XpKB5iRsMHhiVy8", pearl: "https://atpearl.com/dine-and-drink/henbit/" },
          { name: "WonderSlice", what: "Neighborhood pizza joint", web: "https://www.wonderslicepizza.com/", map: "https://maps.app.goo.gl/7jnUvBxLaqiqUtKx9", pearl: "https://atpearl.com/dine-and-drink/wonderslice/" },
          { name: "La Gloria", what: "Mexican street food", web: "https://chefjohnnyhernandez.com/la-gloria-pearl/", map: "https://maps.app.goo.gl/cbHfar3oysLXKiLR6", pearl: "https://atpearl.com/dine-and-drink/la-gloria/" },
          { name: "Freight Fried Chicken", what: "Fried chicken", web: "https://www.bottlingdepartment.com/freight/", map: "https://maps.app.goo.gl/ykk7suGp3CvkYMtj6", pearl: "https://atpearl.com/dine-and-drink/freight-fried-chicken/" },
          { name: "Food Hall at Bottling Department", what: "Chef-driven food stands and a bar", web: "https://www.bottlingdepartment.com/", map: "https://maps.app.goo.gl/JS7ooYDUBag93UWn7", pearl: "https://atpearl.com/dine-and-drink/food-hall-at-bottling-department/" },
        ] },
        { name: "Sit-down dinner", places: [
          { name: "Fife & Farro", what: "Wood-fired pizza and fresh pasta", web: "https://fifeandfarro.com/", map: "https://maps.app.goo.gl/5ifi2gnS4g2FWWhP9", pearl: "https://atpearl.com/dine-and-drink/fife-farro/" },
          { name: "Southerleigh Fine Food & Brewery", what: "Texas cross-cultural cuisine and craft brewery", web: undefined, map: "https://maps.app.goo.gl/8h4oD5e1k2bP5Stf9", pearl: "https://atpearl.com/dine-and-drink/southerleigh-fine-food-brewery/" },
          { name: "Boiler House", what: "Texas grill and wine garden", web: "https://boilerhousesa.com/", map: "https://maps.app.goo.gl/QEDfkGozaFVvZQRe6", pearl: "https://atpearl.com/dine-and-drink/boiler-house/" },
          { name: "Mezquite", what: "The flavors of Sonora", web: "https://mezquitesatx.com/", map: "https://maps.app.goo.gl/qXRU52KUkao4Bh2m7", pearl: "https://atpearl.com/dine-and-drink/mezquite/" },
          { name: "Brasserie Mon Chou Chou", what: "French comfort food", web: "https://www.brasseriemonchouchou.com/", map: "https://maps.app.goo.gl/rvvvGHz7vYS1xQRQA", pearl: "https://atpearl.com/dine-and-drink/brasserie-mon-chou-chou/" },
          { name: "Ladino", what: "Modern Mediterranean grill", web: "https://ladinosatx.com/", map: "https://maps.app.goo.gl/mndoA55qMioKN8vT6", pearl: "https://atpearl.com/dine-and-drink/ladino/" },
          { name: "Best Quality Daughter", what: "New Asian-American cuisine", web: "https://www.bestqualitydaughter.com/", map: "https://maps.app.goo.gl/JkuNLeHBcytnfdRx7", pearl: "https://atpearl.com/dine-and-drink/best-quality-daughter/" },
        ] },
        { name: "Treats", places: [
          { name: "Lick Honest Ice Cream", what: "Ice cream made with local, seasonal ingredients", web: "https://www.ilikelick.com/", map: "https://maps.app.goo.gl/NLf53GhK5Wy8oFLw6", pearl: "https://atpearl.com/dine-and-drink/lick-honest-ice-cream/" },
          { name: "Nicosi", what: "Dessert bar", web: "https://nicosisatx.com/", map: "https://maps.app.goo.gl/ZviAo4N3ahBsTYmx6", pearl: "https://atpearl.com/dine-and-drink/nicosi/" },
        ] },
      ],
      note: "Descriptions, websites and map links come from each place's page on Pearl's website. Hours and menus change, so check before you go.",
    },
    todo: {
      heading: "Things to do nearby",
      items: [
        { name: "Pearl weekend markets", what: "Farmers and ranchers market on Saturdays, artisan market on Sundays, open-air, rain or shine.", distance: "About a 3-minute walk", photo: PH.pearl },
        { name: "Museum Reach of the River Walk", what: "The northern stretch of the River Walk, right by the Pearl.", distance: "A few minutes' walk", photo: PH.reachFalls },
        { name: "GO RIO river cruise", what: "Narrated boat rides that board downtown (Rivercenter, Historia and Aztec docks), about every 15 minutes.", distance: "Short drive downtown" },
        { name: "San Antonio Zoo", what: "In the Brackenridge Park area.", distance: "About a 5–7 minute drive" },
        { name: "The DoSeum", what: "San Antonio's children's museum.", distance: "About a 5–7 minute drive" },
        { name: "Witte Museum", what: "Museum next to Brackenridge Park, with a dinosaur exhibit.", distance: "About a 5–7 minute drive", photo: PH.witte },
        { name: "Japanese Tea Garden", what: "Gardens and ponds inside Brackenridge Park.", distance: "In Brackenridge Park", photo: PH.teaGarden },
        { name: "McNay Art Museum", what: "Art museum.", distance: "About a 5–7 minute drive from 752 Myrtle" },
      ],
    },
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
      { label: "Pearl: Dine & Drink", url: "https://atpearl.com/eat/", read: "2026-11-18" },
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
