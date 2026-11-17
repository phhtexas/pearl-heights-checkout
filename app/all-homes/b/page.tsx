import Image from "next/image";
import { homeCards } from "@/content/allHomes";
import { HOMES } from "@/content/homes";
import { Compare, Footer, HOST, Icon, STEPS, TRUST, mockMeta } from "../shared";
import { HomesB } from "./HomesB";
import "../search.css";
import "./b.css";

/** All Homes, mockup B ("Editorial"): photo-led, host-forward, warm accent. Prototype: noindex, labeled. */
export const metadata = mockMeta("B");
export const dynamic = "force-static";

export default function Page() {
  const homes = homeCards();
  const ind = HOMES.indianola!;
  const hero = { src: ind.photoBase + ind.photos[0]!.id + ".jpg", alt: ind.photos[0]!.alt };
  const trust = (
    <section className="B-trust" aria-labelledby="trust-h">
      <div className="B-trustIn">
        {HOST.photo && <Image src={HOST.photo} alt="Oscar and Fernanda" width={88} height={88} className="B-trustPhoto" />}
        <div>
          <h2 id="trust-h">Book directly with local hosts</h2>
          <p>We&apos;re Oscar and Fernanda, a family of four and Airbnb Superhosts. When you book here, you book directly with us.</p>
        </div>
        <ul>{TRUST.map((t) => <li key={t.icon}><Icon name={t.icon} /><span>{t.text}</span></li>)}</ul>
      </div>
    </section>
  );
  return (
    <div className="B-page">
      <aside className="B-mock" aria-label="Prototype label">Mockup B · Editorial · prototype, not linked from the site</aside>
      <header className="B-top">
        <a className="B-brand" href="/all-homes/b">Pearl Heights <span>HOMES</span></a>
        <a className="B-ask" href="mailto:bookings@thepearlheightshomes.com">Ask a question</a>
      </header>
      <main>
        <HomesB homes={homes} hero={hero} trust={trust} />
        <Compare homes={homes} cls="B-compare" />
        <section className="B-steps" aria-labelledby="steps-h">
          <h2 id="steps-h">Booking directly is simple</h2>
          <ol>{STEPS.map((st, i) => <li key={st.title}><span className="B-num">{i + 1}</span><h3>{st.title}</h3><p>{st.text}</p></li>)}</ol>
        </section>
        <section className="B-host" aria-labelledby="host-h">
          <div className="B-hostIn">
            <h2 id="host-h">Questions before you book?</h2>
            <p>{HOST.bio}</p>
            <ul>{["Local San Antonio hosts", ...HOST.facts].map((f) => <li key={f}>{f}</li>)}</ul>
            <a className="B-cta B-ctaLight" href="mailto:bookings@thepearlheightshomes.com">Ask us a question</a>
          </div>
        </section>
      </main>
      <Footer cls="B-foot" />
    </div>
  );
}
