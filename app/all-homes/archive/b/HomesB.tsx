"use client";
import Image from "next/image";
import type { HomeCard } from "@/content/allHomes";
import { SearchBar } from "../../SearchBar";
import { money, shortDate, useStays } from "../../useStays";

/** Mockup B: photo-led hero with a floating search card, "pick by what matters" chips, wide editorial cards. */
export function HomesB({ homes, hero, trust }: { homes: HomeCard[]; hero: { src: string; alt: string }; trust: React.ReactNode }) {
  const s = useStays("b");
  const searched = s.state === "done";
  const nights = searched && s.ci && s.co ? Math.round((Date.parse(s.co) - Date.parse(s.ci)) / 864e5) : 0;
  const available = searched ? homes.filter((h) => s.results[h.key]?.ok).length : 0;
  return (
    <>
      <section className="B-hero">
        <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="B-heroImg" />
        <div className="B-heroShade" aria-hidden="true" />
        <div className="B-heroText">
          <p className="B-eyebrow">San Antonio, Texas</p>
          <h1>Find your San Antonio stay</h1>
          <p>Five family-friendly homes hosted by Oscar &amp; Fernanda.</p>
        </div>
      </section>
      <div className="B-searchWrap"><SearchBar s={s} cls="B-search" /></div>

      {trust}

      <section className="B-homes" aria-labelledby="homes-h">
        <h2 id="homes-h">Choose your home</h2>
        <p className="B-sub" aria-live="polite">
          {searched ? `${available} of 5 homes available ${shortDate(s.ci)} – ${shortDate(s.co)} for ${s.adults + s.children} guests. Totals include taxes and fees.` : "Add dates to see each home's exact total, taxes included."}
        </p>
        <nav className="B-chips" aria-label="Jump to a home by what matters to you">
          {homes.map((h) => <a key={h.key} href={`#home-${h.key}`}>{h.bestFit}</a>)}
        </nav>
        <ul className="B-list">
          {homes.map((h, i) => {
            const r = s.results[h.key];
            const off = searched && r && !r.ok;
            return (
              <li key={h.key} id={`home-${h.key}`} className={`B-card${off ? " is-off" : ""}`}>
                <div className="B-photos" tabIndex={0} role="region" aria-label={`${h.title} photos, scroll sideways`}>
                  {h.photos.slice(0, 3).map((p, j) => (
                    <div className="B-photo" key={p.src}>
                      <Image src={p.src} alt={p.alt} fill sizes="(min-width: 900px) 420px, 88vw" priority={i === 0 && j === 0} loading={i === 0 && j === 0 ? undefined : "lazy"} />
                    </div>
                  ))}
                </div>
                <div className="B-info">
                  <p className="B-fit">{h.bestFit}</p>
                  <h3><a href={s.href(h.slug)}>{h.title}</a></h3>
                  <p className="B-meta">{h.area} · {h.rating ? <span className="B-star">★ {h.rating.value} <span>({h.rating.count} Airbnb guest reviews)</span></span> : <span className="B-new">New home</span>}</p>
                  <p className="B-specs">{h.guests} guests · {h.bedrooms} bedrooms · {h.beds} beds · {h.baths} bath{h.baths === 1 ? "" : "s"}</p>
                  <ul className="B-points">{h.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  {h.reviewQuote && <blockquote className="B-quote">“{h.reviewQuote.text}” <cite>— {h.reviewQuote.name}, Airbnb guest</cite></blockquote>}
                  <div className="B-buy">
                    <p className="B-price" aria-live="polite">
                      {s.state === "loading" ? <span className="B-muted">Checking these dates…</span>
                        : !searched || !r ? <span className="B-muted">Add dates for the total</span>
                        : r.ok ? <><b>{money(r.total!)}</b><span>total for {nights} night{nights === 1 ? "" : "s"}, taxes included</span></>
                        : <span className="B-muted">{r.reason}</span>}
                    </p>
                    <a className="B-cta" href={s.href(h.slug)} aria-label={`View ${h.title}`}>View home</a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
