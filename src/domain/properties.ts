import { Cents } from "./money";

export interface Property {
  key: "edgewood" | "752" | "736" | "indianola" | "claywell";
  name: string;
  area: string;
  hospitableUuid: string;
  maxGuests: number;
  cleaningFee: Cents;
  /** Extra-guest fee per night for each guest above `extraGuestFrom`. */
  extraGuestFrom: number;
  extraGuestFee: Cents;
  /**
   * PROVISIONAL tax rate (decimal). Oscar decided to use the rates Airbnb collects
   * until the accountant confirms. Do not treat as final.
   */
  provisionalTaxRate: number;
}

// Source: Hospitable property settings + Airbnb fee settings, read Nov 14, 2026.
export const PROPERTIES: Property[] = [
  { key: "edgewood", name: "Edgewood House", area: "Alamo Heights", hospitableUuid: "c646f5d9-18f0-4ad7-ac20-77bf1f214178", maxGuests: 8, cleaningFee: 18000, extraGuestFrom: 6, extraGuestFee: 4000, provisionalTaxRate: 0.06 },
  { key: "752", name: "752 Myrtle", area: "Steps from the Pearl", hospitableUuid: "bcccf183-d750-4027-99cc-e5dacf560005", maxGuests: 8, cleaningFee: 22500, extraGuestFrom: 6, extraGuestFee: 4000, provisionalTaxRate: 0.1675 },
  { key: "736", name: "736 Myrtle", area: "Large family house by the Pearl", hospitableUuid: "d3a82356-6ac4-4a33-bc9e-a8133f4f4817", maxGuests: 10, cleaningFee: 29000, extraGuestFrom: 8, extraGuestFee: 4000, provisionalTaxRate: 0.15 },
  { key: "indianola", name: "613 Indianola", area: "Downtown, walk to the Tower", hospitableUuid: "0248fb46-9d5f-42fd-bda9-6c5fc497f673", maxGuests: 8, cleaningFee: 29000, extraGuestFrom: 4, extraGuestFee: 3000, provisionalTaxRate: 0.15 },
  { key: "claywell", name: "The Claywell", area: "Alamo Heights", hospitableUuid: "c093b16d-ce88-4c42-919b-6be6df499bbb", maxGuests: 8, cleaningFee: 35000, extraGuestFrom: 6, extraGuestFee: 3000, provisionalTaxRate: 0.06 },
];

/** Waivo Premium Protection, included on every direct stay (Oscar, Nov 14). Not taxed (pending accountant). */
export const DAMAGE_PROTECTION: Cents = 7900;

export const CHECK_IN_HOUR = 16; // 4:00 PM America/Chicago
export const CHECK_OUT_HOUR = 10; // 10:00 AM America/Chicago
export const TIMEZONE = "America/Chicago";

export function getProperty(key: string): Property {
  const p = PROPERTIES.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown property: ${key}`);
  return p;
}
