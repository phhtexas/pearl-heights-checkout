// Perplexity round 2 (Nov 20): PX2-F1 (root checkout: switch homes, short-notice dates, continue to details, no crash),
// PX2-F2 (trip edits survive a refresh), PX2-F3 (map link to a home hidden by Saved), PX2-F4 (calendar endpoint names).
// BASE_URL=http://localhost:3401 node e2e/round2.mjs  (mock server: ALLOW_MOCK=true NEXT_PUBLIC_SANDBOX=true npx next start -p 3401)
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("./_noBanner.cjs")(createRequire(import.meta.url)("playwright"));

const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (c, m) => (c ? console.log("ok  -", m) : fail(m));
const browser = await chromium.launch();
const errors = [];
const watch = (page) => { page.on("pageerror", (e) => errors.push(e.message)); return page; };
const fill = async (page) => {
  await page.fill('input[autocomplete="given-name"]', "Ana");
  await page.fill('input[autocomplete="family-name"]', "Test");
  await page.fill('input[type="email"]', "ana@example.com");
  await page.fill('input[type="tel"]', "2105550100");
  await page.evaluate(() => document.activeElement?.blur());
};

// PX2-F1: the root checkout, every home, short-notice dates (first bookable day + 2 nights, else the next pair), then details.
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = watch(await ctx.newPage());
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1000);
  const keys = await page.$$eval("label select option", (o) => o.map((x) => x.value));
  for (const key of keys) {
    await page.goto(`${BASE}/`); await page.waitForTimeout(800);
    if (await page.isVisible(".sheet")) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
    await page.selectOption("label select", key);
    await page.waitForTimeout(500);
    if (!(await page.isVisible(".sheet"))) await page.click('button:has-text("Choose"):visible, button:has-text("Change"):visible >> nth=0');
    await page.waitForSelector(".sheet .day");
    await page.waitForTimeout(400);
    const pre = (l) => l.split(", ").slice(0, 3).join(", ");
    let days = [];
    for (let m = 0; m < 3 && days.length < 2; m++) {
      if (m) { await page.click('.sheet button[aria-label="Next month"]'); await page.waitForTimeout(300); }
      days = (await page.$$eval(".sheet .day:not([disabled])", (b) => b.map((x) => x.getAttribute("aria-label")))).map(pre);
    }
    let saved = false;
    // A short-notice stay: the first bookable day whose next day is also bookable, checking out 2 nights later.
    const iso = (l) => new Date(l + " 12:00 UTC").toISOString().slice(0, 10);
    const set = new Set(days.map(iso));
    const start = days.find((l) => set.has(new Date(Date.parse(iso(l)) + 864e5).toISOString().slice(0, 10)));
    if (start) {
      await page.click(`.sheet [aria-label^="${start}"]`);
      await page.waitForTimeout(150);
      const end = new Date(Date.parse(iso(start)) + 2 * 864e5).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
      const btn = page.locator(`.sheet [aria-label^="${end}"]`);
      if (await btn.count() && await btn.isEnabled()) { await btn.click(); await page.waitForTimeout(150); }
      if (await page.isEnabled(".sheet >> text=Save dates")) { await page.click(".sheet >> text=Save dates"); saved = true; }
    }
    if (!saved && await page.isVisible(".sheet")) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
    if (!saved) { ok(true, `${key}: no short-notice stay bookable in the mock (skipped)`); continue; }
    await page.waitForSelector("text=Continue to your details", { timeout: 10000 }).catch(() => {});
    await page.click("text=Continue to your details >> visible=true");
    const form = await page.waitForSelector('input[autocomplete="given-name"]', { timeout: 5000 }).catch(() => null);
    ok(!!form && !(await page.$("text=Application error")), `${key}: details form after short-notice dates`);
    await page.click('button[aria-label="Back"] >> visible=true').catch(() => {});
    await page.waitForTimeout(300);
  }
  await ctx.close();
}

