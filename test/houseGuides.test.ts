import { describe, expect, it } from "vitest";
import { houseGuide } from "@/content/houseGuides";
import { demoStay } from "@/content/stayDemo";

describe("house guides (ship to the browser)", () => {
  const text = JSON.stringify(houseGuide("752"));
  it("covers the Guest Book topics for 752", () => {
    expect(houseGuide("752").map((t) => t.title)).toEqual(expect.arrayContaining(["Washer and dryer", "Appliances", "Parking", "Trash", "Our favorite places"]));
  });
  it("never contains codes, Wi-Fi details or the street address", () => {
    expect(text).not.toMatch(/password|wi-?fi network|welcomehome|ThePearlHome\b|\bcode (is|:)|\d{4}#|Myrtle St|78212/i);
    expect(text).not.toMatch(/\b(3255|6978)\b/);
  });
  it("portal shows listing rules first, guide topics, safety last", () => {
    const t = demoStay().thingsToKnow.map((x) => x.title);
    expect(t[0]).toBe("Check-in and check-out");
    expect(t[1]).toBe("House rules");
    expect(t.at(-1)).toBe("Safety and property");
    expect(t).toContain("Washer and dryer");
  });
});
