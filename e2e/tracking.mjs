// Tracking (Oscar, Nov 18): banner gates trackers; funnel + CTA events; UTM capture. Build with NEXT_PUBLIC_GA4_ID and NEXT_PUBLIC_META_PIXEL_ID set (any test values).
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const sent = []; p.on("request", (r) => { const u = r.url(); if (/googletagmanager|facebook/.test(u)) sent.push(u.slice(0, 80)); });
await p.goto((process.env.BASE_URL || "http://localhost:3401") + "/homes/752-myrtle?utm_source=meta&utm_campaign=christmas26");
await p.waitForTimeout(1500);
console.log("banner visible:", await p.locator(".PH-consent").isVisible(), "| trackers before accept:", sent.length);
await p.getByRole("button", { name: "Accept" }).click(); await p.waitForTimeout(800);
console.log("after accept, tracker requests:", sent.length, "gtag:", await p.evaluate(() => typeof window.gtag), "fbq:", await p.evaluate(() => typeof window.fbq));
await p.locator("[data-cta=booking_card_availability]").first().click().catch(() => {});
await p.waitForTimeout(500);
const ev = await p.evaluate(() => (window.__phEvents || []).map((e) => e.event));
console.log("events:", ev.join(", "));
console.log("attrib:", await p.evaluate(() => sessionStorage.getItem("ph-attrib")));
await p.reload(); await p.waitForTimeout(800);
console.log("banner after reload:", await p.locator(".PH-consent").isVisible());
await b.close();
