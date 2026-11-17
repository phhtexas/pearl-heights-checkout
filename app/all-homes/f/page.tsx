import Image from "next/image";
import { EVERY_HOME, guestReviews, homeCards, mapPoints, sharedFaq } from "@/content/allHomes";
import { HOMES } from "@/content/homes";
import { policyOverview } from "@/domain/policy";
import { Footer, HOST, STEPS, mockMeta } from "../shared";
import { HomesF } from "./HomesF";
import "../search.css";
import "./f.css";

/**
 * All Homes, version F (note 176, Oscar after comparing C and E live): C as the base + E's header and nav, trust
 * compressed into one strip under the search. C and E stay unchanged. Based on mockup C (Oscar, Nov 16): B's direction + Airbnb-style sections (three reasons, map, "every booking
 * includes", "every home has", stats + reviews, questions) with Airbnb-like spacing. Prototype: noindex, labeled.
 */
export const metadata = mockMeta("F");
export const dynamic = "force-static";

function Ico({ name }: { name: string }) {
  const p = { viewBox: "0 0 24 24", width: 26, height: 26, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home": return <svg {...p}><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></svg>;
    case "receipt": return <svg {...p}><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12h6M9 15.5h3" /></svg>;
    case "shield": return <svg {...p}><path d="M12 3.5 19 6v5.5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg>;
    case "kitchen": return <svg {...p}><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M4 10h16M8 6.5h1M8 13v4" /></svg>;
    case "wifi": return <svg {...p}><path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0" /><circle cx="12" cy="19" r=".8" fill="currentColor" /></svg>;
    case "parking": return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M10 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3" /></svg>;
    case "ac": return <svg {...p}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" /></svg>;
    case "washer": return <svg {...p}><rect x="4.5" y="3" width="15" height="18" rx="2" /><circle cx="12" cy="13" r="4.5" /><path d="M8 6h.5M11 6h.5" /></svg>;
    case "yard": return <svg {...p}><path d="M4 20V9l2-2 2 2v11M10 20V9l2-2 2 2v11M16 20V9l2-2 2 2v11M3 12.5h18M3 17h18" /></svg>;
    case "crib": return <svg {...p}><path d="M4 5v15M20 5v15M4 9h16M4 17h16M8 9v8M12 9v8M16 9v8" /></svg>;
    case "key": return <svg {...p}><rect x="6.5" y="3" width="11" height="18" rx="2" /><path d="M10 7h.5M13.5 7h.5M10 10.5h.5M13.5 10.5h.5M10 14h.5M13.5 14h.5" /></svg>;
    case "check": return <svg {...p} width={22} height={22} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
    case "chev": return <svg {...p} width={20} height={20} strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>;
    default: return null;
  }
}

