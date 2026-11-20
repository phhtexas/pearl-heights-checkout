import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GUIDES, guideBySlug, guideQuote, type GuidePhoto } from "@/content/guides";
import { HOMES } from "@/content/homes";
import { SITE, ldJson, publicMeta } from "@/seo";
import { guideVisible } from "@/guidesAccess";
import { SiteNav } from "../../SiteNav";
import { TileMapV2 } from "../../homes/TileMapV2";
import "../../homes/listingV2.css";
import Image from "next/image";
import "../guides.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  const m = publicMeta(`/guides/${g.slug}`, { title: `${g.title} | Pearl Heights Homes`, description: g.description, openGraph: { images: [g.hero.src] } });
  return g.approved ? m : { ...m, robots: { index: false, follow: false } };
}

/**
 * Guide photos through Vercel's image optimizer (Oscar, Nov 20 SEO check): resized WebP/AVIF instead of full-size JPEGs,
 * with width/height so the page doesn't jump. The box's shape still comes from the CSS aspect-ratio of each slot.
 */
function GImg({ src, alt, sizes, eager }: { src: string; alt: string; sizes: string; eager?: boolean }) {
  // Wikimedia photos load straight from Wikimedia (already 1280px; their servers can refuse automated fetchers).
  if (!src.startsWith("https://assets.hospitable.com/")) return <img src={src} alt={alt} width={1280} height={853} loading={eager ? "eager" : "lazy"} decoding="async" />;
  return <Image src={src} alt={alt} width={1280} height={853} sizes={sizes} priority={!!eager} quality={75} style={{ height: "auto" }} />;
}

/** A photo with its caption and, for Creative Commons photos, the required credit (author, license, source link). */
function Photo({ p, className, eager }: { p: GuidePhoto; className?: string; eager?: boolean }) {
  return (
    <figure className={`G-fig ${className ?? ""}`}>
      <GImg src={p.src} alt={p.alt} eager={eager} sizes={className === "G-slide" ? "(min-width: 760px) 360px, 80vw" : "(min-width: 760px) 720px, 100vw"} />
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

        <h2>{g.homesHeading}</h2>
        <div className="G-homes">
          {g.homes.map((x) => {
            const h = HOMES[x.key]!;
            return (
              <article key={x.key} className="G-home">
                <GImg src={h.photoBase + h.photos[0]!.id + ".jpg"} alt={h.photos[0]!.alt} sizes="(min-width: 760px) 360px, 100vw" />
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
          <section id="eat">
            <h2>{g.eat.heading}</h2>
            <p>{g.eat.intro}</p>
            {g.eat.map && (
              <div className="G-eatMap">
                <TileMapV2 lat={g.eat.map.lat} lon={g.eat.map.lon} zoom={16} interactive span={3} place={g.eat.map.label} />
                <a className="G-btn" href={g.eat.map.directions} target="_blank" rel="noopener noreferrer" data-cta="guide_map">Directions to the {g.eat.map.label}</a>
              </div>
            )}
            <nav className="G-chips" aria-label="Meal types">
              {g.eat.groups.map((grp, i) => <a key={grp.name} href={`#eat-${i}`}>{grp.name}</a>)}
            </nav>
            {g.eat.groups.map((grp, i) => (
              <div key={grp.name} id={`eat-${i}`} className="G-eatGroup">
                <h3>{grp.name}</h3>
                <ul className="G-places">
                  {grp.places.map((pl) => (
                    <li key={pl.name} className="G-place">
                      <strong>{pl.name}{pl.pick && <em className="G-pick">Our pick</em>}</strong>
                      <span>{pl.what}</span>
                      <div className="G-placeLinks">
                        {(pl.web ?? pl.pearl) && <a href={pl.web ?? pl.pearl} target="_blank" rel="noopener noreferrer" data-cta="guide_eat_web">{pl.web ? "Website" : "Info"}</a>}
                        <a href={pl.map} target="_blank" rel="noopener noreferrer" data-cta="guide_eat_directions">Directions</a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="G-note">{g.eat.note}</p>
          </section>
        )}

        {g.todo && (
          <section>
            <h2>{g.todo.heading}</h2>
            <div className="G-todo">
              {g.todo.items.map((t) => (
                <article key={t.name} className={`G-todoCard${t.photo ? "" : " G-todoPlain"}`}>
                  {t.photo && <GImg src={t.photo.src} alt={t.photo.alt} sizes="(min-width: 760px) 360px, 100vw" />}
                  <div>
                    <h3>{t.name}</h3>
                    {t.what && <p>{t.what}</p>}
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
