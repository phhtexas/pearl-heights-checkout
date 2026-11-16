import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOMES } from "../src/content/homes";
import { AgreementBlockedError, SCHEDULE_FIELDS, agreementSchedule, draftSchedule, scheduleGaps } from "../src/domain/propertySchedule";
import { urgentContact } from "../src/server/stayContact";

describe("Property Schedule (Rental Agreement §8)", () => {
  for (const key of Object.keys(HOMES)) {
    it(`${key}: every required field is filled from the listing`, () => {
      const s = agreementSchedule(key, urgentContact({}));
      for (const [k] of SCHEDULE_FIELDS) expect(s[k].trim().length, k).toBeGreaterThan(0);
      expect(s.interiorCameras).toBe("None.");
      expect(s.exteriorCameras).toMatch(/records? audio/);
      expect(s.exteriorCameras).toMatch(/none view inside the home/);
      expect(s.quietHours).toBe("10 PM to 8 AM Central Time");
      expect(s.maxOccupancy.startsWith(`${HOMES[key]!.capacity.guests} guests.`)).toBe(true);
    });
  }
  it("registration: the city number when listed, 'Not listed' only for Edgewood and Claywell", () => {
    expect(agreementSchedule("752", "x").registration).toBe("STR-23-13401235");
    expect(agreementSchedule("edgewood", "x").registration).toBe("Not listed");
    expect(agreementSchedule("claywell", "x").registration).toBe("Not listed");
  });
  it("blocks the agreement when a field is blank, missing or still a placeholder", () => {
    expect(() => agreementSchedule("752", undefined)).toThrow(AgreementBlockedError);
    try { agreementSchedule("752", ""); } catch (e) { expect((e as AgreementBlockedError).missing).toEqual(["Urgent property contact"]); }
    const s = draftSchedule("752", "x");
    expect(scheduleGaps({ ...s, parking: "  " })).toEqual(["Parking"]);
    expect(scheduleGaps({ ...s, parking: "[Parking limit and locations]" })).toEqual(["Parking"]);
    expect(scheduleGaps({ ...s, rules: "{{RULES}}" })).toEqual(["Property-specific rules"]);
    expect(scheduleGaps({ ...s, registration: "TBD" })).toEqual(["Permit or registration"]);
    const { exteriorCameras, ...noCams } = s;
    expect(scheduleGaps(noCams)).toEqual(["Exterior cameras"]);
    expect(() => agreementSchedule("unknown-home", "x")).toThrow(/Unknown property/);
  });
  it("a home without a registration number (other than the two Oscar approved) is blocked", () => {
    const h = HOMES["752"]!;
    const reg = h.registration;
    try { delete (h as any).registration; expect(scheduleGaps(draftSchedule("752", "x"))).toEqual(["Permit or registration"]); }
    finally { h.registration = reg; }
  });
  it("the urgent phone number is server-only: no page, component or public content imports or contains it", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|md|json)$/.test(f) && files.push(p); } };
    walk("app"); walk("src/content"); walk("public");
    for (const f of files) {
      const t = readFileSync(f, "utf8");
      expect(t.includes("400-2540"), f).toBe(false);
      expect(/stayContact/.test(t), f).toBe(false);
    }
  });
});
