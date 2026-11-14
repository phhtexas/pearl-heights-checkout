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
const g = globalThis as unknown as { __phh?: { hosp: MockHospitable; pay: MockPayments; store: BookingStore } };

export function launchGateErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errs: string[] = [];
  if (env.TAX_RATES_CONFIRMED !== "true") errs.push("Tax rates are provisional (accountant has not confirmed).");
  if (env.STRIPE_CHECKLIST_PASSED !== "true") errs.push("Stripe launch checklist has not passed.");
  if (env.ATTORNEY_APPROVED !== "true") errs.push("Attorney review of Terms and checkout is not done.");
  return errs;
}

export function getAdapters(failure: MockFailure = "none", env: NodeJS.ProcessEnv = process.env) {
  const mode = env.CHECKOUT_MODE ?? "mock";
  if (mode === "live") {
    const errs = launchGateErrors(env);
    if (errs.length) throw new Error("Live mode blocked: " + errs.join(" "));
  }
  if (mode !== "mock") throw new Error(`CHECKOUT_MODE=${mode} is not implemented yet; use mock.`);
  if (env.NODE_ENV === "production" && env.ALLOW_MOCK !== "true") throw new Error("Mock adapters are not allowed in production.");
  g.__phh ??= { hosp: new MockHospitable(), pay: new MockPayments(), store: new MemoryBookingStore() };
  g.__phh.hosp.failure = failure;
  g.__phh.pay.failure = failure;
  return { hosp: g.__phh.hosp as HospitableAdapter, pay: g.__phh.pay as PaymentsAdapter, store: g.__phh.store, mode };
}
