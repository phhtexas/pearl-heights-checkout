import { describe, expect, it } from "vitest";
import { HOMES } from "../src/content/homes";
import { HOME_SOURCES } from "../src/content/homeSources";
import { PROPERTIES } from "../src/domain/properties";

describe("home page content", () => {
  for (const [key, h] of Object.entries(HOMES)) {
    it(`${key}: matches its property and has sources`, () => {
      const p = PROPERTIES.find((x) => x.key === h.key);
      expect(p, "known property").toBeTruthy();
      expect(h.capacity.guests).toBe(p!.maxGuests);
      expect(HOME_SOURCES[key]?.sources.length).toBeGreaterThan(0);
      expect(h.roomPhotos.length).toBe(h.sleeping.length);
      const ids = new Set(h.photos.map((x) => x.id));
      for (const id of h.roomPhotos) expect(ids.has(id), `room photo ${id} is in the gallery`).toBe(true);
      expect(new Set(Object.values(HOMES).map((x) => x.slug)).size).toBe(Object.keys(HOMES).length);
    });
  }
  it("guest copy never makes banned price claims", () => {
    const all = JSON.stringify(HOMES).toLowerCase();
    for (const bad of ["no fees", "skip the cleaning fee", "best rate", "5% less", "waivo", "facebook"]) expect(all).not.toContain(bad);
  });
});
