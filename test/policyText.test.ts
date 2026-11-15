import { describe, expect, it } from "vitest";
import { buildQuote } from "../src/domain/quote";
import { getProperty } from "../src/domain/properties";
import { computeRefund } from "../src/domain/refunds";
import { stayPolicy } from "../src/domain/policy";

/** Note 131 f5: every policy row shown to the guest must match what computeRefund() does in that window. */
const rates = (from: string, to: string, c: number) => {
  const o: Record<string, number> = {};
  for (let d = new Date(from + "T00:00:00Z"); d < new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) o[d.toISOString().slice(0, 10)] = c;
  return o;
};
const cases: [string, string, string][] = [
  ["far out (all tiers)", "2027-01-05", "2026-11-15T17:00:00Z"],
  ["20 days out (no 30+ tier)", "2026-12-05", "2026-11-15T17:00:00Z"],
  ["10 days out (only grace + under 14)", "2026-11-25", "2026-11-15T17:00:00Z"],
  ["5 days out (non-refundable)", "2026-11-20", "2026-11-15T17:00:00Z"],
];

describe("policy text is generated from the refund engine", () => {
  for (const [name, ci, booked] of cases) {
    it(name, () => {
      const bookedAt = new Date(booked);
      const q = buildQuote({ property: getProperty("claywell"), checkIn: ci, checkOut: ci.slice(0, 8) + String(Number(ci.slice(8)) + 2).padStart(2, "0"), adults: 2, children: 0, infants: 0, now: bookedAt, nightlyRates: rates(ci, "2027-12-31", 50000) });
      const p = stayPolicy(ci, bookedAt);
      expect(p.nonRefundable).toBe(q.nonRefundable);
      let from = bookedAt.getTime();
      for (const row of p.rows) {
        if (!row.until) { expect(row.tier).toBe("non_refundable"); continue; }
        const until = Date.parse(row.until);
        // One second inside the window: the engine must return exactly this row's tier.
        const r = computeRefund({ quote: q, checkIn: ci, bookedAt, cancelledAt: new Date(Math.max(from, until - 1000)), paidSoFar: q.total, reason: "guest" });
        expect(r.tier).toBe(row.tier);
        from = until;
      }
      if (p.nonRefundable) {
        const r = computeRefund({ quote: q, checkIn: ci, bookedAt, cancelledAt: new Date(bookedAt.getTime() + 3600_000), paidSoFar: q.total, reason: "guest" });
        expect(r.tier).toBe("non_refundable");
      }
    });
  }
});