// PX2-F2: change dates and guests in checkout, enter details, refresh: the edited trip and details come back.
for (const dev of [{ viewport: { width: 1400, height: 900 } }, devices["iPhone 13"]]) {
  const ctx = await browser.newContext(dev);
  const page = watch(await ctx.newPage());
  const quotes = [];
  page.on("response", async (r) => { if (r.url().endsWith("/api/quote") && r.ok()) quotes.push(await r.json()); });
  await page.goto(`${BASE}/?home=752&checkIn=2027-01-26&checkOut=2027-01-29&adults=2&children=0&infants=0`);
  await page.waitForSelector(".plan");
  await page.click('button:has-text("Change"):visible >> nth=0');
  await page.click('[aria-label^="Tue, Jan 26, 2027"]');
  await page.click('[aria-label^="Thu, Jan 28, 2027"]');
  await page.click("text=Save dates");
  await page.waitForTimeout(800);
  await page.click('button:has-text("Change"):visible >> nth=1');
  await page.click('[aria-label="More Adults"]');
  await page.click("text=Save guests");
  await page.waitForTimeout(1200);
  const edited = quotes.at(-1);
  const url = new URL(page.url());
  ok(url.searchParams.get("checkOut") === "2027-01-28" && url.searchParams.get("adults") === "3", `address follows the edited trip (${url.search})`);
  await page.click("text=Continue to your details >> visible=true");
  await fill(page);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('input[autocomplete="given-name"]', { timeout: 10000 }).catch(() => {});
  ok((await page.inputValue('input[autocomplete="given-name"]').catch(() => "")) === "Ana", "details kept after refresh");
  await page.waitForTimeout(800);
  const after = quotes.at(-1);
  ok(after?.quote?.nights === 2 && after.quote.total === edited.quote.total, `refreshed quote is the edited trip (2 nights, ${after?.quote?.total} = ${edited?.quote?.total})`);
  await page.click('button[aria-label="Back"] >> visible=true');
  await page.waitForSelector(".plan");
  const txt = await page.textContent("main");
  ok(/3 guests/.test(txt ?? "") && /Jan 26/.test(txt ?? "") && /28/.test(txt ?? ""), "Review shows the edited dates and 3 guests after refresh + Back");
  await ctx.close();
}

// PX2-F4: the checkout calendar names the chosen check-in and checkout days.
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = watch(await ctx.newPage());
  await page.goto(`${BASE}/?home=752&checkIn=2027-01-26&checkOut=2027-01-29&adults=2`);
  await page.waitForSelector(".plan");
  await page.click('button:has-text("Change"):visible >> nth=0');
  ok(!!(await page.$('[aria-label^="Tue, Jan 26, 2027, check-in"]')), "checkout calendar: check-in day named");
  ok(!!(await page.$('[aria-label^="Fri, Jan 29, 2027, check-out"]')), "checkout calendar: checkout day named");
  await page.goto(`${BASE}/homes/752-myrtle`);
  await page.click("text=Check availability >> visible=true");
  await page.waitForTimeout(800);
  for (let m = 0; m < 3 && !(await page.$(".L-month button.day:not([disabled])")); m++) { await page.click('.sheet button[aria-label="Next month"]'); await page.waitForTimeout(300); }
  if (!(await page.$('button.day[aria-label*=", check-in"]'))) {
    // No dates carried: pick the first bookable day and the first checkout after it.
    await page.locator(".L-month button.day:not([disabled])").first().click();
    await page.waitForTimeout(200);
    await page.locator('.L-month button.day:not([disabled]):not([aria-label*="check-in"])').first().click();
    await page.waitForTimeout(200);
  }
  const listed = await page.$$eval('button[aria-label*=", check-in"], button[aria-label*=", check-out"]', (b) => b.map((x) => x.getAttribute("aria-label")));
  ok(listed.length >= 1, `home page calendar names endpoints (${listed.join(" | ")})`);
  await ctx.close();
}

// PX2-F3: with only one home saved and Saved on, a map link to another home shows all homes and goes to that card.
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = watch(await ctx.newPage());
  await page.goto(`${BASE}/all-homes/f`);
  await page.click('button[aria-label^="Save "] >> nth=0');
  await page.click("text=♥ Saved (1)");
  await page.waitForTimeout(300);
  const target = await page.$$eval('.F-hoodHomes a', (a) => a.map((x) => x.getAttribute("href")).filter((h) => !document.getElementById(h.slice(1))));
  ok(target.length > 0, `a map link points to a hidden card (${target[0]})`);
  await page.click(`.F-hoodHomes a[href="${target[0]}"]`);
  await page.waitForTimeout(900);
  ok(!!(await page.$(target[0])), "the hidden card is shown");
  ok(page.url().endsWith(target[0]), "address has the card");
  ok(await page.$eval("text=All homes", (b) => b.getAttribute("aria-pressed") === "true"), "switched to All homes");
  const top = await page.$eval(target[0], (el) => el.getBoundingClientRect().top);
  ok(top > -50 && top < 400, `scrolled to the card (top ${Math.round(top)})`);
  await ctx.close();
}

ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(" | ")})`);
await browser.close();
console.log(process.exitCode ? "E2E FAILED" : "E2E PASSED");
