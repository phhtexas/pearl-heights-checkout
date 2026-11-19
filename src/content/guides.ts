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

/** A Google Maps search link for a place (no invented website). */
const mapq = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

export interface Guide {
  slug: string;
  approved: boolean;
  title: string;
  description: string;      // search/AI summary, ~150 characters
  updated: string;          // YYYY-MM-DD
  hero: GuidePhoto;
  /** Heading over the home cards, e.g. "Our homes by the Pearl". */
  homesHeading: string;
  /** Swipeable photo strip under the intro. */
  gallery: GuidePhoto[];
  intro: string[];
  homes: { key: string; fit: string; points: string[] }[];
  sections: { heading: string; photo?: GuidePhoto; paragraphs?: string[]; bullets?: string[]; steps?: { when: string; text: string }[] }[];
  /** Where to eat: names and descriptions as the venue lists them (source in `sources`). */
  eat?: { heading: string; intro: string; map?: { lat: number; lon: number; label: string; directions: string }; groups: { name: string; places: { name: string; what: string; web?: string; map: string; pearl?: string; pick?: boolean }[] }[]; note: string };
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
    homesHeading: "Our homes by the Pearl",
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
      map: { lat: 29.44228, lon: -98.47995, label: "Pearl", directions: "https://www.google.com/maps/search/?api=1&query=Pearl%2C%20San%20Antonio%2C%20TX" }, // OpenStreetMap (Nominatim) "Pearl Brewery"
      intro: "The Pearl has more than 30 places to eat and drink, all a few minutes' walk from both homes. A few by type of meal, with each place's own description:",
      groups: [
        { name: "Breakfast, coffee and bakeries", places: [
          { name: "Bakery Lorraine", what: "Classic French pastries", web: "https://bakerylorraine.com/", map: "https://maps.app.goo.gl/P2RCxY5vN7EeNbRL7", pearl: "https://atpearl.com/dine-and-drink/bakery-lorraine/", pick: true },
          { name: "Local Coffee Founders", what: "Coffee shop", web: "https://www.localcoffee.com/", map: "https://maps.app.goo.gl/PBK955EbRy7tuBDk8", pearl: "https://atpearl.com/dine-and-drink/local-coffee-founders/" },
          { name: "Voila Café", what: "French casual bistro", web: "https://voilacafes.com/", map: "https://maps.app.goo.gl/ZvxgJwWcFT9D46X16", pearl: "https://atpearl.com/dine-and-drink/voila-cafe/" },
          { name: "Pullman Market", what: "Specialty grocer with quick eats and dine-in spots", web: "https://www.pullmanmarket.com/", map: "https://maps.app.goo.gl/NDv3uMrCJoDPNHm46", pearl: "https://atpearl.com/dine-and-drink/pullman-market/" },
        ] },
        { name: "Quick and casual", places: [
          { name: "Henbit", what: "Smashburgers, shakes, fries", web: "https://www.bottlingdepartment.com/henbit/", map: "https://maps.app.goo.gl/Z4XpKB5iRsMHhiVy8", pearl: "https://atpearl.com/dine-and-drink/henbit/" },
          { name: "WonderSlice", what: "Neighborhood pizza joint", web: "https://www.wonderslicepizza.com/", map: "https://maps.app.goo.gl/7jnUvBxLaqiqUtKx9", pearl: "https://atpearl.com/dine-and-drink/wonderslice/" },
          { name: "La Gloria", what: "Mexican street food", web: "https://chefjohnnyhernandez.com/la-gloria-pearl/", map: "https://maps.app.goo.gl/cbHfar3oysLXKiLR6", pearl: "https://atpearl.com/dine-and-drink/la-gloria/", pick: true },
          { name: "Freight Fried Chicken", what: "Fried chicken", web: "https://www.bottlingdepartment.com/freight/", map: "https://maps.app.goo.gl/ykk7suGp3CvkYMtj6", pearl: "https://atpearl.com/dine-and-drink/freight-fried-chicken/" },
          { name: "Food Hall at Bottling Department", what: "Chef-driven food stands and a bar", web: "https://www.bottlingdepartment.com/", map: "https://maps.app.goo.gl/JS7ooYDUBag93UWn7", pearl: "https://atpearl.com/dine-and-drink/food-hall-at-bottling-department/", pick: true },
        ] },
        { name: "Sit-down dinner", places: [
          { name: "Fife & Farro", what: "Wood-fired pizza and fresh pasta", web: "https://fifeandfarro.com/", map: "https://maps.app.goo.gl/5ifi2gnS4g2FWWhP9", pearl: "https://atpearl.com/dine-and-drink/fife-farro/" },
          { name: "Southerleigh Fine Food & Brewery", what: "Texas cross-cultural cuisine and craft brewery", web: undefined, map: "https://maps.app.goo.gl/8h4oD5e1k2bP5Stf9", pearl: "https://atpearl.com/dine-and-drink/southerleigh-fine-food-brewery/", pick: true },
          { name: "Boiler House", what: "Texas grill and wine garden", web: "https://boilerhousesa.com/", map: "https://maps.app.goo.gl/QEDfkGozaFVvZQRe6", pearl: "https://atpearl.com/dine-and-drink/boiler-house/" },
          { name: "Mezquite", what: "The flavors of Sonora", web: "https://mezquitesatx.com/", map: "https://maps.app.goo.gl/qXRU52KUkao4Bh2m7", pearl: "https://atpearl.com/dine-and-drink/mezquite/" },
          { name: "Brasserie Mon Chou Chou", what: "French comfort food", web: "https://www.brasseriemonchouchou.com/", map: "https://maps.app.goo.gl/rvvvGHz7vYS1xQRQA", pearl: "https://atpearl.com/dine-and-drink/brasserie-mon-chou-chou/", pick: true },
          { name: "Ladino", what: "Modern Mediterranean grill", web: "https://ladinosatx.com/", map: "https://maps.app.goo.gl/mndoA55qMioKN8vT6", pearl: "https://atpearl.com/dine-and-drink/ladino/", pick: true },
          { name: "Best Quality Daughter", what: "New Asian-American cuisine", web: "https://www.bestqualitydaughter.com/", map: "https://maps.app.goo.gl/JkuNLeHBcytnfdRx7", pearl: "https://atpearl.com/dine-and-drink/best-quality-daughter/", pick: true },
        ] },
        { name: "More of our favorites nearby", places: [ // Oscar & Fernanda's guest book for 752 Myrtle (Canva p.12-13, read Nov 17)
          { name: "Larder", what: "Fine groceries and prepared foods (Pearl's description)", web: "https://atpearl.com/dine-and-drink/larder/", map: mapq("Larder Hotel Emma San Antonio"), pick: true },
          { name: "Full Goods Diner", what: "Diner", map: mapq("Full Goods Diner San Antonio"), pick: true },
          { name: "Down on Grayson", what: "Restaurant", map: mapq("Down on Grayson San Antonio"), pick: true },
          { name: "Carriqui", what: "Restaurant", map: mapq("Carriqui San Antonio"), pick: true },
          { name: "Burger Boy", what: "Burgers", map: mapq("Burger Boy San Antonio"), pick: true },
          { name: "Velvet Taco", what: "Tacos", map: mapq("Velvet Taco San Antonio"), pick: true },
          { name: "Cured", what: "Restaurant at the Pearl", map: mapq("Cured at Pearl San Antonio"), pick: true }, // Edgewood guest book (Canva p.14, read Nov 18)
          { name: "Hotel Emma bar", what: "The bar at Hotel Emma, at the Pearl", map: mapq("Sternewirth Hotel Emma San Antonio"), pick: true }, // Edgewood guest book: "Check out the Hotel Emma's bar as well!"
          { name: "Merritt Coffee", what: "Coffee", map: mapq("Merritt Coffee San Antonio"), pick: true },
          { name: "Extra Fine Coffee", what: "Coffee", map: mapq("Extra Fine Coffee San Antonio"), pick: true },
        ] },
        { name: "Treats", places: [
          { name: "Lick Honest Ice Cream", what: "Ice cream made with local, seasonal ingredients", web: "https://www.ilikelick.com/", map: "https://maps.app.goo.gl/NLf53GhK5Wy8oFLw6", pearl: "https://atpearl.com/dine-and-drink/lick-honest-ice-cream/" },
          { name: "Nicosi", what: "Dessert bar", web: "https://nicosisatx.com/", map: "https://maps.app.goo.gl/ZviAo4N3ahBsTYmx6", pearl: "https://atpearl.com/dine-and-drink/nicosi/" },
        ] },
      ],
      note: "Places marked Our pick are from our own guest book. Descriptions, websites and map links for places at the Pearl come from Pearl's website; the others link to a map search. Hours and menus change, so check before you go.",
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
  {
    slug: "alamo-heights-with-kids",
    approved: false,
    title: "Alamo Heights with kids",
    description: "Two family homes on quiet Alamo Heights streets, near the Zoo, the DoSeum and Brackenridge Park, with playrooms, cribs and fenced backyards.",
    updated: "2026-11-18",
    hero: own("claywell", "Aerial view of the area at sunset", "Alamo Heights at sunset"),
    homesHeading: "Our homes in Alamo Heights",
    gallery: [own("claywell", "Aerial view of the neighborhood", "Tree-lined Alamo Heights"), PH.brackenridge, PH.teaGarden, PH.witte, PH.pearl],
    intro: [
      "Alamo Heights is known for its tree-lined streets, charming homes and local restaurants. Our two homes here sit on quiet residential streets, a short drive from the Pearl, downtown and the River Walk.", // claywell summary + edgewood/claywell location
      "We're Oscar & Fernanda, parents of two young kids, and both homes have a playroom and the gear little ones need.",
    ],
    homes: [
      {
        key: "edgewood",
        fit: "A cozy 2-bedroom for families of up to 8",
        points: [
          "2 bedrooms, 3 beds, 1 bath, sleeps 8",
          "Playroom with toys, books and games; crib, pack 'n play and high chair on request",
          "Fenced backyard with a basketball hoop and patio",
          "Driveway parking for 4 cars, plus a Tesla charger",
        ],
      },
      {
        key: "claywell",
        fit: "3 bedrooms and a big backyard, for families of up to 8",
        points: [
          "3 bedrooms, 5 beds, 2 baths, sleeps 8",
          "Playroom, outdoor playground, and a toddler bed and crib in the primary bedroom; high chair and baby bath on request",
          "Fenced backyard with a fire pit, patio seating and outdoor dining",
          "Front driveway for 4 cars",
        ],
      },
    ],
    sections: [
      {
        heading: "Shopping, coffee and groceries nearby",
        paragraphs: [
          "Edgewood is a few blocks from The Quarry and Lincoln Heights shopping centers, with restaurants, coffee shops and stores. For groceries, our go-tos are Central Market on Broadway, Trader Joe's at the Quarry and H-E-B at Lincoln Heights.", // edgewood location + Oscar's guest book (752, Canva p.12-13)
        ],
      },
      {
        heading: "A morning at Brackenridge Park",
        photo: PH.brackenridge,
        paragraphs: [
          "The San Antonio Zoo, the DoSeum (San Antonio's children's museum) and the Witte Museum are a short drive from both homes. They sit in and around Brackenridge Park, which also has the Japanese Tea Garden, playgrounds and the San Antonio River running through it.", // edgewood location + Brackenridge Park Conservancy
        ],
      },
      {
        heading: "Museums and gardens",
        photo: PH.teaGarden,
        paragraphs: [
          "The McNay Art Museum is a short drive from Edgewood. The San Antonio Botanical Garden and the Japanese Tea Garden are on our own list of favorite places too.", // edgewood highlights + Oscar's guest book
        ],
      },
      {
        heading: "A simple day with little ones",
        steps: [
          { when: "Morning", text: "Drive a few minutes to the Zoo or the DoSeum in the Brackenridge Park area." },
          { when: "Midday", text: "Lunch and a stroll at The Quarry or Lincoln Heights." },
          { when: "Afternoon", text: "Back home for naps, the playroom and the fenced backyard." },
          { when: "Evening", text: "Dinner at the Pearl, a short drive away. Our restaurant picks there are in our Pearl guide." },
        ],
      },
      {
        heading: "Good to know before you book",
        bullets: [
          "Check-in after 4:00 PM, check-out before 10:00 AM, with self check-in",
          "Quiet hours are 10 PM to 8 AM; no parties, events or pets",
          "Exterior cameras: two at Edgewood (car gate and front door), one at The Claywell (front-door doorbell); none inside",
          "At The Claywell, please park in the front driveway: Alamo Heights doesn't allow cars on the street overnight",
          "The exact address is shared after your booking is confirmed and your rental agreement and ID check are complete",
        ],
      },
    ],
    eat: {
      heading: "Where to eat near our Alamo Heights homes",
      intro: "Our own favorites from our Edgewood guest book, in our words. Each links to a map search.",
      groups: [ // Oscar & Fernanda's guest book for 147 Edgewood (Canva p.13-14, read Nov 18, 2026)
        { name: "Our favorite restaurants nearby", places: [
          { name: "Cappy's", what: "Amazing food and service, great for brunch and dinner. Try to reserve ahead of time.", map: mapq("Cappy's Restaurant Alamo Heights San Antonio"), pick: true },
          { name: "Soluna", what: "Mexican food, great margaritas and food", map: mapq("Soluna Alamo Heights San Antonio"), pick: true },
          { name: "Paloma Blanca", what: "Mexican food and a great drinks spot", map: mapq("Paloma Blanca San Antonio"), pick: true },
          { name: "Hanzo", what: "Small bar-like place for great food and drinks", map: mapq("Hanzo Alamo Heights San Antonio"), pick: true },
          { name: "Bar Mon-Amie", what: "Nice little neighborhood bar", map: mapq("Bar Mon-Amie San Antonio"), pick: true },
          { name: "Piatti", what: "Italian food", map: mapq("Piatti Alamo Heights San Antonio"), pick: true },
          { name: "CAVA", what: "Mediterranean, quick and casual", map: mapq("CAVA Alamo Heights San Antonio"), pick: true },
          { name: "Sushi Zushi", what: "Sushi", map: mapq("Sushi Zushi Alamo Heights San Antonio"), pick: true },
          { name: "La Fonda on Main", what: "Mexican restaurant", map: mapq("La Fonda on Main San Antonio"), pick: true },
        ] },
        { name: "Groceries", places: [
          { name: "Central Market", what: "Grocery store on Broadway", map: mapq("Central Market Broadway San Antonio"), pick: true },
          { name: "Trader Joe's", what: "At the Quarry", map: mapq("Trader Joe's Quarry San Antonio"), pick: true },
          { name: "H-E-B", what: "At Lincoln Heights", map: mapq("H-E-B Lincoln Heights San Antonio"), pick: true },
        ] },
        { name: "Coffee and bakeries", places: [
          { name: "Bird Bakery", what: "Bakery", map: mapq("Bird Bakery San Antonio"), pick: true },
          { name: "Merritt Coffee", what: "Coffee", map: mapq("Merritt Coffee San Antonio"), pick: true },
          { name: "Press Coffee", what: "Coffee", map: mapq("Press Coffee Alamo Heights San Antonio"), pick: true },
          { name: "Boss Bagel", what: "Amazing bagels and great coffee", map: mapq("Boss Bagel San Antonio"), pick: true },
          { name: "Revolución", what: "Great coffee and fresh pressed juices", map: mapq("Revolucion Coffee Juice Alamo Heights San Antonio"), pick: true },
          { name: "Extra Fine Coffee", what: "Coffee", map: mapq("Extra Fine Coffee San Antonio"), pick: true },
        ] },
        { name: "Shopping", places: [
          { name: "Quarry Village", what: "Shops and restaurants", map: mapq("Quarry Village San Antonio"), pick: true },
          { name: "Lincoln Heights", what: "Shops and restaurants", map: mapq("Lincoln Heights shopping center San Antonio"), pick: true },
        ] },
      ],
      note: "All of these are from our own guest book and link to a map search. Hours and menus change, so check before you go. The Pearl is a short drive away: our restaurant picks there are in our Pearl guide.",
    },
    todo: {
      heading: "Things to do nearby",
      items: [
        { name: "San Antonio Zoo", what: "In the Brackenridge Park area.", distance: "A short drive" },
        { name: "The DoSeum", what: "San Antonio's children's museum.", distance: "A short drive" },
        { name: "Witte Museum", what: "Museum next to Brackenridge Park, with a dinosaur exhibit.", distance: "A short drive", photo: PH.witte },
        { name: "Japanese Tea Garden", what: "Gardens and ponds inside Brackenridge Park.", distance: "In Brackenridge Park", photo: PH.teaGarden },
        { name: "McNay Art Museum", what: "Art museum.", distance: "A short drive from Edgewood" },
        { name: "San Antonio Botanical Garden", what: "On our own list of favorite places.", distance: "A short drive" },
        { name: "The Pearl and the River Walk", what: "Restaurants, the weekend markets and the Museum Reach.", distance: "A short drive", photo: PH.pearl },
      ],
    },
    quotes: [
      { home: "edgewood", reviewer: "Danielle" },
      { home: "edgewood", reviewer: "Austin" },
    ],
    faq: [
      { q: "How far are the homes from the Pearl and downtown?", a: "Both are a short drive from the Pearl, downtown and the River Walk." },
      { q: "Do you have a crib and a high chair?", a: "Yes. Edgewood has a crib, a pack 'n play and a high chair on request. The Claywell has a crib and a toddler bed in the primary bedroom, plus a high chair and baby bath on request." },
      { q: "Which home is bigger?", a: "The Claywell has 3 bedrooms and 2 baths. Edgewood has 2 bedrooms and 1 bath. Both sleep up to 8." },
      { q: "Is there parking?", a: "Yes. Edgewood has driveway parking for 4 cars and a Tesla charger. The Claywell's front driveway fits 4 cars; Alamo Heights doesn't allow cars on the street overnight." },
    ],
    sources: [
      { label: "Brackenridge Park Conservancy: Things to see and do", url: "https://www.brackenridgepark.org/visit-the-park/things-to-see-and-do", read: "2026-11-18" },
    ],
  },
  {
    slug: "downtown-hemisfair-alamodome",
    approved: false,
    title: "Downtown with kids: Hemisfair, the Tower and the Alamodome",
    description: "A family home in historic Lavaca, about a 2-minute walk to the Tower of the Americas and 5 minutes to Hemisfair's playgrounds and the Convention Center.",
    updated: "2026-11-18",
    hero: own("indianola", "Backyard with Adirondack chairs and the Tower of the Americas at sunset", "The Tower of the Americas from our backyard"),
    homesHeading: "Our home by Hemisfair",
    gallery: [
      own("indianola", "Aerial view of downtown with nearby attractions labeled", "Downtown and the places you can walk to"),
      own("indianola", "Driveway with the Tower of the Americas in the background", "The Tower of the Americas, steps away"),
      own("indianola", "Upstairs deck dining table under the pergola at dusk", "The upstairs deck at dusk"),
      own("indianola", "Aerial view of downtown at dusk with nearby attractions labeled", "Downtown at dusk"),
    ],
    intro: [
      "Our home at 613 Indianola is in historic Lavaca, right next to downtown San Antonio. You can walk to the Tower of the Americas in about 2 minutes, the Alamodome in 4, Hemisfair and the Convention Center in 5, the River Walk in 8 and the Alamo in about 10.", // indianola location + highlights
      "We're Oscar & Fernanda, parents of two young kids. We set the house up for families and groups: a king bed in every bedroom, a game room, and a deck with views of the Tower.",
    ],
    homes: [
      {
        key: "indianola",
        fit: "Best for families, game days and Convention Center trips, up to 8",
        points: [
          "3 bedrooms, each with a king bed and a smart TV; 2 baths; sleeps 8",
          "Upstairs game room with arcade games, shuffleboard and board games",
          "Upstairs deck, covered outdoor dining, fenced backyard and a grill, with Tower views",
          "Free gated parking for 2 cars, room for 1 more outside, plus street parking",
        ],
      },
    ],
    sections: [
      {
        heading: "Hemisfair: playgrounds a few minutes' walk away",
        paragraphs: [
          "Hemisfair's Yanaguana Garden has an inclusive playground with climbing structures and swings, a toddler play area for ages 2 to 5, and a sand play area with a hand water pump. USA Today ranked it seventh among the 10 best public playgrounds in the U.S. in April 2025.",
          "Next door, Civic Park has The Springs, shallow water features where kids race toy sailboats, and the Great Lawn for picnics. The splash pad is closed for the season and reopens in spring 2027; in season it runs 9 AM to 9 PM.",
        ],
      },
      {
        heading: "The Tower of the Americas",
        paragraphs: [
          "At 750 feet, the Tower is the tallest observation tower in Texas, and it's about a 2-minute walk from the house. The observation deck needs no reservation; sunset and weekdays are the suggested times. There's also a 4D movie for all ages, a café and a Build-A-Bear, and the rotating Chart House restaurant, where reservations are recommended.",
        ],
      },
      {
        heading: "Game days and conventions",
        paragraphs: [
          "The Alamodome is about a 4-minute walk and the Convention Center about 5, so you can park once at the house and walk to the event.",
        ],
      },
      {
        heading: "La Villita and the River Walk",
        paragraphs: [
          "The River Walk is about an 8-minute walk. La Villita, a historic village of art galleries, shops and restaurants, is open Monday to Saturday 10 AM to 6 PM and Sunday 11 AM to 4 PM. It has no public parking of its own, so walking from the house is easiest.",
        ],
      },
      {
        heading: "A simple day with little ones",
        steps: [
          { when: "Morning", text: "Walk 5 minutes to Yanaguana Garden at Hemisfair to play." },
          { when: "Late morning", text: "Up the Tower of the Americas for the view and the 4D movie." },
          { when: "Afternoon", text: "Back to the house for naps, the game room and the backyard." },
          { when: "Evening", text: "Sunset on the deck with the Tower lit up, or a walk to the River Walk." },
        ],
      },
      {
        heading: "Good to know before you book",
        bullets: [
          "Check-in after 4:00 PM, check-out before 10:00 AM, with self check-in",
          "Quiet hours are 10 PM to 8 AM; no parties, events or pets",
          "Four exterior security cameras (front doorbell, driveway and two along the sides facing the street); none inside",
          "The exact address is shared after your booking is confirmed and your rental agreement and ID check are complete",
        ],
      },
    ],
    todo: {
      heading: "Things to do nearby",
      items: [
        { name: "Tower of the Americas", what: "Observation deck, 4D movie, café and a rotating restaurant.", distance: "About a 2-minute walk", photo: own("indianola", "Driveway with the Tower of the Americas in the background", "") },
        { name: "Alamodome", what: "Games, concerts and events.", distance: "About a 4-minute walk" },
        { name: "Yanaguana Garden at Hemisfair", what: "Playground, toddler area, sand play and, in season, a splash pad.", distance: "About a 5-minute walk" },
        { name: "Convention Center", what: "Next to Hemisfair.", distance: "About a 5-minute walk" },
        { name: "River Walk", what: "Downtown's river paths, restaurants and boat rides.", distance: "About an 8-minute walk" },
        { name: "La Villita", what: "Historic village of art galleries, shops and restaurants.", distance: "Near the River Walk" },
        { name: "The Alamo", what: "Downtown landmark.", distance: "About a 10-minute walk" },
        { name: "The Pearl", what: "Restaurants and the weekend markets.", distance: "About an 8-minute drive" },
      ],
    },
    quotes: [
      { home: "indianola", reviewer: "Sandra" },
      { home: "indianola", reviewer: "Xiaoshan" },
    ],
    faq: [
      { q: "How far is the Alamodome?", a: "About a 4-minute walk. The Convention Center is about 5 minutes, and the Tower of the Americas about 2." },
      { q: "Is there parking?", a: "Yes: free gated parking for 2 cars on the property, room for 1 more outside, and free street parking nearby." },
      { q: "Is the house good for little kids?", a: "Yes: there are baby safety gates, window guards and outlet covers, and a crib, pack 'n play, high chair and baby bath on request. Hemisfair's playgrounds are a 5-minute walk." },
      { q: "How far is the airport?", a: "About a 10-minute drive." },
    ],
    sources: [
      { label: "Hemisfair: Play at Hemisfair", url: "https://hemisfair.org/play/", read: "2026-11-18" },
      { label: "City of San Antonio: Hemisfair", url: "https://www.sa.gov/Directory/Departments/Parks/Parks-Facilities/Parks/Directory/Hemisfair", read: "2026-11-18" },
      { label: "KSAT: Yanaguana Garden among the 10 best public playgrounds", url: "https://www.ksat.com/news/local/2025/04/17/hemisfairs-yanaguana-garden-ranked-among-the-10-best-public-playgrounds-in-us", read: "2026-11-18" },
      { label: "Tower of the Americas: FAQ", url: "https://www.toweroftheamericas.com/faq/", read: "2026-11-18" },
      { label: "City of San Antonio: La Villita", url: "https://www.sa.gov/Directory/Departments/Parks/Parks-Facilities/Parks/Directory/La-Villita", read: "2026-11-18" },
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
