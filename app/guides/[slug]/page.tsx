import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GUIDES, guideBySlug, guideQuote, type GuidePhoto } from "@/content/guides";
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

/** A photo with its caption and, for Creative Commons photos, the required credit (author, license, source link). */
function Photo({ p, className, eager }: { p: GuidePhoto; className?: string; eager?: boolean }) {
  return (
    <figure className={`G-fig ${className ?? ""}`}>
      <img src={p.src} alt={p.alt} loading={eager ? "eager" : "lazy"} />
      <figcaption>
        {p.caption}
        {p.credit && <span className="G-credit"> · Photo: <a href={p.credit.page} target="_blank" rel="noopener noreferrer">{p.credit.author}</a>, <a href={p.credit.licenseUrl} target="_blank" rel="noopener noreferrer">{p.credit.license}</a></span>}
      </figcaption>
    </figure>
  );
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g || !(await guideVisible(g))) notFound();
  const url = `${SITE}/guides/${g.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "@id": `${url}#article`, headline: g.title, description: g.description, dateModified: g.updated, url,
        image: [g.hero.src, ...g.gallery.map((p) => p.src)],
        author: { "@type": "Person", name: "Oscar & Fernanda" }, publisher: { "@id": `${SITE}/#org` },
        citation: g.sources.map((x) => x.url),
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
        <Photo p={g.hero} className="G-hero" eager />
        {g.intro.map((p) => <p key={p} className="G-lead">{p}</p>)}
        {g.gallery.length > 0 && (
          <div className="G-gallery" role="region" aria-label="Photos of the area, swipe for more" tabIndex={0}>
            {g.gallery.map((p) => <Photo key={p.src} p={p} className="G-slide" />)}
          </div>
        )}

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
            {s.photo && <Photo p={s.photo} className="G-secPhoto" />}
            {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
            {s.bullets && <ul className="G-list">{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
            {s.steps && <ol className="G-steps">{s.steps.map((x) => <li key={x.when}><strong>{x.when}</strong><span>{x.text}</span></li>)}</ol>}
          </section>
        ))}

        {g.eat && (
          <section>
            <h2>{g.eat.heading}</h2>
            <p>{g.eat.intro}</p>
            <div className="G-eat">
              {g.eat.groups.map((grp) => (
                <div key={grp.name} className="G-eatGroup">
                  <h3>{grp.name}</h3>
                  <ul>{grp.places.map((pl) => <li key={pl.name}><strong>{pl.name}</strong><span>{pl.what}</span></li>)}</ul>
                </div>
              ))}
            </div>
            <p className="G-note">{g.eat.note}</p>
          </section>
        )}

        {g.todo && (
          <section>
            <h2>{g.todo.heading}</h2>
            <div className="G-todo">
              {g.todo.items.map((t) => (
                <article key={t.name} className={`G-todoCard${t.photo ? "" : " G-todoPlain"}`}>
                  {t.photo && <img src={t.photo.src} alt={t.photo.alt} loading="lazy" />}
                  <div>
                    <h3>{t.name}</h3>
                    <p>{t.what}</p>
                    <p className="G-dist">{t.distance}</p>
                    {t.photo?.credit && <p className="G-cardCredit">Photo: <a href={t.photo.credit.page} target="_blank" rel="noopener noreferrer">{t.photo.credit.author}</a>, <a href={t.photo.credit.licenseUrl} target="_blank" rel="noopener noreferrer">{t.photo.credit.license}</a></p>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

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

        {g.sources.length > 0 && <>
          <h2>Sources</h2>
          <ul className="G-sources">{g.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></li>)}</ul>
          <p className="G-note">Hours, prices and schedules for places outside our homes can change; check each official page before you go.</p>
        </>}

        <p className="G-updated">Written by Oscar &amp; Fernanda, your hosts · Updated {new Date(g.updated + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </main>
    </div>
  );
}

export function generateStaticParams() { return GUIDES.map((g) => ({ slug: g.slug })); }
