// Every home page built from the V2 template (note 155): loads, shows its own facts, hides what it must,
// and hands the right home to checkout. Run: BASE_URL=http://localhost:3401 node e2e/listing-homes.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };

const HOMES = [
  { slug: "edgewood-alamo-heights", key: "edgewood", title: "Stylish, Charming Home In The Heart of San Antonio", cap: "2 bedrooms · 3 beds · 1 bath · sleeps 8", registration: false, mustNot: [/147 E/i, /Edgewood Place/i, /welcomehome/i, /Cond[eé] Nast/i] },
];

const browser = await chromium.launch();
for (const h of HOMES) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${BASE}/homes/${h.slug}`);
  ok(res.status() === 200, `${h.key}: page loads`);
  ok((await page.textContent("h1"))?.trim() === h.title, `${h.key}: title`);
  const text = await page.evaluate(() => document.body.innerText);
  ok(text.includes(h.cap), `${h.key}: capacity line "${h.cap}"`);
  ok(text.includes("registration") === h.registration, `${h.key}: registration line ${h.registration ? "shown" : "hidden"}`);
  for (const re of h.mustNot) ok(!re.test(text), `${h.key}: page does not show ${re}`);
  ok(!/facebook/i.test(await page.content()), `${h.key}: no Facebook element`);
  const imgs = await page.$$eval("img", (a) => a.slice(0, 3).map((i) => i.currentSrc));
  ok(imgs.some((s) => s.includes("hospitable.com") || s.includes("property_images")), `${h.key}: real photos`);
  // Reserve without dates opens the date sheet; pick dates, then hand off.
  await page.click(".V-bar .V-cta");
  await page.waitForSelector(".day:not([disabled])");
  const days = page.locator(".day:not([disabled]):visible");
  let picked = false;
  for (let m = 0; m < 6 && !picked; m++) {
    const n = await days.count();
    for (let i = 0; i + 3 < n && !picked; i++) {
      await days.nth(i).click();
      await days.nth(i + 3).click().catch(() => {});
      const save = page.locator("text=Save dates");
      if (await save.isEnabled().catch(() => false)) { await save.click(); picked = true; }
    }
    if (!picked) await page.click('[aria-label="Next month"]');
  }
  ok(picked, `${h.key}: dates picked`);
  await page.waitForSelector(".V-bar b:has-text('total')", { timeout: 15000 }).catch(() => {});
  await page.click(".V-bar .V-cta");
  await page.waitForURL(new RegExp(`\\?home=${h.key}`), { timeout: 15000 }).catch(() => {});
  ok(page.url().includes(`home=${h.key}`), `${h.key}: Reserve hands off home=${h.key}`);
  await page.waitForSelector(".plan", { timeout: 15000 }).catch(() => {});
  const ck = await page.evaluate(() => document.body.innerText);
  ok(ck.includes(h.title), `${h.key}: checkout shows this home's title`);
  ok(errors.length === 0, `${h.key}: no page errors ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (!process.exitCode) console.log("HOMES E2E PASSED");
