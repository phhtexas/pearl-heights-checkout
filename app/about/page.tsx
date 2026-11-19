import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HOMES } from "@/content/homes";
import { publicMeta } from "@/seo";
import { SiteNav, ALL_HOMES } from "../SiteNav";
import "../guides/guides.css";
import "./about.css";

/**
 * About us (Oscar, Nov 19: "an about us to give people more confidence to book"). Every line comes from something
 * already sourced: Oscar & Fernanda's Airbnb host profile (homes.ts HOSTS, Nov 15–16), their 752 Myrtle and Edgewood guest books
 * "Meet your hosts" pages (Canva p.3, read Nov 18–19), the Condé Nast Traveler feature (link from Oscar, Nov 17), real
 * guest reviews (homes.ts), and the business details in the Booking Terms. Draft until Oscar approves: hidden on
 * pearlheightshomes.com, visible on the test site.
 */
const ABOUT_APPROVED: boolean = false;
export const dynamic = "force-dynamic";
const base = publicMeta("/about", {
  title: "About us | Pearl Heights Homes",
  description: "Meet Oscar & Fernanda, the San Antonio family behind Pearl Heights Homes: Airbnb Superhosts with five family-friendly vacation homes.",
});
export const metadata: Metadata = ABOUT_APPROVED ? base : { ...base, robots: { index: false, follow: false } };

const ORDER = ["752", "736", "edgewood", "claywell", "indianola"];
const QUOTES: { home: string; name: string; text: string }[] = [
  { home: "752", name: "Hannah", text: "I cannot recommend Oscar and Fernanda’s place highly enough - especially if you have young kids! We are so grateful to how accommodating they were, making sure we had all we need for our 1.5 year old." },
  { home: "edgewood", name: "Danielle", text: "You can tell they put a lot of time and care into making this a nice place for guests - would highly recommend staying here!" },
  { home: "736", name: "Savanna", text: "This was our 2nd year in a row to stay here! … Oscar and Fernanda were also incredibly fast responding to every question we had." },
];

export default async function Page() {
  const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0]!;
  if (!ABOUT_APPROVED && /(^|\.)pearlheightshomes\.com$/.test(host)) notFound();
  const h = HOMES["752"]!.host;
  const homes = ORDER.map((k) => HOMES[k]!).filter(Boolean);
  return (
    <div className="G-page">
      <SiteNav />
      <main className="G-main">
        {!ABOUT_APPROVED && <p className="G-draft">Draft for Oscar&apos;s review. Not shown on pearlheightshomes.com yet.</p>}
        <p className="G-kicker">About us</p>
        <h1>Meet your hosts, Oscar &amp; Fernanda</h1>
        <div className="AB-hero">
          {h.photo && <img src={h.photo} alt="Oscar and Fernanda, the hosts of Pearl Heights Homes" width={320} height={320} />}
          <div>
            <p className="G-lead">We&apos;re a San Antonio family of four, and Pearl Heights Homes is our family business: five vacation homes near the Pearl, downtown and Alamo Heights, set up for families like ours.</p>
            <ul className="AB-facts">
              <li><strong>Airbnb Superhosts</strong></li>
              <li><strong>4.98</strong> average across 463 Airbnb reviews of our homes</li>
              <li>Hosting for 4 years</li>
              <li>We speak English and Spanish</li>
              <li>We usually reply within an hour</li>
            </ul>
          </div>
        </div>

        <h2>Our story</h2>
        {/* In Oscar & Fernanda's own words: "Meet your hosts" pages of the 752 Myrtle and Edgewood Canva guest books (read Nov 18–19, 2026) */}
        <p>Being hosts of a short-term rental was a long-time dream of ours, and that dream has finally come true. We fully remodeled each of our homes with our guests&apos; needs in mind, and we poured our hearts into every little detail.</p>
        <p>Our Alamo Heights home on Edgewood is extra special to us: we first bought it to live in, until our family started to grow and we had to move. And on Myrtle, next to the Pearl, we&apos;re completely in love with the location, right in the center of everything.</p>
        <p>We love to travel with our own kids, so we know what makes a stay easy. We set up every home to feel like a place we&apos;d want our own family to stay: clean, cozy, well-equipped and welcoming.</p>
        <p className="AB-sign">We really hope you enjoy your stay and that you come back and visit us over and over again!<br /><span>Fernanda y Oscar</span></p>

        <h2>How we host</h2>
        <ul className="G-list">
          <li><strong>Spotless and ready.</strong> Fresh linens, toiletries, a stocked coffee and tea station, and a kitchen you can actually cook in.</li>
          <li><strong>Ready for little ones.</strong> Playrooms, and cribs, pack-n-plays and high chairs at our homes, set up on request.</li>
          <li><strong>Real people, fast answers.</strong> You talk to us directly, in English or Spanish, before and during your stay.</li>
          <li><strong>Local tips.</strong> Our own favorite restaurants, coffee shops and things to do with kids, in our <a href="/guides">neighborhood guides</a>.</li>
        </ul>

        <h2>As seen in</h2>
        <p>Our Alamo Heights home on Edgewood was featured in Condé Nast Traveler&apos;s <a href="https://www.cntraveler.com/gallery/best-airbnbs-in-san-antonio" target="_blank" rel="noopener">best Airbnbs in San Antonio</a>.</p>

        <h2>What guests say</h2>
        {QUOTES.map((q) => (
          <blockquote className="G-quote" key={q.name}>
            <p>“{q.text}”</p>
            <cite>{q.name}, stayed at {HOMES[q.home]!.title} (Airbnb review)</cite>
          </blockquote>
        ))}

        <h2>Our homes</h2>
        <ul className="AB-homes">
          {homes.map((x) => (
            <li key={x.slug}>
              <a href={`/homes/${x.slug}`}>
                <img src={x.photoBase + x.photos[0]!.id + ".jpg"} alt={x.photos[0]!.alt} loading="lazy" />
                <span><strong>{x.title}</strong><small>{x.neighborhood} · sleeps {x.capacity.guests}</small></span>
              </a>
            </li>
          ))}
        </ul>

        <h2>Booking with us</h2>
        <p>When you book on our website, you book directly with us. You see your full total before you pay, payments are handled securely by Stripe, and your questions come straight to Oscar and Fernanda.</p>
        <p className="AB-biz">Pearl Heights Homes is operated by PR Portfolio Properties LLC, San Antonio, Texas.<br />
          Email <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a></p>
        <p><a className="G-link" href={ALL_HOMES}>See our homes</a></p>
      </main>
    </div>
  );
}
