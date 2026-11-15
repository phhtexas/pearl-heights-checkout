// Listing page test (note 138): mobile + desktop, date/guest flow, no stale price, events fire once, hand-off to Checkout E.
// Run: ALLOW_MOCK=true npx next start -p 3401 ; BASE_URL=http://localhost:3401 node e2e/listing-736.mjs [shotsDir]
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const SHOTS = process.argv[2];
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();

for (const [label, ctxOpts] of [["mobile", { ...devices["iPhone 13"] }], ["desktop", { viewport: { width: 1280, height: 900 } }]]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/homes/736-myrtle`);
  await page.waitForSelector("h1");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-first.png` });
  const ev = () => page.evaluate(() => (window.__phEvents ?? []).map((e) => e.event));
  ok((await ev()).filter((e) => e === "property_viewed").length === 1, `${label}: property_viewed fired once`);
  // Open dates from the one primary action.
  const cta = label === "mobile" ? ".L-bar .btn" : ".L-side .btn";
  ok((await page.locator(".btn:visible", { hasText: /Check availability|Reserve/ }).count()) === 1, `${label}: exactly one visible primary booking action`);
  await page.click(cta);
  await page.waitForSelector('[role="dialog"]');
  await page.waitForSelector(".day:not([disabled])");
  for (let i = 0; i < 6 && !(await page.locator('[aria-label^="Sun, Jan 10, 2027"]:visible').count()); i++) await page.click('[aria-label="Next month"]');
  await page.click('[aria-label^="Sun, Jan 10, 2027"]:visible');
  await page.click('[aria-label^="Tue, Jan 12, 2027"]:visible');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-dates.png` });
  await page.click("text=Save dates");
  await page.waitForSelector(".L-price .total:visible", { timeout: 10000 });
  const t1 = await page.textContent(".L-price .total >> visible=true");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-quote.png`, fullPage: label === "desktop" });
  // Change guests: the old price must disappear while re-quoting.
  await page.click(label === "mobile" ? ".L-mobileBook .L-field.wide" : ".L-side .L-field.wide");
  for (let i = 0; i < 7; i++) await page.click('[aria-label="More Adults"]');
  await page.click("text=Save guests");
  const staleGone = await page.waitForFunction((old) => { const el = [...document.querySelectorAll(".L-price .total")].find((e) => e.offsetParent); return !el || el.textContent !== old; }, t1, { timeout: 3000 }).then(() => true).catch(() => false);
  ok(staleGone, `${label}: old price not shown after guest change`);
  await page.waitForSelector(".L-price .total:visible");
  const t2 = await page.textContent(".L-price .total >> visible=true");
  ok(t1 !== t2, `${label}: total updated for 9 guests (extra-guest fee) (${t1} → ${t2})`);
  const e = await ev();
  ok(e.filter((x) => x === "dates_selected").length === 1, `${label}: dates_selected once`);
  ok(e.filter((x) => x === "availability_searched").length === 2 && e.filter((x) => x === "quote_viewed").length === 2, `${label}: availability_searched/quote_viewed once per search (${JSON.stringify(e)})`);
  const payloads = await page.evaluate(() => JSON.stringify(window.__phEvents));
  ok(!/@|phone|email|name/i.test(payloads.replace(/"event"/g, "")), `${label}: no PII in event payloads`);
  // Photos dialog keyboard close.
  await page.click(".L-all");
  await page.waitForSelector(".L-photos");
  await page.keyboard.press("Escape");
  ok((await page.locator('[role="dialog"]').count()) === 0, `${label}: photo gallery closes with Escape`);
  // Hand-off.
  await page.click(label === "mobile" ? ".L-bar .btn" : ".L-side .btn");
  await page.waitForURL(/\?home=736/);
  ok((await page.url()).includes("checkIn=2027-01-10&checkOut=2027-01-12&adults=9"), `${label}: Checkout E opened with same home/dates/guests`);
  await page.waitForSelector(".plan", { timeout: 10000 });
  ok((await page.textContent("main")).includes("Jan 10"), `${label}: checkout shows Jan 10`);
  ok(errors.length === 0, `${label}: no page errors ${errors.join("; ")}`);
  await ctx.close();
}
await browser.close();
console.log(process.exitCode ? "LISTING E2E FAILED" : "LISTING E2E PASSED");
