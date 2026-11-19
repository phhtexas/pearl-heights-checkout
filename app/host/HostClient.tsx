"use client";
import { useEffect, useRef, useState } from "react";
import { type Reaction } from "./Reactions";
import { ChatScreen, fullRange, guestLine, initials, type ChatMsg } from "./ChatScreen";

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
export function Inbox() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (document.hidden) return;
      const r = await fetch("/api/host/threads", { cache: "no-store" }).catch(() => null);
      if (r?.status === 401) { location.reload(); return; }
      const j = await r?.json().catch(() => null);
      if (live && j?.threads) setRows(j.threads);
    };
    load(); const t = setInterval(load, 20_000); document.addEventListener("visibilitychange", load);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, []);
  return (
    <div className="H-wrap">
      <header className="H-top"><h1>Guest messages</h1><SignOut /></header>
      {rows === null ? <p className="H-dim">Loading…</p> : rows.length === 0 ? <p className="H-dim">No guest messages yet.</p> : (
        <ul className="H-list">
          {rows.map((r) => (
            <li key={r.bookingId}><a href={`/host/t/${r.bookingId}`} className={r.unread ? "H-row H-unread" : "H-row"}>
              <span className="H-name">{r.guestName}{r.unread > 0 && <b className="H-badge">{r.unread}</b>}</span>
              <span className="H-meta">{home(r.propertyKey)} · {range(r.checkIn, r.checkOut)}</span>
              <span className="H-last">{r.lastSender === "host" ? "You: " : ""}{r.lastBody}</span>
              <span className="H-when">{when(r.lastAt)}</span>
            </a></li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Info = { bookingId: string; bookingRef: string; propertyKey: string; checkIn: string; checkOut: string; guestName: string; guests?: number; confirmedAt?: string; agreementSigned?: boolean; idVerified?: boolean };
export function Thread({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null), [info, setInfo] = useState<Info | null>(null), [homeInfo, setHome] = useState<{ title: string; photo: string | null } | null>(null);
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState(""), [details, setDetails] = useState(false);
  const load = async () => {
    const r = await fetch(`/api/host/threads/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 401) { location.replace("/host"); return; }
    const j = await r?.json().catch(() => null);
    if (j?.messages) { setMsgs(j.messages); setInfo(j.thread); setHome(j.home); }
    else if (r?.status === 404) setErr("This conversation wasn't found.");
  };
  useEffect(() => {
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 15_000);
    return () => clearInterval(t);
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
      <ChatScreen me="host" otherName={first}
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
              <dt>Booking</dt><dd>{info.bookingRef}</dd>
              <dt>Agreement</dt><dd>{info.agreementSigned ? "Signed" : "Not signed yet"}</dd>
              <dt>ID check</dt><dd>{info.idVerified ? "Verified" : "Not verified yet"}</dd>
            </dl>
            <button type="button" className="CH-close" onClick={() => setDetails(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function SignOut() {
  return <button className="H-link" type="button" onClick={async () => { await fetch("/api/host/session", { method: "DELETE" }).catch(() => null); location.replace("/host"); }}>Sign out</button>;
}
