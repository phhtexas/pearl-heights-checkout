import snapshot from "../../data/calendar-snapshot.json";
import { PROPERTIES } from "../domain/properties";
import { AdapterError, CalendarDay, HospitableAdapter, PaymentsAdapter } from "./types";

/**
 * Mock adapters for CHECKOUT_MODE=mock. They behave like Hospitable and Stripe
 * (including duplicate-code rejection and calendar blocking) but touch nothing real.
 * Calendar data is the Hospitable snapshot of Nov 14, 2026 (Nov 15, 2026 - May 31, 2027).
 */
type Snapshot = Record<string, Record<string, [number, number, number]>>;
const SNAP = snapshot as unknown as Snapshot;
const keyByUuid: Record<string, string> = {
  "c646f5d9-18f0-4ad7-ac20-77bf1f214178": "Edgewood",
  "bcccf183-d750-4027-99cc-e5dacf560005": "752",
  "d3a82356-6ac4-4a33-bc9e-a8133f4f4817": "736",
  "0248fb46-9d5f-42fd-bda9-6c5fc497f673": "Indianola",
  "c093b16d-ce88-4c42-919b-6be6df499bbb": "Claywell",
};

export type MockFailure = "none" | "dates_taken" | "card_declined" | "reservation_fails" | "capture_fails" | "cancel_slow";

export class MockHospitable implements HospitableAdapter {
  private blocked = new Map<string, Set<string>>(); // uuid -> dates
  private codes = new Map<string, { uuid: string; nights: string[] }>();
  private byId = new Map<string, string>();
  constructor(public failure: MockFailure = "none") {}

  async getCalendar(uuid: string, start: string, end: string): Promise<CalendarDay[]> {
    const cal = SNAP[keyByUuid[uuid] ?? ""];
    if (!cal) throw new AdapterError("Unknown property", "unknown_property");
    const blocked = this.blocked.get(uuid) ?? new Set();
    return Object.entries(cal)
      .filter(([d]) => d >= start && d <= end)
      .map(([date, [avail, price, minStay]]) => ({ date, available: avail === 1 && !blocked.has(date), price: price * 100, minStay }));
  }

  async createReservation(i: Parameters<HospitableAdapter["createReservation"]>[0]) {
    if (this.failure === "reservation_fails") throw new AdapterError("Hospitable unavailable", "upstream_error");
    if (this.codes.has(i.code)) throw new AdapterError("You have already used that reservation code", "duplicate_code");
    const nights: string[] = [];
    const cal = await this.getCalendar(i.propertyUuid, i.checkIn, i.checkOut);
    for (const d of cal) if (d.date < i.checkOut) { if (!d.available) throw new AdapterError("Dates unavailable", "unavailable"); nights.push(d.date); }
    const set = this.blocked.get(i.propertyUuid) ?? new Set<string>();
    nights.forEach((n) => set.add(n));
    this.blocked.set(i.propertyUuid, set);
    const id = `mock-res-${i.code}`;
    this.codes.set(i.code, { uuid: i.propertyUuid, nights });
    this.byId.set(id, i.code);
    return { reservationId: id };
  }

  async cancelReservation(id: string) {
    const code = this.byId.get(id);
    if (!code) throw new AdapterError("Reservation not found", "not_found");
    const r = this.codes.get(code)!;
    const set = this.blocked.get(r.uuid);
    r.nights.forEach((n) => set?.delete(n));
  }

  /** Test helper: simulate an Airbnb booking landing on these dates. */
  blockDates(uuid: string, dates: string[]) {
    const set = this.blocked.get(uuid) ?? new Set<string>();
    dates.forEach((d) => set.add(d));
    this.blocked.set(uuid, set);
  }
}

export class MockPayments implements PaymentsAdapter {
  intents = new Map<string, { amount: number; status: "authorized" | "captured" | "voided" }>();
  constructor(public failure: MockFailure = "none") {}
  async authorize(i: { amount: number; idempotencyKey: string }) {
    if (this.failure === "card_declined") throw new AdapterError("Your card was declined.", "card_declined");
    const id = `pi_mock_${i.idempotencyKey}`;
    if (!this.intents.has(id)) this.intents.set(id, { amount: i.amount, status: "authorized" });
    return { paymentIntentId: id };
  }
  async capture(id: string) {
    if (this.failure === "capture_fails") throw new AdapterError("Capture failed", "capture_failed");
    const pi = this.intents.get(id);
    if (!pi || pi.status !== "authorized") throw new AdapterError("Nothing to capture", "invalid_state");
    pi.status = "captured";
  }
  async voidAuthorization(id: string) {
    const pi = this.intents.get(id);
    if (pi && pi.status === "authorized") pi.status = "voided";
  }
}

export const MOCK_PROPERTY_KEYS = PROPERTIES.map((p) => p.key);
