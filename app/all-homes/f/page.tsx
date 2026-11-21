import { TestOnly } from "../../TestOnly";
import { LAUNCHED } from "@/launch";
import Image from "next/image";
import { EVERY_HOME, guestReviews, homeCards, mapPoints, sharedFaq } from "@/content/allHomes";
import { HOMES } from "@/content/homes";
import { policyOverview } from "@/domain/policy";
import { HOST, mockMeta } from "../shared";
import { ldJson, siteJsonLd } from "@/seo";
import { CookieChoices } from "../../CookieChoices";
import { HomesF } from "./HomesF";
import { Reveal, ReviewLoop, SiteHeader } from "./Motion";
import "../search.css";
import "./f.css";

/**
 * All Homes, version F (note 176, Oscar after comparing C and E live): C as the base + E's header and nav, trust
 * compressed into one strip under the search. C and E stay unchanged. Based on mockup C (Oscar, Nov 16): B's direction + Airbnb-style sections (three reasons, map, "every booking
 * includes", "every home has", stats + reviews, questions) with Airbnb-like spacing. Prototype: noindex, labeled.
 */
export const metadata = mockMeta("F");
export const dynamic = "force-static";

// Soft brand-family tones for the review initial circles (dark text on all of them passes contrast).
const AV = ["#d9ebe3", "#efe3d3", "#e4e2f0", "#f3dcd6", "#dde8ef"];

