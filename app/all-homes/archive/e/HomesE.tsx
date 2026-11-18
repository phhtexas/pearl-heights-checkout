"use client";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import type { HomeCard } from "@/content/allHomes";
import { SearchBar } from "../../SearchBar";
import { money, shortDate, useStays } from "../../useStays";
import { PinMap } from "../c/PinMap";

/**
 * Mockup E made functional (Oscar, Nov 16): E's design with live parts. Search prices all five homes for real
 * (/api/availability), filter chips use tags derived from each listing, sort works, cards open the listing with the
 * dates, and the map is the real area-level map. Nothing here is hard-coded per date.
 */
const CHIPS = [
  { f: "all", label: "Any home" },
  { f: "pearl", label: "Walk to the Pearl" },
  { f: "downtown", label: "Downtown" },
  { f: "alamo", label: "Alamo Heights" },
  { f: "level", label: "Single level" },
  { f: "kids", label: "Ready for little ones" },
];
const AREA_NOTE: Record<string, string> = { "Tobin Hill": "walk to the Pearl", Lavaca: "walk downtown" };
const Star = () => <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" /></svg>;

export function HomesE({ homes, points }: { homes: HomeCard[]; points: { key: string; lat: number; lon: number }[] }) {
  const s = useStays("e");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<"rec" | "total" | "rating">("rec");
  const searchRef = useRef<HTMLDivElement>(null);
  const searched = s.state === "done";
  const nights = searched && s.ci && s.co ? Math.round((Date.parse(s.co) - Date.parse(s.ci)) / 864e5) : 0;
  const result = (h: HomeCard) => (searched ? s.results[h.key] : undefined);

  const shown = useMemo(() => {
    const list = homes.filter((h) => filter === "all" || h.tags.includes(filter));
    if (sort === "rec") return list;
    const val = (h: HomeCard) => {
      if (sort === "rating") return -(h.rating?.value ?? 0);
      const r = result(h);
      return r?.ok ? r.total! : Number.MAX_SAFE_INTEGER; // unpriced / unavailable last
    };
    return [...list].sort((a, b) => val(a) - val(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homes, filter, sort, s.results, searched]);

  const available = shown.filter((h) => result(h)?.ok).length;
  const line = searched
    ? `${shortDate(s.ci)} – ${shortDate(s.co)} · ${s.adults + s.children} guests · ${filter === "all" ? `${available} of ${homes.length} homes available` : `${shown.length} of ${homes.length} homes match · ${available} available`} · totals include taxes and fees`
    : `${filter === "all" ? `${homes.length} homes` : `${shown.length} of ${homes.length} homes match`} · add dates to see each home's total, taxes and fees included`;

  const toSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    setTimeout(() => searchRef.current?.querySelector<HTMLInputElement>('input[aria-label="Check-in date"]')?.focus({ preventScroll: true }), 450);
  };
  const areas = [...new Set(homes.map((h) => h.area))];

  return (
    <>
      <section className="E-search-sec" aria-label="Search homes">
        <div className="E-wrap" ref={searchRef}>
          <SearchBar s={s} cls="E-search" icons />
          <div className="E-chips" role="group" aria-label="Filter homes">
            {CHIPS.map((c) => (
              <button key={c.f} type="button" className={`E-chip${filter === c.f ? " on" : ""}`} aria-pressed={filter === c.f} onClick={() => setFilter(c.f)}>{c.label}</button>
            ))}
          </div>
        </div>
      </section>

      <section id="homes" className="E-wrap">
        <div className="E-sec-head">
          <div>
            <h2>{searched ? "Stays for your dates" : "Our homes"}</h2>
            <p id="avail-line" aria-live="polite">{s.state === "loading" ? "Checking your dates…" : line}</p>
          </div>
          <label className="E-right E-sort">Sort:{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort homes">
              <option value="rec">Recommended</option>
              <option value="total" disabled={!searched}>Lowest total{searched ? "" : " (add dates)"}</option>
              <option value="rating">Highest rated</option>
            </select>
          </label>
        </div>
        <div className="E-grid" id="homegrid">
          {shown.map((h, i) => {
            const r = result(h);
            const off = !!r && !r.ok;
            const tooSmall = off && r!.reason === `Sleeps ${h.guests}`;
            return (
              <article key={h.key} id={`home-${h.key}`} className={`E-card${off ? " unavailable" : ""}`}>
                <div className="E-ph">
                  <Image src={h.photos[0]!.src} alt={h.photos[0]!.alt} fill sizes="(min-width: 1100px) 560px, (min-width: 760px) 45vw, 100vw" priority={i < 2} />
                  <span className="E-badge">{h.bestFit}</span>
                  {off && <span className="E-unavail">{r!.reason}</span>}
                </div>
                <div className="E-info">
                  <div className="E-top">
                    <h3><a className="E-stretch" href={s.href(h.slug)}>{h.title}</a></h3>
                    {h.rating ? <span className="E-rating"><Star />{h.rating.value}</span> : <span className="E-rating" style={{ color: "var(--muted)" }}>New</span>}
                  </div>
                  <div className="E-meta">{h.area} · {h.guests} guests · {h.bedrooms} bedrooms · {h.beds} beds · {h.baths} bath{h.baths === 1 ? "" : "s"}{h.rating ? ` · ${h.rating.count} Airbnb reviews` : ""}</div>
                  <div className="E-tags">{h.points.map((p) => <span key={p}>{p}</span>)}</div>
                  <div className="E-foot">
                    {off && !tooSmall ? <button type="button" className="E-loc E-retry" onClick={toSearch}>Try other dates</button> : <span className="E-loc">{off ? "Too many guests for this home" : ""}</span>}
                    <div className="E-price">
                      {s.state === "loading" ? <small>Checking…</small>
                        : !searched || !r ? <><b>Add dates</b><small>for the total, taxes included</small></>
                        : r.ok ? <><b>{money(r.total!)}</b><small>total · {nights} night{nights === 1 ? "" : "s"}, taxes included</small></>
                        : <><b style={{ color: "var(--muted)" }}>—</b><small>{tooSmall ? r.reason : "dates unavailable"}</small></>}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {shown.length === 0 && <p className="E-none">No homes match that filter. <button type="button" onClick={() => setFilter("all")}>Show all homes</button></p>}
          <div className="E-card-help">
            <div className="E-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" /></svg></div>
            <h3>Not sure which home fits?</h3>
            <p>Tell us your dates and your group, and we&apos;ll point you to the right home. We usually reply within an hour.</p>
            <a href="mailto:bookings@pearlheightshomes.com">Ask Oscar &amp; Fernanda →</a>
          </div>
        </div>
      </section>

      <section className="E-mapsec" id="locations">
        <div className="E-wrap E-inner">
          <div>
            <h2>Where the homes <em>are</em></h2>
            <p className="E-lead">Near the Pearl, downtown and in Alamo Heights. Tap a pin or a home to jump to it.</p>
            <div className="E-hoods">
              {areas.map((area) => {
                const list = homes.filter((h) => h.area === area);
                const totals = list.map(result).filter((r) => r?.ok).map((r) => r!.total!);
                return (
                  <div className="E-hood" key={area}>
                    <div>
                      <div className="E-nm">{area}</div>
                      <div className="E-ct">{list.length} home{list.length > 1 ? "s" : ""}{AREA_NOTE[area] ? ` · ${AREA_NOTE[area]}` : ""}</div>
                      <ul className="E-hoodHomes">{list.map((h) => <li key={h.key}><a href={`#home-${h.key}`}>{h.title}</a></li>)}</ul>
                    </div>
                    <div className="E-pr">{totals.length ? `from ${money(Math.min(...totals))}` : searched ? "Not available" : "Add dates"}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="E-mapcard">
            <PinMap pins={homes.map((h) => {
              const r = result(h);
              return { ...points.find((p) => p.key === h.key)!, title: h.title, off: !!r && !r.ok, label: r ? (r.ok ? money(r.total!) : "Unavailable") : h.rating ? `★ ${h.rating.value}` : "New" };
            })} />
          </div>
        </div>
      </section>
    </>
  );
}
