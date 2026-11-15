import { describe, expect, it } from "vitest";
import { hospitableCalendarSource } from "../src/adapters/hospitableCalendar";
import { MockHospitable } from "../src/adapters/mock";

// Shape copied from a real Hospitable v2 calendar response (Indianola, Mar 8-10, 2027).
const body = { data: { days: [
  { date: "2027-03-08", min_stay: 2, status: { available: true }, price: { amount: 60700, currency: "USD" } },
  { date: "2027-03-09", min_stay: 2, status: { available: false }, price: { amount: 43700, currency: "USD" } },
  { date: "2027-03-10", min_stay: 3, status: { available: true }, price: { amount: 58900, currency: "USD" } },
] } };
const UUID = "0248fb46-9d5f-42fd-bda9-6c5fc497f673";

function fakeFetch(status = 200) {
  const calls: any[] = [];
  const f = (async (url: string, init: any) => { calls.push({ url, init }); return { ok: status === 200, status, json: async () => body } as any; }) as any;
  return { f, calls };
}

describe("Hospitable calendar (read-only)", () => {
  it("maps days, keeps cents, sends the token as a bearer header, and caches for a minute", async () => {
    const { f, calls } = fakeFetch();
    const src = hospitableCalendarSource("tok_test", f);
    const days = await src(UUID, "2027-03-08", "2027-03-10");
    expect(days).toEqual([
      { date: "2027-03-08", available: true, price: 60700, minStay: 2, closedForCheckin: false, closedForCheckout: false },
      { date: "2027-03-09", available: false, price: 43700, minStay: 2, closedForCheckin: false, closedForCheckout: false },
      { date: "2027-03-10", available: true, price: 58900, minStay: 3, closedForCheckin: false, closedForCheckout: false },
    ]);
    expect(calls[0].url).toBe(`https://public.api.hospitable.com/v2/properties/${UUID}/calendar?start_date=2027-03-08&end_date=2027-03-10`);
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok_test");
    await src(UUID, "2027-03-08", "2027-03-10");
    expect(calls).toHaveLength(1);
  });
  it("errors are raised and not cached", async () => {
    const { f, calls } = fakeFetch(401);
    const src = hospitableCalendarSource("bad", f);
    await expect(src(UUID, "2027-03-08", "2027-03-10")).rejects.toMatchObject({ code: "auth_failed" });
    await expect(src(UUID, "2027-03-08", "2027-03-10")).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
  it("fake bookings and the dates-taken test still layer on top of the real calendar", async () => {
    const { f } = fakeFetch();
    const h = new MockHospitable("none", hospitableCalendarSource("tok", f));
    h.blockDates(UUID, ["2027-03-08"]);
    expect((await h.getCalendar(UUID, "2027-03-08", "2027-03-10")).map((d) => d.available)).toEqual([false, false, true]);
    h.failure = "dates_taken";
    expect((await h.getCalendar(UUID, "2027-03-08", "2027-03-10")).every((d) => !d.available)).toBe(true);
  });
});

describe("same-day cut-off (12 PM CT, Oscar Nov 14)", async () => {
  const { earliestCheckIn } = await import("../src/domain/time");
  it("before noon CT today is bookable", () => expect(earliestCheckIn(new Date("2026-11-14T17:59:00Z"))).toBe("2026-11-14")); // 11:59 AM CST
  it("at/after noon CT the earliest is tomorrow", () => expect(earliestCheckIn(new Date("2026-11-14T18:00:00Z"))).toBe("2026-11-15"));
  it("late evening CT is still 'today' in Chicago even when UTC has rolled over", () => expect(earliestCheckIn(new Date("2026-11-15T03:30:00Z"))).toBe("2026-11-15")); // 9:30 PM Nov 14 CT
  it("summer (CDT) noon", () => expect(earliestCheckIn(new Date("2027-07-01T16:59:00Z"))).toBe("2027-07-01"));
});

describe("closed for check-in / check-out", () => {
  it("are read from Hospitable", async () => {
    const f = (async () => ({ ok: true, status: 200, json: async () => ({ data: { days: [{ date: "2027-03-08", min_stay: 2, closed_for_checkin: true, closed_for_checkout: false, status: { available: true }, price: { amount: 100, currency: "USD" } }] } }) })) as any;
    const [d] = await hospitableCalendarSource("t", f)(UUID, "2027-03-08", "2027-03-08");
    expect(d).toMatchObject({ closedForCheckin: true, closedForCheckout: false });
  });
});
