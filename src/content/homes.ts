/**
 * Listing-page content per home (template: 736 Myrtle, ChatGPT notes 138–139).
 * RULE: every visible fact has a source below; anything unverified is listed in `missing` and not shown as fact.
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
  registration: string;
  sources: { fact: string; source: string }[];
  missing: string[];
}

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
      { group: "Safety", items: ["Smoke and carbon monoxide alarms in each main area and bedroom", "Fire extinguisher", "First aid kit", "Two exterior security cameras (see Things to know)"] },
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
    host: {
      names: "Oscar & Fernanda",
      photo: "https://a0.muscache.com/im/pictures/user/1826038f-d265-41c6-877b-f2d217548669.jpg?aki_policy=profile_large",
      since: "Hosting for 4 years",
      facts: ["Airbnb Superhosts", "4.98 average across 460 Airbnb reviews of our homes", "Speak English and Spanish", "Usually reply within an hour"],
      bio: "Hello! We’re a family of four who love to travel and experience new places and cultures. With a 5-year-old girl and a 2-year-old boy, we know the importance of comfort and hospitality. As both guests and hosts, we value cleanliness, thoughtful touches, and creating a welcoming space. We set up our homes to feel like places we’d want our own family to stay in—cozy, well-equipped, and inviting. Our goal is to ensure every stay feels like home!",
    },
    thingsToKnow: [
      { title: "Check-in and check-out", items: ["Check-in after 4:00 PM", "Check-out before 10:00 AM", "Self check-in with a door keypad"] },
      { title: "House rules", items: ["Up to 10 overnight guests; only the guests on your reservation may use the home", "The reservation holder must be 25 or older and stay at the home", "No parties or events", "No pets", "No smoking, vaping or illegal substances in or within 25 feet of the home", "Quiet hours 10 PM to 8 AM", "No commercial photography or filming", "Before you leave: dishes in the dishwasher, close all doors, windows and the car gate, and send us a quick message"] },
      { title: "Safety and property", items: ["Two exterior security cameras: one faces the car entry gate and one is the front-door doorbell. They are motion-activated, record audio, and are checked occasionally, not monitored live.", "Smoke and carbon monoxide alarms in each main area and bedroom", "Fire extinguisher and first aid kit"] },
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
    sources: [
      { fact: "Title, capacity (10 guests, 5 bedrooms, 5 beds, 3.5 baths), beds per room", source: "Hospitable property API + Airbnb listing, Nov 15, 2026" },
      { fact: "Neighborhood 'Tobin Hill'", source: "Airbnb listing 'Where you'll be', Nov 15, 2026" },
      { fact: "Photos (71) and their order", source: "Hospitable direct-booking gallery; alt text written by Claude from the photos" },
      { fact: "Rating 4.97 from 78 ratings; category averages", source: "Airbnb listing (4.97 · 78 reviews) and Hospitable review records (78 rated reviews, avg 4.974)" },
      { fact: "Review quotes (6), names, months", source: "Airbnb reviews as shown on the listing, word for word; approved by Oscar (chat, Nov 15) — attorney to confirm before launch" },
      { fact: "Amenities incl. 'on request' baby items, appliance details, TV/streaming, A/C types, accessible parking spot, lit path", source: "Airbnb listing amenities + accessibility panels, Nov 15, 2026 (Hospitable list as cross-check)" },
      { fact: "Camera details (2 exterior: car gate + doorbell; motion-activated; audio)", source: "Airbnb 'Safety & property', host's own wording" },
      { fact: "No commercial photography; checkout steps; 'Up to 10 overnight guests' / only reservation guests use the home", source: "Airbnb house rules (re-checked Nov 16, 2026)" },
      { fact: "Baby items 'on request'", source: "Airbnb amenities: crib, pack 'n play, high chair, baby bath 'available upon request' (re-checked Nov 16, 2026)" },
      { fact: "House rules, quiet hours, 25+ holder", source: "Hospitable additional rules; Oscar decisions (25+, no parties)" },
      { fact: "Exterior security cameras, alarms", source: "Airbnb 'Things to know' + Hospitable amenities" },
      { fact: "Host photo", source: "Hosts' Airbnb profile picture (Hospitable listing data, platform_picture), Nov 16, 2026; requested by Oscar" },
      { fact: "Per-review 5.0 ratings on the six quoted reviews", source: "Hospitable review records (public rating 5.00 each), Nov 16, 2026" },
      { fact: "Host facts (Superhost, 4 years, 460 reviews 4.98, languages, bio)", source: "Airbnb host profile on the listing, Nov 15, 2026" },
      { fact: "Response time 'usually within an hour'", source: "Airbnb host details ('Responds within an hour')" },
      { fact: "3-min walk to the Pearl / 5-min drive to Zoo, DoSeum, Witte; no grill; bathroom layout; 3 cars behind gate; baby items kept at home; stove + A/C issues from May 2026 review fixed", source: "Oscar (chat, Nov 15, 2026)" },
      { fact: "Area map (approximate, no pin)", source: "OpenStreetMap embed; Oscar approved an area map (chat, Nov 15)" },
      { fact: "Registration STR-25-13500115", source: "Airbnb listing registration details" },
      { fact: "Direct-site 25+ reservation-holder rule (differs from Airbnb's 'under 25 with a parent or guardian')", source: "Oscar (chat, Nov 16, 2026): keep the direct rule" },
      { fact: "No toddler bed (Airbnb description mentions one; bed list does not)", source: "Oscar (chat, Nov 16, 2026)" },
      { fact: "'Local hosts' badge", source: "Airbnb description ('we're just minutes away'); Oscar confirmed still true (chat, Nov 16, 2026)" },
      { fact: "Cancellation summary", source: "Generated from the checkout's policy engine (src/domain/policy.ts)" },
    ],
    missing: [
      "Photo room labels from Oscar (alt text is descriptive; rooms aren't labeled).",
      "Pricing promise vs Airbnb: not shown (no substantiated comparison).",
    ],
  },
};
