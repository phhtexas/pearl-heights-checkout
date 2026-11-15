"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeContent } from "@/content/homes";
import type { Quote } from "@/domain/quote";
import { track } from "@/client/track";
import "./listing.css";

/**
 * Listing page template (736 Myrtle first; ChatGPT notes 138–139). Airbnb patterns adopted: hero gallery + "Show all
 * photos", title/capacity/rating up top, highlights, sleeping arrangement, top amenities + "show all", reviews, host,
 * things to know, sticky booking card (desktop) and sticky price bar (phone). Direct-booking changes: the full total
 * (with cleaning, waiver and taxes) appears as soon as dates are picked, and "Reserve" goes straight into Checkout E
 * with the same home, dates and guests.
 */
type Day = { date: string; available: boolean; price: number; minStay: number; closedForCheckin?: boolean; closedForCheckout?: boolean };
type Prop = { key: string; name: string; maxGuests: number; extraGuestFrom: number; extraGuestFee: number };
type Sheet = null | "photos" | "dates" | "guests" | "amenities" | "reviews" | "breakdown";

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const nightsOf = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function Listing({ home, prop, policy }: { home: HomeContent; prop: Prop; policy: string[] }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ci, setCi] = useState<string | null>(null);
  const [co, setCo] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ ci: string | null; co: string | null }>({ ci: null, co: null });
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0), [infants, setInfants] = useState(0);
  const [gDraft, setGDraft] = useState({ adults: 2, children: 0, infants: 0 }); // guests sheet edits apply on Save (one re-quote)
  const [days, setDays] = useState<Day[]>([]);
  const [calErr, setCalErr] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qState, setQState] = useState<"idle" | "loading" | "error" | "unavailable">("idle");
  const [qErr, setQErr] = useState("");
  const [slide, setSlide] = useState(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);
  const guests = adults + children;
  const photo = (i: number) => home.photoBase + home.photos[i]!.id + ".jpg";

  useEffect(() => { track("property_viewed", { property: prop.key }, "pv"); }, [prop.key]);
  useEffect(() => {
    fetch(`/api/calendar?property=${prop.key}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.days) setDays(j.days); else setCalErr(j.error ?? "Availability is temporarily unavailable."); })
      .catch(() => setCalErr("Availability is temporarily unavailable. Please try again."));
  }, [prop.key]);
  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);

  // Quote whenever dates/guests change; never show a stale price (older responses are ignored).
  useEffect(() => {
    if (!ci || !co) { setQuote(null); setQState("idle"); return; }
    const id = ++reqId.current;
    setQuote(null); setQState("loading"); setQErr("");
    track("availability_searched", { property: prop.key, nights: nightsOf(ci, co), guests, lead_days: nightsOf(new Date().toISOString().slice(0, 10), ci) });
    fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: prop.key, checkIn: ci, checkOut: co, adults, children, infants, payPlan: "full" }) })
      .then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }))
      .then(({ ok, status, j }) => {
        if (id !== reqId.current) return;
        if (!ok) { setQState(status === 409 ? "unavailable" : "error"); setQErr(j.error ?? "We couldn't price these dates."); return; }
        setQuote(j.quote); setQState("idle");
        track("quote_viewed", { property: prop.key, nights: j.quote.nights, guests, total_cents: j.quote.total, non_refundable: j.quote.nonRefundable }, "qv" + j.quoteId);
      })
      .catch(() => { if (id === reqId.current) { setQState("error"); setQErr("We couldn't reach our booking system. Please try again."); } });
  }, [ci, co, adults, children, infants, prop.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sheets: focus in, Tab trapped, Escape closes, focus back to the opener.
  useEffect(() => {
    if (!sheet) { opener.current?.focus?.(); return; }
    const el = sheetRef.current;
    el?.querySelector<HTMLElement>("button, [href], input, select")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSheet(null); return; }
      if (e.key !== "Tab" || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), [href]")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1]!.focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0]!.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [sheet]);
  const open = useCallback((s: Exclude<Sheet, null>) => {
    opener.current = document.activeElement as HTMLElement;
    if (s === "dates") { setDraft({ ci, co }); if (ci) setMonth(ci.slice(0, 7)); }
    if (s === "guests") setGDraft({ adults, children, infants });
    setSheet(s);
  }, [ci, co, adults, children, infants]);

  function pickDay(iso: string) {
    if (!draft.ci || draft.co || iso <= draft.ci) { setDraft({ ci: iso, co: null }); return; }
    setDraft({ ci: draft.ci, co: iso });
  }
  function saveDates() {
    if (!draft.ci || !draft.co) return;
    setCi(draft.ci); setCo(draft.co); setSheet(null);
    track("dates_selected", { property: prop.key, nights: nightsOf(draft.ci, draft.co), check_in_month: draft.ci.slice(0, 7) }, "ds" + draft.ci + draft.co);
  }
  function reserve() {
    if (!quote || !ci || !co) return;
    track("checkout_started", { property: prop.key, nights: quote.nights, guests, total_cents: quote.total }, "cs" + ci + co + guests);
    // Hands off to Checkout E (unchanged): it re-quotes server-side and starts its own 15-minute price lock.
    location.href = `/?home=${prop.key}&checkIn=${ci}&checkOut=${co}&adults=${guests}`;
  }

  const dayState = (iso: string) => {
    const d = byDate[iso];
    if (!d) return { ok: false, price: "" };
    if (draft.ci && !draft.co && iso > draft.ci) {
      const min = byDate[draft.ci]?.minStay ?? 2;
      let free = true;
      for (let x = draft.ci; x < iso; x = addDays(x, 1)) if (!byDate[x]?.available) { free = false; break; }
      return { ok: free && nightsOf(draft.ci, iso) >= min && !d.closedForCheckout, price: "" };
    }
    return { ok: d.available && !d.closedForCheckin, price: d.available ? "$" + Math.round(d.price / 100) : "" };
  };
  const monthGrid = (m: string) => {
    const [y, mo] = m.split("-").map(Number) as [number, number];
    const pad = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { pad, list: Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`) };
  };
  const shift = (k: number) => { const [y, m] = month.split("-").map(Number) as [number, number]; setMonth(new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7)); };
  const nextMonth = (() => { const [y, m] = month.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); })();
  const minNights = draft.ci ? byDate[draft.ci]?.minStay ?? 2 : 2;
  const folded = quote ? quote.lodging + quote.extraGuestFee + quote.cleaning + quote.protection : 0;

  const renderMonth = (m: string) => {
    const g = monthGrid(m);
    return (
      <div className="L-month" key={m}>
        <div className="L-monthName">{new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" })}</div>
        <div className="grid">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} className="dow">{d}</div>)}
          {Array.from({ length: g.pad }, (_, i) => <div key={"p" + i} />)}
          {g.list.map((iso) => {
            const s = dayState(iso);
            const cls = "day" + (iso === draft.ci || iso === draft.co ? " sel" : draft.ci && draft.co && iso > draft.ci && iso < draft.co ? " in" : "");
            const why = !byDate[iso] ? "not available" : !s.ok ? (draft.ci && !draft.co && iso > draft.ci ? "not available as check-out (booked night or under the minimum stay)" : "booked or not available for check-in") : s.price ? s.price + " per night" : "available";
            return <button key={iso} className={cls} disabled={!s.ok} onClick={() => pickDay(iso)} aria-pressed={iso === draft.ci || iso === draft.co}
              aria-label={`${new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })}, ${why}`}>{Number(iso.slice(8))}<small>{s.price}</small></button>;
          })}
        </div>
      </div>
    );
  };

  // Booking card (desktop sticky, phone inline under the gallery).
  const booking = (
    <div className="L-book" aria-label="Check availability">
      <div className="L-bookHead">{quote ? <><b>{money(quote.total)}</b> <span>total for {quote.nights} nights</span></> : <b>Add dates for prices</b>}</div>
      <div className="L-fields">
        <button className="L-field" onClick={() => open("dates")}><span>Check-in</span>{ci ? fmt(ci) : "Add date"}</button>
        <button className="L-field" onClick={() => open("dates")}><span>Check-out</span>{co ? fmt(co) : "Add date"}</button>
        <button className="L-field wide" onClick={() => open("guests")}><span>Guests</span>{guests} {guests === 1 ? "guest" : "guests"}{infants ? `, ${infants} ${infants === 1 ? "infant" : "infants"}` : ""}</button>
      </div>
      {qState === "loading" && <div className="L-status" role="status">Checking availability and price…</div>}
      {qState === "unavailable" && <div className="L-status bad" role="alert">{qErr} Please try other dates.</div>}
      {qState === "error" && <div className="L-status bad" role="alert">{qErr}</div>}
      {quote && (<div className="L-price">
        <div className="ln"><span>{quote.nights} nights × {money(Math.round(folded / quote.nights))}</span><span>{money(folded)}</span></div>
        <div className="ln"><span>Taxes</span><span>{money(quote.tax)}</span></div>
        <div className="ln total"><span>Total <u>USD</u></span><span>{money(quote.total)}</span></div>
        <button className="link tight" onClick={() => open("breakdown")}>Price breakdown</button>
      </div>)}
      {quote
        ? <button className="btn" onClick={reserve}>Reserve</button>
        : <button className="btn" onClick={() => open("dates")}>Check availability</button>}
      {quote && <div className="L-note">{quote.nonRefundable ? "Non-refundable: this stay starts within 7 days." : "Free cancellation within 24 hours after booking."} You won't be charged yet.</div>}
      <ul className="L-trust">
        <li>Book direct with the hosts</li><li>Secure payment by Stripe</li><li>Local hosts, usually reply within an hour</li>
      </ul>
    </div>
  );

  return (
    <>
      <div className="L-test">Preview · fake calendar and payments · nothing is booked or charged</div>
      <header className="L-top">
        <a href="https://pearlheightshomes.com" className="brand">Pearl Heights <span>HOMES</span></a>
        <a className="L-ask" href="mailto:bookings@pearlheightshomes.com?subject=Question%20about%20736%20Myrtle">Ask a question</a>
      </header>

      {/* Gallery: phone = swipe carousel; desktop = 1 large + 4 small. */}
      <section className="L-gallery" aria-label="Photos">
        <div className="L-carousel" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {home.photos.slice(0, 12).map((p, i) => (
            <div className="L-slide" key={p.id}>
              <Image src={photo(i)} alt={p.alt} fill sizes="100vw" priority={i === 0} loading={i === 0 ? undefined : "lazy"} style={{ objectFit: "cover" }} />
            </div>))}
        </div>
        <div className="L-grid">
          {home.photos.slice(0, 5).map((p, i) => (
            <button key={p.id} className={"L-cell" + (i === 0 ? " big" : "")} onClick={() => open("photos")} aria-label={`Open photo gallery: ${p.alt}`}>
              <Image src={photo(i)} alt="" fill sizes={i === 0 ? "(min-width: 960px) 560px, 100vw" : "280px"} priority={i === 0} style={{ objectFit: "cover" }} />
            </button>))}
        </div>
        <span className="L-count" aria-hidden="true">{slide + 1} / {home.photos.length}</span>
        <button className="L-all" onClick={() => open("photos")}>Show all {home.photos.length} photos</button>
      </section>

      <div className="L-layout">
        <main className="L-main">
          <section className="L-intro">
            <h1>{home.title}</h1>
            <div className="L-sub">{home.subtitle}</div>
            <div className="L-cap">{home.capacity.guests} guests · {home.capacity.bedrooms} bedrooms · {home.capacity.beds} beds · {home.capacity.baths} baths</div>
            {home.rating && <a className="L-rating" href="#reviews">★ {home.rating.value.toFixed(2)} · {home.rating.count} {home.rating.source}</a>}
          </section>

          {ci && co && <div className="L-mobileBook">{booking}</div>}

          <nav className="L-anchors" aria-label="On this page">
            <a href="#overview">Overview</a><a href="#sleep">Bedrooms</a><a href="#amenities">Amenities</a><a href="#reviews">Reviews</a><a href="#location">Location</a><a href="#know">Things to know</a>
          </nav>

          <section id="overview" className="L-sec">
            <ul className="L-high">{home.highlights.map((h) => <li key={h.title}><b>{h.title}</b><span>{h.text}</span></li>)}</ul>
          </section>

          <section className="L-sec L-hostline">
            <div className="L-avatar" aria-hidden="true">O&amp;F</div>
            <div><b>Hosted by {home.host.names}</b><div className="muted">{home.host.facts[0]} · {home.host.since}</div></div>
          </section>

          <section className="L-sec"><p className="L-p">{home.summary}</p></section>

          <section id="sleep" className="L-sec">
            <h2>Where you'll sleep</h2>
            <div className="L-rooms">{home.sleeping.map((r) => <div key={r.room} className="L-room"><b>{r.room}</b><span>{r.beds}</span></div>)}</div>
          </section>

          <section id="amenities" className="L-sec">
            <h2>What this home offers</h2>
            <ul className="L-amen">{home.topAmenities.map((a) => <li key={a}>{a}</li>)}</ul>
            <button className="btn ghost L-inline" onClick={() => open("amenities")}>Show all amenities</button>
          </section>

          <section className="L-sec">
            <h2>Is this home right for you?</h2>
            <div className="L-fit">
              <div><h3>Great for</h3><ul>{home.goodFit.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><h3>Not a fit for</h3><ul>{home.notFit.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
          </section>

          {home.rating && (
            <section id="reviews" className="L-sec">
              <h2>★ {home.rating.value.toFixed(2)} · {home.rating.count} ratings</h2>
              <p className="muted">Ratings and reviews from Airbnb guests. Reviews are quoted word for word.</p>
              <div className="L-cats">{home.rating.categories.map(([c, v]) => <div key={c}><span>{c}</span><b>{v.toFixed(1)}</b></div>)}</div>
              <div className="L-reviews">{home.reviews.slice(0, 4).map((r) => (
                <figure key={r.name + r.when} className="L-review"><blockquote>{r.text.length > 240 ? r.text.slice(0, 240).replace(/\s\S*$/, "") + "…" : r.text}</blockquote>
                  <figcaption><b>{r.name}</b> · {r.when} · Airbnb</figcaption></figure>))}</div>
              <button className="btn ghost L-inline" onClick={() => open("reviews")}>Show {home.reviews.length} reviews in full</button>
            </section>
          )}

          <section id="location" className="L-sec">
            <h2>Where you'll be</h2>
            <p className="L-p">{home.location.text}</p>
            <ul className="L-list">{home.location.facts.map((f) => <li key={f}>{f}</li>)}</ul>
            {home.location.mapBbox && (
              <div className="L-map">
                <iframe title={`Map of the area around ${home.neighborhood} (approximate, not the exact address)`} loading="lazy" referrerPolicy="no-referrer"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${home.location.mapBbox}&layer=mapnik`} />
                <span className="L-mapArea" aria-hidden="true" />
              </div>)}
            <p className="muted">{home.location.note}</p>
          </section>

          <section className="L-sec L-host">
            <h2>Meet your hosts</h2>
            <div className="L-hostcard">
              <div className="L-avatar big" aria-hidden="true">O&amp;F</div>
              <div><b>{home.host.names}</b><ul>{home.host.facts.map((f) => <li key={f}>{f}</li>)}</ul></div>
            </div>
            <p className="L-p">{home.host.bio}</p>
            <a className="btn ghost L-inline" href="mailto:bookings@pearlheightshomes.com?subject=Question%20about%20736%20Myrtle">Ask us a question</a>
          </section>

          <section id="know" className="L-sec">
            <h2>Things to know</h2>
            <div className="L-know">
              {home.thingsToKnow.map((t) => <div key={t.title}><h3>{t.title}</h3><ul>{t.items.map((i) => <li key={i}>{i}</li>)}</ul></div>)}
              <div><h3>Cancellation</h3><ul>{policy.map((p) => <li key={p}>{p}</li>)}</ul></div>
            </div>
          </section>

          <section className="L-sec">
            <h2>Questions</h2>
            {home.faq.map((f) => <details key={f.q} className="L-faq"><summary>{f.q}</summary><p>{f.a}</p></details>)}
            <p className="muted small">City short-term rental registration {home.registration}</p>
          </section>
        </main>
        <aside className="L-side">{booking}</aside>
      </div>

      {/* Phone: one sticky action. */}
      <footer className="L-bar">
        <div>{quote ? <><b>{money(quote.total)}</b><span>{fmt(ci!)} – {fmt(co!)} · {guests} guests</span></> : <><b>Add dates</b><span>for the full price</span></>}</div>
        {quote ? <button className="btn" onClick={reserve}>Reserve</button> : <button className="btn" onClick={() => open("dates")}>Check availability</button>}
      </footer>

      {sheet && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div ref={sheetRef} className={"sheet" + (sheet === "photos" ? " L-full" : "")} role="dialog" aria-modal="true"
            aria-label={{ photos: "All photos", dates: "Select dates", guests: "Guests", amenities: "All amenities", reviews: "Reviews", breakdown: "Price breakdown" }[sheet]}>
            <div className="sheetHead"><h2>{{ photos: "All photos", dates: "Select dates", guests: "Guests", amenities: "All amenities", reviews: "Reviews", breakdown: "Price breakdown" }[sheet]}</h2>
              <button className="x" aria-label="Close" onClick={() => setSheet(null)}>×</button></div>

            {sheet === "photos" && <div className="L-photos">{home.photos.map((p, i) => (
              <figure key={p.id}><div className="L-ph"><Image src={photo(i)} alt={p.alt} fill sizes="(min-width: 960px) 900px, 100vw" loading="lazy" style={{ objectFit: "cover" }} /></div><figcaption>{p.alt}</figcaption></figure>))}</div>}

            {sheet === "dates" && (<>
              {calErr && <div className="L-status bad" role="alert">{calErr}</div>}
              <div className="row"><button className="nav" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
                <div className="center muted small">{draft.ci ? `Minimum stay: ${minNights} nights` : "Choose check-in"}</div>
                <button className="nav" aria-label="Next month" onClick={() => shift(1)}>›</button></div>
              <div className="L-months">{renderMonth(month)}<div className="L-second">{renderMonth(nextMonth)}</div></div>
              {days.length === 0 && !calErr && <div className="muted" role="status">Loading availability and prices…</div>}
              <div className="hint">{draft.ci && draft.co ? `${fmt(draft.ci)} – ${fmt(draft.co)} · ${nightsOf(draft.ci, draft.co)} nights` : draft.ci ? "Now choose your check-out date." : "Prices shown are per night before cleaning, waiver and taxes."}</div>
              <div className="row"><button className="link" onClick={() => setDraft({ ci: null, co: null })}>Clear dates</button>
                <button className="btn L-save" disabled={!draft.ci || !draft.co} onClick={saveDates}>Save dates</button></div>
            </>)}

            {sheet === "guests" && (<>
              {([["Adults", "Ages 13+", "adults", 1], ["Children", "Ages 2–12", "children", 0], ["Infants", "Under 2", "infants", 0]] as const).map(([l, sub, k, min]) => {
                const v = gDraft[k], total = gDraft.adults + gDraft.children;
                return (<div key={l} className="row gr"><div><b>{l}</b><div className="muted">{sub}</div></div><span className="stepper">
                  <button aria-label={"Fewer " + l} disabled={v <= min} onClick={() => setGDraft({ ...gDraft, [k]: v - 1 })}>−</button><b>{v}</b>
                  <button aria-label={"More " + l} disabled={k === "infants" ? v >= 6 : total >= prop.maxGuests} onClick={() => setGDraft({ ...gDraft, [k]: v + 1 })}>+</button></span></div>);
              })}
              <div className="muted">Sleeps {prop.maxGuests}. Infants don't count toward the limit.{gDraft.adults + gDraft.children > prop.extraGuestFrom ? ` Extra-guest fee ${money(prop.extraGuestFee)}/night for each guest over ${prop.extraGuestFrom}.` : ""}</div>
              <button className="btn" onClick={() => { setAdults(gDraft.adults); setChildren(gDraft.children); setInfants(gDraft.infants); setSheet(null); }}>Save guests</button>
            </>)}

            {sheet === "amenities" && home.amenityGroups.map((g) => <div key={g.group}><h3>{g.group}</h3><ul className="L-list">{g.items.map((i) => <li key={i}>{i}</li>)}</ul></div>)}

            {sheet === "reviews" && home.reviews.map((r) => <figure key={r.name + r.when} className="L-review"><blockquote>{r.text}</blockquote><figcaption><b>{r.name}</b> · {r.when} · Airbnb</figcaption></figure>)}

            {sheet === "breakdown" && quote && (<>
              <div className="ln"><span>{quote.nights} nights</span><span>{money(quote.lodging)}</span></div>
              {quote.extraGuestFee > 0 && <div className="ln"><span>Extra guests</span><span>{money(quote.extraGuestFee)}</span></div>}
              <div className="ln"><span>Cleaning</span><span>{money(quote.cleaning)}</span></div>
              <div className="ln"><span>Damage waiver — $5,000 coverage</span><span>{money(quote.protection)}</span></div>
              <div className="ln"><span>Taxes</span><span>{money(quote.tax)}</span></div>
              <div className="ln total"><span>Total (USD)</span><span>{money(quote.total)}</span></div>
              <div className="muted small">Tax shown is an example rate until confirmed by our accountant.</div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
