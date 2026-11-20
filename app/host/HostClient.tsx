"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { type Reaction } from "./Reactions";
import { ChatScreen, fullRange, guestLine, initials, type ChatMsg } from "./ChatScreen";
import { CancelPanel } from "./CancelPanel";

/** Host inbox UI (Oscar, Nov 19): sign-in by email link, the list of guest threads, and one thread with a reply box. */
const when = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const range = (a: string, b: string) => {
  const f = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(d + "T00:00:00Z"));
  return `${f(a)} – ${f(b)}`;
};
const HOME: Record<string, string> = { "752": "752 E Grayson", "736": "736 E Grayson", edgewood: "Edgewood", indianola: "Indianola", claywell: "Claywell" };
const home = (k: string) => HOME[k] ?? k;

export function SignIn() {
  const [email, setEmail] = useState(""), [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const go = async () => {
    setState("sending");
    const r = await fetch("/api/host/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    setState(r?.ok ? "sent" : "error");
  };
  return (
    <div className="H-card">
      <h1>Host inbox</h1>
      {state === "sent"
        ? <p>If that's a host address, a sign-in link is on its way. Open it on this device. It works once, for 15 minutes.</p>
        : <form onSubmit={(e) => { e.preventDefault(); go(); }}>
            <label htmlFor="h-email">Email</label>
            <input id="h-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bookings@pearlheightshomes.com" />
            <button className="H-btn" type="submit" disabled={state === "sending" || !email.trim()}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
            {state === "error" && <p className="H-err">Something went wrong. Please try again in a minute.</p>}
          </form>}
    </div>
  );
}

export function Redeem({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle"), [msg, setMsg] = useState("");
  const go = async () => {
    setState("busy");
    const r = await fetch("/api/host/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    if (r?.ok) { location.replace("/host"); return; }
    setMsg(((await r?.json().catch(() => null)) as any)?.error ?? "That didn't work."); setState("error");
  };
  return (
    <div className="H-card">
      <h1>Host inbox</h1>
      <p>Sign in on this device. You'll stay signed in for 90 days.</p>
      <button className="H-btn" type="button" onClick={go} disabled={state === "busy"}>{state === "busy" ? "Signing in…" : "Sign in"}</button>
      {state === "error" && <p className="H-err">{msg} <a href="/host">Request a new link</a></p>}
    </div>
  );
}

type Row = { bookingId: string; bookingRef: string; propertyKey: string; checkIn: string; checkOut: string; guestName: string; lastBody: string; lastSender: "guest" | "host"; lastAt: string; unread: number };
type QRow = { id: string; propertyKey: string; checkIn: string | null; checkOut: string | null; guestName: string; livemode: boolean; lastBody: string; lastSender: "guest" | "host"; lastAt: string; unread: number };
type Item = { key: string; href: string; name: string; tag?: string; meta: string; last: string; lastAt: string; unread: number };
export function Inbox() {
  const [rows, setRows] = useState<Item[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (document.hidden) return;
      const r = await fetch("/api/host/threads", { cache: "no-store" }).catch(() => null);
      if (r?.status === 401) { location.reload(); return; }
      const j = await r?.json().catch(() => null);
      if (!live || !j?.threads) return;
      // Stay chats and questions before booking (Oscar, Nov 19) in one list, newest first.
      const items: Item[] = [
        ...(j.threads as Row[]).map((t) => ({ key: "b" + t.bookingId, href: `/host/t/${t.bookingId}`, name: t.guestName, meta: `${home(t.propertyKey)} · ${range(t.checkIn, t.checkOut)}`,
          last: (t.lastSender === "host" ? "You: " : "") + t.lastBody, lastAt: t.lastAt, unread: t.unread })),
        ...((j.inquiries ?? []) as QRow[]).map((q) => ({ key: "q" + q.id, href: `/host/i/${q.id}`, name: q.guestName, tag: q.livemode ? "Question" : "Question · test",
          meta: `${home(q.propertyKey)} · ${q.checkIn && q.checkOut ? range(q.checkIn, q.checkOut) : "no dates"}`,
          last: (q.lastSender === "host" ? "You: " : "") + q.lastBody, lastAt: q.lastAt, unread: q.unread })),
      ].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
      setRows(items);
    };
    load(); const t = setInterval(load, 10_000); document.addEventListener("visibilitychange", load);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, []);
  return (
    <div className="H-wrap">
      <header className="H-top"><h1>Guest messages</h1><SignOut /></header>
      <p><a className="H-navLink" href="/host/checkin">Check-in details for each home →</a></p>
      {rows === null ? <p className="H-dim">Loading…</p> : rows.length === 0 ? <p className="H-dim">No guest messages yet.</p> : (
        <ul className="H-list">
          {rows.map((r) => (
            <li key={r.key}><a href={r.href} className={r.unread ? "H-row H-unread" : "H-row"}>
              <span className="H-name">{r.name}{r.tag && <i className="H-tag">{r.tag}</i>}{r.unread > 0 && <b className="H-badge">{r.unread}</b>}</span>
              <span className="H-meta">{r.meta}</span>
              <span className="H-last">{r.last}</span>
              <span className="H-when">{when(r.lastAt)}</span>
            </a></li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Info = { bookingId: string; bookingRef: string; propertyKey: string; checkIn: string; checkOut: string; guestName: string; guests?: number; confirmedAt?: string; agreementSigned?: boolean; idVerified?: boolean; babyGear?: boolean };
export function Thread({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null), [info, setInfo] = useState<Info | null>(null), [homeInfo, setHome] = useState<{ title: string; photo: string | null } | null>(null);
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState(""), [details, setDetails] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const load = async () => {
    const r = await fetch(`/api/host/threads/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 401) { location.replace("/host"); return; }
    const j = await r?.json().catch(() => null);
    if (j?.messages) { setMsgs(j.messages); setInfo(j.thread); setHome(j.home); }
    else if (r?.status === 404) setErr("This conversation wasn't found.");
  };
  useEffect(() => {
    const v = () => { if (!document.hidden) load(); };
    load(); const t = setInterval(v, 4_000);
    document.addEventListener("visibilitychange", v); window.addEventListener("focus", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); window.removeEventListener("focus", v); };
  }, [id]);
  const send = async () => {
    const body = draft.trim(); if (!body || busy) return;
    setBusy(true); setErr(""); setNote("");
    const r = await fetch(`/api/host/threads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "Not sent. Please try again."); return; }
    setDraft(""); setNote(j.guestEmailed ? "Sent. We emailed the guest a link to the chat." : "");
    load();
  };
  const react = async (m: ChatMsg, emoji: Reaction | null) => {
    setMsgs((cur) => cur?.map((x) => (x.id === m.id ? { ...x, hostReaction: emoji } : x)) ?? cur);
    const r = await fetch(`/api/host/threads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, emoji }) }).catch(() => null);
    if (!r?.ok) load();
  };
  const first = info?.guestName.split(" ")[0] || "Guest", n = info?.guests ?? 0;
  return (
    <>
      <ChatScreen me="host" otherName={first} otherRole="Guest"
        avatars={[{ initials: initials(info?.guestName ?? ""), alt: info?.guestName ?? "Guest" }, { src: "/homes/hosts/oscar-fernanda-about.jpg", alt: "Oscar & Fernanda" }]}
        title={info ? (n > 1 ? `${first}'s group of ${n}` : info.guestName) : "Loading…"} subtitle={homeInfo?.title ?? (info ? home(info.propertyKey) : "")}
        onBack={() => location.assign("/host")} backLabel="All messages" onDetails={() => setDetails(true)}
        confirmed={{ at: info?.confirmedAt ?? new Date().toISOString(), text: info ? `Booking confirmed · ${guestLine(n)}, ${fullRange(info.checkIn, info.checkOut)}` : "" }}
        messages={info ? msgs : null} draft={draft} setDraft={setDraft} onSend={send} busy={busy} error={err} note={note} onReact={react} />
      {details && info && (
        <div className="CH-sheet" onClick={() => setDetails(false)}>
          <div className="CH-sheetIn" role="dialog" aria-label="Reservation" onClick={(e) => e.stopPropagation()}>
            {homeInfo?.photo && <img src={homeInfo.photo} alt="" />}
            <h2>{homeInfo?.title ?? home(info.propertyKey)}</h2>
            <dl>
              <dt>Guest</dt><dd>{info.guestName}</dd>
              <dt>Dates</dt><dd>{fullRange(info.checkIn, info.checkOut)}</dd>
              <dt>Guests</dt><dd>{guestLine(n)}</dd>
              {info?.babyGear && <><dt>Set up</dt><dd>Crib and high chair</dd></>}
              <dt>Booking</dt><dd>{info.bookingRef}</dd>
              <dt>Agreement</dt><dd>{info.agreementSigned ? "Signed" : "Not signed yet"}</dd>
              <dt>ID check</dt><dd>{info.idVerified ? "Verified" : "Not verified yet"}</dd>
            </dl>
            <TestBalance id={id} />
            <button type="button" className="H-link H-cancelLink" onClick={() => { setDetails(false); setCancelOpen(true); }}>Cancel booking…</button>
            <button type="button" className="CH-close" onClick={() => setDetails(false)}>Close</button>
          </div>
        </div>
      )}
      {cancelOpen && <CancelPanel bookingId={id} onClose={() => setCancelOpen(false)} />}
    </>
  );
}

function SignOut() {
  return <button className="H-link" type="button" onClick={async () => { await fetch("/api/host/session", { method: "DELETE" }).catch(() => null); location.replace("/host"); }}>Sign out</button>;
}

/** Test site only (step 16): run a test booking's second payment now. Hidden on pearlheightshomes.com. */
function TestBalance({ id }: { id: string }) {
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [out, setOut] = useState("");
  useEffect(() => { setShow(!/(^|\.)pearlheightshomes\.com$/.test(location.hostname)); }, []);
  if (!show) return null;
  const run = async () => {
    setBusy(true); setOut("");
    const r = await fetch(`/api/host/bookings/${id}/charge-balance`, { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setOut(!r?.ok ? (j.error ?? "Failed.") : j.note ?? `Second payment: ${j.status}${j.lastError ? ` (${j.lastError})` : ""}${j.declines ? ` · declines: ${j.declines}` : ""}`);
  };
  return (
    <div className="H-testBal">
      <button type="button" className="H-link" disabled={busy} onClick={run}>{busy ? "Charging…" : "Test: charge the balance now"}</button>
      {out && <p className="H-dim" role="status">{out}</p>}
    </div>
  );
}

/* ---------- Questions before booking (Oscar, Nov 19) ---------- */
type Inq = { id: string; propertyKey: string; checkIn: string | null; checkOut: string | null; adults: number; children: number; infants: number;
  quotedTotal: number | null; guestName: string; guestEmail: string; livemode: boolean; createdAt: string };
type Offer = { id: string; checkIn: string; checkOut: string; adults: number; children: number; infants: number; total: number; regular: number; createdAt: string; expiresAt: string; withdrawn: boolean; bookingRef: string | null; active: boolean };
const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 });
const offerState = (o: Offer) => o.bookingRef ? `Booked (${o.bookingRef})` : o.withdrawn ? "Withdrawn" : o.active ? `Active until ${when(o.expiresAt)}` : "Expired";

export function InquiryThread({ id }: { id: string }) {
  const [inq, setInq] = useState<Inq | null>(null), [msgs, setMsgs] = useState<ChatMsg[] | null>(null), [offers, setOffers] = useState<Offer[]>([]);
  const [homeInfo, setHome] = useState<{ title: string; photo: string | null } | null>(null);
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState("");
  const [details, setDetails] = useState(false), [offerOpen, setOfferOpen] = useState(false);
  const load = async () => {
    const r = await fetch(`/api/host/inquiries/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 401) { location.replace("/host"); return; }
    const j = await r?.json().catch(() => null);
    if (j?.messages) { setMsgs(j.messages); setInq(j.inquiry); setOffers(j.offers ?? []); setHome(j.home); }
    else if (r?.status === 404) setErr("This conversation wasn't found.");
  };
  useEffect(() => {
    const v = () => { if (!document.hidden) load(); };
    load(); const t = setInterval(v, 5_000);
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    const body = draft.trim(); if (!body || busy) return;
    setBusy(true); setErr(""); setNote("");
    const r = await fetch(`/api/host/inquiries/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "Not sent. Please try again."); return; }
    setDraft(""); setNote(j.guestEmailed ? "Sent. We emailed the guest a link to the conversation." : "");
    load();
  };
  const active = offers.find((o) => o.active);
  const first = inq?.guestName.split(" ")[0] || "Guest", n = inq ? inq.adults + inq.children : 0;
  const withdraw = async () => {
    const r = await fetch(`/api/host/inquiries/${id}/offer`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setErr("Couldn't withdraw the offer. Please try again.");
    load();
  };
  const footer = (
    <div className="H-offerBar">
      {active
        ? <p>Special offer sent: <b>{usd(active.total)}</b> (regular {usd(active.regular)}) · {offerState(active)} <button type="button" className="H-link" onClick={withdraw}>Withdraw</button></p>
        : <button type="button" className="H-btn H-offerBtn" onClick={() => setOfferOpen(true)}>Send a special offer</button>}
    </div>
  );
  return (
    <>
      <ChatScreen me="host" otherName={first} otherRole="Guest" reactions={false}
        avatars={[{ initials: initials(inq?.guestName ?? ""), alt: inq?.guestName ?? "Guest" }, { src: "/homes/hosts/oscar-fernanda-about.jpg", alt: "Oscar & Fernanda" }]}
        title={inq ? inq.guestName : "Loading…"} subtitle={homeInfo?.title ?? (inq ? home(inq.propertyKey) : "")}
        onBack={() => location.assign("/host")} backLabel="All messages" onDetails={() => setDetails(true)} sysAction="Show details"
        confirmed={{ at: inq?.createdAt ?? new Date().toISOString(), text: inq ? `${inq.livemode ? "" : "TEST · "}Question before booking · ${inq.checkIn && inq.checkOut ? `${guestLine(n)}, ${fullRange(inq.checkIn, inq.checkOut)}` : "no dates"}${inq.quotedTotal ? ` · saw ${usd(inq.quotedTotal)}` : ""}` : "" }}
        messages={inq ? msgs : null} draft={draft} setDraft={setDraft} onSend={send} busy={busy} error={err} note={note} onReact={() => undefined} footer={inq ? footer : null} />
      {details && inq && (
        <div className="CH-sheet" onClick={() => setDetails(false)}>
          <div className="CH-sheetIn" role="dialog" aria-label="Details" onClick={(e) => e.stopPropagation()}>
            {homeInfo?.photo && <img src={homeInfo.photo} alt="" />}
            <h2>{homeInfo?.title ?? home(inq.propertyKey)}</h2>
            <dl>
              <dt>Guest</dt><dd>{inq.guestName}</dd>
              <dt>Email</dt><dd><a href={`mailto:${inq.guestEmail}`}>{inq.guestEmail}</a></dd>
              <dt>Dates</dt><dd>{inq.checkIn && inq.checkOut ? fullRange(inq.checkIn, inq.checkOut) : "Not chosen"}</dd>
              <dt>Guests</dt><dd>{guestLine(n)}{inq.infants ? ` + ${inq.infants} infant${inq.infants === 1 ? "" : "s"}` : ""}</dd>
              {inq.quotedTotal && <><dt>Price they saw</dt><dd>{usd(inq.quotedTotal)}</dd></>}
              {offers.map((o) => <Fragment key={o.id}><dt>Offer</dt><dd>{usd(o.total)} · {fullRange(o.checkIn, o.checkOut)} · {offerState(o)}</dd></Fragment>)}
            </dl>
            {!active && <button type="button" className="H-btn" onClick={() => { setDetails(false); setOfferOpen(true); }}>Send a special offer</button>}
            <button type="button" className="CH-close" onClick={() => setDetails(false)}>Close</button>
          </div>
        </div>
      )}
      {offerOpen && inq && <OfferPanel inq={inq} onClose={() => setOfferOpen(false)} onSent={() => { setOfferOpen(false); setNote("Special offer sent. It lasts 24 hours."); load(); }} />}
    </>
  );
}

/** Special offer: pick the stay, see the regular price from the live calendar, set the new all-in total, send. */
function OfferPanel({ inq, onClose, onSent }: { inq: Inq; onClose: () => void; onSent: () => void }) {
  const [ci, setCi] = useState(inq.checkIn ?? ""), [co, setCo] = useState(inq.checkOut ?? "");
  const [adults, setAdults] = useState(Math.max(1, inq.adults)), [children, setChildren] = useState(inq.children), [infants, setInfants] = useState(inq.infants);
  const [regular, setRegular] = useState<number | null>(null), [total, setTotal] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const stay = { checkIn: ci, checkOut: co, adults, children, infants };
  useEffect(() => {
    setRegular(null); setErr("");
    if (!ci || !co || co <= ci) return;
    let live = true;
    (async () => {
      const r = await fetch(`/api/host/inquiries/${inq.id}/offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stay) }).catch(() => null);
      const j = await r?.json().catch(() => null);
      if (!live) return;
      if (r?.ok) setRegular(j.regular); else setErr(j?.error ?? "Couldn't check the price.");
    })();
    return () => { live = false; };
  }, [ci, co, adults, children, infants]); // eslint-disable-line react-hooks/exhaustive-deps
  const cents = Math.round(Number(total.replace(/[$,\s]/g, "")) * 100);
  const valid = regular != null && Number.isFinite(cents) && cents > 0 && cents < regular;
  const sendOffer = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/host/inquiries/${inq.id}/offer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...stay, total: cents }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "Not sent. Please try again."); return; }
    onSent();
  };
  const nums = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return (
    <div className="CH-sheet" onClick={onClose}>
      <div className="CH-sheetIn H-offerPanel" role="dialog" aria-label="Send a special offer" onClick={(e) => e.stopPropagation()}>
        <h2>Send a special offer</h2>
        <p className="H-dim">A new all-in total for {inq.guestName.split(" ")[0]} only. It lasts 24 hours and is used once.</p>
        <div className="H-grid2">
          <label>Check-in<input type="date" value={ci} onChange={(e) => setCi(e.target.value)} /></label>
          <label>Check-out<input type="date" value={co} min={ci || undefined} onChange={(e) => setCo(e.target.value)} /></label>
        </div>
        <div className="H-grid3">
          <label>Adults<select value={adults} onChange={(e) => setAdults(Number(e.target.value))}>{nums(1, 16).map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Children<select value={children} onChange={(e) => setChildren(Number(e.target.value))}>{nums(0, 15).map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Infants<select value={infants} onChange={(e) => setInfants(Number(e.target.value))}>{nums(0, 6).map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <p className="H-offerReg">{!ci || !co ? "Pick the dates to see the regular price." : regular == null ? (err ? "" : "Checking the regular price…") : <>Regular price: <b>{usd(regular)}</b> total (cleaning, waiver and taxes included)</>}</p>
        <label className="H-offerTotal">New total, all-in<input inputMode="decimal" placeholder={regular ? (Math.round(regular * 0.9) / 100).toFixed(0) : ""} value={total} onChange={(e) => setTotal(e.target.value)} /></label>
        {valid && regular && <p className="H-dim">The guest saves {usd(regular - cents)} ({Math.round(((regular - cents) / regular) * 100)}%). Taxes stay included; the total may move by a cent for tax rounding.</p>}
        {err && <p className="H-err" role="alert">{err}</p>}
        <button type="button" className="H-btn" disabled={!valid || busy} onClick={sendOffer}>{busy ? "Sending…" : "Send offer"}</button>
        <button type="button" className="CH-close" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
