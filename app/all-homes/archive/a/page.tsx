import Image from "next/image";
import { homeCards } from "@/content/allHomes";
import { Compare, Footer, HOST, Icon, STEPS, TRUST, mockMeta } from "../../shared";
import { HomesA } from "./HomesA";
import "../../search.css";
import "./a.css";

/** ARCHIVED (Oscar, Nov 16: keep working on C). All Homes, mockup A ("Classic search"): Airbnb-familiar layout. Prototype: noindex, labeled. */
export const metadata = { ...mockMeta("A"), title: `Archived mockup A | Pearl Heights Homes` };
export const dynamic = "force-static";

export default function Page() {
  const homes = homeCards();
  return (
    <div className="A-page">
      <aside className="A-mock" aria-label="Archived mockup">Archived · Mockup A (Classic search) · kept for reference · <a href="/all-homes/f" style={{ color: "#fff" }}>Current version: Mockup F</a></aside>
      <header className="A-top">
        <a className="A-brand" href="/all-homes/archive/a">Pearl Heights <span>HOMES</span></a>
        <a className="A-ask" href="mailto:bookings@pearlheightshomes.com">Ask a question</a>
      </header>
      <main>
        <HomesA homes={homes}>
          <section className="A-trust" aria-labelledby="trust-h">
            <div className="A-trustHost">
              {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={56} height={56} />}
              <h2 id="trust-h">Book directly with local hosts</h2>
            </div>
            <ul>{TRUST.map((t) => <li key={t.icon}><Icon name={t.icon} /><span>{t.text}</span></li>)}</ul>
          </section>
        </HomesA>

        <Compare homes={homes} cls="A-compare" />

        <section className="A-steps" aria-labelledby="steps-h">
          <h2 id="steps-h">Booking directly is simple</h2>
          <ol>{STEPS.map((st, i) => <li key={st.title}><span className="A-num">{i + 1}</span><div><h3>{st.title}</h3><p>{st.text}</p></div></li>)}</ol>
        </section>

        <section className="A-host" aria-labelledby="host-h">
          {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={120} height={120} className="A-hostPhoto" />}
          <div>
            <h2 id="host-h">Meet your hosts, Oscar &amp; Fernanda</h2>
            <p>{HOST.bio}</p>
            <ul className="A-hostFacts">{["Local San Antonio hosts", ...HOST.facts].map((f) => <li key={f}>{f}</li>)}</ul>
            <a className="A-btnGhost" href="mailto:bookings@pearlheightshomes.com">Ask us a question</a>
          </div>
        </section>
      </main>
      <Footer cls="A-foot" />
    </div>
  );
}
