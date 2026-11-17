import Image from "next/image";
import { EVERY_HOME, guestReviews, homeCards, mapPoints, sharedFaq } from "@/content/allHomes";
import { HOMES } from "@/content/homes";
import { policyOverview } from "@/domain/policy";
import { HOST, STEPS, mockMeta } from "../shared";
import { Header, Reviews } from "./Bits";
import { HomesE } from "./HomesE";
import "../search.css";
import "./e.css";

/**
 * All Homes, mockup E (Oscar's design, Nov 16) made functional: live search/totals, real filters and sort, real map,
 * real photos and reviews, cards open the listing with the dates. Oscar: cover photo on top, our fonts (Inter,
 * Marcellus logo), listing-page side padding. Facts come from the listings; prototype: noindex, labeled.
 * The original static file stays at /all-homes/archive/e-static.
 */
export const metadata = mockMeta("E");
export const dynamic = "force-static";

const ic = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ICONS: Record<string, React.ReactNode> = {
  kitchen: <svg {...ic}><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M4 10h16M8 6.5h1M8 13v4" /></svg>,
  wifi: <svg {...ic}><path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0" /><circle cx="12" cy="19" r=".8" fill="currentColor" /></svg>,
  parking: <svg {...ic}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M10 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3" /></svg>,
  ac: <svg {...ic}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /></svg>,
  washer: <svg {...ic}><rect x="4.5" y="3" width="15" height="18" rx="2" /><circle cx="12" cy="13" r="4.5" /></svg>,
  yard: <svg {...ic}><path d="M4 20V9l2-2 2 2v11M10 20V9l2-2 2 2v11M16 20V9l2-2 2 2v11M3 12.5h18M3 17h18" /></svg>,
  crib: <svg {...ic}><path d="M4 5v15M20 5v15M4 9h16M4 17h16M8 9v8M12 9v8M16 9v8" /></svg>,
  key: <svg {...ic}><rect x="6.5" y="3" width="11" height="18" rx="2" /><path d="M10 7h.5M13.5 7h.5M10 10.5h.5M13.5 10.5h.5" /></svg>,
};
const TRUST_ROWS = [
  { t: "You book with us", p: "Questions go straight to Oscar and Fernanda, and we usually reply within an hour.", i: <svg {...ic}><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /></svg> },
  { t: "Your full total, first", p: "Taxes and the damage waiver are in the total you see before you pay. Pay in full, or half now when check-in is more than 30 days away.", i: <svg {...ic}><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12h6" /></svg> },
  { t: "You're covered", p: "Every stay includes a damage waiver with $5,000 coverage, and you pay securely through Stripe.", i: <svg {...ic}><path d="M12 3.5 19 6v5.5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg> },
];

export default function Page() {
  const homes = homeCards();
  const ind = HOMES.indianola!;
  const cover = { src: ind.photoBase + ind.photos[0]!.id + ".jpg", alt: ind.photos[0]!.alt };
  const reviews = guestReviews();
  const faq = sharedFaq(policyOverview());
  return (
    <div className="E">
      <aside className="E-mockbar" aria-label="Prototype label"><b>Mockup E</b> · prototype, not linked from the site</aside>
      <Header>
        <div className="E-wrap E-nav">
          <a className="E-brand" href="#top" aria-label="Pearl Heights Homes, top of page"><span className="E-logo">Pearl Heights <span>HOMES</span></span></a>
          <nav className="E-navlinks" aria-label="Sections">
            <a href="#homes">Homes</a><a href="#locations">Locations</a><a href="#reviews">Reviews</a><a href="#faq">FAQ</a>
          </nav>
          <a className="E-nav-cta" href="mailto:bookings@thepearlheightshomes.com">Ask a question</a>
        </div>
      </Header>
      <main id="top">
        <section className="E-hero E-cover">
          <Image src={cover.src} alt={cover.alt} fill priority sizes="100vw" className="E-coverImg" />
          <div className="E-coverShade" aria-hidden="true" />
          <div className="E-wrap E-coverText">
            <h1>Find your San Antonio stay</h1>
            <p className="E-sub">Five family-friendly homes hosted by Oscar &amp; Fernanda, near the Pearl, downtown and in Alamo Heights. Book directly with the hosts, with your full total up front.</p>
            <div className="E-stats">
              <div className="E-hstat"><div className="E-n">4.98 <small>★</small></div><div className="E-l">average across 463 Airbnb guest reviews</div></div>
              <div className="E-hstat"><div className="E-n">5</div><div className="E-l">homes that sleep 8 to 10 guests</div></div>
              <div className="E-hstat"><div className="E-n">~1 <small>hr</small></div><div className="E-l">usual reply time</div></div>
            </div>
          </div>
        </section>

        <HomesE homes={homes} points={mapPoints()} />

        <section className="E-trust E-wrap">
          <div className="E-cols">
            <div>
              <h2>Book directly with local hosts</h2>
              <p className="E-lead">Airbnb Superhosts with a 4.98 average across 463 Airbnb guest reviews.</p>
            </div>
            <div>{TRUST_ROWS.map((r) => <div className="E-trow" key={r.t}><div className="E-ic">{r.i}</div><div><h3>{r.t}</h3><p>{r.p}</p></div></div>)}</div>
          </div>
        </section>

        <section className="E-amensec">
          <div className="E-wrap">
            <div className="E-sec-head" style={{ paddingTop: 0 }}><div><h2>Every home has</h2><p>Checked against each home&apos;s amenity list.</p></div></div>
            <div className="E-amen-grid">{EVERY_HOME.map((a) => <div className="E-amen" key={a.label}>{ICONS[a.icon]}<span>{a.label}</span></div>)}</div>
          </div>
        </section>

        <section className="E-revsec" id="reviews">
          <div className="E-wrap">
            <div className="E-sec-head" style={{ paddingTop: 0 }}><div><h2>What guests say</h2><p>Reviews from Airbnb guests who stayed in our homes.</p></div></div>
            <div className="E-revstats">
              <div className="E-rstat"><div className="E-n">4.98<sup>★</sup></div><div className="E-l">average across 463 Airbnb guest reviews</div></div>
              <div className="E-rstat"><div className="E-n">5</div><div className="E-l">homes that sleep 8 to 10 guests</div></div>
              <div className="E-rstat"><div className="E-n">~1 hr</div><div className="E-l">usual reply time from Oscar &amp; Fernanda</div></div>
            </div>
            <Reviews>
              {reviews.map((r) => (
                <figure className="E-rev" key={r.key + r.name}>
                  <div className="E-stars" aria-label="5 out of 5 stars">★★★★★</div>
                  <blockquote>“{r.text}”</blockquote>
                  <figcaption className="E-who">
                    <span className="E-av" aria-hidden="true">{r.name[0]}</span>
                    <div><b>{r.name}</b><span>{r.when}</span></div>
                    <a className="E-home" href={`#home-${r.key}`}>{r.home}</a>
                  </figcaption>
                </figure>
              ))}
            </Reviews>
          </div>
        </section>

        <section className="E-stepssec">
          <div className="E-wrap">
            <div className="E-sec-head" style={{ paddingTop: 0 }}><div><h2>Booking directly is simple</h2><p>Three steps, all online.</p></div></div>
            <ol className="E-steps">{STEPS.map((st) => <li className="E-step" key={st.title}><h3>{st.title}</h3><p>{st.text}</p></li>)}</ol>
          </div>
        </section>

        <section className="E-faqsec" id="faq">
          <div className="E-wrap">
            <div className="E-sec-head" style={{ paddingTop: 0 }}><div><h2>Your questions, answered</h2></div></div>
            <div className="E-faq">
              {faq.map((f) => (
                <details className="E-qa E-qa" key={f.q}>
                  <summary className="E-q"><span>{f.q}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></summary>
                  <p className="E-a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="E-hostsec" id="host">
          <div className="E-wrap E-hostinner">
            {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={120} height={120} className="E-ph" />}
            <h2>Meet your hosts</h2>
            <p className="E-bio">{HOST.bio}</p>
            <div className="E-tags">{["Local San Antonio hosts", ...HOST.facts].map((f) => <span key={f}>{f}</span>)}</div>
            <a className="E-btn" href="mailto:bookings@thepearlheightshomes.com">Ask us a question</a>
          </div>
        </section>
      </main>
      <footer>
        <div className="E-wrap">
          <div className="E-fgrid">
            <div>
              <div className="E-logo E-logoFoot">Pearl Heights <span>HOMES</span></div>
              <p className="E-note">Hosted by Oscar &amp; Fernanda · San Antonio, Texas<br /><a href="mailto:bookings@thepearlheightshomes.com">bookings@thepearlheightshomes.com</a></p>
            </div>
            <div><p className="E-fh">Explore</p><a className="E-fl" href="#homes">All homes</a><a className="E-fl" href="#locations">Locations</a><a className="E-fl" href="#reviews">Reviews</a><a className="E-fl" href="#faq">FAQ</a></div>
            <div><p className="E-fh">Support</p><a className="E-fl" href="mailto:bookings@thepearlheightshomes.com">Ask a question</a><span className="E-fl">Terms of service (coming soon)</span><span className="E-fl">Privacy policy (coming soon)</span></div>
          </div>
          <div className="E-fbottom"><span>Ratings and reviews are from Airbnb guests who stayed in our homes.</span><span>© 2026 Pearl Heights Homes</span></div>
        </div>
      </footer>
    </div>
  );
}
