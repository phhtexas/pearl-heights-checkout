// Every home page built from the V2 template (note 155): loads, shows its own facts, hides what it must,
// and hands the right home to checkout. Run: BASE_URL=http://localhost:3401 node e2e/listing-homes.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };

const HOMES = [
  { slug: "edgewood-alamo-heights", key: "edgewood", title: "Stylish, Charming Home In The Heart of San Antonio", cap: "2 bedrooms · 3 beds · 1 bath · sleeps 8", registration: false, mustNot: [/147 E/i, /Edgewood Place/i, /welcomehome/i, /Cond[eé] Nast/i] },
  { slug: "752-myrtle", key: "752", title: "5-Star Family-Friendly 3BR Walk to Pearl Riverwalk", cap: "3 bedrooms · 3 beds · 2 baths · sleeps 8", registration: true, mustNot: [/752 E(ast)? Myrtle/i, /Burger Boy/i] },
  { slug: "613-indianola", key: "indianola", title: "NEW #1 Downtown SA House-Walk to Tower & Alamodome", cap: "3 bedrooms · 3 beds · 2 baths · sleeps 8", registration: true, mustNot: [/613 Indianola St/i, /1515/, /welcomehome/i, /TheDowntownHouse/i] },
  { slug: "claywell-alamo-heights", key: "claywell", title: "#1 Large Family Home in the Heart of Alamo Heights", cap: "3 bedrooms · 5 beds · 2 baths · sleeps 8", registration: false, mustNot: [/110 Claywell/i, /Commercial photography allowed/i] },
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
  await page.waitForSelector(".day"); // the current month may be fully booked; the loop below moves ahead
  await page.waitForTimeout(800);
  // Find a real 3-night window from the calendar API (min stay respected), then click those exact days.
  const cal = await page.evaluate(async (k) => (await (await fetch(`/api/calendar?property=${k}`)).json()).days, h.key);
  let start = null;
  for (let i = 0; i + 3 < cal.length && !start; i++) {
    const run = cal.slice(i, i + 3);
    if (run.every((d) => d.available) && run[0].minStay <= 3 && cal[i + 3]) start = i;
  }
  const label = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  let picked = false;
  if (start !== null) {
    const a = `[aria-label^="${label(cal[start].date)}"]:visible`, b = `[aria-label^="${label(cal[start + 3].date)}"]:visible`;
    for (let m = 0; m < 12 && !(await page.locator(a).count()); m++) await page.click('[aria-label="Next month"]');
    await page.click(a);
    for (let m = 0; m < 2 && !(await page.locator(b).count()); m++) await page.click('[aria-label="Next month"]');
    await page.click(b);
    const save = page.locator("text=Save dates");
    if (await save.isEnabled().catch(() => false)) { await save.click(); picked = true; }
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
