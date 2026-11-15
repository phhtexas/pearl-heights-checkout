import snapshot from "../../data/calendar-snapshot.json";
import { PROPERTIES } from "../domain/properties";
import { AdapterError, CalendarDay, HospitableAdapter, PaymentsAdapter } from "./types";
import type { CalendarSource } from "./hospitableCalendar";

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
  /** `source` = real Hospitable calendar (read-only); without it, the Nov 14 snapshot is used. */
  constructor(public failure: MockFailure = "none", private source?: CalendarSource) {}

  private async baseCalendar(uuid: string, start: string, end: string, fresh = false): Promise<CalendarDay[]> {
    if (!keyByUuid[uuid]) throw new AdapterError("Unknown property", "unknown_property");
    if (this.source) return this.source(uuid, start, end, { fresh });
    const cal = SNAP[keyByUuid[uuid]!]!;
    return Object.entries(cal)
      .filter(([d]) => d >= start && d <= end)
      .map(([date, [avail, price, minStay]]) => ({ date, available: avail === 1, price: price * 100, minStay }));
  }

  async getCalendar(uuid: string, start: string, end: string, opts: { fresh?: boolean } = {}): Promise<CalendarDay[]> {
    const base = await this.baseCalendar(uuid, start, end, opts.fresh === true);
    // "Dates booked on Airbnb during checkout": every requested night is now taken.
    if (this.failure === "dates_taken") return base.map((d) => ({ ...d, available: false }));
    const blocked = this.blocked.get(uuid) ?? new Set();
    if (this.codes.size && this.hiddenReads < this.hideNewBlocksForReads) { this.hiddenReads++; return base; }
    return base.map((d) => ({ ...d, available: d.available && !blocked.has(d.date) }));
  }

  async createReservation(i: Parameters<HospitableAdapter["createReservation"]>[0]) {
    if (this.failure === "reservation_fails") throw new AdapterError("Hospitable rejected the reservation", "rejected");
    if (this.codes.has(i.code)) throw new AdapterError("You have already used that reservation code", "duplicate_code");
    const nights: string[] = [];
    const cal = await this.getCalendar(i.propertyUuid, i.checkIn, i.checkOut, { fresh: true });
    for (const d of cal) if (d.date < i.checkOut) { if (!d.available) throw new AdapterError("Dates unavailable", "unavailable"); nights.push(d.date); }
    const set = this.blocked.get(i.propertyUuid) ?? new Set<string>();
    nights.forEach((n) => set.add(n));
    this.blocked.set(i.propertyUuid, set);
    const id = `mock-res-${i.code}`;
    this.codes.set(i.code, { uuid: i.propertyUuid, nights });
    this.byId.set(id, i.code);
    if (this.createThenTimeout) throw new AdapterError("Hospitable timeout", "upstream_error");
    return { reservationId: id };
  }

  /** Test: after a reservation, this many fresh reads still show the nights as open (slow block). Infinity = never. */
  hideNewBlocksForReads = 0;
  private hiddenReads = 0;

  /** When true, a cancelled reservation's dates stay BLOCKED (seen briefly in the live test). */
  cancelSlow = false;

  async cancelReservation(id: string) {
    const code = this.byId.get(id);
    if (!code) throw new AdapterError("Reservation not found", "not_found");
    if (this.cancelSlow) return;
    const r = this.codes.get(code)!;
    const set = this.blocked.get(r.uuid);
    r.nights.forEach((n) => set?.delete(n));
  }

  async findReservationByCode(code: string): Promise<string | null> {
    return this.codes.has(code) ? `mock-res-${code}` : null;
  }
  /** Test: the reservation is created, then the call fails as if it timed out. */
  createThenTimeout = false;

  /** Number of reservations created (for tests). */
  get reservationCount() { return this.codes.size; }

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
    if (this.authorizeThenTimeout) throw new AdapterError("Stripe timeout", "upstream_error");
    return { paymentIntentId: id };
  }
  async capture(id: string) {
    if (this.failure === "capture_fails") throw new AdapterError("Capture failed", "capture_failed");
    const pi = this.intents.get(id);
    if (!pi || pi.status !== "authorized") throw new AdapterError("Nothing to capture", "invalid_state");
    pi.status = "captured";
    if (this.captureThenTimeout) throw new AdapterError("Stripe timeout", "upstream_error");
  }
  async voidAuthorization(id: string) {
    if (this.voidFails) throw new AdapterError("Stripe unavailable", "upstream_error");
    const pi = this.intents.get(id);
    if (pi && pi.status === "authorized") pi.status = "voided";
  }
  /** Test switches for failure boundaries. */
  voidFails = false;
  authorizeThenTimeout = false;
  captureThenTimeout = false;
  /** Test switches for the second charge. */
  offSession: "ok" | "decline" | "auth_required" | "timeout_after_charge" | "timeout_always" = "ok";
  saved = new Map<string, { customerId: string; paymentMethodId: string }>();
  async savedMethod(pi: string) {
    return this.saved.get(pi) ?? (this.intents.has(pi) ? { customerId: "cus_mock", paymentMethodId: "pm_mock_saved" } : null);
  }
  async chargeSaved(i: { customerId: string; paymentMethodId: string; amount: number; idempotencyKey: string }) {
    const id = `pi_mock_${i.idempotencyKey}`;
    const existing = this.intents.get(id);
    if (existing && this.offSession === "timeout_always") throw new AdapterError("Stripe timeout", "upstream_error");
    if (existing) return { paymentIntentId: id, status: "succeeded" as const }; // idempotent replay
    if (this.offSession === "decline") throw new AdapterError("Your card was declined.", "card_declined");
    if (this.offSession === "auth_required") throw new AdapterError("Authentication required", "authentication_required");
    this.intents.set(id, { amount: i.amount, status: "captured" });
    if (this.offSession === "timeout_after_charge" || this.offSession === "timeout_always") throw new AdapterError("Stripe timeout", "upstream_error");
    return { paymentIntentId: id, status: "succeeded" as const };
  }
  async status(id: string) {
    const pi = this.intents.get(id);
    return pi ? pi.status : "failed";
  }
  async findByRef(ref: string) {
    return [...this.intents.keys()].filter((k) => k.startsWith(`pi_mock_${ref}:`));
  }
}

export const MOCK_PROPERTY_KEYS = PROPERTIES.map((p) => p.key);
