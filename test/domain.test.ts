import { describe, expect, it } from "vitest";
import { buildQuote, QuoteError } from "../src/domain/quote";
import { getProperty } from "../src/domain/properties";
import { computeRefund } from "../src/domain/refunds";
import { verificationDeadline } from "../src/domain/verification";
import { transition, InvalidTransition } from "../src/domain/bookingState";
import { checkInInstant, chicagoInstant } from "../src/domain/time";

const rates = (from: string, to: string, cents: number) => {
  const out: Record<string, number> = {};
  for (let d = new Date(from + "T00:00:00Z"); d < new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1))
    out[d.toISOString().slice(0, 10)] = cents;
  return out;
};
const NOW = new Date("2026-11-14T20:00:00Z"); // Nov 14, 2:00 PM Central

describe("time", () => {
  it("check-in is 4 PM Central (CST in winter, CDT in summer)", () => {
    expect(checkInInstant("2027-01-02").toISOString()).toBe("2027-01-02T22:00:00.000Z");
    expect(checkInInstant("2027-04-05").toISOString()).toBe("2027-04-05T21:00:00.000Z");
    expect(chicagoInstant("2027-03-14", 10).toISOString()).toBe("2027-03-14T15:00:00.000Z"); // DST day
  });
});

describe("quote", () => {
  it("matches the mockup's Edgewood example (3 nights, 2 guests, split plan)", () => {
    const q = buildQuote({ payPlan: "split", 
      property: getProperty("edgewood"), checkIn: "2026-12-31", checkOut: "2027-01-03",
      adults: 2, children: 0, infants: 0, now: NOW,
      nightlyRates: { "2026-12-31": 45500, "2027-01-01": 46400, "2027-01-02": 45400 },
    });
    expect(q.lodging).toBe(137300);
    expect(q.tax).toBe(9318); // 6% of 1,553.00
    expect(q.total).toBe(172518);
    expect(q.plan.split).toBe(true);
    expect(q.plan.dueNow + q.plan.scheduled!.amount).toBe(q.total);
    expect(q.plan.scheduled!.chargeAt.toISOString()).toBe("2026-12-01T22:00:00.000Z"); // Dec 1, 4 PM CST (Oscar, Nov 15)
  });

  it("adds Indianola's $30/night fee from the 5th guest", () => {
    const q = buildQuote({ payPlan: "split", 
      property: getProperty("indianola"), checkIn: "2027-02-14", checkOut: "2027-02-16",
      adults: 6, children: 0, infants: 2, now: NOW, nightlyRates: rates("2027-02-14", "2027-02-16", 50000),
    });
    expect(q.extraGuestFee).toBe(2 * 3000 * 2);
  });

  it("charges in full when check-in is within 30 days", () => {
    const q = buildQuote({ payPlan: "split", 
      property: getProperty("752"), checkIn: "2026-12-01", checkOut: "2026-12-03",
      adults: 2, children: 0, infants: 0, now: NOW, nightlyRates: rates("2026-12-01", "2026-12-03", 40000),
    });
    expect(q.plan.split).toBe(false);
    expect(q.plan.dueNow).toBe(q.total);
  });

  it("rejects too many guests and missing nights", () => {
    const base = { property: getProperty("edgewood"), checkIn: "2027-01-10", checkOut: "2027-01-12", children: 0, infants: 0, now: NOW };
    expect(() => buildQuote({ payPlan: "split",  ...base, adults: 9, nightlyRates: rates("2027-01-10", "2027-01-12", 30000) })).toThrow(QuoteError);
    expect(() => buildQuote({ payPlan: "split",  ...base, adults: 2, nightlyRates: { "2027-01-10": 30000 } })).toThrow(QuoteError);
  });
});

