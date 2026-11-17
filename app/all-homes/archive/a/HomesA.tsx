"use client";
import Image from "next/image";
import type { HomeCard } from "@/content/allHomes";
import { SearchBar } from "../../SearchBar";
import { money, shortDate, useStays } from "../../useStays";

const specs = (h: HomeCard) => `${h.guests} guests · ${h.bedrooms} bedrooms · ${h.beds} beds · ${h.baths} bath${h.baths === 1 ? "" : "s"}`;

/** Mockup A: hero search + a grid of large cards. Totals appear on every card after a search. */
export function HomesA({ homes, children }: { homes: HomeCard[]; children: React.ReactNode }) {
  const s = useStays("a");
  const searched = s.state === "done";
  const nights = searched && s.ci && s.co ? Math.round((Date.parse(s.co) - Date.parse(s.ci)) / 864e5) : 0;
  return (
    <>
      <section className="A-hero">
        <h1>Find your San Antonio stay</h1>
        <p>Five family-friendly homes hosted by Oscar &amp; Fernanda.</p>
        <SearchBar s={s} cls="A-search" />
      </section>

      {children /* trust strip, server-rendered */}

      <section className="A-homes" aria-labelledby="homes-h">
        <div className="A-homesHead">
          <h2 id="homes-h">Our homes</h2>
          <p aria-live="polite">{searched ? `${shortDate(s.ci)} – ${shortDate(s.co)} · ${s.adults + s.children} guests · totals include taxes and fees` : "Add dates to see each home's total, taxes included."}</p>
        </div>
        <ul className="A-grid">
          {homes.map((h, i) => {
            const r = s.results[h.key];
            const off = searched && r && !r.ok;
            return (
              <li key={h.key} id={`home-${h.key}`} className={off ? "is-off" : undefined}>
                <a className="A-card" href={s.href(h.slug)}>
                  <div className="A-photo">
                    <Image src={h.photos[0]!.src} alt={h.photos[0]!.alt} fill sizes="(min-width: 1100px) 520px, (min-width: 720px) 46vw, 100vw" priority={i < 2} />
                    <span className="A-badge">{h.bestFit}</span>
                  </div>
                  <div className="A-body">
                    <div className="A-titleRow">
                      <h3>{h.title}</h3>
                      <span className="A-rating">{h.rating ? <>★ {h.rating.value}</> : "New"}</span>
                    </div>
                    <p className="A-area">{h.area}, San Antonio{h.rating ? ` · ${h.rating.count} Airbnb guest reviews` : " · New home"}</p>
                    <p className="A-specs">{specs(h)}</p>
                    <p className="A-points">{h.points.join(" · ")}</p>
                    <div className="A-priceRow">
                      <p className="A-price">
                        {s.state === "loading" ? <span className="A-muted">Checking…</span>
                          : !searched || !r ? <span className="A-muted">Add dates for the total</span>
                          : r.ok ? <><b>{money(r.total!)}</b> total for {nights} night{nights === 1 ? "" : "s"}</>
                          : <span className="A-muted">{r.reason}</span>}
                      </p>
                      <span className="A-cta">View home</span>
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
