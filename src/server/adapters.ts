import { MockHospitable, MockPayments, MockFailure } from "../adapters/mock";
import { HospitableAdapter, PaymentsAdapter } from "../adapters/types";
import { BookingStore, MemoryBookingStore } from "../services/bookingStore";
import { StripePayments, assertLiveKeys, assertTestKeys } from "../adapters/stripe";
import { getDb } from "../db/client";
import { CalendarSource, hospitableCalendarSource } from "../adapters/hospitableCalendar";
import { DbLedger, Ledger, MemoryLedger } from "../db/ledger";
import { hospitableReservations } from "../adapters/hospitableReservations";
import { PROPERTIES } from "../domain/properties";

/**
 * Picks adapters by mode: "mock", "test" (Stripe TEST keys; Hospitable writes only with HOSPITABLE_WRITES=on) or
 * "live" (pearlheightshomes.com with LIVE_CHECKOUT=on; Stripe LIVE keys; always real Hospitable reservations).
 * Callers pass the request's settings from envForRequest (src/server/mode.ts).
 *
 * Guards (ChatGPT review, note 68):
 *  - A production deployment refuses mock adapters unless ALLOW_MOCK=true is set explicitly
 *    (used only for the private demo deployment).
 *  - Live mode refuses to start until the launch gates are confirmed: confirmed tax rates and
 *    the Stripe checklist. The 5%-below-Airbnb claim is not implemented at all.
 */
type MockSet = { hosp: MockHospitable; pay: MockPayments; store: BookingStore; ledger: MemoryLedger; used: number };
/** One isolated mock calendar + payments per tester session (ChatGPT note 73), capped in memory. */
const g = globalThis as unknown as { __phh?: Map<string, MockSet>; __stripe?: StripePayments; __stripeLive?: StripePayments; __liveStore?: BookingStore; __ledger?: DbLedger; __cal?: CalendarSource };
const MAX_SESSIONS = 200;

function mockSet(session: string): MockSet {
  g.__phh ??= new Map();
  let set = g.__phh.get(session);
  if (!set) {
    if (g.__phh.size >= MAX_SESSIONS) {
      const oldest = [...g.__phh.entries()].sort((a, b) => a[1].used - b[1].used)[0];
      if (oldest) g.__phh.delete(oldest[0]);
    }
    set = { hosp: new MockHospitable("none", liveCalendar()), pay: new MockPayments(), store: new MemoryBookingStore(), ledger: new MemoryLedger(), used: 0 };
    g.__phh.set(session, set);
  }
  set.used = Date.now();
  return set;
}

/** Clears this tester's mock bookings and payments. Mock mode only. */
export function resetMockSession(session: string, env: NodeJS.ProcessEnv = process.env) {
  getAdapters("none", env, session); // runs the same mode guards
  g.__phh?.delete(session);
}

export function launchGateErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errs: string[] = [];
  if (env.TAX_RATES_CONFIRMED !== "true") errs.push("Tax rates are provisional (accountant has not confirmed).");
  if (env.STRIPE_CHECKLIST_PASSED !== "true") errs.push("Stripe launch checklist has not passed.");
  if (env.ATTORNEY_APPROVED !== "true") errs.push("Attorney review of Terms and checkout is not done.");
  return errs;
}

