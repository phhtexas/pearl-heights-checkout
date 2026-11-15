import { AdapterError, CalendarDay } from "./types";

/**
 * Read-only Hospitable calendar (Public API v2). Used in mock/test modes so guests see real prices and
 * availability while reservations stay fake (Oscar, Nov 14, 2026). Responses are cached briefly per range.
 * Price amounts are integer cents, matching our Cents type.
 */
export type CalendarSource = (uuid: string, start: string, end: string) => Promise<CalendarDay[]>;

const BASE = "https://public.api.hospitable.com/v2";
const CACHE_MS = 60_000;

export function hospitableCalendarSource(token: string, fetchImpl: typeof fetch = fetch): CalendarSource {
  const cache = new Map<string, { at: number; days: Promise<CalendarDay[]> }>();
  return (uuid, start, end) => {
    const key = `${uuid}:${start}:${end}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.days;
    const days = (async () => {
      const url = `${BASE}/properties/${encodeURIComponent(uuid)}/calendar?start_date=${start}&end_date=${end}`;
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new AdapterError(`Hospitable calendar ${res.status}`, res.status === 401 ? "auth_failed" : "upstream_error");
      const body = (await res.json()) as { data?: { days?: Array<{ date: string; min_stay?: number; closed_for_checkin?: boolean; closed_for_checkout?: boolean; status?: { available?: boolean }; price?: { amount?: number; currency?: string } }> } };
      return (body.data?.days ?? []).map((d) => {
        if (d.price?.currency && d.price.currency !== "USD") throw new AdapterError(`Unexpected currency ${d.price.currency}`, "upstream_error");
        return { date: d.date, available: d.status?.available === true && typeof d.price?.amount === "number", price: d.price?.amount ?? 0, minStay: d.min_stay ?? 1,
          closedForCheckin: d.closed_for_checkin === true, closedForCheckout: d.closed_for_checkout === true };
      });
    })();
    cache.set(key, { at: Date.now(), days });
    days.catch(() => cache.delete(key));
    return days;
  };
}
