// Search + AI-search prep (Oscar, Nov 18): one switch, structured data without private details, test host never indexed.
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { HOMES } from "../src/content/homes";
import { homeJsonLd, publicMeta, siteJsonLd, ldJson } from "../src/seo";
import robots from "../app/robots";
import sitemap from "../app/sitemap";

const req = (url: string, host: string) => new NextRequest(new URL(url, `https://${host}`), { headers: { host } });
afterEach(() => { delete process.env.SITE_INDEXING; });

describe("search and AI-search setup", () => {
  it("stays noindex until SITE_INDEXING=on, with the real-domain canonical either way", () => {
    expect(publicMeta("/homes/752-myrtle", { title: "x" }).robots).toEqual({ index: false, follow: false });
    process.env.SITE_INDEXING = "on";
    const m = publicMeta("/homes/752-myrtle", { title: "x" });
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe("/homes/752-myrtle");
    expect(String(m.metadataBase)).toBe("https://pearlheightshomes.com/");
  });
  it("robots.txt lists the sitemap only when on; private areas always closed", () => {
    expect(robots().sitemap).toBeUndefined();
    process.env.SITE_INDEXING = "on";
    const r = robots();
    expect(r.sitemap).toBe("https://pearlheightshomes.com/sitemap.xml");
    expect(JSON.stringify(r.rules)).toContain("/stay/");
    expect(sitemap().map((x) => x.url)).toContain("https://pearlheightshomes.com/homes/claywell-alamo-heights");
  });
  it("structured data never includes a street address, coordinates or codes", () => {
    for (const h of Object.values(HOMES)) {
      const s = ldJson(homeJsonLd(h));
      expect(s).not.toMatch(/streetAddress|latitude|longitude|"geo"|postalCode/);
      expect(s).not.toMatch(/\d{2,5} (East |West |North |South )?[A-Z][a-z]+ (St|Street|Dr|Drive|Pl|Place|Ave|Avenue)\b/);
      expect(s).toContain(`"maxValue":${h.capacity.guests}`);
    }
    expect(ldJson(siteJsonLd(Object.values(HOMES)))).toContain("ItemList");
    expect(ldJson({ a: "</script>" })).not.toContain("</script>");
  });
  it("the Vercel test address and prototype paths are never indexable", () => {
    expect(middleware(req("/homes/752-myrtle", "pearl-heights-checkout.vercel.app")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(middleware(req("/all-homes/c", "pearlheightshomes.com")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(middleware(req("/homes/752-myrtle", "pearlheightshomes.com")).headers.get("x-robots-tag")).toBeNull();
    expect(middleware(req("/", "pearlheightshomes.com")).headers.get("x-robots-tag")).toBeNull();
  });
});
