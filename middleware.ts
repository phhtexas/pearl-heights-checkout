import { NextResponse, type NextRequest } from "next/server";

/**
 * Public-domain safety switch (Oscar, Nov 18: replace the old WordPress site on pearlheightshomes.com with this site).
 * Direct checkout is NOT live yet (Stripe test mode, Hospitable bookings not built), so on the real domain:
 *  - "/" shows All Homes (Version F) instead of the checkout;
 *  - a Reserve hand-off ("/?home=…&checkIn=…") goes to that home's Airbnb listing with the same dates and guests;
 *  - checkout and stay-page APIs and the stay pages are closed (404).
 * The Vercel test URL is untouched, so testing continues there. Remove this once direct checkout goes live.
 */
const PUBLIC_HOSTS = new Set(["pearlheightshomes.com", "www.pearlheightshomes.com"]);

/** Airbnb listing ids, from the Hospitable calendar (provider airbnb-official), read Nov 17. */
export const AIRBNB_LISTING: Record<string, string> = {
  "752": "1080744270622054461",
  "736": "1348639518638496843",
  edgewood: "681419907080223265",
  indianola: "1754611590665180717",
  claywell: "1775567094906340136",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: string | null) => (v && /^\d{1,2}$/.test(v) ? v : null);

export function airbnbUrl(q: URLSearchParams): string | null {
  const id = AIRBNB_LISTING[q.get("home") ?? ""];
  if (!id) return null;
  const u = new URL(`https://www.airbnb.com/rooms/${id}`);
  const ci = q.get("checkIn"), co = q.get("checkOut");
  if (ci && co && ISO.test(ci) && ISO.test(co)) { u.searchParams.set("check_in", ci); u.searchParams.set("check_out", co); }
  for (const [ours, theirs] of [["adults", "adults"], ["children", "children"], ["infants", "infants"]] as const) {
    const v = n(q.get(ours)); if (v && v !== "0") u.searchParams.set(theirs, v);
  }
  return u.toString();
}

const CLOSED = [/^\/api\/checkout/, /^\/api\/stay-link/, /^\/api\/stay\//, /^\/stay\//, /^\/api\/mock/];

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0]!;
  // The Vercel test address and previews must never be indexed (only the real domain can be, after launch).
  if (!PUBLIC_HOSTS.has(host)) { const r = NextResponse.next(); r.headers.set("X-Robots-Tag", "noindex, nofollow"); return r; }
  const { pathname, searchParams } = req.nextUrl;
  if (host === "www.pearlheightshomes.com") {
    const u = req.nextUrl.clone(); u.host = "pearlheightshomes.com"; u.port = "";
    return NextResponse.redirect(u, 308);
  }
  if (CLOSED.some((r) => r.test(pathname))) return new NextResponse("Not found", { status: 404 });
  if (pathname === "/") {
    if (searchParams.get("home")) {
      const to = airbnbUrl(searchParams);
      if (to) return NextResponse.redirect(to, 307);
    }
    const u = req.nextUrl.clone(); u.pathname = "/all-homes/f"; u.search = "";
    return NextResponse.rewrite(u);
  }
  // Prototype pages stay noindex on the real domain too (Version F is indexed only as "/").
  if (pathname.startsWith("/all-homes")) { const r = NextResponse.next(); r.headers.set("X-Robots-Tag", "noindex, nofollow"); return r; }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon|.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|woff2?|css|js)$).*)"] };
