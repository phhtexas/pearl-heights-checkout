"use client";
import { useEffect, useRef, useState } from "react";
import { track } from "@/client/track";
import "./share.css";

/**
 * Share sheet like the Airbnb app (Oscar's reference, Nov 19): the home's photo, name, rating and area on top, then
 * Copy link, Email, Messages, WhatsApp, Messenger (phones), Facebook, X and More options (the phone's own share menu).
 * Generic icons only (no brand logos). Each choice is tracked as a GA4 "share" event with its method.
 */
type Props = { open: boolean; onClose: () => void; url: string; title: string; photo: string; photoAlt: string; rating?: { value: number; count: number }; area: string; propertyKey: string };

const I = {
  copy: "M8 8h11v11H8zM5 16V5h11",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  sms: "M4 5h16v11H9l-5 4z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  bubble: "M12 4c4.8 0 8 3.1 8 7s-3.2 7-8 7c-.9 0-1.8-.1-2.6-.3L5 19.5l1.2-3.6C4.8 14.7 4 13 4 11c0-3.9 3.2-7 8-7z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z",
  post: "M5 5h14v14H5zM8 9h8M8 12h8M8 15h5",
  more: "M6 12h.01M12 12h.01M18 12h.01",
};
const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth={d === I.more ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function ShareSheet(p: Props) {
  const [copied, setCopied] = useState(false), [mobile, setMobile] = useState(false), [native, setNative] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)); setNative(typeof navigator.share === "function"); }, []);
  useEffect(() => {
    if (!p.open) return;
    closeBtn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); };
    addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [p.open]);
  if (!p.open) return null;
  const text = `${p.title} · Pearl Heights Homes`;
  const u = encodeURIComponent(p.url), t = encodeURIComponent(text);
  const log = (method: string) => track("share", { method, property: p.propertyKey, content_type: "home" }, "share" + method + Date.now());
  const copy = async () => {
    try { await navigator.clipboard.writeText(p.url); setCopied(true); setTimeout(() => setCopied(false), 2000); log("copy_link"); } catch { /* clipboard blocked */ }
  };
  const links: { key: string; label: string; icon: string; href: string; show?: boolean }[] = [
    { key: "email", label: "Email", icon: I.mail, href: `mailto:?subject=${t}&body=${encodeURIComponent(`Take a look at this home in San Antonio:\n${p.url}`)}` },
    { key: "messages", label: "Messages", icon: I.sms, href: `sms:?&body=${encodeURIComponent(`${text} ${p.url}`)}` },
    { key: "whatsapp", label: "WhatsApp", icon: I.phone, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${p.url}`)}` },
    { key: "messenger", label: "Messenger", icon: I.bubble, href: `fb-messenger://share/?link=${u}`, show: mobile },
    { key: "facebook", label: "Facebook", icon: I.globe, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "x", label: "X (Twitter)", icon: I.post, href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
  ];
  return (
    <div className="SH-back" onClick={p.onClose}>
      <div className="SH" role="dialog" aria-modal="true" aria-labelledby="sh-h" onClick={(e) => e.stopPropagation()}>
        <button ref={closeBtn} type="button" className="SH-x" onClick={p.onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <h2 id="sh-h">Share</h2>
        <div className="SH-home">
          <img src={p.photo} alt="" />
          <p>{p.title}{p.rating ? <> · ★{p.rating.value.toFixed(2)}</> : null} · Home in {p.area}</p>
        </div>
        <div className="SH-grid">
          <button type="button" onClick={copy}><Ico d={I.copy} />{copied ? "Link copied" : "Copy link"}</button>
          {links.filter((l) => l.show !== false).map((l) => (
            <a key={l.key} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => log(l.key)}><Ico d={l.icon} />{l.label}</a>
          ))}
          {native && <button type="button" onClick={async () => { try { await navigator.share({ title: text, url: p.url }); log("native"); } catch { /* cancelled */ } }}><Ico d={I.more} />More options</button>}
        </div>
      </div>
    </div>
  );
}
