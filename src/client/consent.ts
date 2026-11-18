/**
 * Cookie consent + tracker loading (Oscar, Nov 18). Google Analytics and the Meta Pixel load only after the visitor
 * taps "Accept". The choice is kept in this browser (localStorage) for 180 days. IDs come from public env vars, so the
 * trackers stay off until they are set in Vercel.
 */
export type Consent = "granted" | "denied" | "unset";
const KEY = "ph-consent";
const DAYS = 180;

export function analyticsIds() {
  return { ga4: process.env.NEXT_PUBLIC_GA4_ID || "", pixel: process.env.NEXT_PUBLIC_META_PIXEL_ID || "" };
}
export const trackingConfigured = () => { const i = analyticsIds(); return !!(i.ga4 || i.pixel); };

export function consent(): Consent {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return "unset";
    const { v, at } = JSON.parse(raw) as { v: Consent; at: number };
    if (Date.now() - at > DAYS * 864e5) return "unset";
    return v === "granted" || v === "denied" ? v : "unset";
  } catch { return "unset"; }
}

export function setConsent(v: "granted" | "denied") {
  try { localStorage.setItem(KEY, JSON.stringify({ v, at: Date.now() })); } catch { /* private mode: ask again next visit */ }
  if (v === "granted") loadTrackers();
  window.dispatchEvent(new CustomEvent("ph-consent", { detail: v }));
}

let loaded = false;
export function loadTrackers() {
  if (loaded || typeof window === "undefined" || consent() !== "granted") return;
  loaded = true;
  const { ga4, pixel } = analyticsIds();
  const w = window as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (ga4) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { w.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
    w.gtag("js", new Date());
    w.gtag("config", ga4, { anonymize_ip: true });
    const s = document.createElement("script"); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`;
    document.head.appendChild(s);
  }
  if (pixel && !w.fbq) {
    const n: any = (w.fbq = function fbq() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }); // eslint-disable-line
    if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    w.fbq("init", pixel);
    w.fbq("track", "PageView");
  }
}

/** First-party campaign info for our own booking records (utm_*, fbclid, gclid). Session only; never sent to third parties by us. */
export function captureAttribution() {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
    const found = Object.fromEntries(keys.filter((k) => q.get(k)).map((k) => [k, q.get(k)!.slice(0, 200)]));
    if (Object.keys(found).length) sessionStorage.setItem("ph-attrib", JSON.stringify({ ...found, landing: location.pathname, at: new Date().toISOString() }));
    else if (!sessionStorage.getItem("ph-attrib") && document.referrer && !document.referrer.startsWith(location.origin))
      sessionStorage.setItem("ph-attrib", JSON.stringify({ referrer: new URL(document.referrer).hostname, landing: location.pathname, at: new Date().toISOString() }));
  } catch { /* ignore */ }
}
export function attribution(): Record<string, string> | null {
  try { return JSON.parse(sessionStorage.getItem("ph-attrib") || "null"); } catch { return null; }
}
/** Meta browser ids (_fbp/_fbc cookies) so the server-side booking event matches the same visitor. */
export function metaBrowserIds() {
  const c = (n: string) => document.cookie.split("; ").find((x) => x.startsWith(n + "="))?.split("=")[1];
  return { fbp: c("_fbp"), fbc: c("_fbc") };
}
