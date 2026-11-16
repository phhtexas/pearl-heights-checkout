"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeContent } from "@/content/homes";
import type { Quote } from "@/domain/quote";
import { track } from "@/client/track";
import { Icon, iconFor } from "./icons";
import { TileMap } from "./TileMap";
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
type Sheet = null | "dates" | "guests" | "amenities" | "tour" | "map";

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: c % 100 ? 2 : 0 });
const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const nightsOf = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-");
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${fmt(a)}–${Number(b.slice(8))}` : `${fmt(a)} – ${fmt(b)}`);

/** Room-card photos (best match from the gallery; room labels still to be confirmed by Oscar). */
const ROOM_PHOTOS = [
  "AMyRewULeO20lFQFkRFWrNe7c3vr7OYCIKAQATmP", "jZCUKfTCluAkxsNcIkwKlg4tbbcWnFByKScze6A8", "c4KYo3CgFK4Kkh12P5auyXNIqTYFAzS3ihZCkw5F",
  "QSN5MvVxsp5HP1pUba2bAbXmVYaHMIrBTO2jMvn3", "eMTLaWUswh02vPrOIB3bXluq8osxAB5Weit9PXTi", "1bi1pgTc4hSHL1561okYKpWcH4kuKZaTvokSvrJX",
];
const AV_COLORS = ["#c9b8a3", "#a9b9a6", "#b3b8c9", "#c9a9a9", "#b9adc4", "#a7c0c2"]; // soft initial circles for reviewers
const DOTS = 5; // the reference shows five dots; with more photos they track position along the set

/** Photo tour groups, matched from each photo's description (first match wins). Labels describe the space, not a specific bedroom. */
const TOUR: [string, RegExp][] = [
  ["Living room", /^(living|electric fireplace|open living)|sectional|mantel|hallway/i],
  ["Full kitchen", /kitchen|refrigerator|coffee|snack|glassware/i],
  ["Dining area", /dining/i],
  ["Bedrooms", /bed|crib|pillow/i],
  ["Bathrooms", /bath|shower|vanity/i],
  ["Bonus room", /bonus room/i],
  ["Kids' play area", /kids|play table/i],
  ["Workspace", /workspace|desk/i],
  ["Laundry", /laundry|washer/i],
  ["Backyard and patio", /backyard|patio|pergola|lawn chairs/i],
  ["Exterior", /front|house|street|side|driveway|entrance|exterior/i],
  ["Neighborhood", /aerial|neighborhood/i],
];
const groupOf = (alt: string) => {
  if (/bonus room/i.test(alt)) return "Bonus room"; // bonus-room shots also mention the lawn or night lighting
  if (/aerial|neighborhood/i.test(alt)) return "Neighborhood";
  return TOUR.find(([, re]) => re.test(alt))?.[0] ?? "More photos";
};

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
  const [tourFocus, setTourFocus] = useState<{ group: string; id: string } | null>(null); // photo tour opened from a room card
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState("");
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  // As the page scrolls, the content sheet slides over the pinned cover and the cover fades slightly to white.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = heroRef.current;
      if (!h) return;
      const sheet = h.nextElementSibling as HTMLElement | null; // the content sheet that slides over the cover
      if (!sheet) return;
      const p = Math.min(1, Math.max(0, 1 - sheet.getBoundingClientRect().top / Math.max(1, h.offsetHeight)));
      h.style.setProperty("--fade", (p * 0.6).toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const opener = useRef<HTMLElement | null>(null);
  const reqId = useRef(0);
  const guests = adults + children;
  const src = (id: string) => home.photoBase + id + ".jpg";

  useEffect(() => {
    if (sheet !== "tour" || !tourFocus) return;
    const t = setTimeout(() => document.getElementById("tour-" + slugify(tourFocus.group))?.scrollIntoView(), 0);
    return () => clearTimeout(t);
  }, [sheet, tourFocus]);
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
  const tour = useMemo(() => {
    const m = new Map<string, HomeContent["photos"]>();
    for (const p of home.photos) { const g = groupOf(p.alt); m.set(g, [...(m.get(g) ?? []), p]); }
    return [...TOUR.map(([n]) => n), "More photos"].filter((n) => m.has(n)).map((n) => ({ name: n, photos: m.get(n)! }));
  }, [home.photos]);
  const mapPt = useMemo(() => {
    const [w, so, e, n] = (home.location.mapBbox ?? "0,0,0,0").split(",").map(Number) as [number, number, number, number];
    return { lat: (so + n) / 2, lon: (w + e) / 2 }; // bbox center: between the home and the Pearl, never the exact house
  }, [home.location.mapBbox]);
  const roomPhoto = (i: number) => ROOM_PHOTOS[i] ?? ROOM_PHOTOS[0]!;
  const roomAlt = (id: string) => home.photos.find((p) => p.id === id)?.alt ?? "";

  return (
    <div className="A-page">
      <div className="A-test">Test site · nothing is booked or charged</div>
      <header className="A-top">
        <span aria-hidden="true" className="A-topSide" />
        <a href="https://pearlheightshomes.com" className="A-brand">Pearl Heights <span>HOMES</span></a>
        <div className="A-acts">
          <button className="A-round" onClick={share} aria-label="Share this home"><Icon name="share" size={18} /></button>
          <button className={"A-round" + (saved ? " A-saved" : "")} onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Saved" : "Save this home"}><Icon name="heart" size={18} /></button>
        </div>
      </header>
      {shared && <div className="A-toast" role="status">{shared}</div>}

      <section ref={heroRef} className="A-hero" aria-label="Photos">
        <div className="A-carousel" onClick={() => { setTourFocus(null); open("tour"); }} onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {home.photos.map((p, i) => (
            <div className="A-slide" key={p.id}>
              <Image src={src(p.id)} alt={p.alt} fill sizes="(min-width: 600px) 560px, 100vw" priority={i === 0} loading={i === 0 ? undefined : "lazy"} style={{ objectFit: "cover" }} />
            </div>))}
        </div>
        <div className="A-heroFade" aria-hidden="true" />
        <div className="A-dots" aria-hidden="true">{Array.from({ length: DOTS }, (_, i) => <span key={i} className={i === Math.round((slide / Math.max(1, home.photos.length - 1)) * (DOTS - 1)) ? "on" : ""} />)}</div>
        <button className="A-count" onClick={() => { setTourFocus(null); open("tour"); }} aria-label={`Photo ${slide + 1} of ${home.photos.length}. Open the photo tour`}>{slide + 1} / {home.photos.length}</button>
      </section>

      <main className="A-main A-sheet">
        <section className="A-intro">
          <h1>{home.title}</h1>
          <div className="A-sub">{home.neighborhood}, San Antonio · Entire home</div>
          {home.rating && <a className="A-rating" href="#reviews"><Icon name="star" size={14} />{home.rating.value.toFixed(2)} · {home.rating.count} reviews</a>}
          <div className="A-cap">{home.capacity.bedrooms} bedrooms · {home.capacity.beds} beds · {home.capacity.baths} baths · sleeps {home.capacity.guests}</div>
        </section>

        <section className="A-host">
          <HostPhoto home={home} size={44} />
          <div><b>Hosted by {home.host.names}</b><span>{home.host.facts[0]} · {home.host.facts.find((f) => /reply/i.test(f)) ?? ""}</span></div>
        </section>

        <ul id="overview" className="A-high">{home.highlights.map((h) => <li key={h.title}><Icon name={iconFor(h.title)} size={18} /><div><b>{h.title}</b><span>{h.text}</span></div></li>)}</ul>

        <section className="A-sec">
          <h2>About this home</h2>
          <p className={"A-p" + (more ? "" : " A-clamp")}>{home.summary}</p>
          <button className="A-more" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Show less" : "Show more"}</button>
        </section>

        <section id="sleep" className="A-sec">
          <h2>Sleeping arrangements</h2>
          <div className="A-rooms">{home.sleeping.map((r, i) => (
            <button key={r.room} className="A-room" aria-label={`${r.room}: see photos`}
              onClick={() => { const id = roomPhoto(i); setTourFocus({ group: groupOf(roomAlt(id)), id }); open("tour"); }}>
              <div className="A-roomPh"><Image src={src(roomPhoto(i))} alt={roomAlt(roomPhoto(i))} fill sizes="(min-width: 600px) 360px, 70vw" loading="lazy" style={{ objectFit: "cover" }} /></div>
              <div className="A-roomTx"><b>{r.room}</b><span>{r.beds}</span></div>
            </button>))}
          </div>
        </section>

        <section id="amenities" className="A-sec">
          <h2>Amenities</h2>
          <ul className="A-list">{home.topAmenities.map((a) => <li key={a}><Icon name={iconFor(a)} size={18} />{a}</li>)}</ul>
          <button className="A-outline" onClick={() => open("amenities")}>Show all amenities</button>
        </section>

        <section className="A-sec">
          <h2>Is this home right for you?</h2>
          <h3 className="A-h3">Great for</h3>
          <ul className="A-list A-rules">{home.goodFit.map((x) => <li key={x}><Icon name="check" size={18} />{x}</li>)}</ul>
          <h3 className="A-h3">Not a fit for</h3>
          <ul className="A-list A-rules">{home.notFit.map((x) => <li key={x}><Icon name="x" size={18} />{x}</li>)}</ul>
        </section>

        <section id="location" className="A-sec">
          <h2>Location</h2>
          {home.location.mapBbox && (
            <div className="A-map">
              <div role="img" aria-label={`Map of ${home.neighborhood}, approximate location (not the exact address)`}><TileMap lat={mapPt.lat} lon={mapPt.lon} zoom={14} /></div>
              <span className="A-mapTag">Approximate location</span>
              <button className="A-expand" onClick={() => open("map")} aria-label="Open the map full screen"><Icon name="expand" size={20} /></button>
            </div>)}
          <p className="A-p">{home.location.text}</p>
          <ul className="A-list A-rules A-facts">{home.location.facts.map((f) => <li key={f}><Icon name={/drive/.test(f) ? "car" : "walk"} size={18} />{f}</li>)}</ul>
          <p className="A-note">{home.location.note}</p>
        </section>

        {home.rating && (
          <section id="reviews" className="A-sec">
            <h2>Reviews</h2>
            <div className="A-score"><Icon name="star" size={14} />{home.rating.value.toFixed(2)} · {home.rating.count} reviews</div>
            <div className="A-reviews">{home.reviews.map((r) => (
              <figure key={r.name + r.when} className="A-review">
                {r.rating && <div className="A-rstar"><Icon name="star" size={13} />{r.rating.toFixed(1)}</div>}
                <blockquote>“{r.text.length > 150 ? r.text.slice(0, 150).replace(/\s\S*$/, "") + "…" : r.text}”</blockquote>
                <figcaption><span className="A-rav" aria-hidden="true" style={{ background: AV_COLORS[r.name.charCodeAt(0) % AV_COLORS.length] }}>{r.name[0]}</span><span><b>{r.name}</b><br />{r.when} · Airbnb</span></figcaption>
              </figure>))}
            </div>
          </section>
        )}

        <section id="hosts" className="A-sec">
          <h2>Meet your hosts</h2>
          <div className="A-hostcard">
            <HostPhoto home={home} size={72} />
            <div><b>{home.host.names}</b><ul>{home.host.facts.map((f) => <li key={f}>{f}</li>)}</ul></div>
          </div>
          <p className="A-p">{home.host.bio}</p>
          <a className="A-outline" href="mailto:bookings@pearlheightshomes.com?subject=Question%20about%20736%20Myrtle">Ask us a question</a>
        </section>

        <section id="rules" className="A-sec">
          <h2>House rules</h2>
          <ul className="A-list A-rules">{houseRules.map((r, i) => <li key={r}><Icon name={i === 0 ? "clock" : iconFor(r)} size={18} />{r}</li>)}</ul>
        </section>

        <section className="A-sec">
          <h2>Cancellation policy</h2>
          <div className="A-cancel"><Icon name="check" size={18} /><b>{policy[0]}</b></div>
          {policy.slice(1).map((p) => <p key={p} className="A-cancelSub">{p}</p>)}
        </section>

        <section id="faq" className="A-sec">
          <h2>Questions</h2>
          {home.faq.map((f) => <details key={f.q} className="A-faq"><summary>{f.q}<Icon name="chev" size={18} /></summary><p>{f.a}</p></details>)}
          <p className="A-note">City short-term rental registration {home.registration}</p>
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

      {sheet === "tour" && (
        <div ref={sheetRef} className="A-tour" role="dialog" aria-modal="true" aria-label="Photo tour">
          <div className="A-tourTop">
            <button className="A-icoBtn" onClick={() => setSheet(null)} aria-label="Back to the listing"><Icon name="back" size={22} /></button>
            <h2>Photo tour</h2>
            <div className="A-acts">
              <button className="A-icoBtn" onClick={share} aria-label="Share this home"><Icon name="share" size={20} /></button>
              <button className={"A-icoBtn" + (saved ? " A-saved" : "")} onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Saved" : "Save this home"}><Icon name="heart" size={20} /></button>
            </div>
          </div>
          <div className="A-tourThumbs">{tour.map((g) => (
            <a key={g.name} href={"#tour-" + slugify(g.name)} className="A-tourThumb" onClick={(e) => { e.preventDefault(); document.getElementById("tour-" + slugify(g.name))?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className="A-tourThumbPh"><Image src={src(g.photos[0]!.id)} alt="" fill sizes="150px" style={{ objectFit: "cover" }} /></span>
              <span>{g.name}</span>
            </a>))}
          </div>
          {tour.map((g) => (
            <section key={g.name} id={"tour-" + slugify(g.name)} className="A-tourSec">
              <h3>{g.name}</h3>
              <div className="A-tourSub">{g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}</div>
              <div className="A-tourGrid">{(tourFocus?.group === g.name ? [...g.photos.filter((p) => p.id === tourFocus.id), ...g.photos.filter((p) => p.id !== tourFocus.id)] : g.photos).map((p, i) => (
                <figure key={p.id} className={"A-tourPh" + (i % 3 === 0 ? " big" : "")}>
                  <Image src={src(p.id)} alt={p.alt} fill sizes={i % 3 === 0 ? "(min-width: 600px) 528px, 100vw" : "(min-width: 600px) 264px, 50vw"} loading={tourFocus?.group === g.name && i < 3 ? "eager" : "lazy"} style={{ objectFit: "cover" }} />
                </figure>))}
              </div>
            </section>))}
          <div className="A-tourCta">
            {quote ? <button className="A-cta" onClick={reserve}>Reserve</button> : <button className="A-cta" onClick={() => { setSheet(null); setTimeout(() => open("dates"), 0); }}>Check availability</button>}
          </div>
        </div>
      )}

      {sheet === "map" && home.location.mapBbox && (() => {
        return (
          <div ref={sheetRef} className="A-tour A-mapFull" role="dialog" aria-modal="true" aria-label="Map">
            <div className="A-tourTop">
              <button className="A-icoBtn" onClick={() => setSheet(null)} aria-label="Back to the listing"><Icon name="back" size={22} /></button>
              <h2>Where you'll be</h2><span />
            </div>
            <div className="A-mapBig">
              <TileMap lat={mapPt.lat} lon={mapPt.lon} zoom={14} interactive span={4} />
            </div>
            <p className="A-note A-mapNote">{home.neighborhood} · Approximate location. {home.location.note}</p>
          </div>);
      })()}

      {sheet && sheet !== "tour" && sheet !== "map" && (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={{ dates: "Select dates", guests: "Guests", amenities: "All amenities" }[sheet as "dates" | "guests" | "amenities"]}>
            <div className="sheetHead"><h2>{{ dates: "Select dates", guests: "Guests", amenities: "All amenities" }[sheet as "dates" | "guests" | "amenities"]}</h2>
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

/** Hosts' Airbnb profile photo in the round avatar; falls back to initials if there is no photo. */
function HostPhoto({ home, size }: { home: HomeContent; size: number }) {
  if (!home.host.photo) return <div className={"A-avatar" + (size > 50 ? " big" : "")} aria-hidden="true">O&amp;F</div>;
  return (
    <div className={"A-avatar A-avatarPh" + (size > 50 ? " big" : "")}>
      <Image src={home.host.photo} alt={`${home.host.names}, your hosts`} fill sizes={`${size}px`} style={{ objectFit: "cover" }} />
    </div>
  );
}

