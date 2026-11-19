// Public-domain safety switch (Oscar, Nov 18): on pearlheightshomes.com, no test checkout; Reserve goes to Airbnb.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { airbnbUrl, middleware } from "../middleware";

const req = (url: string, host: string) => new NextRequest(new URL(url, `https://${host}`), { headers: { host } });

describe("public domain switch", () => {
  it("builds the Airbnb link with dates and guests", () => {
    expect(airbnbUrl(new URLSearchParams("home=claywell&checkIn=2026-12-23&checkOut=2026-12-27&adults=2&children=2&infants=0")))
      .toBe("https://www.airbnb.com/rooms/1775567094906340136?check_in=2026-12-23&check_out=2026-12-27&adults=2&children=2");
    expect(airbnbUrl(new URLSearchParams("home=nope"))).toBeNull();
    expect(airbnbUrl(new URLSearchParams("home=752&checkIn=bad&checkOut=2026-12-01"))).toBe("https://www.airbnb.com/rooms/1080744270622054461");
  });
  it("on the real domain: Reserve -> Airbnb, home -> All Homes, checkout and stay closed", () => {
    const r = middleware(req("/?home=edgewood&checkIn=2026-12-23&checkOut=2026-12-26&adults=2", "pearlheightshomes.com"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("airbnb.com/rooms/681419907080223265?check_in=2026-12-23");
    expect(middleware(req("/", "pearlheightshomes.com")).headers.get("x-middleware-rewrite")).toContain("/all-homes/f");
    for (const p of ["/api/checkout", "/api/stay-link", "/stay/demo", "/api/stay/abc/agreement", "/api/mock/reset", "/preview/confirmation"])
      expect(middleware(req(p, "pearlheightshomes.com")).status).toBe(404);
    expect(middleware(req("/homes/752-myrtle", "pearlheightshomes.com")).status).toBe(200);
    expect(middleware(req("/api/quote", "pearlheightshomes.com")).status).toBe(200);
  });
  it("www redirects to the bare domain", () => {
    const r = middleware(req("/contact", "www.pearlheightshomes.com"));
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://pearlheightshomes.com/contact");
  });
  it("the test site is untouched", () => {
    for (const p of ["/", "/?home=752", "/api/checkout", "/stay/demo"])
      expect(middleware(req(p, "pearl-heights-checkout.vercel.app")).headers.get("x-middleware-next")).toBe("1");
  });
});