describe("refunds (Terms revision 3)", () => {
  const q = buildQuote({ payPlan: "split", 
    property: getProperty("claywell"), checkIn: "2027-03-01", checkOut: "2027-03-04",
    adults: 4, children: 0, infants: 0, now: NOW, nightlyRates: rates("2027-03-01", "2027-03-04", 50000),
  });
  const fee = Math.round(q.processingFeeBase * 0.05);
  const bookedAt = NOW;
  const at = (iso: string) => new Date(iso);

  it("24-hour grace (8+ days out): everything back, no fee (Oscar, Nov 15)", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2026-11-15T10:00:00Z"), paidSoFar: q.plan.dueNow, reason: "guest" });
    expect(r.tier).toBe("grace_24h");
    expect(r.refund).toBe(q.plan.dueNow); expect(r.processingFee).toBe(0);
  });
  it("30+ days: same fee, scheduled payment cancelled", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2027-01-10T18:00:00Z"), paidSoFar: q.plan.dueNow, reason: "guest" });
    expect(r.tier).toBe("30_plus");
    expect(r.cancelScheduledPayment).toBe(true);
    expect(r.refund).toBe(q.plan.dueNow - fee);
  });
  it("14-29 days: keep 50% of the total excluding protection (protection refunded)", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2027-02-10T18:00:00Z"), paidSoFar: q.total, reason: "guest" });
    expect(r.tier).toBe("14_to_29");
    expect(r.retained).toBe(Math.round((q.total - q.protection) / 2));
  });
  it("under 14 days: no refund except protection", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2027-02-25T18:00:00Z"), paidSoFar: q.total, reason: "guest" });
    expect(r.tier).toBe("under_14");
    expect(r.refund).toBe(q.protection);
  });
  it("after check-in: nothing back", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2027-03-02T15:00:00Z"), paidSoFar: q.total, reason: "guest" });
    expect(r.refund).toBe(0);
  });
  it("missed verification or host cancel: full refund, no fee", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2026-11-15T21:00:00Z"), paidSoFar: q.plan.dueNow, reason: "verification_missed" });
    expect(r.refund).toBe(q.plan.dueNow);
    expect(r.processingFee).toBe(0);
  });
  it("nonpayment exception: first payment back minus the fee", () => {
    const r = computeRefund({ quote: q, checkIn: "2027-03-01", bookedAt, cancelledAt: at("2027-02-02T16:00:00Z"), paidSoFar: q.plan.dueNow, reason: "nonpayment" });
    expect(r.tier).toBe("nonpayment");
    expect(r.refund).toBe(q.plan.dueNow - fee);
  });
});

describe("verification deadlines (approved Nov 14)", () => {
  it("48h+ before check-in: 24 hours", () => {
    expect(verificationDeadline(NOW, "2026-11-20").rule).toBe("24h");
  });
  it("under 48h: 2 hours", () => {
    expect(verificationDeadline(new Date("2026-11-14T20:00:00Z"), "2026-11-15").rule).toBe("2h");
  });
  it("under 2h: must finish before access", () => {
    const d = verificationDeadline(new Date("2026-11-14T21:30:00Z"), "2026-11-14");
    expect(d.rule).toBe("before_access");
    expect(d.mustCompleteBeforeAccess).toBe(true);
  });
});

describe("booking state machine", () => {
  it("follows the happy path", () => {
    let s = transition("quote_created", "DETAILS_SUBMITTED");
    for (const e of ["PAY_PRESSED", "AUTH_OK", "RESERVATION_OK", "CAPTURE_REQUESTED", "CAPTURE_OK", "VERIFIED", "ACCESS_SENT", "CHECKED_OUT"] as const)
      s = transition(s, e);
    expect(s).toBe("completed");
  });
  it("never sends access before verification", () => {
    expect(() => transition("confirmed", "ACCESS_SENT")).toThrow(InvalidTransition);
  });
  it("capture failure only closes after the dates are confirmed open", () => {
    expect(transition("capturing", "CAPTURE_FAILED")).toBe("cancelling_after_capture_fail");
    expect(() => transition("cancelling_after_capture_fail", "CLOSE")).toThrow(InvalidTransition);
    expect(transition("cancelling_after_capture_fail", "DATES_REOPENED")).toBe("closed");
  });
});
