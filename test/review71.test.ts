// Tests requested in ChatGPT live review (note 71).
import { describe, expect, it } from "vitest";
import { MockHospitable, MockPayments } from "../src/adapters/mock";
import { runCheckout } from "../src/services/checkout";
import { getProperty } from "../src/domain/properties";
import { buildQuote } from "../src/domain/quote";
import { verificationDeadline } from "../src/domain/verification";
import { formatChicagoDate, formatChicagoDateTime } from "../src/domain/time";
import { guestView } from "../src/server/guestView";

const indianola = getProperty("indianola");
const NOW = new Date("2026-11-14T20:00:00Z");

async function request(h: MockHospitable, ref: string) {
  const stay = { property: indianola, checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0, now: NOW };
  const clean = new MockHospitable(); // quote is taken before the Airbnb booking lands
  const cal = await clean.getCalendar(indianola.hospitableUuid, stay.checkIn, stay.checkOut);
  const q = buildQuote({ ...stay, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
  return { ...stay, guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" }, bookingRef: ref, acceptedTotal: q.total };
}

describe("item 1: dates booked on Airbnb during checkout", () => {
  for (const retryAfterDecline of [false, true]) {
    it(`stops before payment: zero authorization, reservation and capture${retryAfterDecline ? " (after a card-decline retry)" : ""}`, async () => {
      const h = new MockHospitable(), p = new MockPayments();
      if (retryAfterDecline) {
        h.failure = p.failure = "card_declined";
        const first = await runCheckout(await request(h, "PH-DECL01"), h, p);
        expect(first.ok).toBe(false);
      }
      h.failure = p.failure = "dates_taken";
      const r = await runCheckout(await request(h, "PH-TAKEN1"), h, p);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("dates_taken");
      expect(p.intents.size).toBe(0);
      expect(h.reservationCount).toBe(0);
      expect([...p.intents.values()].some((i) => i.status === "captured")).toBe(false);
      expect(guestView(r, "PH-TAKEN1")).toEqual({ ok: false, reason: "dates_taken", guestMessage: r.guestMessage });
    });
  }
});

describe("item 2: guests never receive internal state", () => {
  it("success view has no log, reservation or payment IDs", async () => {
    const h = new MockHospitable(), p = new MockPayments();
    const r = await runCheckout(await request(h, "PH-OKAY01"), h, p);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(guestView(r, "PH-OKAY01"));
    for (const word of ["log", "mock-res", "pi_mock", "authoriz", "capture", "alert", "reservation_"]) expect(json).not.toContain(word);
  });
  it("failure view has no log", async () => {
    const h = new MockHospitable(), p = new MockPayments("capture_fails");
    const r = await runCheckout(await request(h, "PH-CAPF01"), h, p);
    expect(Object.keys(guestView(r, "PH-CAPF01")).sort()).toEqual(["guestMessage", "ok", "reason"]);
  });
});

describe("item 3: verification deadline in Central time with date and zone", () => {
  it("CST (Nov): 24h after a Saturday 6:52 PM payment is Sunday 6:52 PM CT", () => {
    const v = verificationDeadline(new Date("2026-11-15T00:52:00Z"), "2026-12-20");
    expect(v.deadlineText).toBe("Sunday, November 15, 2026, 6:52 PM CT");
  });
  it("CDT (Jul)", () => expect(formatChicagoDateTime(new Date("2027-07-04T15:30:00Z"))).toBe("Sunday, July 4, 2027, 10:30 AM CT"));
  it("across spring-forward: Sat Mar 13 3:00 AM CST + 24h = Sun Mar 14 4:00 AM CDT", () => {
    const v = verificationDeadline(new Date("2027-03-13T09:00:00Z"), "2027-04-20");
    expect(v.deadlineText).toBe("Sunday, March 14, 2027, 4:00 AM CT");
  });
  it("across fall-back", () => {
    const v = verificationDeadline(new Date("2027-11-06T23:00:00Z"), "2027-12-20"); // Sat 6 PM CDT
    expect(v.deadlineText).toBe("Sunday, November 7, 2027, 5:00 PM CT"); // 24 real hours later, now CST
  });
});

describe("item 4: consent names the actual second-charge date", () => {
  it("10 AM CT, 30 days before check-in, as a Central calendar date", () => {
    const q = buildQuote({ property: indianola, checkIn: "2027-04-05", checkOut: "2027-04-07", adults: 2, children: 0, infants: 0, now: NOW, nightlyRates: { "2027-04-05": 30000, "2027-04-06": 30000 } });
    expect(formatChicagoDate(q.plan.scheduled!.chargeAt)).toBe("Mar 6, 2027");
  });
});
