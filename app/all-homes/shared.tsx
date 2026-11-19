import type { Metadata } from "next";
import { publicMeta } from "@/seo";
import type { HomeCard } from "@/content/allHomes";
import { HOMES } from "@/content/homes";

/** Pieces both All Homes mockups share. Server-rendered (no client JS). Facts come from the approved home content. */
export const mockMeta = (v: string): Metadata => v === "F"
  ? publicMeta("/", { title: "Pearl Heights Homes | Family homes in San Antonio", description: "Five family-friendly San Antonio homes hosted by Oscar & Fernanda. Book directly; your total, upfront." })
  : ({
  // F is the home page on pearlheightshomes.com (Oscar, Nov 18), so it carries the brand title; the others stay labeled mockups.
  title: v === "F" ? "Pearl Heights Homes | Family homes in San Antonio" : `All homes — mockup ${v} | Pearl Heights Homes`,
  description: "Five family-friendly San Antonio homes hosted by Oscar & Fernanda. Book directly; your total, upfront.",
  robots: { index: false, follow: false },
});

export const HOST = HOMES["736"]!.host;
/** Trust facts (Oscar's brief). Each is sourced: Stripe checkout, host profile facts, checkout shows the total before pay. */
export const TRUST = [
  { icon: "lock", text: "Secure payment through Stripe" },
  { icon: "star", text: "4.98 average across 463 Airbnb guest reviews" },
  { icon: "chat", text: "Oscar & Fernanda usually reply within an hour" },
  { icon: "receipt", text: "Your complete price, taxes included, before you pay" },
] as const;

export const STEPS = [
  { title: "Choose your home and pay securely", text: "See your exact total first. Pay in full, or half now when your stay is 37 or more days away." },
  { title: "Sign the agreement and verify", text: "The reservation holder signs the rental agreement and verifies their ID online." },
  { title: "Get your guest portal", text: "Your address and check-in steps appear in your stay page once you've signed and verified. Door codes arrive the morning of check-in day." },
];

export function Icon({ name }: { name: string }) {
  const p = { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "lock": return <svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>;
    case "star": return <svg {...p}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>;
    case "chat": return <svg {...p}><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></svg>;
    case "receipt": return <svg {...p}><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12h6" /></svg>;
    default: return null;
  }
}

export const specs = (h: HomeCard) =>
  `${h.guests} guests · ${h.bedrooms} bedroom${h.bedrooms === 1 ? "" : "s"} · ${h.beds} bed${h.beds === 1 ? "" : "s"} · ${h.baths} bath${h.baths === 1 ? "" : "s"}`;
export const ratingText = (h: HomeCard) => (h.rating ? `★ ${h.rating.value.toFixed(2).replace(/0$/, "")} · ${h.rating.count} Airbnb guest review${h.rating.count === 1 ? "" : "s"}` : "New home");

export function Compare({ homes, cls }: { homes: HomeCard[]; cls: string }) {
  return (
    <section className={cls} aria-labelledby="compare-h">
      <h2 id="compare-h">Compare all five homes</h2>
      <div className="C-wrap" tabIndex={0} role="region" aria-label="Comparison table, scrolls sideways">
        <table>
          <thead><tr><th scope="col">Home</th><th scope="col">Best for</th><th scope="col">Area</th><th scope="col">Sleeps</th><th scope="col">Bedrooms</th><th scope="col">Baths</th><th scope="col">Parking</th><th scope="col">Rating</th></tr></thead>
          <tbody>
            {homes.map((h) => (
              <tr key={h.key}>
                <th scope="row"><a href={`#home-${h.key}`}>{h.title}</a></th>
                <td>{h.bestFit}</td><td>{h.area}</td><td>{h.guests}</td><td>{h.bedrooms}</td><td>{h.baths}</td><td>{h.parking}</td>
                <td>{h.rating ? `★ ${h.rating.value} (${h.rating.count})` : "New"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Footer({ cls }: { cls: string }) {
  return (
    <footer className={cls}>
      <p className="F-brand">Pearl Heights <span>HOMES</span></p>
      <p>Hosted by Oscar &amp; Fernanda · San Antonio, Texas · <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a></p>
      <p className="F-legal">Terms of service (coming soon) · Privacy policy (coming soon)</p>
      <p className="F-note">Ratings and reviews are from Airbnb guests who stayed in our homes.</p>
    </footer>
  );
}
