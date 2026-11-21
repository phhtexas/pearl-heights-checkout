import type { Metadata } from "next";
import { publicMeta } from "@/seo";
import { LAUNCHED } from "@/launch";
import { SiteNav, ALL_HOMES } from "../SiteNav";
import { CookieChoices } from "../CookieChoices";
import { CancelTimeline } from "./Timeline";
import "../guides/guides.css";
import "./cancellation.css";

/**
 * Guest-friendly cancellation page (Oscar, Nov 21): pick your dates, swipe a timeline from today to check-in and see
 * what you'd get back on any day. Links to the full policy for the legal detail. Then why book with us, the homes, footer.
 * Draft for Oscar's review: not linked from the site and not indexed yet.
 */
export const metadata: Metadata = { ...publicMeta("/cancellation", {
  title: "Cancellation, made clear | Pearl Heights Homes",
  description: "Pick your dates and see exactly what you'd get back if you cancel, on any day before your trip.",
}), robots: { index: false, follow: false } };

const WHY: { icon: string; title: string; text: string }[] = [
  { icon: "chat", title: "Talk to your hosts directly", text: "Your questions go straight to Oscar & Fernanda, before and during your stay." },
  { icon: "clock", title: "Fast answers", text: "We usually reply within an hour, in English or Spanish." },
  { icon: "receipt", title: "Your total, upfront", text: "Your complete price, cleaning, damage waiver and taxes included, before you pay." },
  { icon: "lock", title: "Secure payment", text: "Payments are processed securely by Stripe." },
  { icon: "shield", title: "Damage waiver included", text: "Every booking includes a damage waiver for accidental damage during your stay." },
  { icon: "star", title: "Loved by families", text: "Airbnb Superhosts, with a 4.98 average across 463 Airbnb guest reviews." },
];

function Ico({ name }: { name: string }) {
  const p = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "chat": return <svg {...p}><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></svg>;
    case "clock": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "receipt": return <svg {...p}><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12h6" /></svg>;
    case "lock": return <svg {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>;
    case "shield": return <svg {...p}><path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    default: return <svg {...p}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>;
  }
}

export default function Page() {
  return (
    <div className="G-page CXP">
      <SiteNav />
      <main className="G-main">
        <p className="G-kicker">Cancellation policy</p>
        <h1>Know exactly what you&apos;d get back</h1>
        <p className="G-lead">Plans change. Pick your trip dates and swipe through the days before your stay to see what you&apos;d get back if you cancel.</p>
        <CancelTimeline />
        <p className="CXP-legal">Want the fine print? Read the <a href="/policies/cancellation">full cancellation policy</a>{LAUNCHED ? <> and our <a href="/terms">Direct Booking Terms</a></> : null}.</p>

        <section aria-labelledby="why-h">
          <h2 id="why-h">Why book with us</h2>
          <ul className="CXP-why">
            {WHY.map((w) => <li key={w.title}><span className="CXP-ic"><Ico name={w.icon} /></span><b>{w.title}</b><p>{w.text}</p></li>)}
          </ul>
        </section>

        <section className="CXP-homes" aria-labelledby="homes-h">
          <h2 id="homes-h">Find your San Antonio home</h2>
          <p>Family-friendly homes near the Pearl, downtown and in Alamo Heights, each set up with the things that make traveling with kids easier.</p>
          <a className="CXP-cta" href={ALL_HOMES} data-cta="cancellation_see_homes">See our homes</a>
        </section>
      </main>

      <footer className="CXP-foot">
        <div className="CXP-footIn">
          <img src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} loading="lazy" />
          <p>Direct bookings with your hosts, Oscar &amp; Fernanda · San Antonio, Texas</p>
          <p><a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a></p>
          <ul className="CXP-links">
            <li><a href={ALL_HOMES}>Our homes</a></li>
            <li><a href="/about">About us</a></li>
            <li><a href="/guides">Local guides</a></li>
            <li><a href="/policies/cancellation">Cancellation policy</a></li>
            {LAUNCHED ? <><li><a href="/terms">Terms of service</a></li><li><a href="/privacy">Privacy policy</a></li></> : null}
          </ul>
          <p className="CXP-small"><CookieChoices /> · © {new Date().getFullYear()} Pearl Heights Homes</p>
        </div>
      </footer>
    </div>
  );
}
