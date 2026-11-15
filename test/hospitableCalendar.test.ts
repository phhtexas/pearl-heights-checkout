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

describe("Hospitable client controls (note 82)", () => {
  const ok = (days: unknown) => ({ ok: true, status: 200, json: async () => ({ data: { days } }) });
  it("fresh reads bypass the 60-second cache", async () => {
    let n = 0;
    const f = (async () => { n++; return ok([{ date: "2027-03-08", status: { available: true }, price: { amount: 100 * n, currency: "USD" } }]); }) as any;
    const src = hospitableCalendarSource("t", f);
    expect((await src(UUID, "2027-03-08", "2027-03-08"))[0]!.price).toBe(100);
    expect((await src(UUID, "2027-03-08", "2027-03-08"))[0]!.price).toBe(100); // cached
    expect((await src(UUID, "2027-03-08", "2027-03-08", { fresh: true }))[0]!.price).toBe(200);
    expect(n).toBe(2);
  });
  it("retries 429/5xx at most twice with backoff, then fails", async () => {
    const statuses: number[] = []; const waits: number[] = [];
    const f = (async () => { statuses.push(503); return { ok: false, status: 503, json: async () => ({}) }; }) as any;
    await expect(hospitableCalendarSource("t", f, async (ms) => { waits.push(ms); })(UUID, "2027-03-08", "2027-03-08")).rejects.toMatchObject({ code: "upstream_error" });
    expect(statuses).toHaveLength(3);
    expect(waits).toEqual([300, 900]);
  });
  it("does not retry 401", async () => {
    let n = 0;
    const f = (async () => { n++; return { ok: false, status: 401, json: async () => ({}) }; }) as any;
    await expect(hospitableCalendarSource("t", f, async () => {})(UUID, "2027-03-08", "2027-03-08")).rejects.toMatchObject({ code: "auth_failed" });
    expect(n).toBe(1);
  });
  it("retries a timeout/network error, then succeeds", async () => {
    let n = 0;
    const f = (async (_u: string, init: any) => { n++; expect(init.signal).toBeDefined(); if (n === 1) throw new Error("timeout"); return ok([]); }) as any;
    expect(await hospitableCalendarSource("t", f, async () => {})(UUID, "2027-03-08", "2027-03-08")).toEqual([]);
    expect(n).toBe(2);
  });
  it("rejects malformed responses: bad date, fractional or negative price, non-USD, non-array", async () => {
    for (const days of [[{ date: "03/08/2027" }], [{ date: "2027-03-08", price: { amount: 1.5 } }], [{ date: "2027-03-08", price: { amount: -1 } }],
      [{ date: "2027-03-08", price: { amount: 1, currency: "EUR" } }], "nope"]) {
      const f = (async () => ok(days)) as any;
      await expect(hospitableCalendarSource("t", f)(UUID, "2027-03-08", "2027-03-08")).rejects.toMatchObject({ code: "bad_response" });
    }
  });
  it("only calls the fixed Hospitable base URL and refuses malformed ids/dates", async () => {
    const f = (async () => ok([])) as any;
    await expect(hospitableCalendarSource("t", f)("../../evil", "2027-03-08", "2027-03-08")).rejects.toMatchObject({ code: "bad_request" });
    await expect(hospitableCalendarSource("t", f)(UUID, "2027-3-8", "2027-03-08")).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("pre-payment recheck is fresh (note 82)", async () => {
  const { runCheckout } = await import("../src/services/checkout");
  const { getProperty } = await import("../src/domain/properties");
  const { buildQuote } = await import("../src/domain/quote");
  const { MockPayments } = await import("../src/adapters/mock");
  const indianola = getProperty("indianola");
  const stay = { property: indianola, checkIn: "2027-03-08", checkOut: "2027-03-10", adults: 2, children: 0, infants: 0, now: new Date("2026-11-14T20:00:00Z") };
  const guest = { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" };
  function changingSource(after: "blocked" | "price") {
    let changed = false;
    const f = (async () => ({ ok: true, status: 200, json: async () => ({ data: { days: [
      { date: "2027-03-08", status: { available: !(changed && after === "blocked") }, price: { amount: changed && after === "price" ? 70000 : 60700, currency: "USD" }, min_stay: 2 },
      { date: "2027-03-09", status: { available: true }, price: { amount: 43700, currency: "USD" }, min_stay: 2 },
    ] } }) })) as any;
    return { src: hospitableCalendarSource("t", f), change: () => { changed = true; } };
  }
  for (const kind of ["blocked", "price"] as const) {
    it(`a ${kind === "blocked" ? "night booked" : "price change"} inside the cache window is caught: 0 authorization, reservation, capture`, async () => {
      const { src, change } = changingSource(kind);
      const h = new MockHospitable("none", src), p = new MockPayments();
      const cal = await h.getCalendar(indianola.hospitableUuid, stay.checkIn, stay.checkOut); // browse: fills the cache
      const q = buildQuote({ ...stay, nightlyRates: Object.fromEntries(cal.filter((d) => d.date < stay.checkOut).map((d) => [d.date, d.price])) });
      change(); // Airbnb booking / PriceLabs update lands; the cached browse copy is now stale
      expect((await h.getCalendar(indianola.hospitableUuid, stay.checkIn, stay.checkOut))[0]!.price).toBe(60700); // cache still stale
      const r = await runCheckout({ ...stay, guest, bookingRef: "PH-FRESH1", acceptedTotal: q.total }, h, p);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(kind === "blocked" ? "dates_taken" : "price_changed");
      expect(p.intents.size).toBe(0);
      expect(h.reservationCount).toBe(0);
    });
  }
});