const INCLUDES: [string, string][] = [
  ["Damage waiver with up to $5,000 in coverage", "Covers accidental damage during your stay, up to $5,000, subject to the provider's terms and exclusions. It isn't a security deposit."],
  ["Your full total, taxes included, before you pay", "You see the exact total, with taxes and the damage waiver, before you pay. Pay in full, or half now when check-in is 37 or more days away."],
  ["Secure payment through Stripe", "You enter your card in Stripe's secure payment form, and the card details go straight to Stripe. We never see your full card number."],
  ["A private stay page with your check-in steps", "Once your rental agreement and ID check are complete, your private stay page shows your arrival instructions. You can also message us there. Final access details arrive on check-in morning."],
  ["Message your hosts directly", "Your questions go straight to Oscar & Fernanda. We usually reply within an hour."],
];

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
    case "star": return <svg {...p}><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></svg>;
    case "chat": return <svg {...p}><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></svg>;
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
  // Our profile right away (Oscar): one calm line under the search, no box, so it doesn't compete with the photo.
  const reasons = (
    <section className="F-strip" aria-label="Book directly with local hosts" data-reveal>
      <div className="F-stripHost">
        {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={56} height={56} className="F-stripPhoto" />}
        <div><b>Hosted directly by Oscar &amp; Fernanda</b><span>Airbnb Superhosts · Local San Antonio hosts</span></div>
      </div>
      <ul>
        <li><span className="F-stripIc" aria-hidden="true">★</span>4.98/5 from 463 Airbnb guest reviews</li>
        <li><span className="F-stripIc" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg></span>Secure payment through Stripe</li>
        <li><span className="F-stripIc" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></svg></span>Usually reply within an hour</li>
      </ul>
    </section>
  );

  // "Booking directly is simple" as a timeline (Oscar: RevWhisper's Day 0 -> Every day after line), with our real steps.
  // Oscar's own wording, Nov 17 (replaces the 5-step version). Guest portal messaging per Oscar.
  const TIMELINE = [
    { when: "Step 1", title: "Book your home", text: "See your full total before you pay. Pay in full, or choose two payments if check-in is at least 37 days away." },
    { when: "Step 2", title: "Complete your check-in steps", text: "Sign the rental agreement and verify your ID online. It takes about 2 minutes. Check your confirmation for the exact deadline, which can be up to 24 hours after booking." },
    { when: "Step 3", title: "Get ready for arrival", text: "Once your rental agreement and ID check are complete, your private stay page shows your arrival instructions. You can also message us there. Final access details arrive on check-in morning." },
    { when: "Step 4", title: "Enjoy your stay", text: "Check in after 4:00 p.m. and check out by 10:00 a.m. Questions? Message Oscar and Fernanda\u2014we usually reply within an hour." },
  ];

  return (
    <div className="F-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(siteJsonLd(["736", "752", "indianola", "edgewood", "claywell"].map((k) => HOMES[k]!))) }} />
      <TestOnly><aside className="F-mock" aria-label="Prototype label">Mockup F · prototype, not linked from the site</aside></TestOnly>
      {/* Oscar, Nov 19: logo + Browse homes · Reviews · Map · FAQ (order matches the page); "Ask a question" as a light outlined button so it doesn't compete with search. */}
      <Reveal />
      <SiteHeader>
        <div className="F-topIn">
          <a className="F-brand" href="#top" aria-label="Pearl Heights Homes, top of page">
            {/* The logo from pearlheightshomes.com (white); the dark copy is the same artwork recolored for the solid header. */}
            <img className="F-logo F-logoWhite" src="/brand/logo-white.webp" alt="" width={200} height={174} />
            <img className="F-logo F-logoDark" src="/brand/logo-dark.webp" alt="" width={200} height={174} />
          </a>
          <nav className="F-nav" aria-label="Sections"><a href="#homes">Browse homes</a><a href="#reviews">Reviews</a><a href="#locations">Map</a><a href="#faq">FAQ</a></nav>
          <a className="F-ask" data-cta="header_ask_question" href="mailto:bookings@pearlheightshomes.com">Ask a question</a>
        </div>
      </SiteHeader>
      <main id="top">
        {/* Oscar, Nov 19 (his wife's test): reviews and the two "Every…" sections come right after the homes; the map moves
            below them (HomesF renders these between the homes list and the map). */}
        <HomesF homes={homes} hero={hero} points={mapPoints()} reasons={reasons} afterHomes={<>
        <section className="F-sec F-band" id="reviews" aria-labelledby="love-h">
          <div className="F-head" data-reveal>
            <h2 id="love-h">What guests say</h2>
            <p>Reviews from Airbnb guests who stayed in our homes.</p>
          </div>
          <ul className="F-stats" data-reveal>
            {/* Oscar, Nov 17: icons on the stats */}
            <li><i className="F-statIc" aria-hidden="true"><Ico name="star" /></i><b>4.98</b><span>average across 463 Airbnb guest reviews</span></li>
            <li><i className="F-statIc" aria-hidden="true"><Ico name="home" /></i><b>5 homes</b><span>that sleep 8 to 10 guests</span></li>
            <li><i className="F-statIc" aria-hidden="true"><Ico name="chat" /></i><b>1 hour</b><span>usual reply time from Oscar &amp; Fernanda</span></li>
          </ul>
          <ReviewLoop>
            <div className="F-loopMask" data-reveal>
              <ul className="F-loopTrack">
                {[...reviews, ...reviews].map((r, i) => (
                  <li key={`${i}-${r.key}-${r.name}`} aria-hidden={i >= reviews.length ? true : undefined}>
                    <p className="F-stars" aria-label="5 out of 5 stars">★★★★★</p>
                    {r.tags.length > 0 && <p className="F-revTags">{r.tags.map((t) => <span key={t}>{t}</span>)}</p>}
                    <blockquote>“{r.text}”</blockquote>
                    {/* Oscar, Nov 17: initial circles (no photos; real photos only with a guest's permission) */}
                    <p className="F-who"><span className="F-av" aria-hidden="true" style={{ ["--av" as string]: AV[[...r.name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AV.length] }}>{r.name.charAt(0)}</span><span><b>{r.name}</b> · {r.when}</span></p>
                    <a className="F-revHome" href={`#home-${r.key}`} tabIndex={i >= reviews.length ? -1 : undefined}>{r.home}</a>
                  </li>
                ))}
              </ul>
            </div>
          </ReviewLoop>
        </section>

        <section className="F-sec" aria-labelledby="inc-h">
          <div className="F-head" data-reveal>
            <h2 id="inc-h">Every booking includes</h2>
            <p>The same at all five homes.</p>
          </div>
          <ul className="F-checks" data-reveal>
            {/* Oscar, Nov 17: same rows; tapping one opens a short explanation. Each explanation repeats what the site
                already says elsewhere (waiver note, booking-day and stay steps, Stripe Payment Element, reply time). */}
            {/* Oscar, Nov 17: first row open on load; one open at a time; a chevron shows each row opens */}
            {INCLUDES.map(([t, more], i) => (
              <li key={t}>
                <details className="F-inc" name="includes" open={i === 0}>
                  <summary><span>{t}</span><span className="F-incIcons"><Ico name="check" /><i className="F-incChev" aria-hidden="true"><Ico name="chev" /></i></span></summary>
                  <p>{more}</p>
                </details>
              </li>
            ))}
          </ul>
          <p className="F-fine">The damage waiver covers accidental damage during your stay, up to $5,000, subject to the provider&apos;s terms and exclusions. It isn&apos;t a security deposit.</p>
        </section>

        <section className="F-sec F-band" aria-labelledby="every-h">
          <div className="F-head" data-reveal>
            <h2 id="every-h">Every home has</h2>
            <p>Available at all five homes.</p>
          </div>
          <ul className="F-amen">{EVERY_HOME.map((a, i) => <li key={a.label} data-reveal style={{ ["--d" as string]: `${(i % 4) * 70}ms` }}><Ico name={a.icon} /><span>{a.label}</span></li>)}</ul>
        </section>

        </>} />

        <section className="F-sec" aria-labelledby="steps-h">
          <div className="F-head" data-reveal><h2 id="steps-h">Booking directly is simple</h2><p>From the day you book to the day you leave.</p></div>
          <ol className="F-tl" data-reveal>
            {TIMELINE.map((st, i) => (
              <li key={st.when} style={{ ["--i" as string]: i }}>
                <p className="F-tlWhen">{st.when}</p>
                <div className="F-tlTrack" aria-hidden="true"><span className="F-tlMark" /><span className="F-tlRail" /></div>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="F-sec F-band" id="faq" aria-labelledby="faq-h">
          <div className="F-head" data-reveal><h2 id="faq-h">Your questions, answered</h2></div>
          <div className="F-faq" data-reveal>
            {faq.map((f) => (
              <details key={f.q}><summary><span>{f.q}</span><Ico name="chev" /></summary><p>{f.a}</p></details>
            ))}
          </div>
        </section>

        <section className="F-sec F-hostSec" aria-labelledby="host-h" data-reveal>
          {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={112} height={112} className="F-hostPhoto" />}
          <h2 id="host-h">Have questions before you book?</h2>
          <p>{HOST.bio}</p>
          <ul className="F-chips">{["Local San Antonio hosts", ...HOST.facts].map((f) => <li key={f}>{f}</li>)}</ul>
          <a className="F-dark" data-cta="faq_ask_hosts" href="mailto:bookings@pearlheightshomes.com">Message us</a>
        </section>
      </main>
      {/* Oscar, Nov 16: our logo + Instagram in F's footer (C and E keep the shared footer). Instagram link as on pearlheightshomes.com. */}
      <footer className="F-foot F-footF">
        <img className="F-footLogo" src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} loading="lazy" />
        <a className="F-ig" href="https://www.instagram.com/pearlheightshomes" target="_blank" rel="noopener noreferrer" aria-label="Pearl Heights Homes on Instagram">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></svg>
        </a>
        <p>Hosted by Oscar &amp; Fernanda · San Antonio, Texas · <a href="mailto:bookings@pearlheightshomes.com">bookings@pearlheightshomes.com</a></p>
        <p className="F-legal"><a href="/about">About us</a> · <a href="/guides">Local guides</a> · {LAUNCHED ? <><a href="/terms">Terms of service</a> · <a href="/privacy">Privacy policy</a></> : <>Terms of service (coming soon) · Privacy policy (coming soon)</>} · <CookieChoices /></p>
        <p className="F-note">Ratings and reviews are from Airbnb guests who stayed in our homes.</p>
      </footer>
    </div>
  );
}
