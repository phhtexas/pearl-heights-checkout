/**
 * Listing-page content per home (template: 736 Myrtle, ChatGPT notes 138–139).
 * RULE: every visible fact has a source in homeSources.ts (kept out of the browser bundle); anything unverified is listed in `missing` and not shown as fact.
 * Sources: H = Hospitable property API (Nov 15, 2026); A = the home's Airbnb listing page (read Nov 15, 2026);
 * R = Hospitable review records (Airbnb reviews); O = Oscar's decisions in chat.
 */
export interface HomeContent {
  key: string;                   // matches PROPERTIES key
  slug: string;
  title: string;
  subtitle: string;
  neighborhood: string;
  capacity: { guests: number; bedrooms: number; beds: number; baths: number };
  photoBase: string;
  photos: { id: string; alt: string }[];
  /** Photo for each sleeping card, same order as `sleeping` (ids from `photos`). */
  roomPhotos: string[];
  rating?: { value: number; count: number; source: string; categories: [string, number][] };
  highlights: { title: string; text: string; source: string }[];
  summary: string;
  sleeping: { room: string; beds: string }[];
  amenityGroups: { group: string; items: string[] }[];
  topAmenities: string[];
  goodFit: string[];
  notFit: string[];
  location: { text: string; note: string; facts: string[]; mapBbox?: string };
  reviews: { name: string; when: string; text: string; rating?: number }[];
  host: { names: string; since: string; facts: string[]; bio: string; photo?: string };
  thingsToKnow: { title: string; items: string[] }[];
  faq: { q: string; a: string }[];
  /** City STR registration, only when the listing shows one. */
  registration?: string;
}

/** Shared host block (Airbnb host profile, Nov 15–16, 2026). */
const HOSTS: HomeContent["host"] = {
  names: "Oscar & Fernanda",
  photo: "/homes/hosts/oscar-fernanda.jpg",
  since: "Hosting for 4 years",
  facts: ["Airbnb Superhosts", "4.98 average across 463 Airbnb reviews of our homes", "Speak English and Spanish", "Usually reply within an hour"],
  bio: "Hello! We’re a family of four who love to travel and experience new places and cultures. With a 5-year-old girl and a 2-year-old boy, we know the importance of comfort and hospitality. As both guests and hosts, we value cleanliness, thoughtful touches, and creating a welcoming space. We set up our homes to feel like places we’d want our own family to stay in—cozy, well-equipped, and inviting. Our goal is to ensure every stay feels like home!",
  };

