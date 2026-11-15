import { AdapterError, CalendarDay } from "./types";

/**
 * Read-only Hospitable calendar (Public API v2), server-side only.
 *
 * Client controls (ChatGPT note 82):
 *  - Fixed trusted base URL (constant below); the property UUID is URL-encoded and dates are validated.
 *  - Token from the server env only (HOSPITABLE_API_TOKEN, sensitive in Vercel); never logged or returned.
 *  - 8-second timeout per request; at most 2 retries on 429/5xx/network errors with backoff (300 ms, 900 ms).
 *  - Every response is validated (ISO date, integer cents >= 0, USD, boolean status); anything else is rejected.
 *  - Errors carry only an HTTP status code, never the upstream body.
 *  - Browsing may use a 60-second cache; quotes and the pre-payment recheck pass { fresh: true } and bypass it.
 * Token scope: created by Oscar as a personal access token for this checkout; least privilege (read) to be confirmed by Oscar.
 */
export type CalendarSource = (uuid: string, start: string, end: string, opts?: { fresh?: boolean }) => Promise<CalendarDay[]>;

export const HOSPITABLE_API_BASE = "https://public.api.hospitable.com/v2";
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8_000;
const BACKOFF_MS = [300, 900];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

type RawDay = { date?: unknown; min_stay?: unknown; closed_for_checkin?: unknown; closed_for_checkout?: unknown; status?: { available?: unknown }; price?: { amount?: unknown; currency?: unknown } };

function parseDay(d: RawDay): CalendarDay {
  const bad = (what: string) => new AdapterError(`Hospitable calendar: invalid ${what}`, "bad_response");
  if (typeof d.date !== "string" || !ISO.test(d.date)) throw bad("date");
  const amount = d.price?.amount;
  if (amount != null && (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0)) throw bad("price");
  if (d.price?.currency != null && d.price.currency !== "USD") throw bad("currency");
  if (d.status?.available != null && typeof d.status.available !== "boolean") throw bad("status");
  const minStay = typeof d.min_stay === "number" && Number.isInteger(d.min_stay) && d.min_stay > 0 ? d.min_stay : 1;
  return { date: d.date, available: d.status?.available === true && typeof amount === "number", price: typeof amount === "number" ? amount : 0, minStay,
    closedForCheckin: d.closed_for_checkin === true, closedForCheckout: d.closed_for_checkout === true };
}

export function hospitableCalendarSource(token: string, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): CalendarSource {
  const cache = new Map<string, { at: number; days: Promise<CalendarDay[]> }>();

  async function request(uuid: string, start: string, end: string): Promise<CalendarDay[]> {
    if (!UUID.test(uuid) || !ISO.test(start) || !ISO.test(end)) throw new AdapterError("Hospitable calendar: invalid request", "bad_request");
    const url = `${HOSPITABLE_API_BASE}/properties/${encodeURIComponent(uuid)}/calendar?start_date=${start}&end_date=${end}`;
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      try {
        res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        if (attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]!); continue; }
        throw new AdapterError("Hospitable calendar: network error or timeout", "upstream_error");
      }
      if (res.ok) {
        const body = (await res.json()) as { data?: { days?: unknown } };
        if (!Array.isArray(body?.data?.days)) throw new AdapterError("Hospitable calendar: invalid body", "bad_response");
        return (body.data!.days as RawDay[]).map(parseDay);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]!); continue; }
      throw new AdapterError(`Hospitable calendar ${res.status}`, res.status === 401 || res.status === 403 ? "auth_failed" : "upstream_error");
    }
  }

  return (uuid, start, end, opts = {}) => {
    const key = `${uuid}:${start}:${end}`;
    const hit = cache.get(key);
    if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.days;
    const days = request(uuid, start, end);
    cache.set(key, { at: Date.now(), days }); // a fresh read also refreshes the browsing cache
    days.catch(() => cache.delete(key));
    return days;
  };
}
