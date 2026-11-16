"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeContent } from "@/content/homes";
import type { Quote } from "@/domain/quote";
import { track } from "@/client/track";
import { Icon, iconFor } from "./icons";
import "./listing.css";
import "./listingA.css";

/**
 * Listing option A (Oscar's Nov 15 reference layout), filled with the real 736 photos and copy so it can be compared
 * side by side with the current listing page. Layout and behavior follow the reference: photo carousel with dots,
 * share/save, highlights, about (show more), sleeping cards with photos, amenities, location, reviews, house rules,
 * cancellation, trust row, and one sticky bar with the price and Reserve. Booking logic is the same as the current page
 * (live calendar, server quote, hand-off to Checkout E).
 */
type Day = { date: string; available: boolean; price: number; minStay: number; closedForCheckin?: boolean; closedForCheckout?: boolean };
type Prop = { key: string; name: string; maxGuests: number; extraGuestFrom: number; extraGuestFee: number };
type Sheet = null | "dates" | "guests" | "amenities";

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: c % 100 ? 2 : 0 });
const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const nightsOf = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${fmt(a)}–${Number(b.slice(8))}` : `${fmt(a)} – ${fmt(b)}`);

/** Room-card photos (best match from the gallery; room labels still to be confirmed by Oscar). */
const ROOM_PHOTOS = [
  "AMyRewULeO20lFQFkRFWrNe7c3vr7OYCIKAQATmP", "jZCUKfTCluAkxsNcIkwKlg4tbbcWnFByKScze6A8", "c4KYo3CgFK4Kkh12P5auyXNIqTYFAzS3ihZCkw5F",
  "QSN5MvVxsp5HP1pUba2bAbXmVYaHMIrBTO2jMvn3", "eMTLaWUswh02vPrOIB3bXluq8osxAB5Weit9PXTi", "1bi1pgTc4hSHL1561okYKpWcH4kuKZaTvokSvrJX",
];
const HERO = 5; // the reference shows five dots

export function ListingA({ home, prop, policy }: { home: HomeContent; prop: Prop; policy: string[] }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [ci, setCi] = useState<string | null>(null);
  const [co, setCo] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ ci: string | null; co: string | null }>({ ci: null, co: null });
  const [adults, setAdults] = useState(2), [children, setChildren] = useState(0), [infants, setInfants] = useState(0);
  const [gDraft, setGDraft] = useState({ adults: 2, children: 0, infants: 0 });
  const [days, setDays] = useState<Day[]>([]);
  const [calErr, setCalErr] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qState, setQState] = useState<"idle" | "loading" | "error" | "unavailable">("idle");
  const [qErr, setQErr] = useState("");
  const [slide, setSlide] = useState(0);
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState("");
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);
  const guests = adults + children;
  const src = (id: string) => home.photoBase + id + ".jpg";

  useEffect(() => { track("property_viewed", { property: prop.key, variant: "A" }, "pv"); }, [prop.key]);
  useEffect(() => { try { setSaved(localStorage.getItem("ph-saved-" + prop.key) === "1"); } catch { /* no storage */ } }, [prop.key]);
  useEffect(() => {
    fetch(`/api/calendar?property=${prop.key}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.days) setDays(j.days); else setCalErr(j.error ?? "Availability is temporarily unavailable."); })
      .catch(() => setCalErr("Availability is temporarily unavailable. Please try again."));
  }, [prop.key]);
  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);

  // Quote whenever dates/guests change; never show a stale price.
  useEffect(() => {
    if (!ci || !co) { setQuote(null); setQState("idle"); return; }
    const id = ++reqId.current;
    setQuote(null); setQState("loading"); setQErr("");
    track("availability_searched", { property: prop.key, nights: nightsOf(ci, co), guests, lead_days: nightsOf(new Date().toISOString().slice(0, 10), ci), variant: "A" });
    fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: prop.key, checkIn: ci, checkOut: co, adults, children, infants, payPlan: "full" }) })
      .then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }))
      .then(({ ok, status, j }) => {
        if (id !== reqId.current) return;
        if (!ok) { setQState(status === 409 ? "unavailable" : "error"); setQErr(j.error ?? "We couldn't price these dates."); return; }
        setQuote(j.quote); setQState("idle");
        track("quote_viewed", { property: prop.key, nights: j.quote.nights, guests, total_cents: j.quote.total, non_refundable: j.quote.nonRefundable, variant: "A" }, "qv" + j.quoteId);
      })
      .catch(() => { if (id === reqId.current) { setQState("error"); setQErr("We couldn't reach our booking system. Please try again."); } });
  }, [ci, co, adults, children, infants, prop.key]); // eslint-disable-line react-hooks/exhaustive-deps

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
    track("dates_selected", { property: prop.key, nights: nightsOf(draft.ci, draft.co), check_in_month: draft.ci.slice(0, 7), variant: "A" }, "ds" + draft.ci + draft.co);
  }
  function reserve() {
    if (!quote || !ci || !co) return;
    track("checkout_started", { property: prop.key, nights: quote.nights, adults, children, infants, total_cents: quote.total, variant: "A" }, "cs" + ci + co + adults + "-" + children + "-" + infants);
    location.href = `/?home=${prop.key}&checkIn=${ci}&checkOut=${co}&adults=${adults}&children=${children}&infants=${infants}`;
  }
  async function share() {
    const url = location.href.split("?")[0]!;
    try {
      if (navigator.share) { await navigator.share({ title: home.title, url }); return; }
      await navigator.clipboard.writeText(url); setShared("Link copied");
    } catch { setShared(""); }
    setTimeout(() => setShared(""), 2500);
  }
  function toggleSave() {
    const v = !saved; setSaved(v);
    try { localStorage.setItem("ph-saved-" + prop.key, v ? "1" : "0"); } catch { /* no storage */ }
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
  const minNights = draft.ci ? byDate[draft.ci]?.minStay ?? 2 : 2;
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

  // Copy, all from the 736 content file (same sources as the current page).
  const tk = (t: string) => home.thingsToKnow.find((x) => x.title === t)?.items ?? [];
  const find = (list: string[], re: RegExp) => list.find((x) => re.test(x));
  const checkIO = tk("Check-in and check-out"), rules = tk("House rules"), safety = tk("Safety and property");
  const houseRules = [
    `${checkIO[0]} · ${checkIO[1]}`, checkIO[2], find(rules, /parties/), find(rules, /smok/), find(rules, /pets/i), find(rules, /^Up to/), find(rules, /quiet/i), find(safety, /camera/),
  ].filter(Boolean) as string[];
  const amenityCount = home.amenityGroups.reduce((n, g) => n + g.items.length, 0);
  const roomPhoto = (i: number) => ROOM_PHOTOS[i] ?? ROOM_PHOTOS[0]!;
  const roomAlt = (id: string) => home.photos.find((p) => p.id === id)?.alt ?? "";

  return (
    <div className="A-page">
      <div className="A-test">Listing option A · Preview · nothing is booked or charged</div>
      <header className="A-top">
        <span aria-hidden="true" className="A-topSide" />
        <a href="https://pearlheightshomes.com" className="A-brand">Pearl Heights <span>HOMES</span></a>
        <div className="A-acts">
          <button className="A-round" onClick={share} aria-label="Share this home"><Icon name="share" size={18} /></button>
          <button className={"A-round" + (saved ? " A-saved" : "")} onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Saved" : "Save this home"}><Icon name="heart" size={18} /></button>
        </div>
      </header>
      {shared && <div className="A-toast" role="status">{shared}</div>}

      <section className="A-hero" aria-label="Photos">
        <div className="A-carousel" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {home.photos.slice(0, HERO).map((p, i) => (
            <div className="A-slide" key={p.id}>
              <Image src={src(p.id)} alt={p.alt} fill sizes="(min-width: 600px) 560px, 100vw" priority={i === 0} loading={i === 0 ? undefined : "lazy"} style={{ objectFit: "cover" }} />
            </div>))}
        </div>
        <div className="A-dots" aria-hidden="true">{Array.from({ length: HERO }, (_, i) => <span key={i} className={i === slide ? "on" : ""} />)}</div>
      </section>

      <main className="A-main">
        <section className="A-intro">
          <h1>{home.title}</h1>
          <div className="A-sub">{home.neighborhood}, San Antonio</div>
          {home.rating && <a className="A-rating" href="#reviews"><Icon name="star" size={14} />{home.rating.value.toFixed(2)} · {home.rating.count} reviews</a>}
          <div className="A-cap">Entire home · {home.capacity.bedrooms} bedrooms · {home.capacity.beds} beds · {home.capacity.baths} baths · sleeps {home.capacity.guests}</div>
        </section>

        <section className="A-host">
          <div className="A-avatar" aria-hidden="true">O&amp;F</div>
          <div><b>Hosted by {home.host.names}</b><span>{home.host.facts[0]} · {home.host.facts.find((f) => /reply/i.test(f)) ?? ""}</span></div>
        </section>

        <ul className="A-high">{home.highlights.map((h) => <li key={h.title}><Icon name={iconFor(h.title)} size={18} /><div><b>{h.title}</b><span>{h.text}</span></div></li>)}</ul>

        <section className="A-sec">
          <h2>About this home</h2>
          <p className={"A-p" + (more ? "" : " A-clamp")}>{home.summary}</p>
          <button className="A-more" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Show less" : "Show more"}</button>
        </section>

        <section className="A-sec">
          <h2>Sleeping arrangements</h2>
          <div className="A-rooms">{home.sleeping.map((r, i) => (
            <div key={r.room} className="A-room">
              <div className="A-roomPh"><Image src={src(roomPhoto(i))} alt={roomAlt(roomPhoto(i))} fill sizes="170px" loading="lazy" style={{ objectFit: "cover" }} /></div>
              <div className="A-roomTx"><b>{r.room}</b><span>{r.beds}</span></div>
            </div>))}
          </div>
        </section>

        <section className="A-sec">
          <h2>Amenities</h2>
          <ul className="A-list">{home.topAmenities.map((a) => <li key={a}><Icon name={iconFor(a)} size={18} />{a}</li>)}</ul>
          <button className="A-outline" onClick={() => open("amenities")}>Show all {amenityCount} amenities</button>
        </section>

        <section className="A-sec">
          <h2>Location</h2>
          {home.location.mapBbox && (
            <div className="A-map">
              <iframe title={`Map of the area around ${home.neighborhood} (approximate, not the exact address)`} loading="lazy" referrerPolicy="no-referrer"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${home.location.mapBbox}&layer=mapnik`} />
              <span className="A-mapArea" aria-hidden="true" />
              <span className="A-mapTag">Approximate area</span>
            </div>)}
          <p className="A-p">{home.location.text} {home.location.facts.map((f) => f + ".").join(" ")} {home.location.note}</p>
        </section>

        {home.rating && (
          <section id="reviews" className="A-sec">
            <h2>Reviews</h2>
            <div className="A-score"><Icon name="star" size={14} />{home.rating.value.toFixed(2)} · {home.rating.count} reviews</div>
            <div className="A-reviews">{home.reviews.map((r) => (
              <figure key={r.name + r.when} className="A-review">
                <blockquote>“{r.text.length > 150 ? r.text.slice(0, 150).replace(/\s\S*$/, "") + "…" : r.text}”</blockquote>
                <figcaption>{r.name} · {r.when}</figcaption>
              </figure>))}
            </div>
          </section>
        )}

        <section className="A-sec">
          <h2>House rules</h2>
          <ul className="A-list A-rules">{houseRules.map((r, i) => <li key={r}><Icon name={i === 0 ? "clock" : iconFor(r)} size={18} />{r}</li>)}</ul>
        </section>

        <section className="A-sec">
          <h2>Cancellation policy</h2>
          <div className="A-cancel"><Icon name="check" size={18} /><b>{policy[0]}</b></div>
          {policy.slice(1).map((p) => <p key={p} className="A-cancelSub">{p}</p>)}
        </section>

        <ul className="A-badges" aria-label="Booking direct">
          <li><Icon name="home" size={18} /><b>Book direct</b><span>with the hosts</span></li>
          <li><Icon name="lock" size={18} /><b>Secure payment</b><span>by Stripe</span></li>
          <li><Icon name="chat" size={18} /><b>Local hosts</b><span>reply within an hour</span></li>
          <li><Icon name="shield" size={18} /><b>Damage waiver</b><span>included</span></li>
        </ul>
      </main>

      <footer className="A-bar">
        <div className="A-barL">
          {quote
            ? <b>{money(quote.total)} <small>total</small></b>
            : <b>{qState === "loading" ? "Checking…" : "Add dates"}</b>}
          {ci && co
            ? <span className="A-barLinks"><button onClick={() => open("dates")}>{range(ci, co)}</button> · <button onClick={() => open("guests")}>{guests} {guests === 1 ? "guest" : "guests"}</button></span>
            : <span className="A-barSub">for the full price</span>}
          {(qState === "unavailable" || qState === "error") && <span className="A-barErr" role="alert">{qErr}</span>}
        </div>
        {quote ? <button className="A-cta" onClick={reserve}>Reserve</button> : <button className="A-cta" onClick={() => open("dates")}>Check availability</button>}
      </footer>

      {sheet && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={{ dates: "Select dates", guests: "Guests", amenities: "All amenities" }[sheet]}>
            <div className="sheetHead"><h2>{{ dates: "Select dates", guests: "Guests", amenities: "All amenities" }[sheet]}</h2>
              <button className="x" aria-label="Close" onClick={() => setSheet(null)}>×</button></div>

            {sheet === "dates" && (<>
              {calErr && <div className="L-status bad" role="alert">{calErr}</div>}
              <div className="row"><button className="nav" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
                <div className="center muted small">{draft.ci ? `Minimum stay: ${minNights} nights` : "Choose check-in"}</div>
                <button className="nav" aria-label="Next month" onClick={() => shift(1)}>›</button></div>
              <div className="L-months">{renderMonth(month)}</div>
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
          </div>
        </div>
      )}
    </div>
  );
}
