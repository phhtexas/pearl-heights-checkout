import type { Metadata } from "next";
import { HOMES } from "@/content/homes";
import { SiteNav, ALL_HOMES } from "./SiteNav";
import "./guides/guides.css";
import "./not-found.css";

/**
 * Site-wide "page not found" (Oscar, Nov 20, after launch): replaces Next's plain black 404 with our logo, a short
 * message and a way back to the homes. Still a real 404 for search engines. Old WordPress addresses are redirected in
 * next.config.mjs; this catches everything else (typos, old shared links).
 */
export const metadata: Metadata = { title: "Page not found | Pearl Heights Homes" }; // Next adds noindex on 404s

const ORDER = ["736", "752", "indianola", "edgewood", "claywell"];

export default function NotFound() {
  const homes = ORDER.map((k) => HOMES[k]).filter((h): h is NonNullable<typeof h> => !!h);
  return (
    <div className="G-page">
      <SiteNav />
      <main className="G-main NF">
        <h1>We couldn&apos;t find that page</h1>
        <p>The link may be old or mistyped. Here are our five San Antonio homes, or start from the home page.</p>
        <p><a className="G-btn" href={ALL_HOMES}>See all homes</a></p>
        <ul className="NF-homes">
          {homes.map((h) => (
            <li key={h.slug}>
              <a href={`/homes/${h.slug}`}>
                <span className="NF-title">{h.title}</span>
                <span className="NF-where">{h.neighborhood} · sleeps {h.capacity.guests}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="NF-help">Looking for your booking? Your private stay link is in your confirmation email. Questions? Email <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a>.</p>
      </main>
    </div>
  );
}
