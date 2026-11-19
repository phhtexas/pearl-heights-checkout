"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSaved } from "@/client/saved";
import type { HomeCard } from "@/content/allHomes";
import { money, shortDate, useStays } from "../useStays";
import { PinMapF as PinMap, type Area } from "./PinMapF";
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
          <a className="F-photo" key={p.src} href={href} data-cta="home_card_photo" data-cta-home={h.key} draggable={false} tabIndex={j === 0 ? 0 : -1}
            aria-label={j === 0 ? `${h.title}: view home` : undefined} aria-hidden={j === 0 ? undefined : true}>
            {Math.abs(j - at) <= 1 && <Image src={p.src} alt={j === 0 ? "" : p.alt} fill sizes="(min-width: 900px) 500px, 100vw" priority={first && j === 0} draggable={false} />}
          </a>
        ))}
      </div>
      <button type="button" className="F-arrow F-arrowPrev" aria-label={`Previous photo of ${h.title}`} onClick={() => go(at - 1)}>‹</button>
      <button type="button" className="F-arrow F-arrowNext" aria-label={`Next photo of ${h.title}`} onClick={() => go(at + 1)}>›</button>
      <div className="F-dots" aria-hidden="true">{photos.map((p, j) => <span key={p.src} className={j === at ? "on" : ""} />)}</div>
      <span className="F-count" aria-hidden="true">{at + 1} / {photos.length}</span>
      {PILLS[h.key] && (
        <ul className="F-pills" aria-label="Highlights">
          {PRESS[h.key] && <li className="F-press"><a href={PRESS[h.key]!.href} target="_blank" rel="noopener">{PRESS[h.key]!.label}<span className="sr-only"> (opens in a new window)</span></a></li>}
          {PILLS[h.key]!.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Photo pills (Oscar, Nov 17): two callouts per home, chosen from who books (Hospitable: 51% of stays bring kids,
 * 41% are parties of 5+; reviews mention location 56%, kids/family 40%). Every pill is from that home's listing:
 * 752/736 goodFit "walk to the Pearl and the River Walk" + Playroom amenity / 10 guests; Edgewood "a quiet street in
 * Alamo Heights" + "children's playroom"; Claywell "tree-lined streets" + title "Large Family Home"; Indianola
 * highlight "Walk downtown" (walk times in homeSources) + "a king bed in every bedroom".
 */
const PILLS: Record<string, string[]> = {
  "752": ["Walk to the Pearl", "Kids' playroom"],
  "736": ["Walk to the Pearl", "Sleeps 10"],
  edgewood: ["Quiet Alamo Heights street", "Kids' playroom"],
  claywell: ["Tree-lined Alamo Heights", "Large family home"],
  indianola: ["Walk to downtown", "King bed in every room"],
};

/**
 * Press mention (Oscar, Nov 17): Edgewood is in Condé Nast Traveler's "14 San Antonio Airbnbs that Capture the Alamo
 * City's Spirit" (link from Oscar). Text pill only, no logo (their trademark). Opens the article in a new window.
 */
const PRESS: Record<string, { label: string; href: string }> = {
  edgewood: { label: "Featured in Condé Nast Traveler", href: "https://www.cntraveler.com/gallery/best-airbnbs-in-san-antonio" },
};

export function HomesF({ homes, hero, points, reasons }: {
  homes: HomeCard[]; hero: { src: string; alt: string }; points: { key: string; lat: number; lon: number }[]; reasons: React.ReactNode;
}) {
  const s = useStays("f");
  // "From $X / night" before dates (Oscar, Nov 17): per night incl. cleaning and damage waiver, before taxes.
  const [fromP, setFromP] = useState<Record<string, number>>({});
  useEffect(() => { fetch("/api/from-prices").then((r) => r.ok ? r.json() : null).then((j) => { if (j?.from) setFromP(j.from); }).catch(() => {}); }, []);
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
  // Oscar, Nov 17: pick a neighborhood -> one circle around its homes on the map (none on load; picking another replaces it).
  // Oscar (later, Nov 17): one neighborhood is always selected; Tobin Hill to start.
  const areaOf = (name: string): Area => ({ name, keys: homes.filter((h) => h.area === name).map((h) => h.key) });
  const [selected, setArea] = useState<Area>(() => areaOf(areas[0]!));
  const [hot, setHot] = useState<string | null>(null);
  // Saved homes (hearts) in this browser; "Saved" shows only those (Oscar, Nov 19).
  const [saved, toggleSaved] = useSaved(homes.map((h) => h.key));
  const savedCount = homes.filter((h) => saved[h.key]).length;
  const [onlySaved, setOnlySaved] = useState(false);
  // The Saved filter lives in the URL (?saved=1) like the search, so Back (link or browser) restores it.
  useEffect(() => { if (new URLSearchParams(location.search).get("saved") === "1") setOnlySaved(true); }, []);
  const hadSaved = useRef(false);
  useEffect(() => { if (savedCount) hadSaved.current = true; else if (hadSaved.current) setOnlySaved(false); }, [savedCount]);
  useEffect(() => {
    const u = new URL(location.href);
    if (onlySaved) u.searchParams.set("saved", "1"); else u.searchParams.delete("saved");
    if (u.href !== location.href) history.replaceState(history.state, "", u);
  }, [onlySaved]);
  // Back from a listing (?card=<home>): once the results are on screen, bring that home's card into view, then drop
  // the param so a reload or a later visit doesn't jump again. Only for returns to the same results.
  useEffect(() => {
    const u = new URL(location.href), key = u.searchParams.get("card");
    if (!key || !/^[a-z0-9-]{2,20}$/.test(key)) return;
    const waiting = u.searchParams.get("checkIn") && s.state !== "done" && s.state !== "error";
    if (waiting) return;
    requestAnimationFrame(() => {
      document.getElementById(`home-${key}`)?.scrollIntoView({ block: "start" });
      u.searchParams.delete("card");
      history.replaceState(history.state, "", u);
    });
  }, [s.state]);
  const link = (slug: string) => s.href(slug, onlySaved ? { saved: "1" } : {});
  const selArea = selected?.name;
  const mapRef = useRef<HTMLDivElement>(null);
  const pickArea = (name: string) => {
    setArea(areaOf(name));
    // Phones: the map sits under the list, so bring it into view.
    const m = mapRef.current;
    if (m && matchMedia("(max-width: 899px)").matches) {
      const r = m.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight) m.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }
  };
  const card = (h: HomeCard, i: number) => {
    const r = s.results[h.key];
    const off = searched && r && !r.ok;
    const on = !!saved[h.key];
    return (
      <li key={h.key} id={`home-${h.key}`} className={`F-card${off ? " is-off" : ""}`} data-reveal onClickCapture={(e) => {
        // Remember which card was opened in this page's own URL, so the browser Back button also returns to it.
        if (!(e.target as HTMLElement).closest("a[href^='/homes/']")) return;
        const u = new URL(location.href); u.searchParams.set("card", h.key); history.replaceState(history.state, "", u);
      }}>
        <Photos h={h} href={link(h.slug)} first={i === 0} />
        <button type="button" className={"F-heart" + (on ? " is-on" : "")} aria-pressed={on} aria-label={on ? `Saved: ${h.title}` : `Save ${h.title}`}
          onClick={() => toggleSaved(h.key, "home_card")}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.3 3.4 3.8 6.4C19 15.6 12 20 12 20z" /></svg>
        </button>
        <div className="F-info">
          <p className="F-fit">{h.bestFit}</p>
          <p className="F-meta">{h.area} · {h.rating ? <span>★ {h.rating.value} <span className="F-dim">({h.rating.count} Airbnb guest reviews)</span></span> : <b>New home</b>}</p>
          <h3><a href={link(h.slug)} data-cta="home_card_title" data-cta-home={h.key}>{h.title}</a></h3>
          <p className="F-dim">{h.guests} guests · {h.bedrooms} bedrooms · {h.beds} beds · {h.baths} bath{h.baths === 1 ? "" : "s"}</p>
          <ul className="F-points">{h.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <div className="F-buy">
            <p className="F-price">
              {s.state === "loading" ? <span className="F-dim">Checking these dates…</span>
                : !searched || !r ? (fromP[h.key] != null
                  ? <><span className="F-from">From <b>{money(fromP[h.key]!)}</b> / night</span><span>before taxes · add dates for your exact total</span></>
                  : <span className="F-dim">Add dates for the total</span>)
                : r.ok ? <><b>{money(r.total!)}</b><span>total for {nights} night{nights === 1 ? "" : "s"}, taxes included</span></>
                : <><span className="F-dim">{r.reason}</span>{r.reason !== `Sleeps ${h.guests}` && <button type="button" className="F-retry" onClick={toSearch}>Try other dates</button>}</>}
            </p>
            <a className="F-cta" href={link(h.slug)} data-cta="home_card_view" data-cta-home={h.key} aria-label={`View ${h.title}`}>View home</a>
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
      {/* Phones (Oscar, Nov 19): a way to look at the homes without entering dates. */}
      <p className="F-browseAll"><a href="#homes" data-cta="hero_browse_all">Browse all 5 homes <span aria-hidden="true">↓</span></a></p>

      {reasons}

      <section className="F-sec F-homes" id="homes" aria-labelledby="homes-h">
        <div className="F-head" data-reveal>
          <h2 id="homes-h">Choose your home</h2>
          {savedCount > 0 && (
            <div className="F-savedBar" role="group" aria-label="Show homes">
              <button type="button" aria-pressed={!onlySaved} onClick={() => setOnlySaved(false)}>All homes</button>
              <button type="button" aria-pressed={onlySaved} onClick={() => setOnlySaved(true)}>♥ Saved ({savedCount})</button>
            </div>
          )}
          <p aria-live="polite">{searched ? `${available} of 5 homes available ${shortDate(s.ci)} – ${shortDate(s.co)} for ${s.adults + s.children} guests. Totals include taxes and fees.` : "Add dates to see each home's exact total, taxes included."}</p>
        </div>
        <ul className="F-list">
          {/* Oscar, Nov 17: after a search, homes that fit the dates and guests move to the top (original order kept within
              each group); the rest stay visible, greyed, below a small divider. */}
          {(searched ? [...homes].sort((x, y) => Number(!s.results[x.key]?.ok) - Number(!s.results[y.key]?.ok)) : homes).filter((h) => !onlySaved || saved[h.key]).flatMap((h, i, list) => {
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
            <p className="F-lead">Near the Pearl, downtown and in Alamo Heights. Select a neighborhood to circle it on the map, or tap a pin to jump to a home.</p>
            <div className="F-hoods">
              {areas.map((area) => {
                const sel = selArea;
                const list = homes.filter((h) => h.area === area);
                const totals = list.map((h) => s.results[h.key]).filter((r) => searched && r?.ok).map((r) => r!.total!);
                return (
                  // Oscar, Nov 17: the whole box selects the neighborhood (the title button stays for keyboard/screen readers;
                  // the home links inside still jump to their cards).
                  <div className={`F-hood${area === sel ? " is-sel" : ""}`} key={area}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) pickArea(area); }}>
                    <div>
                      <h3><button type="button" className="F-hoodBtn" aria-pressed={area === sel} onClick={() => pickArea(area)}>
                        {area}<span className="sr-only">: show on map</span>
                      </button></h3>
                      <p className="F-dim">{list.length} home{list.length > 1 ? "s" : ""}{AREA_NOTE[area] ? ` · ${AREA_NOTE[area]}` : ""}</p>
                    </div>
                    <p className="F-hoodPr">{totals.length ? <>from <b>{money(Math.min(...totals))}</b></> : searched ? <span className="F-dim">Not available</span> : list.some((h) => fromP[h.key] != null) ? <>from <b>{money(Math.min(...list.filter((h) => fromP[h.key] != null).map((h) => fromP[h.key]!)))}</b> / night</> : <span className="F-dim">Add dates</span>}</p>
                    {/* each home on its own row with the same pill as its map pin, so two homes read as two */}
                    <ul className="F-hoodHomes">{list.map((h) => (
                      <li key={h.key}>
                        <a href={`#home-${h.key}`} data-cta="map_neighborhood_home" data-cta-home={h.key} onMouseEnter={() => setHot(h.key)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(h.key)} onBlur={() => setHot(null)}>
                          <span className="F-hoodPill" aria-hidden="true">{pinLabel(h)}</span>
                          <span className="F-hoodName">{h.title}</span>
                          <svg className="F-hoodGo" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                        </a>
                      </li>
                    ))}</ul>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="F-mapCard" ref={mapRef} data-reveal style={{ ["--d" as string]: "120ms" }}>
            <PinMap area={selected} hot={hot} pins={homes.map((h) => ({ ...points.find((p) => p.key === h.key)!, label: pinLabel(h), title: h.title, off: !!(searched && s.results[h.key] && !s.results[h.key]!.ok) }))} />
          </div>
        </div>
      </section>

      <div className={`F-sticky${sticky ? " is-on" : ""}`} aria-hidden={!sticky}>
        <button type="button" className="F-stickyBtn" data-cta="all_homes_sticky_search" tabIndex={sticky ? 0 : -1} onClick={toSearch}>
          {searched ? `Change dates · ${shortDate(s.ci)} – ${shortDate(s.co)}` : "Search homes"}
        </button>
      </div>
    </>
  );
}
