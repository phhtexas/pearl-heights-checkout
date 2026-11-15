import { MockHospitable, MockPayments, MockFailure } from "../adapters/mock";
import { HospitableAdapter, PaymentsAdapter } from "../adapters/types";
import { BookingStore, MemoryBookingStore } from "../services/bookingStore";

/**
 * Picks adapters by CHECKOUT_MODE. Only "mock" exists today; "test" (Stripe test mode + Hospitable)
 * and "live" are added once Oscar enters the keys in Vercel.
 *
 * Guards (ChatGPT review, note 68):
 *  - A production deployment refuses mock adapters unless ALLOW_MOCK=true is set explicitly
 *    (used only for the private demo deployment).
 *  - Live mode refuses to start until the launch gates are confirmed: confirmed tax rates and
 *    the Stripe checklist. The 5%-below-Airbnb claim is not implemented at all.
 */
type MockSet = { hosp: MockHospitable; pay: MockPayments; store: BookingStore; used: number };
/** One isolated mock calendar + payments per tester session (ChatGPT note 73), capped in memory. */
const g = globalThis as unknown as { __phh?: Map<string, MockSet> };
const MAX_SESSIONS = 200;

function mockSet(session: string): MockSet {
  g.__phh ??= new Map();
  let set = g.__phh.get(session);
  if (!set) {
    if (g.__phh.size >= MAX_SESSIONS) {
      const oldest = [...g.__phh.entries()].sort((a, b) => a[1].used - b[1].used)[0];
      if (oldest) g.__phh.delete(oldest[0]);
    }
    set = { hosp: new MockHospitable(), pay: new MockPayments(), store: new MemoryBookingStore(), used: 0 };
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
  if (mode !== "mock") throw new Error(`CHECKOUT_MODE=${mode} is not implemented yet; use mock.`);
  if (env.NODE_ENV === "production" && env.ALLOW_MOCK !== "true") throw new Error("Mock adapters are not allowed in production.");
  const set = mockSet(session);
  set.hosp.failure = failure;
  set.pay.failure = failure;
  return { hosp: set.hosp as HospitableAdapter, pay: set.pay as PaymentsAdapter, store: set.store, mode };
}
