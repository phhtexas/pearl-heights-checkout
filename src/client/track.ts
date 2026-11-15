/**
 * Funnel events for listing pages (note 138). Preview: pushed to window.dataLayer and logged, nothing sent anywhere.
 * Each event carries the property key and non-PII funnel context only. `once` keys stop double-firing.
 */
export type FunnelEvent = "property_viewed" | "dates_selected" | "availability_searched" | "quote_viewed" | "checkout_started";
const fired = new Set<string>();

export function track(event: FunnelEvent, params: Record<string, string | number | boolean>, once: string = event + JSON.stringify(params)) {
  if (typeof window === "undefined" || fired.has(once)) return;
  fired.add(once);
  const w = window as unknown as { dataLayer?: unknown[]; __phEvents?: unknown[] };
  const payload = { event, ...params, ts: Date.now() };
  (w.dataLayer ??= []).push(payload);
  (w.__phEvents ??= []).push(payload); // read by the e2e test
  if (process.env.NODE_ENV !== "production" || location.hostname.includes("-git-")) console.info("[track]", event, params);
}
