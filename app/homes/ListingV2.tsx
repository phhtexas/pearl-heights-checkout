"use client";
import Image from "next/image";
import { CookieChoices } from "../CookieChoices";
import { GUIDES } from "@/content/guides";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeContent } from "@/content/homes";
import type { Quote } from "@/domain/quote";
import { track } from "@/client/track";
import { ShareSheet } from "./ShareSheet";
import { TestOnly } from "../TestOnly";
import { LAUNCHED } from "@/launch";
import { useSaved } from "@/client/saved";
import { Icon, iconFor } from "./icons";
import { ALL_HOMES, ListingNav } from "../SiteNav";
import { TileMapV2 as TileMap } from "./TileMapV2";
import { AskHosts, ChatIcon } from "./AskHosts";
import "./listing.css";
import "./listingV2.css";

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
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-");
const range = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${fmt(a)}–${Number(b.slice(8))}` : `${fmt(a)} – ${fmt(b)}`);

const AV_COLORS = ["#c9b8a3", "#a9b9a6", "#b3b8c9", "#c9a9a9", "#b9adc4", "#a7c0c2"]; // soft initial circles for reviewers
const DOTS = 5;
/** Note 150: compact, factual trust proof beside the booking action (approved wording). */
const TRUST = "Airbnb Superhosts · 4.98 across 463 Airbnb reviews · Secure payment by Stripe";
/** Footer (Oscar, chat Nov 16, 2026): email only (incl. the "pearlheightshomes.com" domain), managed-by line, Instagram from
 *  pearlheightshomes.com's own footer link. Instagram only (note 155). */
const CONTACT = { email: "bookings@pearlheightshomes.com", managedBy: "Site managed by PR Portfolio Properties LLC (formerly Pena Revilla Properties LLC) | San Antonio, TX" };
const SOCIAL = [{ name: "Instagram", icon: "instagram", href: "https://www.instagram.com/pearlheightshomes" }];

/** Photo tour groups, matched from each photo's description (first match wins). Labels describe the space, not a specific bedroom. */
const TOUR: [string, RegExp][] = [
  ["Living room", /^(living|electric fireplace|open living)|sectional|mantel|hallway/i],
  ["Full kitchen", /kitchen|refrigerator|coffee|snack|glassware/i],
  ["Dining area", /dining/i],
  ["Bedrooms", /bed|crib|pillow/i],
  ["Bathrooms", /bath|shower|vanity/i],
  ["Bonus room", /bonus room/i],
  ["Playroom", /playroom/i],
  ["Game room", /game room|arcade|shuffleboard/i],
  ["Kids' play area", /kids|play table/i],
  ["Workspace", /workspace|desk/i],
  ["Laundry", /laundry|washer/i],
  ["Backyard and patio", /backyard|patio|pergola|lawn chairs|deck/i],
  ["EV charger", /ev charger/i],
  ["Exterior", /front|house|street|side|driveway|entrance|exterior/i],
  ["Neighborhood", /aerial|neighborhood/i],
];
const groupOf = (alt: string) => {
  if (/bonus room/i.test(alt)) return "Bonus room"; // bonus-room shots also mention the lawn or night lighting
  if (/playroom/i.test(alt)) return "Playroom"; // playroom shots also mention a sofa or kids' table
  if (/game room|arcade|shuffleboard/i.test(alt)) return "Game room"; // game-room shots also mention seating or windows
  if (/aerial|neighborhood/i.test(alt)) return "Neighborhood";
  return TOUR.find(([, re]) => re.test(alt))?.[0] ?? "More photos";
};

export function ListingV2({ home, prop, policy }: { home: HomeContent; prop: Prop; policy: string[] }) {
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
  const [shared, setShared] = useState("");
  const [ask, setAsk] = useState(false); // "Message Oscar & Fernanda" (Oscar, Nov 19)
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const carRef = useRef<HTMLDivElement | null>(null);
  const goSlide = (i: number) => { const c = carRef.current; if (!c) return; const n = Math.max(0, Math.min(home.photos.length - 1, i)); c.scrollTo({ left: n * c.clientWidth, behavior: "smooth" }); setSlide(n); };
  // As the page scrolls, the content sheet slides over the pinned cover and the cover fades slightly to white.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = heroRef.current;
      if (!h) return;
      const sheet = h.parentElement?.querySelector<HTMLElement>(".V-sheet") ?? null; // the content sheet that slides over the cover
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
  useEffect(() => { track("property_viewed", { property: prop.key, variant: "v2" }, "pv"); }, [prop.key]);
  useEffect(() => {
    fetch(`/api/calendar?property=${prop.key}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.days) setDays(j.days); else setCalErr(j.error ?? "Availability is temporarily unavailable."); })
      .catch(() => setCalErr("Availability is temporarily unavailable. Please try again."));
  }, [prop.key]);
  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);
  // "← Back to all homes" (Oscar, Nov 19): when this page was opened from the All Homes results (from=browse), rebuild
  // those results from this page's own URL (dates, guests, saved filter) and ask All Homes to bring this home's card
  // back into view (card=). Opened directly: the default All Homes page, nothing restored. Never a blind history.back().
  const [backHref, setBackHref] = useState(ALL_HOMES);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("from") !== "browse") return;
    const keep = new URLSearchParams();
    for (const k of ["checkIn", "checkOut", "adults", "children", "saved"]) { const v = q.get(k); if (v && /^[0-9-]{1,10}$/.test(v)) keep.set(k, v); }
    keep.set("card", prop.key);
    setBackHref(`${ALL_HOMES}?${keep}`);
  }, [prop.key]);
  // Dates and guests handed over from the All Homes page (?checkIn=&checkOut=&adults=&children=): prefill, then quote.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const a = q.get("checkIn"), b = q.get("checkOut"), iso = /^\d{4}-\d{2}-\d{2}$/;
    const ad = Number(q.get("adults")), ch = Number(q.get("children"));
    if (ad >= 1 && ad + Math.max(0, ch || 0) <= prop.maxGuests) { setAdults(ad); setChildren(Math.max(0, ch || 0)); }
    if (a && b && iso.test(a) && iso.test(b) && b > a) { setCi(a); setCo(b); setMonth(a.slice(0, 7)); }
  }, [prop.maxGuests]);

  // Quote whenever dates/guests change; never show a stale price.
  useEffect(() => {
    if (!ci || !co) { setQuote(null); setQState("idle"); return; }
    const id = ++reqId.current;
    setQuote(null); setQState("loading"); setQErr("");
    track("availability_searched", { property: prop.key, nights: nightsOf(ci, co), guests, adults, children, check_in: ci, check_out: co, lead_days: nightsOf(new Date().toISOString().slice(0, 10), ci), variant: "v2" });
    fetch("/api/quote", { method: "POST", body: JSON.stringify({ property: prop.key, checkIn: ci, checkOut: co, adults, children, infants, payPlan: "full" }) })
      .then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) }))
      .then(({ ok, status, j }) => {
        if (id !== reqId.current) return;
        if (!ok) { setQState(status === 409 ? "unavailable" : "error"); setQErr(j.error ?? "We couldn't price these dates."); return; }
        setQuote(j.quote); setQState("idle");
        track("quote_viewed", { property: prop.key, nights: j.quote.nights, guests, adults, children, check_in: ci!, check_out: co!, total_cents: j.quote.total, non_refundable: j.quote.nonRefundable, variant: "v2" }, "qv" + j.quoteId);
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
    track("dates_selected", { property: prop.key, nights: nightsOf(draft.ci, draft.co), check_in_month: draft.ci.slice(0, 7), variant: "v2" }, "ds" + draft.ci + draft.co);
  }
  function reserve(where: string) {
    if (!quote || !ci || !co) return;
    // On pearlheightshomes.com the Reserve hand-off goes to Airbnb (middleware) until direct checkout is live.
    const destination = /(^|\.)pearlheightshomes\.com$/.test(location.hostname) ? "airbnb" : "checkout";
    track("book_click", { property: prop.key, cta: where, destination, nights: quote.nights, adults, children, check_in: ci, check_out: co, total_cents: quote.total }, "bk" + where + ci + co + adults + "-" + children);
    if (destination === "checkout") track("checkout_started", { property: prop.key, nights: quote.nights, adults, children, infants, check_in: ci, check_out: co, total_cents: quote.total, variant: "v2" }, "cs" + ci + co + adults + "-" + children + "-" + infants);
    location.href = `/?home=${prop.key}&checkIn=${ci}&checkOut=${co}&adults=${adults}&children=${children}&infants=${infants}`;
  }
  // Share sheet like the Airbnb app (Oscar, Nov 19).
  const [shareOpen, setShareOpen] = useState(false);
  function share() { setShareOpen(true); }
  // Heart = saved homes in this browser + an interest signal for retargeting (Oscar, Nov 19, option 2).
  const [savedMap, toggleSaved] = useSaved([prop.key]);
  const saved = !!savedMap[prop.key];
  function toggleSave() { toggleSaved(prop.key, "home_page"); }

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
    `${checkIO[0]} · ${checkIO[1]}`, checkIO[2], find(rules, /parties/), find(rules, /smok/), find(rules, /pets/i), find(rules, /^Up to/), find(rules, /quiet/i), find(safety, /camera/), find(safety, /^No cameras inside/),
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
  const roomPhoto = (i: number) => home.roomPhotos[i] ?? home.roomPhotos[0] ?? home.photos[0]!.id; // per-home room-card photos (content file)
  const roomAlt = (id: string) => home.photos.find((p) => p.id === id)?.alt ?? "";

  return (
    <div className="V-page">
      <TestOnly><div className="V-test">Test site · nothing is booked or charged</div></TestOnly>
      {/* Oscar, Nov 19: a simpler header on property pages (back to the results, ask about THIS home). */}
      <ListingNav backHref={backHref} askHref={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Question about " + home.title)}`} onAsk={() => setAsk(true)} />
      {shared && <div className="V-toast" role="status">{shared}</div>}
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} url={typeof location !== "undefined" ? location.origin + location.pathname : ""}
        title={home.title} photo={src(home.photos[0]!.id)} photoAlt={home.photos[0]!.alt} rating={home.rating ?? undefined} area={`${home.neighborhood}, San Antonio`} propertyKey={prop.key} />

      <section ref={heroRef} className="V-hero" aria-label="Photos">
        {/* Share and Save over the gallery's top-right (Oscar, Nov 19), first in the tab order: clear of the arrows (middle) and counter (bottom). */}
        <div className="V-heroActs">
          <button className="V-heroBtn" onClick={share} aria-label="Share this home"><Icon name="share" size={20} /></button>
          <button className={"V-heroBtn" + (saved ? " V-saved" : "")} onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Saved" : "Save this home"}><Icon name="heart" size={20} /></button>
        </div>
        <div ref={carRef} className="V-carousel" tabIndex={0} role="region" aria-roledescription="carousel" aria-label={`Photos, ${slide + 1} of ${home.photos.length}. Use the left and right arrow keys to browse; press Enter for the photo tour.`}
          onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); goSlide(slide + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); goSlide(slide - 1); } else if (e.key === "Enter") { setTourFocus(null); open("tour"); } }}
          onClick={() => { setTourFocus(null); open("tour"); }} onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
          {home.photos.map((p, i) => (
            <div className="V-slide" key={p.id} aria-hidden={i !== slide}>
              {Math.abs(i - slide) <= 2 && <Image src={src(p.id)} alt={p.alt} fill sizes="(min-width: 960px) 1040px, 100vw" quality={60} priority={i === 0} loading={i === 0 ? undefined : "lazy"} style={{ objectFit: "cover" }} />}
            </div>))}
        </div>
        <button className="V-arrow prev" onClick={() => goSlide(slide - 1)} disabled={slide === 0} aria-label="Previous photo"><Icon name="back" size={18} /></button>
        <button className="V-arrow next" onClick={() => goSlide(slide + 1)} disabled={slide >= home.photos.length - 1} aria-label="Next photo"><Icon name="back" size={18} /></button>
        <div className="V-heroFade" aria-hidden="true" />
        <div className="V-dots" aria-hidden="true">{Array.from({ length: DOTS }, (_, i) => <span key={i} className={i === Math.round((slide / Math.max(1, home.photos.length - 1)) * (DOTS - 1)) ? "on" : ""} />)}</div>
        <button className="V-count" onClick={() => { setTourFocus(null); open("tour"); }} aria-label={`Photo ${slide + 1} of ${home.photos.length}. Open the photo tour`}>{slide + 1} / {home.photos.length}</button>
      </section>

      <div className="V-body">
      <main className="V-main V-sheet">
        <section className="V-intro">
          <h1>{home.title}</h1>
          <div className="V-sub">{home.neighborhood}, San Antonio · Entire home</div>
          {home.rating && <a className="V-rating" href="#reviews"><Icon name="star" size={14} />{home.rating.value.toFixed(2)} · {home.rating.count} reviews</a>}
          <div className="V-cap">{plural(home.capacity.bedrooms, "bedroom")} · {plural(home.capacity.beds, "bed")} · {plural(home.capacity.baths, "bath")} · sleeps {home.capacity.guests}</div>
        </section>

        <section className="V-host">
          <HostPhoto home={home} size={44} />
          <div><b>Hosted by {home.host.names}</b><span>{home.host.facts[0]} · {home.host.facts.find((f) => /reply/i.test(f)) ?? ""}</span></div>
          <button type="button" className="V-msgIcon" aria-label={`Message ${home.host.names}`} data-cta="message_hosts_icon" onClick={() => setAsk(true)}><ChatIcon /></button>
        </section>

        <ul id="overview" className="V-high">{home.highlights.map((h) => <li key={h.title}><Icon name={iconFor(h.title)} size={28} /><div><b>{h.title}</b><span>{h.text}</span></div></li>)}</ul>

        <section className="V-sec">
          <h2>About this home</h2>
          <p className={"V-p" + (more ? "" : " V-clamp")}>{home.summary}</p>
          <button className="V-more" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Show less" : "Show more"}</button>
        </section>

        <section id="sleep" className="V-sec">
          <h2>Sleeping arrangements</h2>
          <div className="V-rooms">{home.sleeping.map((r, i) => (
            <button key={r.room} className="V-room" aria-label={`${r.room}: see photos`}
              onClick={() => { const id = roomPhoto(i); setTourFocus({ group: groupOf(roomAlt(id)), id }); open("tour"); }}>
              <div className="V-roomPh"><Image src={src(roomPhoto(i))} alt={roomAlt(roomPhoto(i))} fill sizes="(min-width: 600px) 360px, 70vw" loading="lazy" style={{ objectFit: "cover" }} /></div>
              <div className="V-roomTx"><b>{r.room}</b><span>{r.beds}</span></div>
            </button>))}
          </div>
        </section>

        <section id="amenities" className="V-sec">
          <h2>Amenities</h2>
          <ul className="V-list">{home.topAmenities.map((a) => <li key={a}><Icon name={iconFor(a)} size={18} />{a}</li>)}</ul>
          <button className="V-outline" onClick={() => open("amenities")}>Show all amenities</button>
        </section>

        <section className="V-sec">
          <h2>Is this home right for you?</h2>
          <h3 className="V-h3">Great for</h3>
          <ul className="V-list V-rules">{home.goodFit.map((x) => <li key={x}><Icon name="check" size={18} />{x}</li>)}</ul>
          <h3 className="V-h3">Not a fit for</h3>
          <ul className="V-list V-rules">{home.notFit.map((x) => <li key={x}><Icon name="x" size={18} />{x}</li>)}</ul>
        </section>

        <section id="location" className="V-sec">
          <h2>Location</h2>
          {home.location.mapBbox && (
            <div className="V-map">
              <div className="V-mapWrap"><p className="sr">Map of {home.neighborhood}, showing an approximate location, not the exact address.</p><TileMap lat={mapPt.lat} lon={mapPt.lon} zoom={14} span={1} /></div>
              <span className="V-mapTag">Approximate location</span>
              <button className="V-expand" onClick={() => open("map")} aria-label="Open the map full screen"><Icon name="expand" size={20} /></button>
            </div>)}
          <p className="V-p">{home.location.text}</p>
          <ul className="V-list V-rules V-facts">{home.location.facts.map((f) => <li key={f}><Icon name={/drive/.test(f) ? "car" : "walk"} size={26} />{f}</li>)}</ul>
          <p className="V-note">{home.location.note}</p>
        </section>

        {home.rating && (
          <section id="reviews" className="V-sec">
            <h2>Reviews</h2>
            <div className="V-score"><Icon name="star" size={14} />{home.rating.value.toFixed(2)} · {home.rating.count} reviews</div>
            <div className="V-reviews" tabIndex={0} role="region" aria-label="Guest reviews. Scroll sideways or use the arrow keys.">{home.reviews.map((r) => (
              <figure key={r.name + r.when} className="V-review">
                {r.rating && <div className="V-rstar"><Icon name="star" size={13} />{r.rating.toFixed(1)}</div>}
                <blockquote>“{r.text.length > 150 ? r.text.slice(0, 150).replace(/\s\S*$/, "") + "…" : r.text}”</blockquote>
                <figcaption><span className="V-rav" aria-hidden="true" style={{ background: AV_COLORS[r.name.charCodeAt(0) % AV_COLORS.length] }}>{r.name[0]}</span><span><b>{r.name}</b><br />{r.when} · Airbnb</span></figcaption>
              </figure>))}
            </div>
          </section>
        )}

        <section id="hosts" className="V-sec">
          <h2>Meet your hosts</h2>
          <div className="V-hostcard">
            <HostPhoto home={home} size={72} />
            <div><b>{home.host.names}</b><ul>{home.host.facts.map((f) => <li key={f}>{f}</li>)}</ul></div>
          </div>
          <p className="V-p">{home.host.bio}</p>
          <button type="button" className="V-outline V-msgBtn" data-cta="message_hosts" onClick={() => setAsk(true)}><ChatIcon size={20} />Message {home.host.names}</button>
          <p className="V-msgNote">Ask about these dates, the home or the area. We usually reply within an hour.</p>
        </section>

        <section id="rules" className="V-sec">
          <h2>House rules</h2>
          <ul className="V-list V-rules">{houseRules.map((r, i) => <li key={r}><Icon name={i === 0 ? "clock" : iconFor(r)} size={18} />{r}</li>)}</ul>
        </section>

        <section className="V-sec">
          <h2>Cancellation policy</h2>
          <div className="V-cancel"><Icon name="check" size={18} /><b>{policy[0]}</b></div>
          {policy.slice(1).map((p) => <p key={p} className="V-cancelSub">{p}</p>)}
        </section>

        <section id="faq" className="V-sec">
          <h2>Questions</h2>
          {home.faq.map((f) => <details key={f.q} className="V-faq"><summary>{f.q}<Icon name="chev" size={18} /></summary><p>{f.a}</p></details>)}
          {home.registration && <p className="V-note">City short-term rental registration {home.registration}</p>}
        </section>

        <ul className="V-badges" aria-label="Booking direct">
          <li><Icon name="home" size={28} /><b>Book direct</b><span>with the hosts</span></li>
          <li><Icon name="lock" size={28} /><b>Secure payment</b><span>by Stripe</span></li>
          <li><Icon name="chat" size={28} /><b>Local hosts</b><span>reply within an hour</span></li>
          <li><Icon name="shield" size={28} /><b>Damage waiver</b><span>included</span></li>
        </ul>
      </main>

      <aside className="V-card" aria-label="Book this home">
        <div className="V-cardPrice">
          {quote ? <><b>{money(quote.total)}</b> <span>total</span></> : <b>{qState === "loading" ? "Checking…" : "Add dates for the full price"}</b>}
        </div>
        <div className="V-cardFields">
          <button className="V-field" onClick={() => open("dates")}><span>Dates</span><b>{ci && co ? `${range(ci, co)} · ${nightsOf(ci, co)} nights` : "Add dates"}</b></button>
          <button className="V-field" onClick={() => open("guests")}><span>Guests</span><b>{guests} {guests === 1 ? "guest" : "guests"}{infants ? `, ${infants} ${infants === 1 ? "infant" : "infants"}` : ""}</b></button>
        </div>
        {(qState === "unavailable" || qState === "error") && <p className="V-cardErr" role="alert">{qErr}</p>}
        {quote ? <button className="V-cta V-cardCta" onClick={() => reserve("booking_card")}>Reserve</button> : <button className="V-cta V-cardCta" data-cta="booking_card_availability" data-cta-home={prop.key} onClick={() => open("dates")}>Check availability</button>}
        <p className="V-cardNote">{quote ? "Includes cleaning, the damage waiver and taxes. You'll review everything before you pay." : "Your full total (cleaning, damage waiver and taxes) shows as soon as you pick dates."}</p>
        <p className="V-trust">{TRUST}</p>
      </aside>
      </div>

      <footer className="V-footer">
        <div className="V-footIn">
          <div className="V-footBrand">
            <div className="V-footLogoRow">
              <span className="V-brand V-brandFoot"><img className="brandLogo" src="/brand/logo-dark.webp" alt="Pearl Heights Homes" width={200} height={174} /></span>
              <ul className="V-social" aria-label="Pearl Heights Homes on social media">
                {SOCIAL.map((s) => <li key={s.name}><a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`Pearl Heights Homes on ${s.name} (opens in a new tab)`}><Icon name={s.icon} size={20} /></a></li>)}
              </ul>
            </div>
            <p>Direct bookings with your hosts, Oscar &amp; Fernanda.</p>
          </div>
          <ul className="V-footContact">
            <li><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
            <li>{CONTACT.managedBy}</li>
          </ul>
          <ul className="V-footLinks">
            <li><a href="/policies/cancellation">Cancellation policy</a></li>
            {GUIDES.filter((g) => g.approved && g.homes.some((h) => h.key === home.key)).map((g) => <li key={g.slug}><a href={`/guides/${g.slug}`}>Local guide: {g.title}</a></li>)}
            {LAUNCHED
              ? <><li><a href="/terms">Terms of service</a></li><li><a href="/privacy">Privacy policy</a></li></>
              : <><li><span>Terms of service <em>(coming soon)</em></span></li><li><span>Privacy policy <em>(coming soon)</em></span></li></>}
            <li><CookieChoices /></li>
          </ul>
          <p className="V-footSmall">{home.registration && <>City short-term rental registration {home.registration} · </>}© {new Date().getFullYear()} Pearl Heights Homes</p>
        </div>
      </footer>

      {/* Phones (Oscar, Nov 19): with no price yet, "Add dates to see your total" stacks above a full-width button on
          narrow screens; side by side where both fit. With a price, the compact side-by-side row as before. */}
      <div className={"V-bar" + (quote || (ci && co) ? "" : " is-empty")}>
        <div className="V-barRow">
        <div className="V-barL">
          {quote
            ? <b>{money(quote.total)} <small>total</small></b>
            : ci && co ? <b>{qState === "loading" ? "Checking…" : "Add dates"}</b> : <b className="V-barAdd">{qState === "loading" ? "Checking…" : "Add dates to see your total"}</b>}
          {ci && co
            ? <span className="V-barLinks"><button onClick={() => open("dates")}>{range(ci, co)}</button> · <button onClick={() => open("guests")}>{guests} {guests === 1 ? "guest" : "guests"}</button></span>
            : null}
          {(qState === "unavailable" || qState === "error") && <span className="V-barErr" role="alert">{qErr}</span>}
        </div>
        {quote ? <button className="V-cta" onClick={() => reserve("sticky_bar")}>Reserve</button> : <button className="V-cta" data-cta="sticky_bar_availability" data-cta-home={prop.key} onClick={() => open("dates")}>Check availability</button>}
        </div>
        <p className="V-barTrust">{TRUST}</p>
      </div>

      {sheet === "tour" && (
        <div ref={sheetRef} className="V-tour" role="dialog" aria-modal="true" aria-label="Photo tour">
          <div className="V-tourTop">
            <button className="V-icoBtn" onClick={() => setSheet(null)} aria-label="Back to the listing"><Icon name="back" size={22} /></button>
            <h2>Photo tour</h2>
            <div className="V-acts">
              <button className="V-icoBtn" onClick={share} aria-label="Share this home"><Icon name="share" size={20} /></button>
              <button className={"V-icoBtn" + (saved ? " V-saved" : "")} onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Saved" : "Save this home"}><Icon name="heart" size={20} /></button>
            </div>
          </div>
          <div className="V-tourThumbs">{tour.map((g) => (
            <a key={g.name} href={"#tour-" + slugify(g.name)} className="V-tourThumb" onClick={(e) => { e.preventDefault(); document.getElementById("tour-" + slugify(g.name))?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className="V-tourThumbPh"><Image src={src(g.photos[0]!.id)} alt="" fill sizes="150px" style={{ objectFit: "cover" }} /></span>
              <span>{g.name}</span>
            </a>))}
          </div>
          {tour.map((g) => (
            <section key={g.name} id={"tour-" + slugify(g.name)} className="V-tourSec">
              <h3>{g.name}</h3>
              <div className="V-tourSub">{g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}</div>
              <div className="V-tourGrid">{(tourFocus?.group === g.name ? [...g.photos.filter((p) => p.id === tourFocus.id), ...g.photos.filter((p) => p.id !== tourFocus.id)] : g.photos).map((p, i) => (
                <figure key={p.id} className={"V-tourPh" + (i % 3 === 0 ? " big" : "")}>
                  <Image src={src(p.id)} alt={p.alt} fill sizes={i % 3 === 0 ? "(min-width: 600px) 528px, 100vw" : "(min-width: 600px) 264px, 50vw"} loading={tourFocus?.group === g.name && i < 3 ? "eager" : "lazy"} style={{ objectFit: "cover" }} />
                </figure>))}
              </div>
            </section>))}
          <div className="V-tourCta">
            {quote ? <button className="V-cta" onClick={() => reserve("photo_tour")}>Reserve</button> : <button className="V-cta" data-cta="photo_tour_availability" data-cta-home={prop.key} onClick={() => { setSheet(null); setTimeout(() => open("dates"), 0); }}>Check availability</button>}
          </div>
        </div>
      )}

      {sheet === "map" && home.location.mapBbox && (() => {
        return (
          <div ref={sheetRef} className="V-tour V-mapFull" role="dialog" aria-modal="true" aria-label="Map">
            <div className="V-tourTop">
              <button className="V-icoBtn" onClick={() => setSheet(null)} aria-label="Back to the listing"><Icon name="back" size={22} /></button>
              <h2>Where you'll be</h2><span />
            </div>
            <div className="V-mapBig">
              <TileMap lat={mapPt.lat} lon={mapPt.lon} zoom={14} interactive span={4} />
            </div>
            <p className="V-note V-mapNote">{home.neighborhood} · Approximate location. {home.location.note}</p>
          </div>);
      })()}

      <AskHosts open={ask} onClose={() => setAsk(false)} home={{ key: prop.key, title: home.title, maxGuests: prop.maxGuests }}
        ci={ci} co={co} adults={adults} children={children} infants={infants} total={quote?.total ?? null} />

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
  if (!home.host.photo) return <div className={"V-avatar" + (size > 50 ? " big" : "")} aria-hidden="true">O&amp;F</div>;
  return (
    <div className={"V-avatar V-avatarPh" + (size > 50 ? " big" : "")}>
      <Image src={home.host.photo} alt={`${home.host.names}, your hosts`} fill sizes={`${size}px`} style={{ objectFit: "cover" }} />
    </div>
  );
}

