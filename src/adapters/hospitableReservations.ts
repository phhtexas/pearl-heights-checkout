import { AdapterError, HospitableAdapter } from "./types";
import { HOSPITABLE_API_BASE } from "./hospitableCalendar";

/**
 * Hospitable manual reservations (Public API v2), server-side only. Oscar, Nov 18: direct bookings go straight into
 * Hospitable. Docs (read Nov 18, developer.hospitable.com):
 *   POST /v2/reservations                 create a manual reservation (scope reservation:write)
 *   POST /v2/reservations/{uuid}/cancel   cancel a manual reservation, body { initiated_by }
 *   GET  /v2/reservations?properties[]=…&reservation_code=…   find by our booking ref
 * Important, from the docs: with a personal access token, Hospitable IGNORES availability and minimum stay (it only
 * refuses to overlap an existing booking). Checkout therefore rechecks the live calendar itself before paying, and
 * confirms the block afterwards (src/services/checkout.ts).
 * Hospitable also sends its own automated messages to the guest of a manual reservation (seen in the Nov 14 test).
 *
 * Errors: 422/400 (overlap, duplicate code, validation) and 401/403 are definite "no reservation" answers; timeouts,
 * network errors and 5xx are "unknown" and go to reconciliation, which looks the booking up by code.
 */
const TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z0-9-]{4,50}$/;

type Writer = Pick<HospitableAdapter, "createReservation" | "cancelReservation" | "findReservationByCode">;

export function hospitableReservations(token: string, propertyUuids: string[], fetchImpl: typeof fetch = fetch, channel = "Pearl Heights Homes"): Writer {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };
  const call = async (url: string, init: RequestInit) => {
    try { return await fetchImpl(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new AdapterError("Hospitable: network error or timeout", "upstream_error"); }
  };
  const errorText = async (res: Response) => { try { return JSON.stringify(await res.json()).slice(0, 400); } catch { return ""; } };

  return {
    async createReservation(i) {
      if (!UUID.test(i.propertyUuid) || !ISO.test(i.checkIn) || !ISO.test(i.checkOut) || !CODE.test(i.code))
        throw new AdapterError("Hospitable reservation: invalid request", "rejected");
      const body = {
        property_id: i.propertyUuid, check_in: i.checkIn, check_out: i.checkOut,
        guests: { adults: i.adults, children: i.children, infants: i.infants, pets: 0 },
        guest: { first_name: i.guest.firstName, last_name: i.guest.lastName, email: i.guest.email, phone: i.guest.phone || null },
        channel, reservation_code: i.code, notes: i.note.slice(0, 1000), language: "en",
        financials: { currency: "USD", accommodation: Math.round(i.accommodationCents), cleaning_fee: Math.round(i.cleaningCents) },
      };
      const res = await call(`${HOSPITABLE_API_BASE}/reservations`, { method: "POST", body: JSON.stringify(body) });
      if (res.status === 201 || res.status === 200) {
        const j = (await res.json().catch(() => null)) as { data?: { id?: unknown } } | null;
        const id = j?.data?.id;
        if (typeof id !== "string" || !UUID.test(id)) throw new AdapterError("Hospitable reservation: invalid body", "bad_response"); // created? reconcile by code
        return { reservationId: id };
      }
      const detail = await errorText(res);
      if (res.status === 422 || res.status === 400) {
        if (/already used|reservation code|reservation_code/i.test(detail)) throw new AdapterError("Hospitable: duplicate reservation code", "duplicate_code");
        if (/overlap|unavailable|not available|existing booking|already booked/i.test(detail)) throw new AdapterError("Hospitable: dates unavailable", "unavailable");
        console.error("[hospitable] create rejected", res.status, detail.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"));
        throw new AdapterError(`Hospitable rejected the reservation (${res.status})`, "rejected");
      }
      if (res.status === 401 || res.status === 403) throw new AdapterError(`Hospitable reservation ${res.status} (token or scope)`, "rejected");
      throw new AdapterError(`Hospitable reservation ${res.status}`, "upstream_error");
    },

    async cancelReservation(id) {
      if (!UUID.test(id)) throw new AdapterError("Hospitable cancel: invalid id", "not_found");
      const res = await call(`${HOSPITABLE_API_BASE}/reservations/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ initiated_by: "host" }) });
      if (res.ok) return;
      if (res.status === 404) throw new AdapterError("Hospitable cancel: not found", "not_found");
      throw new AdapterError(`Hospitable cancel ${res.status}`, "upstream_error");
    },

    async findReservationByCode(code) {
      if (!CODE.test(code)) return null;
      const q = new URLSearchParams();
      for (const p of propertyUuids) q.append("properties[]", p);
      q.set("reservation_code", code);
      // Wide date window: the code filter is what matters; Hospitable defaults the dates to two weeks otherwise.
      q.set("start_date", "2024-01-01"); q.set("end_date", "2030-12-31");
      const res = await call(`${HOSPITABLE_API_BASE}/reservations?${q}`, { method: "GET" });
      if (!res.ok) throw new AdapterError(`Hospitable lookup ${res.status}`, "upstream_error");
      const j = (await res.json().catch(() => null)) as { data?: { id?: string; code?: string; platform_id?: string; status?: string }[] } | null;
      const hit = (j?.data ?? []).find((r) => (r.code === code || r.platform_id === code) && r.status !== "cancelled");
      return hit?.id ?? null;
    },
  };
}
