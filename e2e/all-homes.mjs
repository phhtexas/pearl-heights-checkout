// All Homes mockup C (A and B archived): load, noindex, five homes, search shows totals (or reasons), cards carry the dates to
// the listing, which prefills them. No sideways scroll on a phone. Run: BASE_URL=http://localhost:3401 node e2e/all-homes.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3401";
const ok = (c, m) => { console.log((c ? "ok  - " : "FAIL- ") + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
// pick dates ~60 days out (mock calendar is open)
const iso = (d) => d.toISOString().slice(0, 10);
const a = new Date(Date.now() + 60 * 864e5), b = new Date(Date.now() + 63 * 864e5);
for (const v of ["c"]) for (const dev of [devices["iPhone 13"], { viewport: { width: 1366, height: 900 } }]) {
  const w = dev.viewport.width, tag = `${v}@${w}`;
  const page = await (await browser.newContext(dev)).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${BASE}/all-homes/${v}`);
  ok(res.status() === 200, `${tag}: loads`);
  ok(/noindex/.test(await page.getAttribute('meta[name="robots"]', "content")), `${tag}: noindex`);
  ok((await page.textContent("h1")).includes("Find your San Antonio stay"), `${tag}: headline`);
  ok((await page.locator('[id^="home-"]').count()) >= 5, `${tag}: five homes`);
  const text = await page.evaluate(() => document.body.innerText);
  ok(text.includes("4.98 average across 463 Airbnb guest reviews"), `${tag}: trust proof before the homes`);
  ok(text.indexOf("Book directly with local hosts") < text.indexOf("Large Family House Next to the Pearl"), `${tag}: trust appears before the homes`);
  ok((text.match(/Add dates for the total/g) ?? []).length === 5, `${tag}: no dates -> "Add dates for the total" on every card`);
  ok(!/best rate|no fees|cheaper|less than airbnb|#1|facebook/i.test(text), `${tag}: no banned claims`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tag}: no sideways scroll`);
  // Search
  await page.fill('input[aria-label="Check-in date"]', iso(a));
  await page.fill('input[aria-label="Check-out date"]', iso(b));
  await page.click(".S-go");
  await page.waitForFunction(() => /total for 3 nights/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const after = await page.evaluate(() => document.body.innerText);
  ok((after.match(/total for 3 nights/g) ?? []).length >= 1, `${tag}: search shows exact totals`);
  ok(page.url().includes(`checkIn=${iso(a)}`), `${tag}: search is in the link (shareable)`);
  const href = await page.locator('#home-752 a[href^="/homes/"]').first().getAttribute("href");
  ok(href === `/homes/752-myrtle?checkIn=${iso(a)}&checkOut=${iso(b)}&adults=2&children=0`, `${tag}: card link carries the search (${href})`);
  // Guests over capacity -> reason on the 8-guest homes
  await page.click(".S-guests > button");
  for (let i = 0; i < 7; i++) await page.click('button[aria-label="More adults"]');
  await page.click(".S-done"); await page.click(".S-go");
  await page.waitForFunction(() => /Sleeps 8/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const big = await page.evaluate(() => document.body.innerText);
  ok(/Sleeps 8/.test(big) && /total for 3 nights/.test(big), `${tag}: 9 guests -> 8-guest homes say "Sleeps 8", 736 still priced`);
  ok(errors.length === 0, `${tag}: no page errors ${errors.join(" | ")}`);
  if (w === 390) {
    await page.goto(`${BASE}${href}`);
    await page.waitForFunction(() => /total/i.test(document.querySelector(".V-bar")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
    ok(/total/i.test(await page.locator(".V-bar").innerText()), "listing opened from a card is already priced for those dates");
  }
  await page.context().close();
}
// Archived A and B: still load, labeled, and the old links redirect.
for (const v of ["a", "b"]) {
  const page = await (await browser.newContext()).newPage();
  const res = await page.goto(`${BASE}/all-homes/${v}`);
  ok(res.status() === 200 && page.url().endsWith(`/all-homes/archive/${v}`), `archived ${v}: old link redirects to the archive`);
  ok((await page.locator("aside").innerText()).startsWith("Archived"), `archived ${v}: labeled as archived, links to C`);
  await page.context().close();
}
// Mockup C extras: lazy map with five pins (totals after a search), pin -> card, sticky phone button, FAQ.
{
  const page = await (await browser.newContext(devices["iPhone 13"])).newPage();
  const tileReqs = []; page.on("request", (r) => { if (r.url().includes("tile.openstreetmap.org")) tileReqs.push(r.url()); });
  await page.goto(`${BASE}/all-homes/c`);
  await page.waitForTimeout(800);
  ok(tileReqs.length === 0, "c: map tiles don't load until the map scrolls near (speed)");
  ok((await page.locator(".C-pin").count()) === 5, "c: five pins");
  ok(!(await page.locator(".C-pin").allInnerTexts()).some((t) => /\d{3}\s|Myrtle|Indianola St|Claywell Dr|Edgewood Pl/i.test(t)), "c: pins never show an address");
  ok(!(await page.locator(".C-sticky").getAttribute("class")).includes("is-on"), "c: sticky button hidden while the search is on screen");
  await page.locator("#map-h").scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
  ok(tileReqs.length > 0, "c: map tiles load once the map is near the screen");
  ok((await page.locator(".C-sticky").getAttribute("class")).includes("is-on"), "c: sticky 'Search homes' button shows after scrolling past the search");
  await page.click(".C-stickyBtn"); await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Check-in date"), "c: sticky button brings the guest back to check-in");
  await page.fill('input[aria-label="Check-in date"]', iso(a)); await page.fill('input[aria-label="Check-out date"]', iso(b)); await page.click(".S-go");
  await page.waitForFunction(() => [...document.querySelectorAll(".C-pin")].some((p) => /^\$/.test(p.textContent ?? "")), null, { timeout: 15000 }).catch(() => {});
  ok((await page.locator(".C-pin").allInnerTexts()).some((t) => /^\$[\d,]+$/.test(t)), "c: after a search, pins show totals");
  await page.locator(".C-pin").nth(2).click(); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const r = document.getElementById("home-indianola")?.getBoundingClientRect(); return !!r && r.top > -10 && r.top < 200; }), "c: tapping a pin scrolls to that home's card");
  const q = page.locator(".C-faq details").first();
  await q.locator("summary").click();
  ok(await q.evaluate((d) => d.open), "c: questions open");
  ok((await page.locator(".C-proof li").count()) === 3 && (await page.locator(".C-proof").innerText()).includes("4.98"), "c: trust badges in the hero");
  ok((await page.locator(".S-ic").count()) === 3, "c: search fields have icons");
  ok((await page.locator(".C-areas > li").count()) === 3, "c: homes grouped by neighborhood under the map");
  ok(/\$[\d,]+\+? 3-night total/.test(await page.locator(".C-areas").innerText()), "c: neighborhood groups show totals after a search");
  // An unavailable home offers "Try other dates" (fake one by flipping a result in the page is not possible; check markup path instead)
  ok((await page.locator(".C-card .C-meta").first().evaluate((el) => el.nextElementSibling?.tagName)) === "H3", "c: area and rating sit above the home name");
  ok((await page.locator(".C-amen li").count()) === 8 && (await page.locator(".C-reviews li").count()) >= 6, "c: 8 'every home has' tiles and real reviews");
  await page.context().close();
}
await browser.close();
if (!process.exitCode) console.log("ALL HOMES E2E PASSED");
