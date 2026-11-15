// ChatGPT note 73: mock availability isolated per tester session, with a mock-only reset.
import { describe, expect, it } from "vitest";
import { getAdapters, resetMockSession } from "../src/server/adapters";
import { getProperty } from "../src/domain/properties";

const env = { CHECKOUT_MODE: "mock" } as any;
const uuid = getProperty("edgewood").hospitableUuid;
const book = async (session: string, code: string) => {
  const { hosp } = getAdapters("none", env, session);
  await hosp.createReservation({ propertyUuid: uuid, checkIn: "2027-05-10", checkOut: "2027-05-12", adults: 2, children: 0, infants: 0,
    guest: { firstName: "T", lastName: "G", email: "t@example.com", phone: "2105550100" }, code, accommodationCents: 1, cleaningCents: 1, note: "" });
};
const open = async (session: string) => (await getAdapters("none", env, session).hosp.getCalendar(uuid, "2027-05-10", "2027-05-11")).every((d) => d.available);

describe("tester isolation", () => {
  it("one tester's booking does not block another tester's calendar", async () => {
    await book("session-aaaaaaaaaaaaaaaa", "PH-ISO001");
    expect(await open("session-aaaaaaaaaaaaaaaa")).toBe(false);
    expect(await open("session-bbbbbbbbbbbbbbbb")).toBe(true);
  });
  it("reset clears only that tester's bookings", async () => {
    await book("session-cccccccccccccccc", "PH-ISO002");
    resetMockSession("session-cccccccccccccccc", env);
    expect(await open("session-cccccccccccccccc")).toBe(true);
  });
  it("reset is refused outside mock mode", () => {
    expect(() => resetMockSession("x", { CHECKOUT_MODE: "live" } as any)).toThrow();
    expect(() => resetMockSession("x", { NODE_ENV: "production", CHECKOUT_MODE: "mock" } as any)).toThrow();
  });
});
