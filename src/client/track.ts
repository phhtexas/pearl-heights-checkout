/**
 * Site tracking (Oscar, Nov 18: "track every possible interaction", drop-off, retargeting, conversions with value, ROAS).
 *
 * One call per funnel step. Every event is pushed to window.dataLayer (read by e2e tests). If, and only if, the visitor
 * accepted cookies, it is also sent to Google Analytics 4 and the Meta Pixel. The Meta event id matches the server-side
 * Conversions API event for bookings (booking ref), so Meta counts each booking once.
 * No names, emails, phone numbers or addresses are ever sent from the browser.
 */
import { analyticsIds, consent, loadTrackers, trackingConfigured } from "./consent";

export type FunnelEvent =
  | "all_homes_search" | "property_viewed" | "dates_selected" | "availability_searched" | "quote_viewed"
  | "book_click" | "checkout_started" | "guest_details_done" | "payment_step" | "purchase" | "cta_click" | "share" | "save_home";

/** Our event -> GA4 name and Meta name (standard event where one fits, else custom). */
const MAP: Record<FunnelEvent, { ga: string; meta?: [standard: boolean, name: string] }> = {
  all_homes_search: { ga: "search", meta: [true, "Search"] },
  availability_searched: { ga: "search", meta: [true, "Search"] },
  property_viewed: { ga: "view_item", meta: [true, "ViewContent"] },
  dates_selected: { ga: "dates_selected", meta: [false, "DatesSelected"] },
  quote_viewed: { ga: "quote_viewed", meta: [false, "QuoteViewed"] },
  book_click: { ga: "book_click", meta: [false, "BookClick"] },
  checkout_started: { ga: "begin_checkout", meta: [true, "InitiateCheckout"] },
  guest_details_done: { ga: "add_shipping_info", meta: [false, "GuestDetails"] },
  payment_step: { ga: "add_payment_info", meta: [true, "AddPaymentInfo"] },
  purchase: { ga: "purchase", meta: [true, "Purchase"] },
  cta_click: { ga: "cta_click" },
  share: { ga: "share", meta: [false, "Share"] },
  save_home: { ga: "add_to_wishlist", meta: [true, "AddToWishlist"] },
};

type Params = Record<string, string | number | boolean | undefined>;
const fired = new Set<string>();

/** Shapes the GA4 and Meta parameters from our flat params (property, nights, guests, total_cents...). */
function shape(event: FunnelEvent, p: Params) {
  const value = typeof p.total_cents === "number" ? Math.round(p.total_cents) / 100
    : typeof p.value_cents === "number" ? Math.round(p.value_cents) / 100 : undefined;
  const item = p.property ? [{ item_id: String(p.property), item_name: String(p.property), quantity: Number(p.nights ?? 1) || 1 }] : undefined;
  const ga: Record<string, unknown> = { ...p, value, currency: value != null ? "USD" : undefined, items: item };
  if (event === "purchase") { ga.transaction_id = String(p.booking_ref ?? ""); }
  const meta: Record<string, unknown> = {
    content_ids: p.property ? [String(p.property)] : undefined, content_type: p.property ? "product" : undefined,
    value, currency: value != null ? "USD" : undefined,
    checkin_date: p.check_in as string | undefined, checkout_date: p.check_out as string | undefined,
    num_adults: p.adults as number | undefined, num_children: p.children as number | undefined,
    nights: p.nights as number | undefined, cta: p.cta as string | undefined, destination: p.destination as string | undefined,
  };
  for (const o of [ga, meta]) for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return { ga, meta };
}

export function track(event: FunnelEvent, params: Params, once: string = event + JSON.stringify(params), eventId?: string) {
  if (typeof window === "undefined" || fired.has(once)) return;
  fired.add(once);
  const w = window as unknown as { dataLayer?: unknown[]; __phEvents?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void };
  const payload = { event, ...params, ts: Date.now() };
  (w.dataLayer ??= []).push(payload);
  (w.__phEvents ??= []).push(payload); // read by the e2e tests
  if (process.env.NODE_ENV !== "production" || location.hostname.includes("-git-")) console.info("[track]", event, params);
  if (consent() !== "granted" || !trackingConfigured()) {
    // Held for this page view only: sent if the visitor taps Accept on this page (e.g. the home they're viewing).
    if (consent() === "unset" && pending.length < 30) pending.push([event, params, once, eventId]);
    return;
  }
  send(event, params, once, eventId);
}

const pending: [FunnelEvent, Params, string, string | undefined][] = [];
if (typeof window !== "undefined") window.addEventListener("ph-consent", (e) => {
  if ((e as CustomEvent).detail === "granted") for (const p of pending.splice(0)) send(...p);
  else pending.length = 0;
});

function send(event: FunnelEvent, params: Params, once: string, eventId?: string) {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void };
  loadTrackers();
  const ids = analyticsIds();
  const { ga, meta } = shape(event, params);
  const m = MAP[event];
  try { if (ids.ga4) w.gtag?.("event", m.ga, { ...ga, transport_type: "beacon" }); } catch { /* analytics never breaks the page */ }
  try {
    if (ids.pixel && m.meta) {
      const opts = { eventID: eventId ?? `${event}-${once}`.slice(0, 100) };
      w.fbq?.(m.meta[0] ? "track" : "trackCustom", m.meta[1], meta, opts);
    }
  } catch { /* ignore */ }
}

/** Clicks on any element with data-cta="<where>" (and optional data-cta-home) are tracked as cta_click. */
export function installCtaTracking() {
  if (typeof document === "undefined" || (window as unknown as { __phCta?: boolean }).__phCta) return;
  (window as unknown as { __phCta?: boolean }).__phCta = true;
  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.("[data-cta]") as HTMLElement | null;
    if (!el) return;
    track("cta_click", { cta: el.dataset.cta!, property: el.dataset.ctaHome, page: location.pathname, label: (el.innerText || "").trim().slice(0, 40) }, "cta" + Date.now() + Math.random());
  }, { capture: true });
}
