"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { HomeCard } from "@/content/allHomes";
import { money, shortDate, useStays } from "../useStays";
import { PinMapF as PinMap } from "./PinMapF";
import { SearchBarF, type SearchBarFHandle } from "./SearchBarF";

/**
 * Version F (note 176 + Oscar, Nov 16): centered hero under a see-through header, Airbnb-style calendar, host strip,
 * wide cards, map in a list-left / map-right layout, sticky phone search. Live totals via /api/availability.
 */
const AREA_NOTE: Record<string, string> = { "Tobin Hill": "walk to the Pearl", Lavaca: "walk downtown" };

/**
 * A home's photos (Oscar, Nov 17): on phones the same treatment as the listing page: one full-width photo at a time,
 * swipe for the next, dots + "1 / 4" counter. With a mouse/trackpad the strip isn't a scroll area (so the page always
 * scrolls) and arrows change the photo on hover. Tapping/clicking a photo opens the home.
 */
const MAX_PHOTOS = 4; // the cards carry 4 photos per home (homeCards)
function Photos({ h, href, first }: { h: HomeCard; href: string; first: boolean }) {
  const photos = h.photos.slice(0, MAX_PHOTOS);
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const go = (n: number) => {
    const el = strip.current; if (!el) return;
    const k = (n + photos.length) % photos.length;
    el.scrollTo({ left: k * el.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setAt(k);
  };
  return (
    <div className="F-photoWrap">
      <div className="F-photos" ref={strip} onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
        {photos.map((p, j) => (
          <a className="F-photo" key={p.src} href={href} draggable={false} tabIndex={j === 0 ? 0 : -1}
            aria-label={j === 0 ? `${h.title}: view home` : undefined} aria-hidden={j === 0 ? undefined : true}>
            {Math.abs(j - at) <= 1 && <Image src={p.src} alt={j === 0 ? "" : p.alt} fill sizes="(min-width: 900px) 500px, 100vw" priority={first && j === 0} draggable={false} />}
          </a>
        ))}
      </div>
      <button type="button" className="F-arrow F-arrowPrev" aria-label={`Previous photo of ${h.title}`} onClick={() => go(at - 1)}>‹</button>
      <button type="button" className="F-arrow F-arrowNext" aria-label={`Next photo of ${h.title}`} onClick={() => go(at + 1)}>›</button>
      <div className="F-dots" aria-hidden="true">{photos.map((p, j) => <span key={p.src} className={j === at ? "on" : ""} />)}</div>
      <span className="F-count" aria-hidden="true">{at + 1} / {photos.length}</span>
    </div>
  );
}

export function HomesF({ homes, hero, points, reasons }: {
  homes: HomeCard[]; hero: { src: string; alt: string }; points: { key: string; lat: number; lon: number }[]; reasons: React.ReactNode;
}) {
  const s = useStays("f");
  const searched = s.state === "done";
  const nights = searched && s.ci && s.co ? Math.round((Date.parse(s.co) - Date.parse(s.ci)) / 864e5) : 0;
  const available = searched ? homes.filter((h) => s.results[h.key]?.ok).length : 0;
  const searchRef = useRef<HTMLDivElement>(null);
  const bar = useRef<SearchBarFHandle>(null);
  const [sticky, setSticky] = useState(false);
  useEffect(() => {
    const el = searchRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setSticky(!e!.isIntersecting && e!.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const toSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    setTimeout(() => bar.current?.openDates(), 450);
  };
  const pinLabel = (h: HomeCard) => {
    const r = s.results[h.key];
    if (searched && r) return r.ok ? money(r.total!) : "Unavailable";
    return h.rating ? `★ ${h.rating.value}` : "New";
  };
  const areas = [...new Set(homes.map((h) => h.area))];
  const card = (h: HomeCard, i: number) => {
    const r = s.results[h.key];
    const off = searched && r && !r.ok;
    return (
      <li key={h.key} id={`home-${h.key}`} className={`F-card${off ? " is-off" : ""}`} data-reveal>
        <Photos h={h} href={s.href(h.slug)} first={i === 0} />
        <div className="F-info">
          <p className="F-fit">{h.bestFit}</p>
          <p className="F-meta">{h.area} · {h.rating ? <span>★ {h.rating.value} <span className="F-dim">({h.rating.count} Airbnb guest reviews)</span></span> : <b>New home</b>}</p>
          <h3><a href={s.href(h.slug)}>{h.title}</a></h3>
          <p className="F-dim">{h.guests} guests · {h.bedrooms} bedrooms · {h.beds} beds · {h.baths} bath{h.baths === 1 ? "" : "s"}</p>
          <ul className="F-points">{h.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <div className="F-buy">
            <p className="F-price">
              {s.state === "loading" ? <span className="F-dim">Checking these dates…</span>
                : !searched || !r ? <span className="F-dim">Add dates for the total</span>
                : r.ok ? <><b>{money(r.total!)}</b><span>total for {nights} night{nights === 1 ? "" : "s"}, taxes included</span></>
                : <><span className="F-dim">{r.reason}</span>{r.reason !== `Sleeps ${h.guests}` && <button type="button" className="F-retry" onClick={toSearch}>Try other dates</button>}</>}
            </p>
            <a className="F-cta" href={s.href(h.slug)} aria-label={`View ${h.title}`}>View home</a>
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <section className="F-hero">
        <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="F-heroImg" />
        <div className="F-heroShade" aria-hidden="true" />
        <div className="F-heroText">
          <p className="F-eyebrow F-up">San Antonio, Texas</p>
          <h1 className="F-up F-d1">Find your San Antonio stay</h1>
          <p className="F-up F-d2">Five family-friendly homes hosted by Oscar &amp; Fernanda.</p>
        </div>
      </section>
      <div className="F-searchWrap F-up F-d3" ref={searchRef}><SearchBarF s={s} ref={bar} /></div>

      {reasons}

      <section className="F-sec F-homes" id="homes" aria-labelledby="homes-h">
        <div className="F-head" data-reveal>
          <h2 id="homes-h">Choose your home</h2>
          <p aria-live="polite">{searched ? `${available} of 5 homes available ${shortDate(s.ci)} – ${shortDate(s.co)} for ${s.adults + s.children} guests. Totals include taxes and fees.` : "Add dates to see each home's exact total, taxes included."}</p>
        </div>
        <ul className="F-list">
          {/* Oscar, Nov 17: after a search, homes that fit the dates and guests move to the top (original order kept within
              each group); the rest stay visible, greyed, below a small divider. */}
          {(searched ? [...homes].sort((x, y) => Number(!s.results[x.key]?.ok) - Number(!s.results[y.key]?.ok)) : homes).flatMap((h, i, list) => {
            const offAt = (k: HomeCard) => searched && !!s.results[k.key] && !s.results[k.key]!.ok;
            // divider only between the two groups (not when every home is unavailable)
            const divider = i > 0 && offAt(h) && !offAt(list[i - 1]!) ? [<li key="off-divider" className="F-offHead">Not available for these dates or guests</li>] : [];
            return [...divider, card(h, homes.indexOf(h))];
          })}
        </ul>
      </section>

      {/* Oscar: map in the list-left / map-right layout (as on E) */}
      <section className="F-sec F-mapSec" id="locations" aria-labelledby="map-h">
        <div className="F-mapGrid">
          <div data-reveal>
            <h2 id="map-h">Where the homes are</h2>
            <p className="F-lead">Near the Pearl, downtown and in Alamo Heights. Tap a pin or a home to jump to it.</p>
            <div className="F-hoods">
              {areas.map((area) => {
                const list = homes.filter((h) => h.area === area);
                const totals = list.map((h) => s.results[h.key]).filter((r) => searched && r?.ok).map((r) => r!.total!);
                return (
                  <div className="F-hood" key={area}>
                    <div>
                      <h3>{area}</h3>
                      <p className="F-dim">{list.length} home{list.length > 1 ? "s" : ""}{AREA_NOTE[area] ? ` · ${AREA_NOTE[area]}` : ""}</p>
                      <ul>{list.map((h) => <li key={h.key}><a href={`#home-${h.key}`}>{h.title}</a></li>)}</ul>
                    </div>
                    <p className="F-hoodPr">{totals.length ? <>from <b>{money(Math.min(...totals))}</b></> : searched ? <span className="F-dim">Not available</span> : <span className="F-dim">Add dates</span>}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="F-mapCard" data-reveal style={{ ["--d" as string]: "120ms" }}>
            <PinMap pins={homes.map((h) => ({ ...points.find((p) => p.key === h.key)!, label: pinLabel(h), title: h.title, off: !!(searched && s.results[h.key] && !s.results[h.key]!.ok) }))} />
          </div>
        </div>
      </section>

      <div className={`F-sticky${sticky ? " is-on" : ""}`} aria-hidden={!sticky}>
        <button type="button" className="F-stickyBtn" tabIndex={sticky ? 0 : -1} onClick={toSearch}>
          {searched ? `Change dates · ${shortDate(s.ci)} – ${shortDate(s.co)}` : "Search homes"}
        </button>
      </div>
    </>
  );
}
