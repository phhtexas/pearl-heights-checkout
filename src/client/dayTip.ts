/**
 * Airbnb-style labels above calendar days (Oscar, Nov 20), shared by the home page and checkout calendars (the
 * homepage calendar has its own copy in DateRange): "N-night minimum" on check-in until check-out is picked, then
 * "Check-in day" / "Checkout day" on the one pointed at, or (phones, no hover) the one tapped last.
 */
export type DayTip = { d: string; text: string } | null;
export function dayTip(ci: string | null, co: string | null, hover: string, last: string, minNights: number): DayTip {
  if (ci && !co) return { d: ci, text: `${minNights}-night minimum` };
  if (!ci || !co) return null;
  const at = hover === ci || hover === co ? hover : last;
  return at === ci ? { d: ci, text: "Check-in day" } : at === co ? { d: co, text: "Checkout day" } : null;
}
/** Class for the label: kept inside the calendar on the first two and last two columns. */
export const tipSide = (col: number) => (col <= 1 ? " tipL" : col >= 5 ? " tipR" : "");
