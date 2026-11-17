"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { HomeCard } from "@/content/allHomes";
import { SearchBar } from "../../SearchBar";
import { money, shortDate, useStays } from "../../useStays";
import { PinMap } from "./PinMap";

/** Mockup C: B's photo-led hero and cards, airier spacing, a five-pin map and a sticky search button on phones. */
export function HomesC({ homes, hero, points, reasons }: {
  homes: HomeCard[]; hero: { src: string; alt: string }; points: { key: string; lat: number; lon: number }[]; reasons: React.ReactNode;
}) {
  const s = useStays("c");
  const searched = s.state === "done";
  const nights = searched && s.ci && s.co ? Math.round((Date.parse(s.co) - Date.parse(s.ci)) / 864e5) : 0;
  const available = searched ? homes.filter((h) => s.results[h.key]?.ok).length : 0;
  const searchRef = useRef<HTMLDivElement>(null);
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
    setTimeout(() => searchRef.current?.querySelector<HTMLInputElement>('input[aria-label="Check-in date"]')?.focus({ preventScroll: true }), 450);
  };
  const pinLabel = (h: HomeCard) => {
    const r = s.results[h.key];
    if (searched && r) return r.ok ? money(r.total!) : "Unavailable";
    return h.rating ? `★ ${h.rating.value}` : "New";
  };

  return (
    <>
      <section className="C-hero">
        <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="C-heroImg" />
        <div className="C-heroShade" aria-hidden="true" />
        <div className="C-heroText">
          <p className="C-eyebrow">San Antonio, Texas</p>
          <h1>Find your San Antonio stay</h1>
          <p>Five family-friendly homes hosted by Oscar &amp; Fernanda.</p>
          <ul className="C-proof" aria-label="Why guests trust us">
            <li><span aria-hidden="true">★</span> 4.98 average</li>
            <li>463 Airbnb guest reviews</li>
            <li>Replies in about an hour</li>
          </ul>
        </div>
      </section>
      <div className="C-searchWrap" ref={searchRef}><SearchBar s={s} cls="C-search" icons /></div>

      {reasons}

      <section className="C-sec C-homes" aria-labelledby="homes-h">
        <div className="C-head">
          <h2 id="homes-h">Choose your home</h2>
          <p aria-live="polite">{searched ? `${available} of 5 homes available ${shortDate(s.ci)} – ${shortDate(s.co)} for ${s.adults + s.children} guests. Totals include taxes and fees.` : "Add dates to see each home's exact total, taxes included."}</p>
        </div>
        <ul className="C-list">
          {homes.map((h, i) => {
            const r = s.results[h.key];
            const off = searched && r && !r.ok;
            return (
              <li key={h.key} id={`home-${h.key}`} className={`C-card${off ? " is-off" : ""}`}>
                <div className="C-photos" tabIndex={0} role="region" aria-label={`${h.title} photos, scroll sideways`}>
                  {h.photos.slice(0, 3).map((p, j) => (
                    <div className="C-photo" key={p.src}>
                      <Image src={p.src} alt={p.alt} fill sizes="(min-width: 900px) 460px, 88vw" priority={i === 0 && j === 0} />
                    </div>
                  ))}
                </div>
                <div className="C-info">
                  <p className="C-fit">{h.bestFit}</p>
                  <p className="C-meta">{h.area} · {h.rating ? <span>★ {h.rating.value} <span className="C-dim">({h.rating.count} Airbnb guest reviews)</span></span> : <b>New home</b>}</p>
                  <h3><a href={s.href(h.slug)}>{h.title}</a></h3>
                  <p className="C-dim">{h.guests} guests · {h.bedrooms} bedrooms · {h.beds} beds · {h.baths} bath{h.baths === 1 ? "" : "s"}</p>
                  <ul className="C-points">{h.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  <div className="C-buy">
                    <p className="C-price">
                      {s.state === "loading" ? <span className="C-dim">Checking these dates…</span>
                        : !searched || !r ? <span className="C-dim">Add dates for the total</span>
                        : r.ok ? <><b>{money(r.total!)}</b><span>total for {nights} night{nights === 1 ? "" : "s"}, taxes included</span></>
                        : <><span className="C-dim">{r.reason}</span>{r.reason !== `Sleeps ${h.guests}` && <button type="button" className="C-retry" onClick={toSearch}>Try other dates</button>}</>}
                    </p>
                    <a className="C-cta" href={s.href(h.slug)} aria-label={`View ${h.title}`}>View home</a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="C-sec" aria-labelledby="map-h">
        <div className="C-head">
          <h2 id="map-h">Where the homes are</h2>
          <p>Near the Pearl, downtown and in Alamo Heights. Tap a pin to see the home.</p>
        </div>
        <PinMap pins={homes.map((h) => ({ ...points.find((p) => p.key === h.key)!, label: pinLabel(h), title: h.title, off: !!(searched && s.results[h.key] && !s.results[h.key]!.ok) }))} />
        <ul className="C-areas">
          {[...new Set(homes.map((h) => h.area))].map((area) => {
            const list = homes.filter((h) => h.area === area);
            const totals = list.map((h) => s.results[h.key]).filter((r) => searched && r?.ok).map((r) => r!.total!);
            return (
              <li key={area}>
                <div className="C-areaHead">
                  <h3>{area}</h3>
                  <p>{totals.length ? <><b>{money(Math.min(...totals))}{totals.length > 1 ? "+" : ""}</b> {nights}-night total{totals.length > 1 ? "s" : ""}</>
                    : searched ? <span className="C-dim">Not available these dates</span> : <span className="C-dim">{list.length} home{list.length > 1 ? "s" : ""}</span>}</p>
                </div>
                <ul>{list.map((h) => <li key={h.key}><a href={`#home-${h.key}`}>{h.title}</a><span className="C-dim">sleeps {h.guests}</span></li>)}</ul>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={`C-sticky${sticky ? " is-on" : ""}`} aria-hidden={!sticky}>
        <button type="button" className="C-stickyBtn" tabIndex={sticky ? 0 : -1} onClick={toSearch}>
          {searched ? `Change dates · ${shortDate(s.ci)} – ${shortDate(s.co)}` : "Search homes"}
        </button>
      </div>
    </>
  );
}
