"use client";
import { useEffect, useState } from "react";
import { Countdown } from "@/client/Countdown";
import { useSheet } from "@/client/useSheet";
import { ChatScreen, fullRange, guestLine, initials, type ChatMsg } from "../../host/ChatScreen";

/** The guest's side of a question before booking: our replies, their answers, and any 24-hour special offer. */
type Inq = { id: string; propertyKey: string; checkIn: string | null; checkOut: string | null; adults: number; children: number; infants: number; guestName: string; createdAt: string };
type Offer = { total: number; regular: number; checkIn: string; checkOut: string; adults: number; children: number; infants: number; expiresAt: string; url: string };
const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 ? 2 : 0 });
const until = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));

export function Conversation({ token }: { token: string }) {
  const [inq, setInq] = useState<Inq | null>(null), [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [home, setHome] = useState<{ title: string; slug: string | null; photo: string | null } | null>(null), [offer, setOffer] = useState<Offer | null>(null);
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [details, setDetails] = useState(false);
  const sheetRef = useSheet(details, () => setDetails(false));
  const load = async () => {
    const r = await fetch(`/api/inquiries/${token}`, { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.messages) { setInq(j.inquiry); setMsgs(j.messages); setHome(j.home); setOffer(j.offer); }
    else if (r?.status === 404) location.reload();
  };
  useEffect(() => {
    const v = () => { if (!document.hidden) void load(); };
    void load(); const t = setInterval(v, 6_000);
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    const body = draft.trim(); if (!body || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/inquiries/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(r?.status === 429 ? "You've sent several messages. Please wait a few minutes." : j?.error ?? "Not sent. Please try again."); return; }
    setDraft(""); void load();
  };
  const n = inq ? inq.adults + inq.children : 0;
  const homeHref = home?.slug ? `/homes/${home.slug}` : "/all-homes/f";
  const offerCard = offer && (
    <div className="CH-offer" role="region" aria-label="Special offer">
      <p className="CH-offerTag">Special offer</p>
      <p className="CH-offerPrice"><b>{money(offer.total)}</b> total <s>{money(offer.regular)}</s></p>
      <p className="CH-offerLine">{fullRange(offer.checkIn, offer.checkOut)} · {guestLine(offer.adults + offer.children)}{offer.infants ? ` + ${offer.infants} ${offer.infants === 1 ? "infant" : "infants"}` : ""}</p>
      <Countdown until={offer.expiresAt} onEnd={() => void load()} />
      <p className="CH-offerLine">Good until {until(offer.expiresAt)}</p>
      <a className="CH-offerBtn" href={offer.url}>Book with this offer</a>
    </div>
  );
  return (
    <>
      <ChatScreen me="guest" otherName="Oscar & Fernanda" otherRole="Hosts" reactions={false}
        avatars={[{ src: "/homes/hosts/oscar-fernanda-about.jpg", alt: "Oscar & Fernanda" }, { initials: initials(inq?.guestName ?? ""), alt: inq?.guestName ?? "You" }]}
        title="Oscar & Fernanda" subtitle={home?.title ?? ""}
        onBack={() => location.assign(homeHref)} backLabel="Back to the home" onDetails={() => setDetails(true)} sysAction="Show details"
        confirmed={{ at: inq?.createdAt ?? new Date().toISOString(), text: inq ? `Your question · ${inq.checkIn && inq.checkOut ? `${fullRange(inq.checkIn, inq.checkOut)} · ${guestLine(n)}` : "no dates yet"} · nothing booked or charged` : "" }}
        messages={inq ? msgs : null} draft={draft} setDraft={setDraft} onSend={send} busy={busy} error={err} onReact={() => undefined} footer={offerCard} />
      {details && inq && (
        <div className="CH-sheet" onClick={() => setDetails(false)}>
          <div className="CH-sheetIn" ref={sheetRef} role="dialog" aria-modal="true" aria-label="Details" onClick={(e) => e.stopPropagation()}>
            {home?.photo && <img src={home.photo} alt="" />}
            <h2>{home?.title}</h2>
            <dl>
              <dt>Dates</dt><dd>{inq.checkIn && inq.checkOut ? fullRange(inq.checkIn, inq.checkOut) : "Not chosen yet"}</dd>
              <dt>Guests</dt><dd>{guestLine(n)}{inq.infants ? ` + ${inq.infants} ${inq.infants === 1 ? "infant" : "infants"}` : ""}</dd>
              <dt>Status</dt><dd>Question · nothing booked or charged</dd>
            </dl>
            <a className="CH-offerBtn" href={homeHref}>See the home and book</a>
            <button type="button" className="CH-close" onClick={() => setDetails(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

