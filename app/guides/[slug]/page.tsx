import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GUIDES, guideBySlug, guideQuote } from "@/content/guides";
import { HOMES } from "@/content/homes";
import { SITE, ldJson, publicMeta } from "@/seo";
import { guideVisible } from "@/guidesAccess";
import { SiteNav } from "../../SiteNav";
import "../guides.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  const m = publicMeta(`/guides/${g.slug}`, { title: `${g.title} | Pearl Heights Homes`, description: g.description });
  return g.approved ? m : { ...m, robots: { index: false, follow: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g || !(await guideVisible(g))) notFound();
  const hero = HOMES[g.heroHome]!;
  const url = `${SITE}/guides/${g.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "@id": `${url}#article`, headline: g.title, description: g.description, dateModified: g.updated, url,
        image: hero.photoBase + hero.photos[0]!.id + ".jpg",
        author: { "@type": "Person", name: "Oscar & Fernanda" }, publisher: { "@id": `${SITE}/#org` },
        about: g.homes.map((h) => ({ "@id": `${SITE}/homes/${HOMES[h.key]!.slug}#home` })) },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
  return (
    <div className="G-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <SiteNav />
      <main className="G-main">
        {!g.approved && <p className="G-draft">Draft for Oscar&apos;s review · only visible on the test site</p>}
        <p className="G-kicker">Guide</p>
        <h1>{g.title}</h1>
        <img className="G-hero" src={hero.photoBase + hero.photos[0]!.id + ".jpg"} alt={hero.photos[0]!.alt} />
        {g.intro.map((p) => <p key={p} className="G-lead">{p}</p>)}

        <h2>Our homes by the Pearl</h2>
        <div className="G-homes">
          {g.homes.map((x) => {
            const h = HOMES[x.key]!;
            return (
              <article key={x.key} className="G-home">
                <img src={h.photoBase + h.photos[0]!.id + ".jpg"} alt={h.photos[0]!.alt} loading="lazy" />
                <div className="G-homeBody">
                  <h3>{h.title}</h3>
                  <p className="G-fit">{x.fit}</p>
                  <ul>{x.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  <a className="G-link" href={`/homes/${h.slug}`} data-cta="guide_home" data-cta-home={x.key}>See the home</a>
                </div>
              </article>
            );
          })}
        </div>

        {g.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
            {s.bullets && <ul className="G-list">{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
          </section>
        ))}

        <h2>What families say</h2>
        {g.quotes.map((q) => {
          const r = guideQuote(q);
          return (
            <blockquote key={q.home + q.reviewer} className="G-quote">
              <p>{r.text}</p>
              <cite>{r.name}, {r.when} · Airbnb review of {r.home.title}</cite>
            </blockquote>
          );
        })}

        <h2>Questions</h2>
        <div className="G-faq">{g.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>

        <p className="G-updated">Written by Oscar &amp; Fernanda, your hosts · Updated {new Date(g.updated + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </main>
    </div>
  );
}

export function generateStaticParams() { return GUIDES.map((g) => ({ slug: g.slug })); }
