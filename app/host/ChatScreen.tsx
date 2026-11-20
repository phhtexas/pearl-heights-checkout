"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { MessageActions, type Reaction } from "./Reactions";
import "./chat.css";

/**
 * Full-screen chat like the Airbnb app (Oscar's reference screenshots, Nov 19): a header with both sides' photos, the
 * title and home, a Details button; a "Booking confirmed · guests, dates · Show reservation" line at the top of the
 * thread; day separators; press-and-hold reactions; and a round send button. Shared by the stay page and host inbox.
 */
export type ChatMsg = { id: string; sender: "guest" | "host"; body: string; at: string; readAt: string | null; guestReaction: Reaction | null; hostReaction: Reaction | null };
export type Avatar = { src?: string; initials?: string; alt: string };

const TZ = "America/Chicago";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
// All times are Central with a "CT" label (Oscar, Nov 20, PX2-F6): check-in times and deadlines are Central too.
export const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " CT";
export const stamp = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " CT";
function dayLabel(iso: string) {
  const k = dayKey(iso), today = dayKey(new Date().toISOString()), yest = dayKey(new Date(Date.now() - 864e5).toISOString());
  if (k === today) return "Today";
  if (k === yest) return "Yesterday";
  // Within the last week: the day of the week, like the Airbnb app ("Monday").
  if (Date.parse(today) - Date.parse(k) < 7 * 864e5) return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(new Date(iso));
  const sameYear = k.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(iso));
}

function Face({ a, big }: { a: Avatar; big?: boolean }) {
  return a.src ? <img className={big ? "CH-av CH-avBig" : "CH-av"} src={a.src} alt={a.alt} />
    : <span className={big ? "CH-av CH-avBig CH-avTxt" : "CH-av CH-avTxt"} role="img" aria-label={a.alt}>{a.initials}</span>;
}

export function ChatScreen(p: {
  me: "guest" | "host";
  avatars: [Avatar, Avatar];           // [main (the other side), small (you)]
  title: string; subtitle: string;
  onBack: () => void; backLabel: string;
  onDetails: () => void;
  confirmed: { at: string; text: string };
  messages: ChatMsg[] | null;
  draft: string; setDraft: (s: string) => void; onSend: () => void; busy: boolean; error?: string; note?: string;
  onReact: (m: ChatMsg, e: Reaction | null) => void;
  otherName: string; otherRole: string; footer?: ReactNode;
  /** Label of the button under the top line (default "Show reservation"); reactions off for pre-booking questions. */
  sysAction?: string; reactions?: boolean;
}) {
  const end = useRef<HTMLDivElement>(null), count = useRef(-1), ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const n = p.messages?.length ?? -1;
    if (n !== count.current) { end.current?.scrollIntoView({ block: "end", behavior: count.current < 0 ? "auto" : "smooth" }); count.current = n; }
  }, [p.messages]);
  useEffect(() => { const t = ta.current; if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; } }, [p.draft]);

  const rows: ReactNode[] = [];
  const list = p.messages ?? [];
  let lastDay = dayKey(p.confirmed.at), lastAt = 0, lastSender = "";
  list.forEach((m, i) => {
    const d = dayKey(m.at), t = Date.parse(m.at);
    if (d !== lastDay) { rows.push(<p key={"d" + m.id} className="CH-day">{dayLabel(m.at)}</p>); lastDay = d; lastAt = 0; }
    const mine = m.sender === p.me;
    const newGroup = t - lastAt > 10 * 60_000 || m.sender !== lastSender;
    if (newGroup) rows.push(<p key={"t" + m.id} className={mine ? "CH-time CH-timeMe" : "CH-time CH-timeThem"}>{mine ? time(m.at) : <><span className="CH-who2">{p.otherName} · {p.otherRole}</span> {time(m.at)}</>}</p>);
    lastAt = t; lastSender = m.sender;
    // Like the Airbnb app: the other side's photo sits beside the last message of each of their groups.
    const next = list[i + 1];
    const lastOfGroup = !next || next.sender !== m.sender || Date.parse(next.at) - t > 10 * 60_000 || dayKey(next.at) !== d;
    const bubble = p.reactions === false ? (
      <div key={m.id} className={mine ? "CH-msg CH-mine" : "CH-msg"}><p>{m.body}</p>{mine && m.readAt && <span className="sr-only">Seen {stamp(m.readAt)}</span>}</div>
    ) : (
      <MessageActions key={m.id} mineSide={mine} text={m.body} seen={mine && m.readAt ? stamp(m.readAt) : null}
        shown={[m.guestReaction, m.hostReaction]} mine={p.me === "guest" ? m.guestReaction : m.hostReaction} onPick={(e) => p.onReact(m, e)}>
        <div className={mine ? "CH-msg CH-mine" : "CH-msg"}><p>{m.body}</p></div>
      </MessageActions>
    );
    rows.push(mine ? bubble : (
      <div key={"r" + m.id} className="CH-them">
        <span className="CH-themAv">{lastOfGroup && <Face a={p.avatars[0]} />}</span>
        {bubble}
      </div>
    ));
  });

  // "Sent · 10:46 AM" / "Seen · 10:52 AM" under your latest message when it's the last one (Oscar, Nov 20: so the
  // sender knows it went through).
  const last = list[list.length - 1];
  if (last && last.sender === p.me) rows.push(
    <p key="status" className="CH-status" role="status">{last.readAt ? `Seen · ${time(last.readAt)}` : `Sent · ${time(last.at)}`}</p>);

  return (
    <div className="CH" role="dialog" aria-label={`Chat with ${p.title}`}>
      <header className="CH-top">
        <button type="button" className="CH-back" onClick={p.onBack} aria-label={p.backLabel}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="CH-who">
          <span className="CH-faces"><Face a={p.avatars[0]} big /><Face a={p.avatars[1]} /></span>
          <strong>{p.title}</strong>
          <span className="CH-sub">{p.subtitle}</span>
        </div>
        <button type="button" className="CH-details" onClick={p.onDetails}>Details</button>
      </header>
      <div className="CH-body" aria-live="polite">
        <p className="CH-day">{dayLabel(p.confirmed.at)}</p>
        <p className="CH-sys">{p.confirmed.text}<br /><button type="button" onClick={p.onDetails}>{p.sysAction ?? "Show reservation"}</button></p>
        {p.messages === null && <p className="CH-sys">Loading messages…</p>}
        {rows}
        {p.footer}
        <div ref={end} />
      </div>
      <form className="CH-send" onSubmit={(e) => { e.preventDefault(); p.onSend(); }}>
        {(p.error || p.note) && <p className={p.error ? "CH-err" : "CH-note"} role={p.error ? "alert" : undefined}>{p.error || p.note}</p>}
        <div className="CH-box">
          <label className="sr-only" htmlFor="ch-msg">Message</label>
          <textarea id="ch-msg" ref={ta} rows={1} maxLength={2000} value={p.draft} onChange={(e) => p.setDraft(e.target.value)} placeholder="Write a message…" />
          <button type="submit" className="CH-go" disabled={!p.draft.trim() || p.busy} aria-label="Send">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "G";
export const guestLine = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;
export const fullRange = (a: string, b: string) => {
  const f = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(d + "T00:00:00Z"));
  return `${f(a)} – ${f(b)}`;
};
