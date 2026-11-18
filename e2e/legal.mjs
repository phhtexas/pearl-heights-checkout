// Draft legal pages: /legal hub + one page per document. Each loads, is noindex, is labeled DRAFT, contents links
// work, no sideways scroll on a phone, and the search box suggests sections as you type.
// Run: BASE_URL=http://localhost:3401 node e2e/legal.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("./_noBanner.cjs")(createRequire(import.meta.url)("playwright"));
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const PAGES = [
  ["/legal", "Terms and policies"],
  ["/terms", "Direct Booking Terms and Cancellation Policy"],
  ["/rental-agreement", "Rental Agreement and House Rules"],
  ["/privacy", "Privacy and Cookie Notice"],
  ["/website-terms", "Website Terms of Use"],
];
const browser = await chromium.launch();
for (const dev of [devices["iPhone 13"], { viewport: { width: 1280, height: 900 } }]) {
  const w = dev.viewport.width;
  const ctx = await browser.newContext(dev); const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title] of PAGES) {
    const res = await page.goto(BASE + path);
    ok(res.status() === 200, `${w} ${path}: loads`);
    ok((await page.textContent("h1"))?.trim() === title, `${w} ${path}: title`);
    ok(/noindex/.test(await page.getAttribute('meta[name="robots"]', "content")), `${w} ${path}: noindex`);
    const text = await page.evaluate(() => document.body.innerText);
    ok(text.includes("Draft — not for real bookings"), `${w} ${path}: DRAFT label`);
    if (path !== "/legal") ok(text.includes("1.2 (draft)"), `${w} ${path}: version 1.2`);
    ok(!/cheaper|less than airbnb|best rate|no fees/i.test(text), `${w} ${path}: no price comparison`);
    const broken = await page.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute("href").slice(1)).filter((id) => id && !document.getElementById(id)));
    ok(broken.length === 0, `${w} ${path}: contents links have targets ${broken.join(",")}`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${w} ${path}: no sideways scroll`);
  }
  // Hub cards link to each page
  await page.goto(BASE + "/legal");
  for (const [path] of PAGES.slice(1)) ok((await page.locator(`.L-cards a[href="${path}"]`).count()) === 1, `${w} hub links to ${path}`);
  // Search: suggestions appear as you type, keyboard picks one and opens it
  const box = page.locator('input[role="combobox"]');
  await box.fill("pets");
  await page.waitForSelector('[role="listbox"]:not([hidden]) [role="option"]');
  const n = await page.locator('[role="option"]').count();
  ok(n > 0 && n <= 8, `${w} search "pets": ${n} suggestions`);
  ok((await box.getAttribute("aria-expanded")) === "true", `${w} search: aria-expanded`);
  await box.press("ArrowDown");
  ok((await box.getAttribute("aria-activedescendant")) !== null, `${w} search: arrow key highlights an option`);
  await Promise.all([page.waitForURL(/#/), box.press("Enter")]);
  ok(/\/(terms|rental-agreement|privacy|website-terms)#/.test(page.url()), `${w} search: Enter opens the section (${page.url().replace(BASE, "")})`);
  // Click a suggestion on a document page
  await page.locator('input[role="combobox"]').fill("refund schedule");
  await page.waitForSelector('[role="option"]');
  ok((await page.locator('[role="option"]').first().innerText()).includes("Cancellation and refund schedule"), `${w} search "refund schedule": best match first`);
  await Promise.all([page.waitForURL(/booking-terms-13/), page.locator('[role="option"]').first().click()]);
  ok(page.url().endsWith("/terms#booking-terms-13"), `${w} search: click opens /terms#booking-terms-13`);
  await page.locator('input[role="combobox"]').fill("zzqx");
  ok((await page.locator(".L-rNone").count()) === 1, `${w} search: no-match message`);
  await page.locator('input[role="combobox"]').press("Escape");
  ok(await page.locator('[role="listbox"]').isHidden(), `${w} search: Escape closes`);
  ok(errors.length === 0, `${w}: no page errors ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
if (!process.exitCode) console.log("LEGAL E2E PASSED");
