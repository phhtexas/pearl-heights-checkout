import { CHECK_IN_HOUR, TIMEZONE } from "./properties";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Offset in minutes of `tz` from UTC at the given instant (e.g. -360 for CST). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** The UTC instant for a local wall-clock time in America/Chicago (handles DST). */
export function chicagoInstant(dateISO: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateISO.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let offset = tzOffsetMinutes(new Date(guess), TIMEZONE);
  let instant = guess - offset * 60_000;
  // Re-check once across a DST boundary.
  offset = tzOffsetMinutes(new Date(instant), TIMEZONE);
  instant = guess - offset * 60_000;
  return new Date(instant);
}

/** Check-in moment: 4:00 PM Central on the check-in date. */
export const checkInInstant = (checkInISO: string): Date => chicagoInstant(checkInISO, CHECK_IN_HOUR);

export const hoursBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / HOUR;

export const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * HOUR);

export const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY);
  return t.toISOString().slice(0, 10);
};

export const nightsBetween = (checkIn: string, checkOut: string): string[] => {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDaysISO(d, 1)) out.push(d);
  return out;
};

/** "Sunday, November 15, 2026, 6:52 PM CT" (server-authoritative; same text for screen, email and records). */
export function formatChicagoDateTime(at: Date): string {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(at);
  return s.replace(" at ", ", ") + " CT";
}

/** "Nov 16, 2026" as a calendar date in Central time. */
export function formatChicagoDate(at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(at);
}

export { HOUR, DAY };
