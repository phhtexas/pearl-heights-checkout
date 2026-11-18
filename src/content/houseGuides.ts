/**
 * House guides for the guest portal (Oscar, Nov 17, option 1: start with 752 Myrtle).
 *
 * Source: the home's Canva Guest Book linked from its Hospitable check-in message
 * (752 Myrtle: bit.ly/PearlHomeOnMyrtle -> canva.com/design/DAF9EFqmzAY, 15 pages, read Nov 17, 2026).
 * Only topics the Airbnb listing doesn't already cover are here; check-in/out, house rules and safety come from the
 * listing (src/content/homes.ts), which is the source of truth where the two differ.
 *
 * NEVER put door codes, gate codes, Wi-Fi names/passwords or the street address here: this file ships to the browser.
 * Those arrive only through the locked arrival section once the agreement is signed and the ID is verified.
 * Draft until Oscar approves each home's guide (Canva links stay live until then, per note 444 in the Sheet).
 */
export type GuideTopic = { title: string; items: string[] };

const GUIDES: Record<string, GuideTopic[]> = {
  "752": [
    { title: "Washer and dryer", items: [ // Canva p.6
      "The washer and dryer are in the hallway next to the guest bathroom.",
      "Please don't overload them, and use only detergent made for this type of washer.",
      "Please don't wash the home's towels or sheets together with personal clothes. Mixing fabrics can damage or stain the linens.",
    ] },
    { title: "Appliances", items: [ // Canva p.6–7
      "Air conditioning: the thermostat is on the dining-area wall. Please keep it between 70°F and 78°F, and don't leave it running when you're out.",
      "Dishwasher: run it when it's full. Tablets are under the sink. Close the door all the way before starting a cycle.",
      "Coffee and tea: the station is on the kitchen counter, with a Keurig, K-cups and a French press. A regular coffee maker is in the cabinet, and a kettle is by the stove. Coffee, creamer, sugar and tea are provided.",
    ] },
    { title: "Around the house", items: [ // Canva p.7–8
      "Windows: open them gently, and close them when you're out so the house stays cool and bugs stay outside.",
      "Backyard string lights turn on at sunset and off around 10 PM. The canopy lights are automatic too, with a switch on the wall near the outdoor lounge.",
      "Sofa bed: the beige sofa in the living room. Pull the strap at the front center and fold the backrest down. Extra pillows, sheets and a comforter are stored inside. Please put them back and close it after use.",
      "Sprinklers run automatically on Thursday mornings, front yard first, then the backyard.",
      "Our landscaper comes on Tuesdays. He works outside only, uses the car gate, and never enters the home. It usually takes under an hour.",
      "The storage unit in the backyard is off-limits to guests.",
    ] },
    { title: "Parking", items: [ // Canva p.7 (gate code deliberately left out)
      "There's room for about 4 cars on the property, plus some street parking.",
      "You can park on the driveway outside the gate, or open the gate and drive in toward the backyard. The gate details come with your check-in instructions.",
      "The storage unit isn't for parking.",
    ] },
    { title: "Trash", items: [ // Canva p.7
      "Stays of 1–4 nights: when you leave, set your trash outside the kitchen door and we'll take it to the bins.",
      "Stays of 5 nights or more: please use the trash cans in the backyard by the palm tree.",
    ] },
    { title: "Emergencies and nearby help", items: [ // Canva p.10
      "In an emergency, call 911 first.",
      "Hospital: Methodist Hospital Metropolitan, 1310 McCullough Ave.",
      "Pharmacy: CVS, 1915 Broadway (about half a mile).",
      "Police: 2020 N St Mary's St. Fire department: 1430 N St Mary's St.",
      "Need us? Message us here anytime, or call (210) 400-2540 if it's urgent.",
    ] },
    { title: "Getting around", items: [ // Canva p.11
      "San Antonio International Airport (SAT) is about 7 miles away.",
      "Uber and Lyft work well here. Taxis: National Cab (210) 434-4444, San Antonio Taxi (210) 571-7171.",
      "Buses: VIA Metropolitan Transit, viainfo.net.",
    ] },
    { title: "Our favorite places", items: [ // Canva p.12–13
      "Walk to: The Pearl (Food Hall and the weekend Farmers Market), the River Walk.",
      "With kids: The DoSeum, the San Antonio Zoo, Brackenridge Park, the Witte Museum.",
      "Sights: the McNay Art Museum, the San Antonio Botanical Garden, the Japanese Tea Garden, Southtown, Jazz TX.",
      "Coffee and bakeries: Merritt Coffee, Bakery Lorraine, Larder (inside Hotel Emma), Bird Bakery, Extra Fine Coffee.",
      "Our restaurant picks: Southerleigh, Mon Chou Chou, Best Quality Daughter, La Gloria, Landino, Full Goods Diner, Velvet Taco, Down on Grayson, Carriqui, Burger Boy.",
      "A little farther: Six Flags Fiesta Texas, SeaWorld, Natural Bridge Wildlife Ranch.",
      "Outdoors and fitness: Brackenridge Park trails, Quarry Golf Club.",
      "Shopping: Quarry Village, Lincoln Heights, North Star Mall, Target.",
      "Groceries: Central Market on Broadway, Trader Joe's at the Quarry, H-E-B at Lincoln Heights.",
      "Day trips: Fredericksburg (wineries), Gruene (eat at the Gristmill), Boerne, Canyon Lake, Austin.",
    ] },
  ],
};

export const houseGuide = (homeKey: string): GuideTopic[] => GUIDES[homeKey] ?? [];
