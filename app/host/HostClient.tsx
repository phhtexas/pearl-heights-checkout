"use client";
import { useEffect, useRef, useState } from "react";

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

type Msg = { id: string; sender: "guest" | "host"; body: string; at: string; readAt: string | null };
export function Thread({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null), [info, setInfo] = useState<Omit<Row, "lastBody" | "lastSender" | "lastAt" | "unread"> | null>(null);
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [note, setNote] = useState("");
  const end = useRef<HTMLDivElement>(null), count = useRef(0);
  const load = async () => {
    const r = await fetch(`/api/host/threads/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 401) { location.replace("/host"); return; }
    const j = await r?.json().catch(() => null);
    if (j?.messages) { setMsgs(j.messages); setInfo(j.thread); }
    else if (r?.status === 404) setErr("This conversation wasn't found.");
  };
  useEffect(() => {
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 15_000);
    return () => clearInterval(t);
  }, [id]);
  useEffect(() => { if (msgs && msgs.length !== count.current) { count.current = msgs.length; end.current?.scrollIntoView({ block: "end" }); } }, [msgs]);
  const send = async () => {
    const body = draft.trim(); if (!body || busy) return;
    setBusy(true); setErr(""); setNote("");
    const r = await fetch(`/api/host/threads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "Not sent. Please try again."); return; }
    setDraft(""); setNote(j.guestEmailed ? "Sent. We emailed the guest a link to the chat." : "Sent. It shows in the guest's chat on their stay page.");
    load();
  };
  return (
    <div className="H-wrap H-threadWrap">
      <header className="H-top"><a href="/host" className="H-back">‹ All messages</a></header>
      {info && <div className="H-head"><h1>{info.guestName}</h1><p className="H-dim">{home(info.propertyKey)} · {range(info.checkIn, info.checkOut)} · {info.bookingRef}</p></div>}
      {err && <p className="H-err">{err}</p>}
      <div className="H-thread" aria-live="polite">
        {msgs?.length === 0 && <p className="H-dim">No messages yet.</p>}
        {msgs?.map((m) => <div key={m.id} className={m.sender === "host" ? "H-msg H-me" : "H-msg"}><p>{m.body}</p><span>{m.sender === "host" ? "You" : info?.guestName.split(" ")[0]} · {when(m.at)}{m.sender === "host" && m.readAt ? " · Seen" : ""}</span></div>)}
        <div ref={end} />
      </div>
      <form className="H-send" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="h-reply">Reply</label>
        <textarea id="h-reply" rows={2} maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply" />
        <button className="H-btn" type="submit" disabled={busy || !draft.trim()}>{busy ? "Sending…" : "Send"}</button>
      </form>
      {note && <p className="H-dim H-note">{note}</p>}
    </div>
  );
}

function SignOut() {
  return <button className="H-link" type="button" onClick={async () => { await fetch("/api/host/session", { method: "DELETE" }).catch(() => null); location.replace("/host"); }}>Sign out</button>;
}
