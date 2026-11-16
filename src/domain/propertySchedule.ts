import { HOMES, type HomeContent } from "../content/homes";

/**
 * Property Schedule for the Rental Agreement (V1.2 §8; Legal notes 9, 11, 14). Built only from facts already approved
 * on each home's listing plus Oscar's decisions; nothing is invented here. The agreement generator (waiting on the
 * e-signature vendor) must call `agreementSchedule()`: it throws when any required field is blank, missing or still a
 * placeholder, so an agreement can never be produced with gaps.
 */
export const SCHEDULE_FIELDS = [
  ["maxOccupancy", "Maximum occupancy"],
  ["parking", "Parking"],
  ["quietHours", "Quiet hours"],
  ["exteriorCameras", "Exterior cameras"],
  ["interiorCameras", "Interior cameras"],
  ["features", "Outdoor or special features"],
  ["rules", "Property-specific rules"],
  ["registration", "Permit or registration"],
  ["urgentContact", "Urgent property contact"],
] as const;
export type ScheduleField = (typeof SCHEDULE_FIELDS)[number][0];
export type PropertySchedule = Record<ScheduleField, string>;

/** Oscar, Legal note 9: an allowed value, so these homes are not blocked. Any other home without a number is. */
export const REGISTRATION_NOT_LISTED = "Not listed";
const NOT_LISTED_OK = new Set(["edgewood", "claywell"]);
/** Oscar, Legal note 9: approved field-of-view wording for every home. */
const FIELD_OF_VIEW = "Cameras face the home's entries, driveway or street side only; none view inside the home or neighbors' private areas.";
/** Rules every home shares (Rental Agreement §7 already covers them); the schedule lists what is specific to the home. */
const GENERAL_RULE = /^(Up to \d+ overnight guests|The reservation holder must be 25|No parties|No pets|No smoking|Quiet hours)/;
/** Outdoor items that are parking or access logistics, not features. */
const NOT_A_FEATURE = /parking|entrance|check-in|luggage|long stays|accessible|lit path/i;

export class AgreementBlockedError extends Error {
  constructor(public property: string, public missing: string[]) {
    super(`Rental agreement blocked for ${property}: missing or unresolved ${missing.join(", ")}`);
  }
}

const cap = (t: string) => t.replace(/^./, (c) => c.toUpperCase());
const things = (h: HomeContent, title: string) => h.thingsToKnow.find((t) => t.title === title)?.items ?? [];

/** The schedule as far as the listing supports it. Fields that can't be sourced are left empty (and so block). */
export function draftSchedule(key: string, urgentContact: string | undefined): Partial<PropertySchedule> {
  const h = HOMES[key];
  if (!h) return {};
  const rules = things(h, "House rules"), safety = things(h, "Safety and property");
  const occupancy = rules.find((r) => /^Up to \d+ overnight guests/.test(r));
  const quiet = rules.find((r) => /^Quiet hours/.test(r));
  const cams = safety.find((s) => /exterior security camera/i.test(s));
  const outdoors = h.amenityGroups.find((g) => /^Outdoors/.test(g.group))?.items ?? [];
  const features = outdoors.filter((i) => !NOT_A_FEATURE.test(i));
  const specific = rules.filter((r) => !GENERAL_RULE.test(r));
  return {
    maxOccupancy: occupancy && h.capacity.guests ? `${h.capacity.guests} guests. Only the guests on your reservation may stay overnight or use the home.` : "",
    parking: cap(h.faq.find((f) => /parking/i.test(f.q))?.a.replace(/^Yes: /, "") ?? ""),
    quietHours: quiet ? quiet.replace(/^Quiet hours /, "") + " Central Time" : "",
    exteriorCameras: cams ? `${cams} ${FIELD_OF_VIEW}` : "",
    interiorCameras: safety.includes("No cameras inside the home") ? "None." : "",
    features: features.join("; "),
    rules: specific.join("; "),
    registration: h.registration ?? (NOT_LISTED_OK.has(key) ? REGISTRATION_NOT_LISTED : ""),
    urgentContact: urgentContact ?? "",
  };
}

const PLACEHOLDER = /\[[^\]]*\]|\{\{|\}\}|\bTBD\b|to be (added|inserted|confirmed)/i;

/** Labels of the required fields that are blank, missing or still a placeholder. Empty array = ready. */
export function scheduleGaps(s: Partial<PropertySchedule>): string[] {
  return SCHEDULE_FIELDS.filter(([k]) => { const v = s[k]?.trim(); return !v || PLACEHOLDER.test(v); }).map(([, label]) => label);
}

/** The complete schedule, or AgreementBlockedError. The urgent contact comes from server config, never public pages. */
export function agreementSchedule(key: string, urgentContact: string | undefined): PropertySchedule {
  const s = draftSchedule(key, urgentContact);
  const missing = HOMES[key] ? scheduleGaps(s) : ["Unknown property"];
  if (missing.length) throw new AgreementBlockedError(key, missing);
  return s as PropertySchedule;
}
