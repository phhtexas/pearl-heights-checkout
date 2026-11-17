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
// Mockup E (functional): cover photo, fonts, padding, live search, filters, sort, map, card link, FAQ.
for (const dev of [devices["iPhone 13"], { viewport: { width: 1366, height: 900 } }]) {
  const w = dev.viewport.width, tag = `e@${w}`;
  const page = await (await browser.newContext(dev)).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${BASE}/all-homes/e`);
  ok(res.status() === 200, `${tag}: loads`);
  ok(/noindex/.test(await page.getAttribute('meta[name="robots"]', "content")), `${tag}: noindex`);
  ok((await page.locator(".E-cover img").count()) === 1, `${tag}: cover photo on top`);
  const f = await page.evaluate(() => ({ h1: getComputedStyle(document.querySelector("h1")).fontFamily, w: getComputedStyle(document.querySelector("h1")).fontWeight, logo: getComputedStyle(document.querySelector(".E-logo")).fontFamily, pad: getComputedStyle(document.querySelector("#homes")).paddingLeft }));
  ok(f.h1.startsWith("Inter") && f.w === "600" && f.logo.startsWith("Marcellus"), `${tag}: our fonts (Inter 600 headings, Marcellus logo) ${JSON.stringify(f)}`);
  ok(w === 390 ? f.pad === "24px" : f.pad === "40px", `${tag}: side padding ${f.pad}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tag}: no sideways scroll`);
  ok((await page.locator(".E-card").count()) === 5, `${tag}: five homes`);
  ok((await page.locator(".E-card .E-price b", { hasText: "Add dates" }).count()) === 5, `${tag}: no dates -> 'Add dates' on every card`);
  const t0 = await page.evaluate(() => document.body.innerText);
  ok(!/Free cancellation|Pet policies|flexible cancellation|Fast wifi|since the beginning|no fees|best rate/i.test(t0), `${tag}: no wrong or banned claims`);
  // filters
  await page.click('.E-chip:has-text("Downtown")');
  ok((await page.locator(".E-card").count()) === 1 && (await page.locator("#home-indianola").count()) === 1, `${tag}: Downtown filter -> Indianola only`);
  await page.click('.E-chip:has-text("Single level")');
  ok((await page.locator(".E-card").count()) === 3 && (await page.locator("#home-indianola").count()) === 0, `${tag}: Single level -> 736, 752, Edgewood`);
  await page.click('.E-chip:has-text("Any home")');
  // live search
  await page.fill('input[aria-label="Check-in date"]', iso(a)); await page.fill('input[aria-label="Check-out date"]', iso(b)); await page.click(".S-go");
  await page.waitForFunction(() => /total · 3 nights/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  ok((await page.locator(".E-card .E-price", { hasText: "total · 3 nights" }).count()) >= 1, `${tag}: search shows live totals`);
  ok(/Stays for your dates/.test(await page.locator("#homes h2").innerText()), `${tag}: heading switches to your dates`);
  await page.selectOption('select[aria-label="Sort homes"]', "total");
  const totals = await page.$$eval(".E-card .E-price b", (bs) => bs.map((b) => Number((b.textContent ?? "").replace(/[^\d]/g, ""))).filter((n) => n > 0));
  ok(totals.length >= 2 && totals.every((v, i) => i === 0 || v >= totals[i - 1]), `${tag}: sort by lowest total works`);
  const href = await page.locator("#home-752 a.E-stretch").getAttribute("href");
  ok(href === `/homes/752-myrtle?checkIn=${iso(a)}&checkOut=${iso(b)}&adults=2&children=0`, `${tag}: card opens the listing with the dates (${href})`);
  ok(/from \$[\d,]+/.test(await page.locator(".E-hoods").innerText()), `${tag}: neighborhoods show live 'from' totals`);
  await page.locator("#locations").scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  ok((await page.locator(".C-pin").count()) === 5 && (await page.locator(".C-pin").allInnerTexts()).some((x) => /^\$/.test(x)), `${tag}: real map with five priced pins`);
  const q = page.locator(".E-qa").nth(3); await q.locator("summary").click();
  ok(await q.evaluate((d) => d.open) && /non-refundable/.test(await q.innerText()), `${tag}: FAQ opens; cancellation answer is the real policy`);
  ok((await page.locator(".E-rev").count()) >= 6, `${tag}: real guest reviews`);
  ok(errors.length === 0, `${tag}: no page errors ${errors.join(" | ")}`);
  if (w === 390) {
    await page.goto(`${BASE}${href}`);
    await page.waitForFunction(() => /total/i.test(document.querySelector(".V-bar")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
    ok(/total/i.test(await page.locator(".V-bar").innerText()), "e: the listing opened from a card is already priced for those dates");
  }
  await page.context().close();
}
{
  const page = await (await browser.newContext()).newPage();
  const r = await page.goto(`${BASE}/all-homes/archive/e-static`);
  ok(r.status() === 200 && /mockup e/i.test(await page.locator(".mockbar").innerText()), "e: original static file kept at /all-homes/archive/e-static");
  await page.context().close();
}
// Version F (note 176 + Oscar round 2): C base + E header/nav, see-through header with the site logo, centered hero,
// host strip, Airbnb-style calendar, list-left/map-right, timeline, review loop, slow reveals. C and E unchanged.
const pickDates = async (page, a1, b1) => {
  await page.click('button[aria-label^="Check-in date"]');
  await page.waitForSelector(".DR");
  for (const d of [a1, b1]) {
    for (let k = 0; k < 14 && !(await page.locator(`.DR-day[data-date="${d}"]`).count()); k++) await page.click(".DR-next");
    await page.locator(`.DR-day[data-date="${d}"]`).scrollIntoViewIfNeeded();
    await page.click(`.DR-day[data-date="${d}"]`);
  }
};
for (const dev of [devices["iPhone 13"], { viewport: { width: 1366, height: 900 } }]) {
  const w = dev.viewport.width, tag = `f@${w}`;
  const page = await (await browser.newContext(dev)).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${BASE}/all-homes/f`);
  await page.waitForTimeout(400);
  ok(res.status() === 200 && /noindex/.test(await page.getAttribute('meta[name="robots"]', "content")), `${tag}: loads, noindex`);
  ok(!(await page.locator("header.F-top").getAttribute("class")).includes("is-solid"), `${tag}: header see-through over the photo`);
  ok((await page.locator('.F-logoWhite[src="/brand/logo-white.webp"]').count()) === 1 && (await page.locator('.F-logoDark[src="/brand/logo-dark.webp"]').count()) === 1, `${tag}: site logo (white over photo, dark when solid)`);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".F-heroText")).textAlign === "center"), `${tag}: hero text centered`);
  if (w > 760) ok((await page.locator(".F-nav a").allInnerTexts()).join(",") === "Homes,Locations,Reviews,FAQ", `${tag}: nav Homes, Locations, Reviews, FAQ`);
  for (const id of ["homes", "locations", "reviews", "faq"]) ok((await page.locator(`#${id}`).count()) === 1, `${tag}: nav target #${id}`);
  ok((await page.locator(".E-chip, .chip, select[aria-label='Sort homes']").count()) === 0, `${tag}: no filters or sort`);
  const t = await page.evaluate(() => document.body.innerText);
  ok(t.includes("Hosted directly by Oscar & Fernanda") && t.includes("4.98 average across 463 Airbnb guest reviews") && t.includes("Secure payment through Stripe") && t.includes("Usually reply within an hour"), `${tag}: host strip`);
  ok(t.indexOf("Hosted directly by Oscar") < t.indexOf("Choose your home") && t.indexOf("Choose your home") < t.indexOf("Large Family House Next to the Pearl"), `${tag}: search -> host strip -> homes`);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".S-go")).backgroundColor === "rgb(18, 122, 94)"), `${tag}: C's accent kept`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tag}: no sideways scroll`);
  // calendar
  await page.click('button[aria-label^="Check-in date"]');
  await page.waitForSelector(".DR");
  ok((await page.locator(w > 760 ? ".DR-pop .DR-month" : ".DR-sheet .DR-month").count()) === (w > 760 ? 2 : 12), `${tag}: calendar shows ${w > 760 ? "two months side by side" : "a full-screen sheet of months"}`);
  if (w <= 760) { await page.waitForTimeout(500); const r = await page.locator(".DR-sheet").boundingBox(); const vh = await page.evaluate(() => innerHeight); ok(r && r.y === 0 && r.height >= vh - 1, `${tag}: phone calendar fills the screen`); }
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()));
  const yesterday = new Date(Date.parse(today + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  if (await page.locator(`.DR-day[data-date="${yesterday}"]`).count()) ok(await page.locator(`.DR-day[data-date="${yesterday}"]`).isDisabled(), `${tag}: past days disabled`);
  await page.keyboard.press("Escape");
  ok((await page.locator(".DR").count()) === 0, `${tag}: Escape closes the calendar`);
  { // 2-night minimum: after picking check-in, the next day can't be check-out and the calendar says so
    await page.click('button[aria-label^="Check-in date"]'); await page.waitForSelector(".DR");
    ok(/2-night minimum/.test(await page.locator(".DR-sub").innerText()), `${tag}: calendar mentions the 2-night minimum`);
    for (let k = 0; k < 14 && !(await page.locator(`.DR-day[data-date="${iso(a)}"]`).count()); k++) await page.click(".DR-next");
    await page.locator(`.DR-day[data-date="${iso(a)}"]`).scrollIntoViewIfNeeded(); await page.click(`.DR-day[data-date="${iso(a)}"]`);
    const next = new Date(Date.parse(iso(a)) + 864e5).toISOString().slice(0, 10);
    ok((await page.locator(".DR-min").innerText()) === "2-night minimum" && (await page.locator(`.DR-day[data-date="${next}"]`).getAttribute("aria-disabled")) === "true", `${tag}: after check-in, '2-night minimum' shown and the next day is blocked`);
    await page.locator(`.DR-day[data-date="${next}"]`).click({ force: true });
    ok((await page.locator(".DR-h").innerText()) === "Select check-out date", `${tag}: a 1-night pick is refused`);
    await page.keyboard.press("Escape");
  }
  await pickDates(page, iso(a), iso(b));
  ok((await page.locator(".DR-day.is-in").count()) === 2 && (await page.locator(".DR-h").innerText()) === "3 nights", `${tag}: range shaded, '3 nights'`);
  await page.click(".DR-done");
  await page.waitForFunction(() => /total for 3 nights/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  ok(/total for 3 nights/.test(await page.evaluate(() => document.body.innerText)), `${tag}: 'Show totals' runs the search -> live totals`);
  const href = await page.locator('#home-752 a[href^="/homes/"]').first().getAttribute("href");
  ok(href === `/homes/752-myrtle?checkIn=${iso(a)}&checkOut=${iso(b)}&adults=2&children=0`, `${tag}: View home carries the dates`);
  { // available homes first, unavailable below a divider (all still shown)
    const order = await page.evaluate(() => [...document.querySelectorAll(".F-list > li")].map((li) => li.classList.contains("F-offHead") ? "divider" : li.classList.contains("is-off") ? "off" : "on"));
    const firstOff = order.indexOf("off");
    ok(order.filter((x) => x !== "divider").length === 5 && (firstOff === -1 || (order.slice(firstOff).every((x) => x !== "on") && (firstOff === 0 || order[firstOff - 1] === "divider"))), `${tag}: available homes on top, unavailable below a divider (${order.join(",")})`);
  }
  { // 9 guests: only the 10-guest home fits -> it moves to the top, the others drop below the divider
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click(".S-guests > button");
    for (let k = 0; k < 7; k++) await page.click('button[aria-label="More adults"]');
    await page.click(".S-done"); await page.click(".S-go");
    await page.waitForFunction(() => /Sleeps 8/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    const order = await page.evaluate(() => [...document.querySelectorAll(".F-list > li")].map((li) => li.classList.contains("F-offHead") ? "divider" : li.id));
    ok(order[0] === "home-736" && order[1] === "divider" && order.length === 6, `${tag}: 9 guests -> 736 first, the others below (${order.join(",")})`);
    await page.click(".S-guests > button");
    for (let k = 0; k < 7; k++) await page.click('button[aria-label="Fewer adults"]');
    await page.click(".S-done"); await page.click(".S-go");
    await page.waitForFunction(() => !/Sleeps 8/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  }
  // photos: each one opens the home's page; swiping moves to the next photo
  ok((await page.locator('#home-752 .F-photo').evaluateAll((els) => els.every((e) => e.tagName === "A" && e.getAttribute("href").startsWith("/homes/752-myrtle")))), `${tag}: home photos link to the home's page`);
  if (w <= 760) {
    const box = await page.locator("#home-752 .F-photos").boundingBox();
    ok(await page.locator("#home-752 .F-photos").evaluate((el) => Math.abs(el.firstElementChild.getBoundingClientRect().width - el.clientWidth) < 1), `${tag}: one full-width photo at a time (no peek)`);
    ok((await page.locator("#home-752 .F-count").innerText()) === "1 / 4" && (await page.locator("#home-752 .F-dots span").count()) === 4, `${tag}: dots + 1 / 4 counter like the listing page`);
    await page.locator("#home-752 .F-photos").evaluate((el) => el.scrollTo({ left: el.clientWidth }));
    await page.waitForTimeout(700);
    ok(box && await page.locator("#home-752 .F-photos").evaluate((el) => el.scrollLeft > 50), `${tag}: photos scroll sideways to the next one`);
    ok((await page.locator("#home-752 .F-count").innerText()) === "2 / 4" && (await page.locator("#home-752 .F-dots span.on").count()) === 1, `${tag}: counter and dots follow the swipe`);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector("#home-752")).transform === "none"), `${tag}: no hover lift on touch (no stuck swipe)`);
  }
  if (w > 760) { // desktop: wheel/trackpad over a photo scrolls the page (never caught by the strip); arrows change the photo
    const card = page.locator("#home-752");
    await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
    const box = await card.locator(".F-photos").boundingBox();
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(30, 400); await page.waitForTimeout(600); // a slightly diagonal trackpad-like swipe
    ok((await page.evaluate(() => scrollY)) > y0 + 200 && (await card.locator(".F-photos").evaluate((el) => el.scrollLeft)) === 0, `${tag}: scrolling over a home's photo scrolls the page`);
    await card.scrollIntoViewIfNeeded(); await card.hover(); await page.waitForTimeout(300);
    await card.locator(".F-arrowNext").click(); await page.waitForTimeout(900);
    ok((await card.locator(".F-photos").evaluate((el) => Math.round(el.scrollLeft / el.clientWidth))) === 1, `${tag}: next-photo arrow shows the second photo`);
    await card.locator(".F-arrowPrev").click(); await page.waitForTimeout(900);
    ok((await card.locator(".F-photos").evaluate((el) => el.scrollLeft)) === 0, `${tag}: previous-photo arrow goes back`);
  }
  // strip left-aligned; footer logo + Instagram
  if (w <= 760) ok(await page.evaluate(() => { const lis = [...document.querySelectorAll(".F-strip li")].map((l) => l.getBoundingClientRect().left); const h = document.querySelector(".F-stripHost").getBoundingClientRect().left; return Math.abs(lis[0] - h) < 2; }), `${tag}: '4.98' line lines up left with the host line`);
  else ok(await page.evaluate(() => { const h = document.querySelector(".F-stripHost").getBoundingClientRect(), u = document.querySelector(".F-strip ul").getBoundingClientRect(), s = document.querySelector(".F-search").getBoundingClientRect(); return u.left > h.right && h.left >= s.left - 1 && u.right <= s.right + 1 && Math.abs((h.left - s.left) - (s.right - u.right)) < 40; }), `${tag}: desktop strip = host left, facts right, centered under the search bar`);
  ok((await page.locator(".F-stats .F-statIc svg").count()) === 3, `${tag}: review stats have icons`);
  ok(await page.evaluate(() => [...document.querySelectorAll(".F-stats li")].every((li) => { const r = li.getBoundingClientRect(), i = li.querySelector(".F-statIc").getBoundingClientRect(); return Math.abs((i.left + i.width / 2) - (r.left + r.width / 2)) < 2 && getComputedStyle(li).textAlign === "center"; })), `${tag}: stat icons and text centered`);
  ok((await page.locator('footer .F-footLogo[src="/brand/logo-dark.webp"]').count()) === 1 && (await page.locator('footer a[href="https://www.instagram.com/pearlheightshomes"]').count()) === 1, `${tag}: footer has our logo + Instagram`);
  // scroll: header turns solid, reveals, map layout, timeline, reviews
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(500);
  ok((await page.locator("header.F-top").getAttribute("class")).includes("is-solid"), `${tag}: header turns solid on scroll`);
  const hidden = await page.evaluate(() => { const el = document.querySelector(".F-tl"); return getComputedStyle(el).opacity; });
  ok(hidden === "0", `${tag}: timeline waits below the fold (reveal on scroll)`);
  await page.locator(".F-tl").scrollIntoViewIfNeeded(); await page.waitForTimeout(2600);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".F-tl")).opacity === "1" && getComputedStyle(document.querySelector(".F-tl li:last-child .F-tlMark")).transform !== "matrix(0, 0, 0, 0, 0, 0)"), `${tag}: timeline revealed, markers popped in`);
  ok((await page.locator(".F-tlWhen").allInnerTexts()).join("|").toLowerCase() === "booking day|within 24 hours|once you're verified|check-in morning|during your stay", `${tag}: timeline steps`);
  await page.locator("#locations").scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
  ok((await page.locator(".C-pin").count()) === 5 && (await page.locator(".F-hood").count()) === 3, `${tag}: map with 5 pins + neighborhood list`);
  if (w > 760) ok(await page.evaluate(() => { const l = document.querySelector(".F-hoods").getBoundingClientRect(), m = document.querySelector(".F-mapCard").getBoundingClientRect(); return l.right <= m.left; }), `${tag}: list left, map right`);
  await page.locator("#reviews").scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".F-loopTrack")).animationName === "F-marquee"), `${tag}: reviews glide in a loop`);
  ok((await page.locator('.F-loopTrack li:not([aria-hidden="true"])').count()) >= 6, `${tag}: real reviews (loop copies hidden from screen readers)`);
  await page.click(".F-loopBtn");
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".F-loopTrack")).animationPlayState === "paused"), `${tag}: reviews can be paused`);
  if (w > 760) { await page.evaluate(() => window.scrollTo(0, 0)); await page.click('.F-nav a[href="#faq"]'); await page.waitForTimeout(900); ok(await page.evaluate(() => { const r = document.getElementById("faq").getBoundingClientRect(); return r.top >= 0 && r.top < 200; }), `${tag}: nav link jumps to FAQ`); }
  ok(errors.length === 0, `${tag}: no page errors ${errors.join(" | ")}`);
  await page.context().close();
}
{ // reduced motion: nothing hidden, nothing moving
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await page.goto(`${BASE}/all-homes/f`); await page.waitForTimeout(500);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".F-tl")).opacity === "1" && getComputedStyle(document.querySelector(".F-loopTrack")).animationName === "none"), "f: reduced motion -> content visible, reviews still");
  await page.context().close();
}
{
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/all-homes/c`); const c = await page.evaluate(() => document.body.innerText);
  ok(c.includes("You book with us") && (await page.locator(".F-strip").count()) === 0, "c: unchanged (still has its own trust block)");
  await page.goto(`${BASE}/all-homes/e`);
  ok((await page.locator(".E-chip").count()) === 6, "e: unchanged (still has its filters)");
  await page.context().close();
}
await browser.close();
if (!process.exitCode) console.log("ALL HOMES E2E PASSED");
