import { MockHospitable, MockPayments, MockFailure } from "../adapters/mock";
import { HospitableAdapter, PaymentsAdapter } from "../adapters/types";

/**
 * Picks adapters by CHECKOUT_MODE. Only "mock" exists today; "test" (Stripe test mode + Hospitable)
 * and "live" are added once Oscar enters the keys in Vercel.
 */
const g = globalThis as unknown as { __phh?: { hosp: MockHospitable; pay: MockPayments } };

export function getAdapters(failure: MockFailure = "none"): { hosp: HospitableAdapter; pay: PaymentsAdapter; mode: string } {
  const mode = process.env.CHECKOUT_MODE ?? "mock";
  if (mode !== "mock") throw new Error(`CHECKOUT_MODE=${mode} is not implemented yet; use mock.`);
  g.__phh ??= { hosp: new MockHospitable(), pay: new MockPayments() };
  g.__phh.hosp.failure = failure;
  g.__phh.pay.failure = failure;
  return { ...g.__phh, mode };
}
