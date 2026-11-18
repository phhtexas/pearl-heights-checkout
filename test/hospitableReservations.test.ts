// Real Hospitable reservations adapter (Oscar, Nov 18), against a fake fetch: request shape, error mapping, lookup.
import { describe, expect, it, vi } from "vitest";
import { hospitableReservations } from "../src/adapters/hospitableReservations";
import { realHospitable } from "../src/server/adapters";

const P = "c093b16d-ce88-4c42-919b-6be6df499bbb";
const R = "6f58fd0a-a9cb-3746-9219-384a156ff7bb";
const input = { propertyUuid: P, checkIn: "2027-04-12", checkOut: "2027-04-14", adults: 2, children: 1, infants: 0,
  guest: { firstName: "Ana", lastName: "Guest", email: "ana@example.com", phone: "2105550100" },
  code: "PH-ABC123", accommodationCents: 120000, cleaningCents: 35000, note: "Direct booking PH-ABC123" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Hospitable manual reservations", () => {
  it("creates with the documented body and returns the reservation uuid", async () => {
    const f = vi.fn(async () => json(201, { data: { id: R } }));
    const w = hospitableReservations("tok", [P], f as any);
    expect(await w.createReservation(input)).toEqual({ reservationId: R });
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe("https://public.api.hospitable.com/v2/reservations");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toMatchObject({
      property_id: P, check_in: "2027-04-12", check_out: "2027-04-14", reservation_code: "PH-ABC123", language: "en",
      guests: { adults: 2, children: 1, infants: 0 }, guest: { first_name: "Ana", last_name: "Guest", email: "ana@example.com" },
      financials: { currency: "USD", accommodation: 120000, cleaning_fee: 35000 },
    });
    expect(JSON.parse(init.body).financials.other_fees).toBeUndefined();
  });
  it("sends damage protection as an other-fee line so Hospitable revenue matches the pre-tax total", async () => {
    const f = vi.fn(async () => json(201, { data: { id: R } }));
    await hospitableReservations("tok", [P], f as any).createReservation({ ...input, protectionCents: 7900 });
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).financials.other_fees).toEqual([{ label: "Damage protection", amount: 7900 }]);
  });
  it("maps errors: duplicate code and overlap are definite; 5xx and timeouts are unknown", async () => {
    const mk = (r: () => Promise<Response>) => hospitableReservations("tok", [P], vi.fn(r) as any);
    await expect(mk(async () => json(422, { message: "You have already used that reservation code" })).createReservation(input)).rejects.toMatchObject({ code: "duplicate_code" });
    await expect(mk(async () => json(422, { message: "The dates overlap an existing booking" })).createReservation(input)).rejects.toMatchObject({ code: "unavailable" });
    await expect(mk(async () => json(422, { message: "language is invalid" })).createReservation(input)).rejects.toMatchObject({ code: "rejected" });
    await expect(mk(async () => json(403, {})).createReservation(input)).rejects.toMatchObject({ code: "rejected" });
    await expect(mk(async () => json(502, {})).createReservation(input)).rejects.toMatchObject({ code: "upstream_error" });
    await expect(mk(async () => { throw new Error("timeout"); }).createReservation(input)).rejects.toMatchObject({ code: "upstream_error" });
    await expect(mk(async () => json(201, {})).createReservation(input)).rejects.toMatchObject({ code: "bad_response" });
  });
  it("cancels as host and finds by code (ignoring cancelled ones)", async () => {
    const f = vi.fn(async (url: string) => url.includes("/cancel") ? json(200, { data: { id: R } })
      : json(200, { data: [{ id: "11111111-1111-4111-8111-111111111111", code: "PH-ABC123", status: "cancelled" }, { id: R, code: "PH-ABC123", status: "accepted" }] }));
    const w = hospitableReservations("tok", [P, "bcccf183-d750-4027-99cc-e5dacf560005"], f as any);
    await w.cancelReservation(R);
    expect(JSON.parse((f.mock.calls[0] as any)[1].body)).toEqual({ initiated_by: "host" });
    expect(await w.findReservationByCode("PH-ABC123")).toBe(R);
    const q = new URL((f.mock.calls[1] as any)[0]).searchParams;
    expect(q.getAll("properties[]")).toHaveLength(2);
    expect(q.get("reservation_code")).toBe("PH-ABC123");
    expect(await w.findReservationByCode("bad code")).toBeNull();
  });
  it("stays off unless HOSPITABLE_WRITES=on with a token", () => {
    expect(realHospitable({} as any)).toBeNull();
    expect(realHospitable({ HOSPITABLE_API_TOKEN: "t" } as any)).toBeNull();
    expect(realHospitable({ HOSPITABLE_API_TOKEN: "t", HOSPITABLE_WRITES: "on" } as any)).not.toBeNull();
  });
});