export function getAdapters(failure: MockFailure = "none", env: NodeJS.ProcessEnv = process.env, session = "default") {
  const mode = env.CHECKOUT_MODE ?? "mock";
  if (mode === "live") {
    const errs = launchGateErrors(env);
    if (errs.length) throw new Error("Live mode blocked: " + errs.join(" "));
  }
  if (mode === "live") {
    // Live (pearlheightshomes.com with LIVE_CHECKOUT=on; env comes from envForMode): live Stripe keys, and every booking
    // must create a real Hospitable reservation, so the dates are blocked on Airbnb too. No mocks, no simulated failures.
    if (!env.HOSPITABLE_API_TOKEN) throw new Error("Live mode needs HOSPITABLE_API_TOKEN.");
    g.__stripeLive ??= StripePayments.fromEnv(env); // refuses anything but live keys
    return { hosp: realHospitable(env, true)!, pay: g.__stripeLive as PaymentsAdapter, store: (g.__liveStore ??= new MemoryBookingStore()), mode };
  }
  if (mode !== "mock" && mode !== "test") throw new Error(`CHECKOUT_MODE=${mode} is not implemented; use mock or test.`);
  // Hospitable is still mocked in both modes (Oscar, Nov 14: real calendar later, fake bookings), so the mock guard applies.
  // Vercel branch previews have no secrets: they run fully mocked (fake calendar, fake payments, in memory) for design review.
  const previewMock = env.VERCEL_ENV === "preview" && mode === "mock";
  if (env.NODE_ENV === "production" && env.ALLOW_MOCK !== "true" && !previewMock) throw new Error("Mock adapters are not allowed in production.");
  const set = mockSet(session);
  set.hosp.failure = failure;
  set.pay.failure = failure;
  if (mode === "test") {
    g.__stripe ??= StripePayments.fromEnv(env); // refuses anything but test keys
    const real = realHospitable(env);
    return { hosp: real ?? (set.hosp as HospitableAdapter), pay: g.__stripe as PaymentsAdapter, store: set.store, mode };
  }
  return { hosp: set.hosp as HospitableAdapter, pay: set.pay as PaymentsAdapter, store: set.store, mode };
}

/** What the browser needs to render the payment form. Only the publishable key is ever sent. */
export function publicConfig(env: NodeJS.ProcessEnv = process.env): { mode: string; publishableKey?: string } {
  const mode = env.CHECKOUT_MODE ?? "mock";
  if (mode === "test") return { mode, publishableKey: assertTestKeys(env).publishable };
  if (mode === "live") return { mode, publishableKey: assertLiveKeys(env).publishable };
  return { mode };
}

/**
 * Durable records when DATABASE_URL is set; otherwise an in-memory ledger per tester session.
 * Stripe test mode on a deployed site requires the database (no idempotency without it).
 */
export function getLedger(env: NodeJS.ProcessEnv = process.env, session = "default"): { ledger: Ledger; durable: boolean } {
  const db = getDb(env);
  if (db) return { ledger: (g.__ledger ??= new DbLedger(db)), durable: true };
  if (env.NODE_ENV === "production" && (env.CHECKOUT_MODE ?? "mock") !== "mock") throw new Error("Test/live mode requires DATABASE_URL.");
  return { ledger: mockSet(session).ledger, durable: false };
}

/** Real Hospitable prices/availability (read-only) when HOSPITABLE_API_TOKEN is set; else the snapshot. */
function liveCalendar(env: NodeJS.ProcessEnv = process.env): CalendarSource | undefined {
  if (!env.HOSPITABLE_API_TOKEN) return undefined;
  return (g.__cal ??= hospitableCalendarSource(env.HOSPITABLE_API_TOKEN));
}

/**
 * Real Hospitable reservations (Oscar, Nov 18), OFF unless HOSPITABLE_WRITES=on and a token is set. While off, test
 * checkout keeps the stand-in (real calendar, fake bookings). When on, every confirmed booking creates a real manual
 * reservation (blocks the dates on every channel; Hospitable messages the guest), so it is turned on only for a
 * supervised test or at launch.
 */
export function realHospitable(env: NodeJS.ProcessEnv = process.env, live = false): HospitableAdapter | null {
  // Live bookings always write (that is the point); test bookings only with HOSPITABLE_WRITES=on (supervised tests).
  if ((!live && env.HOSPITABLE_WRITES !== "on") || !env.HOSPITABLE_API_TOKEN) return null;
  const cal = liveCalendar(env)!;
  const w = hospitableReservations(env.HOSPITABLE_API_TOKEN, PROPERTIES.map((p) => p.hospitableUuid));
  return { getCalendar: (u, a, b, o) => cal(u, a, b, o), ...w };
}
