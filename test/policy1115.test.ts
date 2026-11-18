import { describe, expect, it } from "vitest";
import { buildQuote, flexibleCutoff, nonRefundableFrom } from "../src/domain/quote";
import { getProperty } from "../src/domain/properties";
import { computeRefund } from "../src/domain/refunds";

/** Oscar's Nov 15, 2026 decisions: pay-in-full default, 4 PM CT second charge, 24-hour full refund, ≤7 days non-refundable. */
const S = 1000;
const rates = (from: string, to: string, cents: number) => {
  const out: Record<string, number> = {};
  for (let d = new Date(from + "T00:00:00Z"); d < new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1))
    out[d.toISOString().slice(0, 10)] = cents;
  return out;
};
const quoteAt = (checkIn: string, checkOut: string, now: Date, payPlan?: "full" | "split") =>
  buildQuote({ property: getProperty("claywell"), checkIn, checkOut, adults: 4, children: 0, infants: 0, now,
    nightlyRates: rates(checkIn, checkOut, 59000), payPlan });

const NOW = new Date("2026-11-15T17:00:00Z"); // Nov 15, 11 AM CT

describe("payment plan choice", () => {
  it("defaults to pay in full and offers split as an option", () => {
    const q = quoteAt("2027-01-05", "2027-01-07", NOW);
    expect(q.total).toBe(173140); // was $1,700.80 at 6%; 8% tax from the CPA (Nov 18)
    expect(q.plan.split).toBe(false);
    expect(q.plan.dueNow).toBe(q.total);
    expect(q.splitPlan?.dueNow).toBe(86570);
    expect(q.nonRefundable).toBe(false);
  });

  it("split charges the rest at 4:00 PM CT, 30 days before check-in", () => {
    const q = quoteAt("2027-01-05", "2027-01-07", NOW, "split");
    expect(q.plan.split).toBe(true);
    expect(q.plan.scheduled!.chargeAt.toISOString()).toBe("2026-12-06T22:00:00.000Z"); // Sun Dec 6, 4 PM CST
    expect(q.plan.dueNow + q.plan.scheduled!.amount).toBe(q.total);
  });

  it("second charge is 30 calendar days at 4 PM local across DST", () => {
    expect(flexibleCutoff("2027-04-05").toISOString()).toBe("2027-03-06T22:00:00.000Z"); // CST cutoff, CDT check-in
  });

  it("no split once the cutoff has passed (or at the exact instant)", () => {
    const cutoff = flexibleCutoff("2027-01-05");
    expect(quoteAt("2027-01-05", "2027-01-07", new Date(cutoff.getTime() - S), "split").plan.split).toBe(true);
    const q = quoteAt("2027-01-05", "2027-01-07", cutoff, "split");
    expect(q.plan.split).toBe(false);
    expect(q.splitPlan).toBeUndefined();
  });

  it("7 days or less before check-in: non-refundable, pay in full only", () => {
    const from = nonRefundableFrom("2026-11-22"); // Nov 15, 4 PM CT
    const before = quoteAt("2026-11-22", "2026-11-24", new Date(from.getTime() - S));
    expect(before.nonRefundable).toBe(false);
    const at = quoteAt("2026-11-22", "2026-11-24", from, "split");
    expect(at.nonRefundable).toBe(true);
    expect(at.plan.split).toBe(false);
  });
});

describe("refunds (Nov 15 rules)", () => {
  const ci = "2027-01-05";
  const bookedAt = NOW;
  const q = quoteAt(ci, "2027-01-07", bookedAt, "split");
  const fee = Math.round(q.processingFeeBase * 0.05);

  it("within 24 hours of booking (8+ days out): everything back, no fee, waiver included", () => {
    const r = computeRefund({ quote: q, checkIn: ci, bookedAt, cancelledAt: new Date(bookedAt.getTime() + 24 * 3600 * S), paidSoFar: q.plan.dueNow, reason: "guest" });
    expect(r.tier).toBe("grace_24h");
    expect(r.refund).toBe(q.plan.dueNow);
    expect(r.processingFee).toBe(0);
  });

  it("after 24 hours but before the cutoff: refund minus 5%", () => {
    const r = computeRefund({ quote: q, checkIn: ci, bookedAt, cancelledAt: new Date(flexibleCutoff(ci).getTime() - S), paidSoFar: q.plan.dueNow, reason: "guest" });
    expect(r.tier).toBe("30_plus");
    expect(r.retained).toBe(fee);
  });

  it("at the cutoff instant the 14-29 tier applies (same instant the second charge runs)", () => {
    const r = computeRefund({ quote: q, checkIn: ci, bookedAt, cancelledAt: flexibleCutoff(ci), paidSoFar: q.total, reason: "guest" });
    expect(r.tier).toBe("14_to_29");
  });

  it("booked 7 days or less out: non-refundable even within 24 hours, waiver included", () => {
    const ci2 = "2026-11-22";
    const booked = nonRefundableFrom(ci2);
    const q2 = quoteAt(ci2, "2026-11-24", booked);
    const r = computeRefund({ quote: q2, checkIn: ci2, bookedAt: booked, cancelledAt: new Date(booked.getTime() + 3600 * S), paidSoFar: q2.total, reason: "guest" });
    expect(r.tier).toBe("non_refundable");
    expect(r.refund).toBe(0);
  });

  it("booked 7 days + 1 second out: still gets the 24-hour full refund", () => {
    const ci2 = "2026-11-22";
    const booked = new Date(nonRefundableFrom(ci2).getTime() - S);
    const q2 = quoteAt(ci2, "2026-11-24", booked);
    const r = computeRefund({ quote: q2, checkIn: ci2, bookedAt: booked, cancelledAt: new Date(booked.getTime() + 3600 * S), paidSoFar: q2.total, reason: "guest" });
    expect(r.tier).toBe("grace_24h");
    expect(r.refund).toBe(q2.total);
  });

  it("failed ID on a non-refundable booking: full refund, no fee", () => {
    const ci2 = "2026-11-22";
    const booked = nonRefundableFrom(ci2);
    const q2 = quoteAt(ci2, "2026-11-24", booked);
    const r = computeRefund({ quote: q2, checkIn: ci2, bookedAt: booked, cancelledAt: new Date(booked.getTime() + 3 * 3600 * S), paidSoFar: q2.total, reason: "verification_missed" });
    expect(r.tier).toBe("full_no_fee");
    expect(r.refund).toBe(q2.total);
  });
});

describe("check-in day (Terms: waiver refunded only before the check-in date)", () => {
  const ci = "2027-01-05";
  const q = quoteAt(ci, "2027-01-07", NOW);
  it("11:59:59 PM the day before: waiver refunded", () => {
    const r = computeRefund({ quote: q, checkIn: ci, bookedAt: NOW, cancelledAt: new Date("2027-01-05T05:59:59Z"), paidSoFar: q.total, reason: "guest" });
    expect(r.tier).toBe("under_14"); expect(r.refund).toBe(q.protection);
  });
  it("12:00 AM CT on check-in day: nothing refundable", () => {
    const r = computeRefund({ quote: q, checkIn: ci, bookedAt: NOW, cancelledAt: new Date("2027-01-05T06:00:00Z"), paidSoFar: q.total, reason: "guest" });
    expect(r.tier).toBe("check_in_day"); expect(r.refund).toBe(0);
  });
});
