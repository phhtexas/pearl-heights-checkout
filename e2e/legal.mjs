// Draft legal page (/legal): loads, is noindex, is labeled DRAFT, anchors work, no sideways scroll on a phone.
// Run: BASE_URL=http://localhost:3401 node e2e/legal.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
for (const dev of [devices["iPhone 13"], { viewport: { width: 1280, height: 900 } }]) {
  const ctx = await browser.newContext(dev); const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const w = dev.viewport.width;
  const res = await page.goto(`${BASE}/legal`);
  ok(res.status() === 200, `${w}: loads`);
  ok(/noindex/.test(await page.getAttribute('meta[name="robots"]', "content")), `${w}: noindex`);
  const text = await page.evaluate(() => document.body.innerText);
  ok(text.includes("Draft — not for real bookings"), `${w}: DRAFT label`);
  for (const t of ["Direct Booking Terms and Cancellation Policy", "Rental Agreement and House Rules", "Privacy and Cookie Notice", "Website Terms of Use"]) ok((await page.locator("h2", { hasText: t }).count()) === 1, `${w}: has ${t}`);
  ok((text.match(/1\.2 \(draft\)/g) ?? []).length === 4, `${w}: version 1.2 on each document`);
  ok(!/cheaper|less than airbnb|best rate|no fees/i.test(text), `${w}: no price comparison`);
  await page.click('.L-callout a[href="#privacy"]');
  ok(page.url().endsWith("#privacy"), `${w}: callout links jump to a document`);
  const broken = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute("href").slice(1)).filter((id) => id && !document.getElementById(id)));
  ok(broken.length === 0, `${w}: every contents link has a target ${broken.join(",")}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${w}: no sideways scroll`);
  ok(errors.length === 0, `${w}: no page errors ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (!process.exitCode) console.log("LEGAL E2E PASSED");