export default function Page() {
  const homes = homeCards();
  const ind = HOMES.indianola!;
  const hero = { src: ind.photoBase + ind.photos[0]!.id + ".jpg", alt: ind.photos[0]!.alt };
  const reviews = guestReviews();
  const faq = sharedFaq(policyOverview());

  // Oscar via note 176: C's big "Book directly" block compressed into one strip right under the search.
  const reasons = (
    <section className="F-strip" aria-label="Book directly with local hosts">
      <div className="F-stripIn">
        <div className="F-stripHost">
          {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={48} height={48} className="F-stripPhoto" />}
          <b>Hosted directly by Oscar &amp; Fernanda</b>
        </div>
        <ul>
          <li><span className="F-stripIc" aria-hidden="true">★</span>4.98 average across 463 Airbnb guest reviews</li>
          <li><span className="F-stripIc" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg></span>Secure payment through Stripe</li>
          <li><span className="F-stripIc" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></svg></span>Usually reply within an hour</li>
        </ul>
      </div>
    </section>
  );

  return (
    <div className="F-page">
      <aside className="F-mock" aria-label="Prototype label">Mockup F · prototype, not linked from the site</aside>
      {/* E's conventional header (note 176): logo, section links, a clear "Ask a question" */}
      <header className="F-top">
        <div className="F-topIn">
          <a className="F-brand" href="#top" aria-label="Pearl Heights Homes, top of page">Pearl Heights <span>HOMES</span></a>
          <nav className="F-nav" aria-label="Sections"><a href="#homes">Homes</a><a href="#locations">Locations</a><a href="#reviews">Reviews</a><a href="#faq">FAQ</a></nav>
          <a className="F-ask" href="mailto:bookings@thepearlheightshomes.com">Ask a question</a>
        </div>
      </header>
      <main id="top">
        <HomesF homes={homes} hero={hero} points={mapPoints()} reasons={reasons} />

        <section className="F-sec F-band" aria-labelledby="inc-h">
          <div className="F-head">
            <h2 id="inc-h">Every booking includes</h2>
            <p>The same at all five homes.</p>
          </div>
          <ul className="F-checks">
            {["Damage waiver — $5,000 coverage", "Your full total, taxes included, before you pay", "Secure payment through Stripe", "A private stay page with your check-in steps", "Hosts who usually reply within an hour"].map((t) => (
              <li key={t}><span>{t}</span><Ico name="check" /></li>
            ))}
          </ul>
          <p className="F-fine">The damage waiver covers accidental damage during your stay, up to $5,000, subject to the provider&apos;s terms and exclusions. It isn&apos;t a security deposit.</p>
        </section>

        <section className="F-sec" aria-labelledby="every-h">
          <div className="F-head">
            <h2 id="every-h">Every home has</h2>
            <p>Checked against each home&apos;s amenity list.</p>
          </div>
          <ul className="F-amen">{EVERY_HOME.map((a) => <li key={a.label}><Ico name={a.icon} /><span>{a.label}</span></li>)}</ul>
        </section>

        <section className="F-sec F-band" id="reviews" aria-labelledby="love-h">
          <div className="F-head">
            <h2 id="love-h">What guests say</h2>
            <p>Reviews from Airbnb guests who stayed in our homes.</p>
          </div>
          <ul className="F-stats">
            <li><b>4.98</b><span>average across 463 Airbnb guest reviews</span></li>
            <li><b>5 homes</b><span>that sleep 8 to 10 guests</span></li>
            <li><b>1 hour</b><span>usual reply time from Oscar &amp; Fernanda</span></li>
          </ul>
          <div className="F-revScroll" tabIndex={0} role="region" aria-label="Guest reviews, scroll sideways">
          <ul className="F-reviews">
            {reviews.map((r) => (
              <li key={r.key + r.name}>
                <p className="F-stars" aria-label="5 out of 5 stars">★★★★★</p>
                <blockquote>“{r.text}”</blockquote>
                <p className="F-who"><b>{r.name}</b> · {r.when}</p>
                <a className="F-revHome" href={`#home-${r.key}`}>{r.home}</a>
              </li>
            ))}
          </ul>
          </div>
        </section>

        <section className="F-sec" aria-labelledby="steps-h">
          <div className="F-head"><h2 id="steps-h">Booking directly is simple</h2></div>
          <ol className="F-steps">{STEPS.map((st, i) => <li key={st.title}><span className="F-num">{i + 1}</span><div><h3>{st.title}</h3><p>{st.text}</p></div></li>)}</ol>
        </section>

        <section className="F-sec F-band" id="faq" aria-labelledby="faq-h">
          <div className="F-head"><h2 id="faq-h">Your questions, answered</h2></div>
          <div className="F-faq">
            {faq.map((f) => (
              <details key={f.q}><summary><span>{f.q}</span><Ico name="chev" /></summary><p>{f.a}</p></details>
            ))}
          </div>
        </section>

        <section className="F-sec F-hostSec" aria-labelledby="host-h">
          {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={112} height={112} className="F-hostPhoto" />}
          <h2 id="host-h">Have questions before you book?</h2>
          <p>{HOST.bio}</p>
          <ul className="F-chips">{["Local San Antonio hosts", ...HOST.facts].map((f) => <li key={f}>{f}</li>)}</ul>
          <a className="F-dark" href="mailto:bookings@thepearlheightshomes.com">Ask Oscar &amp; Fernanda</a>
        </section>
      </main>
      <Footer cls="F-foot" />
    </div>
  );
}
