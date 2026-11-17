"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { HomeCard } from "@/content/allHomes";
import { SearchBar } from "../SearchBar";
import { money, shortDate, useStays } from "../useStays";
import { PinMap } from "../c/PinMap";

/** Version F (from mockup C): B's photo-led hero and cards, airier spacing, a five-pin map and a sticky search button on phones. */
export function HomesF({ homes, hero, points, reasons }: {
  homes: HomeCard[]; hero: { src: string; alt: string }; points: { key: string; lat: number; lon: number }[]; reasons: React.ReactNode;
}) {
  const s = useStays("f");
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
      <section className="F-hero">
        <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="F-heroImg" />
        <div className="F-heroShade" aria-hidden="true" />
        <div className="F-heroText">
          <p className="F-eyebrow">San Antonio, Texas</p>
          <h1>Find your San Antonio stay</h1>
          <p>Five family-friendly homes hosted by Oscar &amp; Fernanda.</p>
        </div>
      </section>
      <div className="F-searchWrap" ref={searchRef}><SearchBar s={s} cls="F-search" icons /></div>

      {reasons}

      <section className="F-sec F-homes" id="homes" aria-labelledby="homes-h">
        <div className="F-head">
          <h2 id="homes-h">Choose your home</h2>
          <p aria-live="polite">{searched ? `${available} of 5 homes available ${shortDate(s.ci)} – ${shortDate(s.co)} for ${s.adults + s.children} guests. Totals include taxes and fees.` : "Add dates to see each home's exact total, taxes included."}</p>
        </div>
        <ul className="F-list">
          {homes.map((h, i) => {
            const r = s.results[h.key];
            const off = searched && r && !r.ok;
            return (
              <li key={h.key} id={`home-${h.key}`} className={`F-card${off ? " is-off" : ""}`}>
                <div className="F-photos" tabIndex={0} role="region" aria-label={`${h.title} photos, scroll sideways`}>
                  {h.photos.slice(0, 3).map((p, j) => (
                    <div className="F-photo" key={p.src}>
                      <Image src={p.src} alt={p.alt} fill sizes="(min-width: 900px) 460px, 88vw" priority={i === 0 && j === 0} />
                    </div>
                  ))}
                </div>
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
          })}
        </ul>
      </section>

      <section className="F-sec" id="locations" aria-labelledby="map-h">
        <div className="F-head">
          <h2 id="map-h">Where the homes are</h2>
          <p>Near the Pearl, downtown and in Alamo Heights. Tap a pin to see the home.</p>
        </div>
        <PinMap pins={homes.map((h) => ({ ...points.find((p) => p.key === h.key)!, label: pinLabel(h), title: h.title, off: !!(searched && s.results[h.key] && !s.results[h.key]!.ok) }))} />
        <ul className="F-areas">
          {[...new Set(homes.map((h) => h.area))].map((area) => {
            const list = homes.filter((h) => h.area === area);
            const totals = list.map((h) => s.results[h.key]).filter((r) => searched && r?.ok).map((r) => r!.total!);
            return (
              <li key={area}>
                <div className="F-areaHead">
                  <h3>{area}</h3>
                  <p>{totals.length ? <><b>{money(Math.min(...totals))}{totals.length > 1 ? "+" : ""}</b> {nights}-night total{totals.length > 1 ? "s" : ""}</>
                    : searched ? <span className="F-dim">Not available these dates</span> : <span className="F-dim">{list.length} home{list.length > 1 ? "s" : ""}</span>}</p>
                </div>
                <ul>{list.map((h) => <li key={h.key}><a href={`#home-${h.key}`}>{h.title}</a><span className="F-dim">sleeps {h.guests}</span></li>)}</ul>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={`F-sticky${sticky ? " is-on" : ""}`} aria-hidden={!sticky}>
        <button type="button" className="F-stickyBtn" tabIndex={sticky ? 0 : -1} onClick={toSearch}>
          {searched ? `Change dates · ${shortDate(s.ci)} – ${shortDate(s.co)}` : "Search homes"}
        </button>
      </div>
    </>
  );
}