export const HOMES: Record<string, HomeContent> = {
  "736": {
    key: "736",
    slug: "736-myrtle",
    title: "Large Family House Next to the Pearl",
    subtitle: "Entire home in Tobin Hill, San Antonio",
    neighborhood: "Tobin Hill",
    capacity: { guests: 10, bedrooms: 5, beds: 5, baths: 3.5 },
    photoBase: "https://assets.hospitable.com/property_images/1713636/",
    photos: [
  { id: "ATEWtuErOcb9E6UypuOM23JgQ44D2C96Tt3DmPdx", alt: "Kitchen island with four counter stools and pendant lights" },
  { id: "ajrdFgXNc1WHvv6SbNgBzyD4pyz07laaZMy27CNd", alt: "Living room mantel with fireplace and decor" },
  { id: "uMJMRhgP9B5A9t0TSVtztr23aYd8NnK1913V5iP5", alt: "Aerial view of the neighborhood near the Pearl" },
  { id: "2zlYmHR7kRRVP9PWf3b2WnhzqjFthLIQVkHsxVy1", alt: "Front of the house: blue siding and planter" },
  { id: "UYcU5pxhI1lerMBaZquM1fXOJgoV2pdjWvOUxiCR", alt: "Living room sectional sofa" },
  { id: "3XQKdeKyeVpMvADWbTQmJHMgnzNyuLBXkfUfiMho", alt: "Backyard lounge with string lights at dusk" },
  { id: "sdweD3zduLE7QKWAKX6IB43pICFvCvDZ9GHPHVZJ", alt: "Front of the house with a lawn at sunset" },
  { id: "8oGc5FF8Fs3UQj82bLyRIR143qvn39uQyj9yXZWi", alt: "Living room with sectional sofa and coffee table" },
  { id: "EB3Ie1cLSrZ7wfpNfOEpE2ha0PzaSqIMCG8Znmo3", alt: "Covered patio with pergola in the backyard" },
  { id: "lCJDsllcqWgB1uWt3Ar5KIIaR2y6MPvursjSGciL", alt: "Backyard bonus room seen from the lawn" },
  { id: "q2345W4CmABwpn7e6hYG5vsUvw5RcOTmoMb9eYaT", alt: "Kitchen island and green cabinets" },
  { id: "AMyRewULeO20lFQFkRFWrNe7c3vr7OYCIKAQATmP", alt: "Bedroom with ceiling fan and framed art" },
  { id: "67KAMVgSiawiHOtthPj1iBlFUvJtdm4KltP8lj7J", alt: "Bedroom seating corner" },
  { id: "pl31NoJEbyHngPBEN3AMHprqiCLa4IyrLj06qMhy", alt: "Crib in a bedroom" },
  { id: "jZCUKfTCluAkxsNcIkwKlg4tbbcWnFByKScze6A8", alt: "Bed with patterned pillows" },
  { id: "lTrzfRnlJhj2HZel0C8SvoVU7ElS4etkNiKKWwWM", alt: "Framed travel posters above a bed" },
  { id: "c4KYo3CgFK4Kkh12P5auyXNIqTYFAzS3ihZCkw5F", alt: "Bedroom with red throw and side lamps" },
  { id: "7pnjk3qjjpoZcyPcQ8DgGp3imKsdMVBJvZzn4HKQ", alt: "Bed with reading lamp" },
  { id: "76UYLFWcHHMUM2kEh937I5qWRPaTdRwLCmSDmv5c", alt: "Bedroom with ceiling fan" },
  { id: "QSN5MvVxsp5HP1pUba2bAbXmVYaHMIrBTO2jMvn3", alt: "Bed with orange and pink pillows" },
  { id: "xUOVCEOrgAUk5ZPkDQHJB2DXOLyPHxmhEkpReZtq", alt: "Bedroom with two windows" },
  { id: "5atcxlayCLJMtEjdccMnmWDbo8GiNFRzw3Q9VAMx", alt: "Bedside table and lamp" },
  { id: "jvVrPa64UDsWC1RhuaAuCJsYgIEeJtnTrkoIwKmV", alt: "Pillows and headboard detail" },
  { id: "U3Q4fPAddf3ze90ypQRY7pYkX25Q04utm7rCmavB", alt: "Bedding detail" },
  { id: "Rw38LYC2FLsXSyEL2ArVFoQ1R7noC8yVm3gRSxVT", alt: "Bedroom with green blanket" },
  { id: "eMTLaWUswh02vPrOIB3bXluq8osxAB5Weit9PXTi", alt: "Bed with green blanket and wall art" },
  { id: "x3weLcgafuM1ttMll5MLyACGlYmkBA8HNAwj04Bi", alt: "Bedroom TV and wood panel wall" },
  { id: "xIqOCByadmfNF0Gch42MDq24ZO3GPX7WahEUeTHk", alt: "Bedroom with colorful framed art" },
  { id: "Y4ZN8iximqxo0FYdLIBLmbQYQUZnLO2upoSNQpQk", alt: "Bedside table with plant" },
  { id: "QgEbG7qqSQMPaIO1KqXDHRlpjtEnu837TKgWTvum", alt: "Bed with textured pillows under colorful art" },
  { id: "4iPHL4d3LIe2fsJIwC35gH1owX8m613mGWmsX92w", alt: "Pillow detail" },
  { id: "Kn0JvwY7e8LhxSkIMNSwsEcWOFN486ATKmm4MXkh", alt: "Bathroom vanity with wood cabinet" },
  { id: "8Kkmvj4Ga4kORAvjPupqxvAOms2fq1hbzTjgReFH", alt: "Walk-in glass shower" },
  { id: "1bi1pgTc4hSHL1561okYKpWcH4kuKZaTvokSvrJX", alt: "Bathroom with bathtub and wood vanity" },
  { id: "GWM8ZDh0bPTUsbeybtlL3ThHdMaMD1gdmMpeLrbn", alt: "Glass shower with green tile" },
  { id: "bSLUrylVKJFdn9brtwB4hoxBqATuOp124M6RHdpb", alt: "Shower and toilet" },
  { id: "TM6CpAlJJDHPcFwGpPbRraPtiDTTBJidMosO3ZMB", alt: "Half bathroom with patterned wallpaper" },
  { id: "DKhKGSrhXse7BecmoSLVHftcoS3tNN992lhPqhBY", alt: "Kitchen with island and green cabinets" },
  { id: "7ozsh3J6gWKHYJJ2ejkxA7aMAvaPUkYZsXIZThmy", alt: "Kitchen sink and counters" },
  { id: "1PJjktgDJ9HllTsNL5v74LpDFkApfAywc7VN2GTb", alt: "Kitchen counters and coffee area" },
  { id: "5W2o9kIWzNxQXLPzcAOI0eTESaf1v6Z97iNvR9aP", alt: "Snack and coffee station" },
  { id: "XpEPHjTSsuBcLDxBOsuYUOGkmZ9WMUdCA8fnmZdE", alt: "Glassware shelf" },
  { id: "GPpzQzQFbKsIvlKlpgEHO8lLQKSfClxiNojMvNkN", alt: "Refrigerator" },
  { id: "fgk0YVNgMkcyZVd0xkfiv9H3aTC4UmCbvx3ZMuCX", alt: "Dining table with floral wallpaper" },
  { id: "H9WPTorY28NpbJEEELMI43uBbVOAJxkoPcru94GS", alt: "Dining area with wood table" },
  { id: "zdb7kR3dWi434adk3YLL6Nc5aUW8buQOFB9EJ9aM", alt: "Electric fireplace with wood surround" },
  { id: "rXyL69OkPPQtEvzuLLOgSEcNj6CulfgTnR46V0cn", alt: "Living room with sectional and armchair" },
  { id: "1FsYDixeqDDuE9ehdLRcBIV2sHBjWewSUPnTHtmu", alt: "Laundry closet with stacked washer and dryer" },
  { id: "XlvjTVXex6GfgflYlcVD8NoqychYtlm0g9Nj1F8t", alt: "Workspace with desk and chair" },
  { id: "bmsEZR2CsUm2zbZ1dVYP0pdswbYENBnzQD1fzC6h", alt: "Kids' play table and toys" },
  { id: "kG7PAmODMOlFsU99rUIir9YWB8uUfwceowP53Khp", alt: "Backyard with lawn chairs around a fire table" },
  { id: "iTYECOYQMlVXZ2pxdsroByZHGRSi3zAlWoGT4RJZ", alt: "Patio lounge under pergola at night" },
  { id: "I72ha2UgSc7fPHCSCPZqziOOdWTRLyh9dLsEHflx", alt: "Backyard patio with string lights" },
  { id: "6bWmbmEQkI0coYS4a7HW35GIEI0YPLLwYqAt7KUd", alt: "Front door with glass panels" },
  { id: "LZM9ts7Y3m8fX7UdyOZObMNzzt5Ytnwbt1jGjaw3", alt: "Side of the house with lighting" },
  { id: "r2b1XWkruVMcUaqoJdD6quF8XGYHnRwIfjPUeBwN", alt: "House and lawn at dusk" },
  { id: "F5UF156uuiZMFO3k22R5284g5oQcy7loLhwzIyoK", alt: "Front yard and driveway" },
  { id: "ABjaoiOg3igAdRDn3uPVLbzWPhOAlU5DMKyMqw3o", alt: "Street view of the house at sunset" },
  { id: "wyazRKe0E16S2ICaDUJRQMu1wZSb1r8vLdm4DCcZ", alt: "Front entrance at night" },
  { id: "ncLsrq8QHOt0GHt4ojOucD1Wc8nYsDXm4JQz8bV8", alt: "Bonus room with blue sofa and colorful art" },
  { id: "0uwskaopWCaCNSaG76LNSvX8vTqrnV8dCfxIgeKb", alt: "Bonus room seating area" },
  { id: "bOnm6oXDBpCvhJbqRbWXZP1sHqpbd97ukWW59qrP", alt: "Bonus room with sofa and rug" },
  { id: "sClHTHBkC13WdnQYuRn5KwhKWOpDxtizggDOagix", alt: "Open living and dining area" },
  { id: "IA73eZzqWq9JFIdDjrEA0JvUVGPLVe3niy7wd2vb", alt: "Kitchen looking into the living room" },
  { id: "mAKAXnltZJ4SLH2qtCLba7ggOVLgNxZzDzgvpRAT", alt: "Open-plan living, dining and kitchen" },
  { id: "wQF9ObSVocWi8oquBSpSGnlVlLGKgexMGuXPmYeh", alt: "Hallway with bench" },
  { id: "NIo8Yctb5PVogx8mjPQKOJO0FApG7R3VDyWxpadO", alt: "Bedroom with TV" },
  { id: "xmjgfsIpAWnSxnTnC8LCx86YGLn48QLileRrcIMq", alt: "Kitchen glass-front cabinets" },
  { id: "L1VCuJfakVuD5k23fa9ILmHb7xupo8PhfIvjB4ZZ", alt: "Side yard and exterior lights" },
  { id: "D8iKlxQv3zSa71sYsnhRUgEQRwwkGHN6hUK9L7qX", alt: "Bonus room sliding door to the patio" },
  { id: "cLLecDHJNPl6RSh1SjKnGN9xYY8aNujzydZbFiLL", alt: "Bonus room exterior lit at night" }
    ],
    roomPhotos: [
      "AMyRewULeO20lFQFkRFWrNe7c3vr7OYCIKAQATmP", "jZCUKfTCluAkxsNcIkwKlg4tbbcWnFByKScze6A8", "c4KYo3CgFK4Kkh12P5auyXNIqTYFAzS3ihZCkw5F",
      "QSN5MvVxsp5HP1pUba2bAbXmVYaHMIrBTO2jMvn3", "eMTLaWUswh02vPrOIB3bXluq8osxAB5Weit9PXTi", "1bi1pgTc4hSHL1561okYKpWcH4kuKZaTvokSvrJX",
    ],
    rating: {
      value: 4.97, count: 78, source: "ratings from Airbnb guests",
      categories: [["Cleanliness", 4.99], ["Accuracy", 4.97], ["Check-in", 4.99], ["Communication", 4.99], ["Location", 4.99], ["Value", 4.95]],
    },
    highlights: [
      { title: "Walk to the Pearl", text: "About a 3-minute walk to the Pearl, the River Walk and restaurants.", source: "A listing; confirmed by Oscar (chat, Nov 15)" },
      { title: "One level, no stairs", text: "A single-level home: no stairs inside.", source: "H/A listing" },
      { title: "Ready for little ones", text: "A playroom with toys and books, plus a crib, pack-n-play, high chair and baby bath kept at the home and set up on request.", source: "A amenities; Oscar (chat, Nov 15): kept at the house, set up on request" },
      { title: "Backyard and bonus room", text: "Fenced backyard with lounge seating and string lights, plus a bonus room with TV, workspace and kids' area.", source: "H/A listing" },
    ],
    summary: "A redesigned 5-bedroom, 3.5-bath home for families and groups of up to 10, close to the Pearl and the Museum Reach of the River Walk. Open kitchen with an island, living room with a smart TV, a dedicated workspace, a playroom, and a large backyard with lounge seating.",
    sleeping: [
      { room: "Bedroom 1 (primary suite)", beds: "1 king bed, 1 crib · private bathroom" },
      { room: "Bedroom 2", beds: "1 queen bed · private bathroom" },
      { room: "Bedroom 3", beds: "1 queen bed" },
      { room: "Bedroom 4", beds: "1 queen bed" },
      { room: "Bedroom 5", beds: "1 queen bed" },
      { room: "Bathrooms", beds: "2 private (bedrooms 1 and 2) · 1 shared hall bath · 1 half bath" },
    ],
    topAmenities: ["Full kitchen", "Fast WiFi", "Dedicated workspace", "Free parking", "Washer and dryer", "Fenced backyard", "Crib and high chair", "Playroom"],
    amenityGroups: [
      { group: "Kitchen and dining", items: ["Full kitchen: electric stove, slide-in electric oven, dishwasher", "4-door French-door refrigerator and freezer", "Microwave, toaster, blender, kettle", "Drip coffee maker, French press and Keurig; coffee", "Pots and pans, oil, salt and pepper", "Dishes, silverware, wine glasses, baking sheet", "Trash compactor", "Dining table"] },
      { group: "Family", items: ["Children's playroom with toys, books and games", "Children's books and toys (ages 0–2 and 2–5)", "Crib, on request (sheets provided)", "Pack-n-play travel crib, on request", "High chair with straps and tray, on request", "Baby bath, on request", "Children's dinnerware", "Outlet covers and table corner guards", "Board games"] },
      { group: "Bedroom and laundry", items: ["Cotton hotel-style sheets, extra pillows and blankets", "Room-darkening shades", "Closets and hangers", "Free washer and dryer in the home", "Iron, hair dryer"] },
      { group: "Bathroom", items: ["Bathtub", "Vegan shampoo, conditioner and body wash", "Towels, soap and toilet paper", "Hot water"] },
      { group: "Entertainment and work", items: ["55-inch HDTV with Netflix, Disney+ and Roku", "Free weights and yoga mat", "Books and board games", "Dedicated workspace", "WiFi"] },
      { group: "Heating and cooling", items: ["Central air conditioning", "Ductless split A/C", "Central heating", "Ceiling fans", "Electric indoor fireplace"] },
      { group: "Outdoors, parking and access", items: ["Private, fully fenced backyard", "Outdoor furniture", "Private entrance", "Free parking behind the car gate for up to 3 cars", "Free street parking", "Single-level home, no stairs", "Accessible parking spot (at least 11 ft wide) and lit path to the entrance", "Self check-in with keypad"] },
      { group: "Safety", items: ["Smoke and carbon monoxide alarms in each main area and bedroom", "Fire extinguisher", "First aid kit", "Two exterior security cameras (see Things to know)", "No cameras inside the home"] },
    ],
    goodFit: ["Families with babies and young kids", "Groups of up to 10 who want separate bedrooms", "Guests who want to walk to the Pearl and the River Walk", "Remote workers (dedicated workspace)"],
    notFit: ["Parties or events (not allowed)", "Pets (not allowed)", "Smoking or vaping anywhere on the property", "Late-night noise: quiet hours are 10 PM to 8 AM", "Guests who don't want exterior security cameras (two outside, recording audio)"],
    location: {
      text: "Tobin Hill, near the Pearl and the Museum Reach of the River Walk.",
      facts: ["About a 3-minute walk to the Pearl, the River Walk and restaurants", "About a 5-minute drive to the San Antonio Zoo, the DoSeum and the Witte Museum"],
      mapBbox: "-98.4935,29.4350,-98.4705,29.4510", // centered between the home and the Pearl so the circle never pinpoints the house
      note: "The exact address is shared after your booking is confirmed and your rental agreement and ID check are complete.",
    },
    reviews: [
      { name: "Tia", when: "November 2026", rating: 5, text: "This Airbnb is amazing! It has everything you could need — plus it’s super kid friendly. Every part of the house was thoughtful, inside and outside. Plenty of space too, many areas to just hang out and relax. The location can’t be beat, it’s a block away from the Pearl. Would 10/10 stay again!! 🤎" },
      { name: "Rebecca", when: "October 2026", rating: 5, text: "We enjoyed staying at this beautiful home so close to the Pearl! The house was stocked with everything we needed to feel right at home. Very easy walk to the Pearl, even with children. We loved the backyard and playroom set up. This house had something for the whole family to enjoy!" },
      { name: "Trenton", when: "October 2026", rating: 5, text: "The place was pristine, immaculate, all of the other words that describe something close to perfection. Super close to all the attractions in SA! The outside area is perfect for kids. Going to model my next home after this one! Must stay!" },
      { name: "Jonelyn", when: "September 2026", rating: 5, text: "This house was exactly what we needed! It's truly family friendly, especially for young kids. They had a crib, a high chair, and even a playroom, plus a step stool in the bathroom and plastic plates and utensils in the kitchen. We loved the spaciousness, the luxurious amenities, and the open kitchen, which we used a lot. Cooking family breakfasts together was a highlight. We couldn't believe how close the house is to the Pearl, less than a 5-minute walk! We all raved about our stay here. Thank you for providing such a beautiful home away from home." },
      { name: "Liliana", when: "September 2026", rating: 5, text: "This house was perfection! 😍 Besides being absolutely beautiful, it had everything we could possibly need while on our trip. We were a big family of 8, and we all fit perfectly and had plenty of space. Everything was also very clean and well taken care of. Even the little details were great, like the shampoo, conditioner, body wash, and lotion they provided. They were actually really good! The backyard with the string lights was exactly what we were looking for and made our evenings there even more special. Communication with the hosts was also top-notch. They were very responsive and helpful throughout our stay. We truly enjoyed our stay and would definitely stay here again! ❤️" },
      { name: "Savanna", when: "July 2026", rating: 5, text: "This was our 2nd year in a row to stay here! We were a group of 10, with 4 kids, it was the best set up which is why we booked for the 2nd time. It is 20 minutes from seaworld and about 7 minutes from the river walk! Great location and great set up. We all had our individual rooms and felt safe and at home! Oscar and Fernanda were also incredibly fast responding to every question we had. We would absolutely book again for the 3rd time! Thanks for having us!!" },
    ],
    host: HOSTS, // same hosts on every home (Airbnb host profile)
    thingsToKnow: [
      { title: "Check-in and check-out", items: ["Check-in after 4:00 PM", "Check-out before 10:00 AM", "Self check-in with a door keypad"] },
      { title: "House rules", items: ["Up to 10 overnight guests; only the guests on your reservation may use the home", "The reservation holder must be 25 or older and stay at the home", "No parties or events", "No pets", "No smoking, vaping or illegal substances in or within 25 feet of the home", "Quiet hours 10 PM to 8 AM", "No commercial photography or filming", "Before you leave: dishes in the dishwasher, close all doors, windows and the car gate, and send us a quick message"] },
      { title: "Safety and property", items: ["Two exterior security cameras: one faces the car entry gate and one is the front-door doorbell. They are motion-activated, record audio, and are checked occasionally, not monitored live.", "No cameras inside the home", "Smoke and carbon monoxide alarms in each main area and bedroom", "Fire extinguisher and first aid kit"] },
    ],
    faq: [
      { q: "Why book direct?", a: "You book with us, the hosts, see your full total before you pay, and pay securely through Stripe. Questions go straight to Oscar and Fernanda." },
      { q: "What happens after I book?", a: "You'll get a confirmation email. Then you sign the rental agreement and verify your ID online (about 3 minutes each). The address, entry steps and WiFi appear in your private stay page once both are done." },
      { q: "Is there a damage waiver?", a: "Yes. Every direct stay includes a damage waiver with $5,000 coverage for accidental damage, as described in the rental agreement. It's included in your total." },
      { q: "Can I pay in two parts?", a: "When check-in is more than 30 days away, you can pay half now and the rest automatically 30 days before check-in, at no extra cost." },
      { q: "Is the home good for babies and toddlers?", a: "Yes: there's a playroom with toys and books, children's dinnerware, outlet covers and corner guards, and a crib, pack-n-play, high chair and baby bath kept at the home. Tell us what you'd like set up." },
      { q: "Is there an outdoor grill?", a: "No, there's no outdoor grill. The kitchen is fully equipped." },
      { q: "Is there parking?", a: "Yes: free parking behind the car gate for up to 3 cars, plus free street parking. There's an accessible parking spot at least 11 feet wide and a lit path to the entrance." },
    ],
    registration: "STR-25-13500115",
  },
  edgewood: {
    key: "edgewood",
    slug: "edgewood-alamo-heights",
    title: "Stylish, Charming Home In The Heart of San Antonio",
    subtitle: "Entire home in Alamo Heights, San Antonio",
    neighborhood: "Alamo Heights",
    capacity: { guests: 8, bedrooms: 2, beds: 3, baths: 1 },
    photoBase: "https://assets.hospitable.com/property_images/921018/",
    photos: [
      { id: "3AwyCByNAQ84CAJ5joG6CUIYKuUPgM3ieYszVxj4", alt: "Living room with blue-and-white tiled fireplace and lounge chairs" },
      { id: "tY1tCBt4WN2H7By1jtORrYdTupnyl8dTmTa5vaBA", alt: "Front of the house at dusk with walkway and lawn" },
      { id: "jsxHrz1q969b24VWxaft9sqV5JQIeuibReG5kCjA", alt: "Front porch with bistro table and chairs" },
      { id: "wiqikkrCnBZCyJ9r40UasdjU8xj8C1BIA4rpB0n5", alt: "Living room with sofa, tiled fireplace and wood front door" },
      { id: "kwc24bDBYWU9smZXIdIL0Ofn169mY2yhlUoxfpKC", alt: "Living room open to the dining area" },
      { id: "du7WtNoISDNgDihBRkxnCQVE8uOXz3lNeQDp2bFe", alt: "Back patio with sofa, sling chairs and coffee table" },
      { id: "xVRdvzzgp7l69HsIbCLrLSZoec3GOSBrU7dpYq5D", alt: "Bedroom with bed, ceiling fan and sling chair" },
      { id: "Z5TOI0AmYd6wR3oQYbP1kdGSkdBNxCFI8nUHt6LQ", alt: "Front porch and entry steps" },
      { id: "RL53zm7YGdQjs7svcrjkJ54VCtXkkHjraFeslQ9N", alt: "Front door with fall wreath and pumpkins" },
      { id: "2yWUp0JLIujhk40K9NHi3RT3Eu0HBvJ3CmhEO9wt", alt: "Living room with sofa, two armchairs and tiled fireplace" },
      { id: "iQzlrJsy15AY9eiKK0PVqZRWz9kNVsMJzu9ohBhb", alt: "Living room TV above the tiled fireplace" },
      { id: "5fXTEI6FbjNnZuMeavJ4BLsV0r3Rlw4hLWBDMLiQ", alt: "Front porch with welcome mat and fall pumpkins" },
      { id: "jFC3N0q2YYWi5rI7vwoa5lEjgql8yLFnJJIy0v06", alt: "Dining area with mural wall and wood table" },
      { id: "Na2jaWAHucthhJMT26smB5airCcRUDaqElF9JlxR", alt: "Front of the house and lawn at dusk" },
      { id: "kucGJZXhwFYxmNJnoY8nvhspZMpfVxvyaC6tyYdc", alt: "Covered back patio with sectional and lounge chairs" },
      { id: "5kcgZ7aHbBs4MgdDcixMdB6Mm3BY4zxqw6MP66JK", alt: "Playroom with pink sofa, seen from the living room" },
      { id: "tC6utY4P9xBfT8pBayYHlCIJBpCrr3pV4NrUHLht", alt: "Console table with lamp" },
      { id: "WmqGBS1hlzuByujNmgqLv2MBbIby1o8ynDMTKrgZ", alt: "Living room window looking onto the front porch" },
      { id: "yhRnqmwloKXy3hG66bdtY49y8fXkDjr50XVK97zC", alt: "Front door with glass panes and porch lights" },
      { id: "LUudXN0FvFdW1xJdIsA1UgbEhVkovQQYI61IOHjW", alt: "Front porch at dusk with bistro table" },
      { id: "pwp2FEaOx1fIFSp7wPTS9WXtiQayhpmrTwV6SmtF", alt: "Front porch and house lit at dusk" },
      { id: "0drrSxfDAdPJN5mGjTwBJSanKlCdQBxl6CiCOYur", alt: "Front porch detail" },
      { id: "OAxnBVLyN86W88itsAjzgpdaaOcJkfGEOwIhf590", alt: "Kids' table and stools in the playroom" },
      { id: "EF1kcYIfFJFfobeSPdlVAEr5rwW2bdZ0jHNPjMT2", alt: "Playroom sofa under the windows" },
      { id: "AHzOvyGtKz2tWQyfgsjYosOvtaX1Qe0ilhxL2ajS", alt: "Playroom with patterned tile floor, pink sofa and cubby shelves" },
      { id: "XJQuC16KWELowTcSprRspTsWpioC0jCO0Tqi0PWB", alt: "Dining bench cushion and mural wall" },
      { id: "pwQs69s6DX6gSLTaRALv2NRO2P7cK26lYoj1mA16", alt: "Dining bench with storage baskets and pillows" },
      { id: "m6XfxPL8gTiuopmp1EpFLJQ3tGdYrMWsO7QpGcTT", alt: "Dining table with plants and mural" },
      { id: "Gos1S0aChwRJJW0UIaauHkzBRxKuHcVh90nbr5w3", alt: "Bathroom with double vanity and lit mirror" },
      { id: "0I690INorv4LN6unFCXlv4NhNWMjrP6DZ0iPQB35", alt: "Bathroom double sink with black faucets" },
      { id: "VTIgHlVxSaTvX3jw3bCepQ85JMJoFuGxCd3AFcHW", alt: "Glass shower with patterned tile" },
      { id: "U6RAUV0WZ3QooF4ClLqDI29Z92JbetjjWALSWDV3", alt: "Rain shower head" },
      { id: "rxkzpgv9CtFV7hjsQBwp52rmEOTPjzai1NABUBcI", alt: "Bathroom sink and soap dispenser" },
      { id: "4EdnBAtWQ3iksTI1Dlmo6s5l2ceqit9l8uBmtbZc", alt: "Primary bedroom with king bed and bench" },
      { id: "z869jCg1ZtdpY8S9f9EaiA6op6ow0fALZH7dPJl4", alt: "Primary bedroom king bed with pillows" },
      { id: "BugxBCm1uHMalw22tQ35MZDw6C2wyN6iOw3MCJEy", alt: "Primary bedroom lounge chair" },
      { id: "QGgFZ7IlO8Wz36Jp2bfrTQxVbeq3O0rSfaV7Nk8T", alt: "King bed with side table and lamp" },
      { id: "UbupKxJZhzTX2ByKrOOG6VcQqPGnRyfwGLb5jK1R", alt: "Guest bedroom queen bed with Texas pillow" },
      { id: "7vcKwgiHn8H7Qdge4S6uvXy3tHysMbtcHULm7BIM", alt: "Queen bed with tufted headboard" },
      { id: "HKfvhkmIMUeo5gvBIt6SBosH4VGLWNwfnIhFtqRY", alt: "Queen bed under a window with lamps" },
      { id: "uAhJ6USefOlFYb86TxUWV4uQvPc0pgDHghoZm4gn", alt: "Kitchen with retro blue refrigerator and gray cabinets" },
      { id: "OMgzTORvwdViDWEsjVYOksEJERkteQKnrelnTfe8", alt: "Kitchen refrigerator, open" },
      { id: "Wje51v8zFPRJDcsm4mpjHv5L7q7sY9ia1l3dEIrD", alt: "Bowl of lemons on the kitchen table" },
      { id: "ke80ADnllc63drEZcSK5pueTgXRoOlVvRZ5LT7Fb", alt: "Breakfast nook dining bench and table" },
      { id: "n1JfrKJItwqm2S0acYtcx0yzFT1TeHqCQyZVNdkO", alt: "Coffee station on a wood kitchen counter" },
      { id: "cyN8yVCIdbnH2b3G8h7OVV5KK2B6GQ2lh6Ch27Cq", alt: "Backyard lawn with string lights at dusk" },
      { id: "OAmtqYJTOJaKdxx4ivQDQGzmAOJD5a9Rv9ybolXV", alt: "Backyard with Adirondack chairs and string lights" },
      { id: "3SF6BJiw6b3YH4Cddx0wEh5OMfa9JlLuiXKlbEdF", alt: "Patio seating with coffee table" },
      { id: "WlFHxp37fpPpmNz3bxHYaNm9UZaiyeP1cuKdULZL", alt: "Driveway and back of the house at dusk" },
      { id: "slIfkn5THEWfqADGgQlfaeIgWcSvnXp0wxInsxTg", alt: "Patio sofa below a window" },
      { id: "IELVInz6XIQGFJ9Kqv4oeqKAeEgGdyyDxuM0l0YC", alt: "EV charger: Tesla wall connector" },
      { id: "7pcC4UxskdN3A7hEA5XAodtMyMccvNAQxSvGo5a7", alt: "Keypad at the entry gate" },
      { id: "BE7jYmEHs1WKBsCQ94EpBS1FyozKe97cJr8reHQh", alt: "Front of the house and lawn" },
      { id: "tRczqPOrAEpM8f7cnOUmQcy4BlOdWvrFBfczXXsF", alt: "Front porch and lawn" },
      { id: "lNsZ4R2hb6tjEmB9HeNZGQnYAJzUiHcwiB48vAYg", alt: "Aerial view of the house and neighborhood" },
      { id: "eUYh4rPWySkC6SaUq9kvcn9YuwmWgHcFgRYQ0ZjZ", alt: "Front walkway and house" }
    ],
    roomPhotos: ["UbupKxJZhzTX2ByKrOOG6VcQqPGnRyfwGLb5jK1R", "4EdnBAtWQ3iksTI1Dlmo6s5l2ceqit9l8uBmtbZc", "2yWUp0JLIujhk40K9NHi3RT3Eu0HBvJ3CmhEO9wt", "Gos1S0aChwRJJW0UIaauHkzBRxKuHcVh90nbr5w3"],
    rating: {
      value: 4.99, count: 239, source: "ratings from Airbnb guests",
      categories: [["Cleanliness", 5.0], ["Accuracy", 4.99], ["Check-in", 4.98], ["Communication", 4.99], ["Location", 5.0], ["Value", 4.95]],
    },
    highlights: [
      { title: "In Alamo Heights", text: "A quiet Alamo Heights street, a short drive to the Pearl, the River Walk and the McNay Art Museum.", source: "A listing highlights" },
      { title: "Parking for 4 cars", text: "Free driveway parking for four cars, plus a Level 2 EV charger (Tesla only).", source: "A amenities" },
      { title: "Ready for little ones", text: "A playroom with toys, books and games and a baby bath at the home; crib, pack 'n play and high chair on request.", source: "A amenities" },
      { title: "Fenced backyard and patio", text: "A private, fully fenced backyard with a basketball hoop, a patio and outdoor furniture.", source: "A amenities" },
    ],
    summary: "A newly remodeled 2-bedroom home for up to 8 guests on a quiet street in Alamo Heights. Living room with a 65-inch TV and an electric fireplace, a children's playroom, a dedicated workspace with fast WiFi, and a fully fenced backyard with a patio.",
    sleeping: [
      { room: "Bedroom 1", beds: "1 queen bed" },
      { room: "Bedroom 2 (primary)", beds: "1 king bed" },
      { room: "Living room", beds: "1 sofa bed" },
      { room: "Bathroom", beds: "1 full bathroom" },
    ],
    topAmenities: ["Full kitchen", "Fast WiFi (770 Mbps)", "Dedicated workspace", "Free driveway parking (4 cars)", "Washer and dryer", "Fenced backyard", "EV charger (Tesla)", "Playroom"],
    amenityGroups: [
      { group: "Kitchen and dining", items: ["Full kitchen: Samsung stainless steel electric stove and oven, dishwasher", "Refrigerator and freezer", "Microwave, toaster, blender, kettle", "Drip coffee maker, French press and Keurig; coffee", "Pots and pans, oil, salt and pepper", "Dishes, silverware, wine glasses, baking sheet", "Dining table"] },
      { group: "Family", items: ["Children's playroom with toys, books and games", "Children's books and toys (ages 0–2 and 2–5)", "Mini crib, on request (sheets provided)", "Pack 'n play travel crib, on request", "High chair, on request", "Baby bath (always at the home)", "Children's dinnerware", "Outlet covers", "Board games"] },
      { group: "Bedroom and laundry", items: ["Cotton hotel-style sheets, extra pillows and blankets", "Room-darkening shades", "Closet and hangers", "Free washer and dryer in the home", "Iron, hair dryer"] },
      { group: "Bathroom", items: ["Vegan shampoo, conditioner and shower gel", "Towels, soap and toilet paper", "Cleaning products", "Hot water"] },
      { group: "Entertainment and work", items: ["65-inch HDTV with Netflix, Roku, Amazon Prime Video, premium cable and Fire TV", "Free weights and yoga mat", "Books and life-size games", "Dedicated workspace with laptop stand and surge protector", "Fast WiFi (770 Mbps)"] },
      { group: "Heating and cooling", items: ["Central air conditioning", "Central and radiant heating", "Ceiling fans", "Electric indoor fireplace"] },
      { group: "Outdoors, parking and access", items: ["Private, fully fenced backyard", "Basketball hoop in the backyard", "Private patio and outdoor furniture", "Private entrance", "Free driveway parking for 4 cars", "Free street parking", "Level 2 EV charger (Tesla only)", "Single-level home, no stairs", "Lit path to the guest entrance", "Self check-in with smart lock", "Long stays (28 nights or more) allowed"] },
      { group: "Safety", items: ["Smoke and carbon monoxide alarms in each main area and bedroom", "Fire extinguisher", "First aid kit", "Two exterior security cameras (see Things to know)", "No cameras inside the home"] },
    ],
    goodFit: ["Families with babies and young kids", "Guests who want a quiet residential street in Alamo Heights", "Remote workers (dedicated workspace, fast WiFi)", "Tesla drivers (Level 2 charger on site)"],
    notFit: ["Parties or events (not allowed)", "Pets (not allowed)", "Smoking or vaping anywhere on the property", "Late-night noise: quiet hours are 10 PM to 8 AM", "Groups who need more than one bathroom", "Guests who don't want exterior security cameras (two outside, recording audio)"],
    location: {
      text: "Alamo Heights, a quiet neighborhood near Broadway.",
      facts: ["A few blocks from The Quarry and Lincoln Heights shopping centers: restaurants, coffee shops and shops", "A short drive to the DoSeum, the San Antonio Zoo, the Witte Museum and the McNay Art Museum", "A short drive to the Pearl and the River Walk"],
      mapBbox: "-98.4790,29.4845,-98.4560,29.5005", // area center set apart from the home so the circle never pinpoints the house
      note: "The exact address is shared after your booking is confirmed and your rental agreement and ID check are complete.",
    },
    reviews: [
      { name: "Mark", when: "November 2026", rating: 5, text: "A fantastic home to explore everything San Antonio has to offer. Close to the airport, downtown, highways, great dining and shopping, etc. We found it the perfect size for our family of 5 and would definitely stay again." },
      { name: "Patti", when: "October 2026", rating: 5, text: "This house was wonderful! Spotless, quiet, great walkable neighborhood and friendly hosts. Can’t wait to stay at the Alamo Heights House again!" },
      { name: "Danielle", when: "August 2026", rating: 5, text: "Such a great place to stay! The house was perfect for my husband, toddler and I while we visited for a week. It’s nicely decorated and CLEAN - cleanest Airbnb I’ve ever stayed in! The beds and linens were super comfortable and the play area and toys were great for our 1.5 year old. And my husband loved the basketball hoop in the backyard haha. The area is nice and quiet and the hosts are very nice, accommodating and quick to reply to messages. You can tell they put a lot of time and care into making this a nice place for guests - would highly recommend staying here!" },
      { name: "Austin", when: "June 2026", rating: 5, text: "Oscar & Fernanda were great hosts. Their place was perfect for a quick getaway with our infant. He really enjoyed the playroom and it was great to have a dedicated space for him. All the amenities were as listed and getting in and out was a breeze. Great location for a family vacation, would definitely stay there again for future visits to San Antonio." },
      { name: "Cheryl", when: "May 2026", rating: 5, text: "Oscar and Fernanda were great hosts!  Very friendly! I love the Alamo Heights house! It is such a cute house! The privacy gate made me feel very safe. The neighborhood is amazing! The house is exactly as described in the listing. I would love to stay here again!" },
      { name: "Zoe", when: "May 2026", rating: 5, text: "This home was in a great location! Quick trip to HEB, the zoo, great restaurants, and coffee shops. Especially wonderful when traveling with kids as they had a stocked playroom, crib, stool, fenced in backyard/driveway, etc. Would definitely stay here again!" }
    ],
    host: HOSTS,
    thingsToKnow: [
      { title: "Check-in and check-out", items: ["Check-in after 4:00 PM", "Check-out before 10:00 AM", "Self check-in with a smart lock"] },
      { title: "House rules", items: ["Up to 8 overnight guests; only the guests on your reservation may use the home", "The reservation holder must be 25 or older and stay at the home", "No parties or events", "No pets", "No smoking, vaping or illegal substances in or within 25 feet of the home", "Quiet hours 10 PM to 8 AM", "No commercial photography or filming", "Before you leave: dishes in the dishwasher, used towels on the woven basket in the main bedroom, trash out, lights off, close all doors, windows and the car gate, and send us a quick message"] },
      { title: "Safety and property", items: ["Two exterior security cameras: one faces the car entry gate and one is the front-door doorbell. They are motion-activated, record audio, and are checked occasionally, not monitored live.", "No cameras inside the home", "Smoke and carbon monoxide alarms in each main area and bedroom", "Fire extinguisher and first aid kit"] },
    ],
    faq: [
      { q: "Why book direct?", a: "You book with us, the hosts, see your full total before you pay, and pay securely through Stripe. Questions go straight to Oscar and Fernanda." },
      { q: "What happens after I book?", a: "You'll get a confirmation email. Then you sign the rental agreement and verify your ID online (about 3 minutes each). The address, entry steps and WiFi appear in your private stay page once both are done." },
      { q: "Is there a damage waiver?", a: "Yes. Every direct stay includes a damage waiver with $5,000 coverage for accidental damage, as described in the rental agreement. It's included in your total." },
      { q: "Can I pay in two parts?", a: "When check-in is more than 30 days away, you can pay half now and the rest automatically 30 days before check-in, at no extra cost." },
      { q: "Is the home good for babies and toddlers?", a: "Yes: there's a playroom with toys, books and games, children's dinnerware, outlet covers and a baby bath. A mini crib, pack 'n play and high chair are available on request." },
      { q: "Is there parking?", a: "Yes: free driveway parking for 4 cars, plus free street parking. There's also a Level 2 EV charger for Teslas." },
      { q: "How many bathrooms are there?", a: "One full bathroom." },
    ],
  },
};
